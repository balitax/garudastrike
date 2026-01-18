import React, { useEffect, useRef, useCallback } from 'react';
import { GameState, Entity, Projectile, Particle, GameStats, Vector2D, PlayerConfig, PowerUpType, WeaponType, MissionType, FloatingText } from '../types';
import { playShoot, playExplosion, playPowerUp, playWeaponUp, playGameOver, playWaveTransition } from '../utils/sound';

interface GameCanvasProps {
  gameState: GameState;
  onGameOver: (stats: GameStats) => void;
  setScore: (score: number) => void;
  setCombo: (combo: number) => void;
  setHealth: (hp: number) => void;
  playerConfig: PlayerConfig;
  highScore?: number;
}

const PLAYER_SPEED_LERP = 0.15;
const BASE_SHOOT_COOLDOWN = 15; // Frames
const RAPID_SHOOT_COOLDOWN = 8; // Frames
const ENEMY_SPAWN_RATE = 60; // Frames
const BOSS_WAVE_INTERVAL = 5; // Boss appears every 5 waves
const COMBO_TIMEOUT_FRAMES = 120; // 2 seconds to keep combo

export const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, onGameOver, setScore, setCombo, setHealth, playerConfig, highScore = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  // Game State Refs (Mutable for performance)
  const playerRef = useRef<Entity>({
    id: 'player',
    pos: { x: 0, y: 0 },
    size: { x: 40, y: 40 },
    velocity: { x: 0, y: 0 },
    color: playerConfig.color,
    hp: 100,
    maxHp: 100,
    type: 'player',
    weaponType: 'BLASTER',
    scoreValue: 0
  });
  
  const targetPosRef = useRef<Vector2D>({ x: 0, y: 0 });
  const enemiesRef = useRef<Entity[]>([]);
  const powerupsRef = useRef<Entity[]>([]); 
  const projectilesRef = useRef<Projectile[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  
  const statsRef = useRef<GameStats>({ 
    score: 0, 
    wave: 1, 
    enemiesDestroyed: 0, 
    shotsFired: 0,
    combo: 0,
    maxCombo: 0,
    mission: {
      type: 'ELIMINATION',
      description: 'INIT',
      targetValue: 0,
      currentValue: 0,
      isComplete: false
    }
  });
  
  const comboTimerRef = useRef(0);
  const frameCountRef = useRef(0);
  const starsRef = useRef<{x: number, y: number, size: number, speed: number, brightness: number}[]>([]);
  const waveTransitionTimer = useRef(0);
  const shakeIntensityRef = useRef(0);

  // Update player color when config changes
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.color = playerConfig.color;
    }
  }, [playerConfig.color]);

  // Init Stars with Parallax Layers
  useEffect(() => {
    if (starsRef.current.length === 0) {
      // Layer 1: Deep Space (Slow, Small, Dim)
      for (let i = 0; i < 80; i++) {
        starsRef.current.push({
          x: Math.random(),
          y: Math.random(),
          size: Math.random() * 1.5 + 0.5,
          speed: Math.random() * 0.3 + 0.1,
          brightness: Math.random() * 0.3 + 0.1
        });
      }
      // Layer 2: Mid Range (Medium speed/size)
      for (let i = 0; i < 40; i++) {
        starsRef.current.push({
          x: Math.random(),
          y: Math.random(),
          size: Math.random() * 1 + 1.5,
          speed: Math.random() * 0.8 + 0.5,
          brightness: Math.random() * 0.3 + 0.4
        });
      }
      // Layer 3: Foreground (Fast, Large, Bright)
      for (let i = 0; i < 20; i++) {
        starsRef.current.push({
          x: Math.random(),
          y: Math.random(),
          size: Math.random() * 1.5 + 2.5,
          speed: Math.random() * 1.5 + 2.0,
          brightness: Math.random() * 0.2 + 0.8
        });
      }
    }
  }, []);

  const addShake = (intensity: number) => {
    shakeIntensityRef.current = Math.min(shakeIntensityRef.current + intensity, 30);
  };

  const initMission = (wave: number) => {
    let type: MissionType = 'ELIMINATION';
    let target = 10 + (wave * 2);
    let description = `DESTROY ${target} HOSTILES`;

    if (wave % BOSS_WAVE_INTERVAL === 0) {
      type = 'BOSS';
      target = 1;
      description = 'DEFEAT DREADNOUGHT CLASS';
    } else {
      // Randomize between Elimination and Survival for non-boss waves
      const rand = Math.random();
      if (wave > 2 && rand > 0.6) {
        type = 'SURVIVAL';
        // Survival time increases with wave
        target = 30 + (Math.min(wave, 10) * 2); // Seconds
        description = `SURVIVE ASSAULT: ${target}s`;
      }
    }

    statsRef.current.mission = {
      type,
      description,
      targetValue: target,
      currentValue: 0, // Kills for elim, Frames for survival
      isComplete: false,
      timer: 0
    };
  };

  const spawnBoss = (width: number, wave: number) => {
    const hp = 500 + (wave * 150);
    const size = { x: 100, y: 80 };
    
    enemiesRef.current.push({
      id: `boss-${wave}`,
      pos: { x: width / 2 - size.x / 2, y: -150 }, // Start off screen
      size,
      velocity: { x: 0, y: 0 },
      hp,
      maxHp: hp,
      type: 'boss',
      color: '#a855f7', // Purple
      scoreValue: 5000 * Math.ceil(wave / 5),
      phase: 1,
      attackTimer: 0,
      moveTimer: 0
    });
  };

  const spawnEnemy = (width: number) => {
    const typeRoll = Math.random();
    let type: Entity['type'] = 'enemy_basic';
    let size = { x: 30, y: 30 };
    let hp = 1;
    let speed = 2;
    let color = '#ef4444'; // red-500
    let score = 100;

    if (typeRoll > 0.85) {
      type = 'enemy_fast';
      size = { x: 20, y: 20 };
      speed = 4;
      hp = 1;
      color = '#f59e0b'; // amber-500
      score = 200;
    } else if (statsRef.current.wave > 2 && typeRoll > 0.70) {
      // Kamikaze: Spawns after wave 2
      type = 'enemy_kamikaze';
      size = { x: 25, y: 25 };
      speed = 2.5; // Starts slower, accelerates
      hp = 2;
      color = '#f97316'; // Orange
      score = 300;
    }

    enemiesRef.current.push({
      id: Math.random().toString(36),
      pos: { x: Math.random() * (width - size.x), y: -50 },
      size,
      velocity: { x: 0, y: speed + (statsRef.current.wave * 0.1) }, 
      hp,
      maxHp: hp,
      type,
      color,
      scoreValue: score
    });
  };

  const spawnFloatingText = (x: number, y: number, text: string, color: string = '#ffffff') => {
    floatingTextsRef.current.push({
      id: Math.random().toString(),
      text,
      pos: { x, y },
      velocity: { x: 0, y: -1.5 },
      life: 1.0,
      color,
      size: 14
    });
  };

  const spawnPowerUp = (x: number, y: number) => {
    const rand = Math.random();
    let pType: PowerUpType = 'HEALTH';
    let color = '#22c55e'; // Green

    if (rand < 0.4) {
      pType = 'HEALTH';
      color = '#22c55e';
    } else if (rand < 0.6) {
      pType = 'WEAPON_SPREAD';
      color = '#eab308'; // Yellow
    } else if (rand < 0.8) {
      pType = 'WEAPON_RAPID';
      color = '#06b6d4'; // Cyan
    } else {
      pType = 'WEAPON_PLASMA';
      color = '#a855f7'; // Purple
    }

    powerupsRef.current.push({
      id: Math.random().toString(),
      pos: { x, y },
      size: { x: 24, y: 24 },
      velocity: { x: 0, y: 2 }, // Floats down
      hp: 1,
      maxHp: 1,
      type: 'powerup',
      powerUpType: pType,
      color: color,
      scoreValue: 0
    });
  };

  const spawnExplosion = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      particlesRef.current.push({
        id: Math.random().toString(),
        pos: { x, y },
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed
        },
        life: 1.0,
        maxLife: 1.0,
        color: color,
        size: Math.random() * 3 + 1
      });
    }
  };

  const spawnMuzzleFlash = (x: number, y: number, type: WeaponType) => {
    const addP = (vx: number, vy: number, color: string, size: number, life: number) => {
       particlesRef.current.push({
        id: Math.random().toString(),
        pos: { x, y },
        velocity: { x: vx, y: vy },
        life,
        maxLife: life,
        color,
        size
      });
    };

    if (type === 'BLASTER') {
      // Small green burst
      for(let i=0; i<5; i++) {
        const angle = Math.PI + Math.random() * Math.PI; // Upward arc
        const speed = Math.random() * 2 + 1;
        addP(Math.cos(angle) * speed, Math.sin(angle) * speed, '#34d399', Math.random() * 2 + 1, 0.4);
      }
    } else if (type === 'SPREAD') {
      // Wide yellow cone
      for(let i=0; i<10; i++) {
        const angle = Math.PI * 1.2 + Math.random() * Math.PI * 0.6; // Mostly up
        const speed = Math.random() * 4 + 2;
        addP(Math.cos(angle) * speed, Math.sin(angle) * speed, '#eab308', Math.random() * 3 + 2, 0.3);
      }
    } else if (type === 'RAPID') {
      // Side ejecting sparks + forward flash
      addP(Math.random() * 3 + 2, Math.random() * 2 - 1, 'rgba(200,200,255,0.8)', 2, 0.2); // Right
      addP(-(Math.random() * 3 + 2), Math.random() * 2 - 1, 'rgba(200,200,255,0.8)', 2, 0.2); // Left
      addP(0, -6, '#06b6d4', 5, 0.15); // Forward
    } else if (type === 'PLASMA') {
       // Implosion/Expansion purple
       for(let i=0; i<12; i++) {
         const angle = Math.random() * Math.PI * 2;
         const speed = Math.random() * 1.5;
         addP(Math.cos(angle) * speed, Math.sin(angle) * speed, '#d8b4fe', Math.random() * 4 + 2, 0.6);
       }
    }
  };

  const spawnTrailParticles = () => {
    const p = playerRef.current;
    if (p.hp <= 0) return;

    const px = p.pos.x;
    const py = p.pos.y;
    const pw = p.size.x;
    const ph = p.size.y;

    // Throttle: only spawn every 2-3 frames
    if (frameCountRef.current % 3 !== 0) return;

    if (playerConfig.trailType === 'plasma') {
       // Cyan rings
       particlesRef.current.push({
         id: Math.random().toString(),
         pos: { x: px + pw/2 + (Math.random() * 6 - 3), y: py + ph - 5 },
         velocity: { x: (Math.random() - 0.5) * 0.5, y: Math.random() * 1 + 1 },
         life: 0.7,
         maxLife: 0.7,
         color: '#22d3ee',
         size: Math.random() * 4 + 2
       });
    } else if (playerConfig.trailType === 'turbo') {
       // Dual jet streams
       const offset = pw * 0.2;
       [px + offset, px + pw - offset].forEach((cx, i) => {
          particlesRef.current.push({
            id: Math.random().toString(),
            pos: { x: cx - 2 + (Math.random() * 4 - 2), y: py + ph - 5 },
            velocity: { x: 0, y: Math.random() * 3 + 2 },
            life: 0.5,
            maxLife: 0.5,
            color: Math.random() > 0.5 ? '#ef4444' : '#ffffff',
            size: Math.random() * 3 + 1
          });
       });
    } else {
       // Standard Ion Drive (Orange/Yellow)
       particlesRef.current.push({
         id: Math.random().toString(),
         pos: { x: px + pw/2 - 2 + (Math.random() * 4 - 2), y: py + ph - 2 },
         velocity: { x: (Math.random() - 0.5) * 0.5, y: Math.random() * 2 + 1 },
         life: 0.6,
         maxLife: 0.6,
         color: Math.random() > 0.5 ? '#f97316' : '#facc15',
         size: Math.random() * 4 + 2
       });
    }
  };

  const fireWeapon = () => {
    const p = playerRef.current;
    const weapon = p.weaponType || 'BLASTER';
    playShoot(weapon);
    statsRef.current.shotsFired++;
    
    // Muzzle flash
    const noseX = p.pos.x + p.size.x / 2;
    const noseY = p.pos.y;
    spawnMuzzleFlash(noseX, noseY, weapon);

    const spawnBullet = (vx: number, vy: number, damage: number, size: number, color: string, type: WeaponType) => {
      projectilesRef.current.push({
        id: Math.random().toString(),
        pos: { x: p.pos.x + p.size.x / 2 - size/2, y: p.pos.y },
        velocity: { x: vx, y: vy },
        isPlayer: true,
        damage,
        color,
        size,
        type
      });
    };

    switch (weapon) {
      case 'SPREAD':
        spawnBullet(0, -10, 1, 4, '#eab308', 'SPREAD');
        spawnBullet(-3, -9, 1, 4, '#eab308', 'SPREAD');
        spawnBullet(3, -9, 1, 4, '#eab308', 'SPREAD');
        break;
      case 'PLASMA':
        spawnBullet(0, -15, 3, 6, '#a855f7', 'PLASMA');
        break;
      case 'RAPID':
        spawnBullet(0, -12, 1, 3, '#06b6d4', 'RAPID');
        break;
      case 'BLASTER':
      default:
        spawnBullet(0, -10, 1, 4, '#34d399', 'BLASTER');
        break;
    }
  };
  
  const spawnEnemyProjectile = (x: number, y: number, vx: number, vy: number, type: WeaponType) => {
      projectilesRef.current.push({
        id: Math.random().toString(),
        pos: { x: x - 5, y: y }, // Center approx
        velocity: { x: vx, y: vy },
        isPlayer: false,
        damage: 15,
        color: '#ef4444',
        size: 10,
        type: type
      });
  };

  const update = (canvas: HTMLCanvasElement) => {
    const width = canvas.width;
    const height = canvas.height;
    frameCountRef.current++;

    // Shake Decay
    if (shakeIntensityRef.current > 0) {
      shakeIntensityRef.current *= 0.9;
      if (shakeIntensityRef.current < 0.5) shakeIntensityRef.current = 0;
    }

    // Combo Decay
    if (comboTimerRef.current > 0) {
      comboTimerRef.current--;
      if (comboTimerRef.current <= 0) {
        statsRef.current.combo = 0; // Reset combo
        setCombo(0);
      }
    }

    // Init Logic
    if (frameCountRef.current === 1) {
       playerRef.current.pos = { x: width / 2 - 20, y: height - 100 };
       targetPosRef.current = { x: width / 2, y: height - 100 };
       initMission(1);
    }

    if (gameState === GameState.CUSTOMIZE) {
      const p = playerRef.current;
      const hoverY = (height / 2 - p.size.y / 2) + Math.sin(frameCountRef.current * 0.05) * 10;
      p.pos.x = width / 2 - p.size.x / 2;
      p.pos.y = hoverY;
      
      // Spawn trail particles in menu too for preview
      spawnTrailParticles();
      
      // Update particles in menu
      particlesRef.current.forEach(part => {
        part.pos.x += part.velocity.x;
        part.pos.y += part.velocity.y;
        part.life -= 0.02;
      });
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);
      return; 
    }

    if (gameState !== GameState.PLAYING) return;
    
    // Wave Transition Delay
    if (statsRef.current.mission.isComplete) {
      waveTransitionTimer.current++;
      
      // Trigger transition sound on first frame of completion
      if (waveTransitionTimer.current === 1) {
        playWaveTransition();
      }

      if (waveTransitionTimer.current > 120) { // 2 seconds delay
        statsRef.current.wave++;
        initMission(statsRef.current.wave);
        waveTransitionTimer.current = 0;
        // Clean up projectiles/enemies between waves
        projectilesRef.current = [];
        enemiesRef.current = [];
      }
      return; // Pause game logic during transition
    }

    // Move Player (Lerp)
    const p = playerRef.current;
    p.pos.x += (targetPosRef.current.x - p.size.x / 2 - p.pos.x) * PLAYER_SPEED_LERP;
    p.pos.y += (targetPosRef.current.y - p.size.y - 20 - p.pos.y) * PLAYER_SPEED_LERP;

    // Clamp Player
    p.pos.x = Math.max(0, Math.min(width - p.size.x, p.pos.x));
    p.pos.y = Math.max(0, Math.min(height - p.size.y, p.pos.y));

    // Spawn Trail
    spawnTrailParticles();

    // Auto Shoot
    const currentCooldown = p.weaponType === 'RAPID' ? RAPID_SHOOT_COOLDOWN : BASE_SHOOT_COOLDOWN;
    if (frameCountRef.current % currentCooldown === 0) {
      fireWeapon();
    }
    
    // Mission Updates
    const mission = statsRef.current.mission;
    if (mission.type === 'SURVIVAL') {
      mission.currentValue++; // Count frames
      // Survival Complete
      if (mission.currentValue >= mission.targetValue * 60) {
        mission.isComplete = true;
        playPowerUp(); // Success sound
      }
    } else if (mission.type === 'ELIMINATION') {
      if (mission.currentValue >= mission.targetValue) {
         mission.isComplete = true;
         playPowerUp();
      }
    } else if (mission.type === 'BOSS') {
      // Completed in collision logic when boss dies
    }
    
    // Spawning Logic based on Mission
    const currentWave = statsRef.current.wave;
    
    if (mission.type === 'BOSS') {
      // Ensure boss exists
      const hasBoss = enemiesRef.current.some(e => e.type === 'boss');
      if (!hasBoss) {
        spawnBoss(width, currentWave);
      }
    } else {
      // Standard or Survival
      let rate = ENEMY_SPAWN_RATE - Math.floor(statsRef.current.score / 500);
      if (mission.type === 'SURVIVAL') {
        rate = Math.max(15, rate * 0.6); // 40% faster spawns in survival
      } else {
        rate = Math.max(20, rate);
      }
      
      if (frameCountRef.current % Math.floor(rate) === 0) {
        spawnEnemy(width);
      }
    }

    // Update Enemies (and Boss AI)
    enemiesRef.current.forEach(e => {
      if (e.type === 'boss') {
         // Boss AI
         e.moveTimer = (e.moveTimer || 0) + 1;
         e.attackTimer = (e.attackTimer || 0) + 1;
         
         // 1. Movement
         if (e.pos.y < 80) {
           e.pos.y += 2;
           e.pos.x += (width/2 - e.size.x/2 - e.pos.x) * 0.05; // Center X
         } else {
           const hoverX = (width/2 - e.size.x/2) + Math.sin(e.moveTimer * 0.02) * (width * 0.3);
           e.pos.x += (hoverX - e.pos.x) * 0.05;
         }
         
         // 2. Phase Check
         if (e.hp < e.maxHp * 0.5) {
           e.phase = 2;
         } else {
           e.phase = 1;
         }
         
         // 3. Attack
         const attackRate = e.phase === 2 ? 40 : 80;
         if (e.attackTimer > attackRate) {
           e.attackTimer = 0;
           const cx = e.pos.x + e.size.x / 2;
           const cy = e.pos.y + e.size.y;
           
           if (e.phase === 1) {
             spawnEnemyProjectile(cx, cy, 0, 5, 'ENEMY_PULSE');
             spawnEnemyProjectile(cx, cy, -2, 4, 'ENEMY_PULSE');
             spawnEnemyProjectile(cx, cy, 2, 4, 'ENEMY_PULSE');
             playShoot('SPREAD'); 
           } else {
             const dx = (p.pos.x + p.size.x/2) - cx;
             const dy = (p.pos.y + p.size.y/2) - cy;
             const mag = Math.sqrt(dx*dx + dy*dy);
             const vx = (dx/mag) * 6;
             const vy = (dy/mag) * 6;
             
             spawnEnemyProjectile(cx, cy, vx, vy, 'ENEMY_BEAM');
             spawnEnemyProjectile(cx, cy, vx + 1, vy, 'ENEMY_BEAM');
             spawnEnemyProjectile(cx, cy, vx - 1, vy, 'ENEMY_BEAM');
             playShoot('PLASMA');
           }
         }
         
      } else if (e.type === 'enemy_kamikaze') {
        // Homing behavior
        const centerX = e.pos.x + e.size.x/2;
        const centerY = e.pos.y + e.size.y/2;
        const targetX = p.pos.x + p.size.x/2;
        const targetY = p.pos.y + p.size.y/2;
        
        const dx = targetX - centerX;
        const dy = targetY - centerY;
        const distance = Math.sqrt(dx*dx + dy*dy);
        
        if (distance > 0) {
            // Accelerate towards player
            e.velocity.x += (dx / distance) * 0.1;
            e.velocity.y += (dy / distance) * 0.1;
            
            // Cap speed
            const maxSpeed = 5;
            const speed = Math.sqrt(e.velocity.x*e.velocity.x + e.velocity.y*e.velocity.y);
            if (speed > maxSpeed) {
                e.velocity.x = (e.velocity.x / speed) * maxSpeed;
                e.velocity.y = (e.velocity.y / speed) * maxSpeed;
            }
        }
        
        e.pos.x += e.velocity.x;
        e.pos.y += e.velocity.y;
        
        // Face direction of movement (optional visual tweak, handled in draw)
      } else {
        // Normal Enemy Movement
        e.pos.x += e.velocity.x;
        e.pos.y += e.velocity.y;
      }
    });

    // Update Powerups
    powerupsRef.current.forEach(pu => {
      pu.pos.x += pu.velocity.x;
      pu.pos.y += pu.velocity.y;
    });

    // Update Projectiles
    projectilesRef.current.forEach(proj => {
      proj.pos.x += proj.velocity.x;
      proj.pos.y += proj.velocity.y;
    });

    // Update Particles
    particlesRef.current.forEach(part => {
      part.pos.x += part.velocity.x;
      part.pos.y += part.velocity.y;
      part.life -= 0.02;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    // Update Floating Texts
    floatingTextsRef.current.forEach(ft => {
      ft.pos.x += ft.velocity.x;
      ft.pos.y += ft.velocity.y;
      ft.life -= 0.02;
    });
    floatingTextsRef.current = floatingTextsRef.current.filter(ft => ft.life > 0);

    // Collision Detection
    // 1. Player Bullets hit Enemies
    projectilesRef.current.filter(proj => proj.isPlayer).forEach(proj => {
      const hitIdx = enemiesRef.current.findIndex(e => 
        proj.pos.x < e.pos.x + e.size.x &&
        proj.pos.x + proj.size > e.pos.x &&
        proj.pos.y < e.pos.y + e.size.y &&
        proj.pos.y + proj.size > e.pos.y
      );

      if (hitIdx !== -1) {
        const enemy = enemiesRef.current[hitIdx];
        enemy.hp -= proj.damage;
        proj.damage = 0; // Destroy bullet
        
        spawnExplosion(proj.pos.x, proj.pos.y, '#ffffff', 2);

        if (enemy.hp <= 0) {
          playExplosion(enemy.type === 'boss');
          // Shake Effect
          addShake(enemy.type === 'boss' ? 20 : 5);
          
          // COMBO LOGIC
          comboTimerRef.current = COMBO_TIMEOUT_FRAMES;
          statsRef.current.combo++;
          if (statsRef.current.combo > statsRef.current.maxCombo) {
             statsRef.current.maxCombo = statsRef.current.combo;
          }
          setCombo(statsRef.current.combo);

          // Calculate Score with Combo Multiplier (10% bonus per combo count, max 3x)
          const multiplier = Math.min(3, 1 + (statsRef.current.combo * 0.1));
          const finalScore = Math.floor(enemy.scoreValue * multiplier);

          statsRef.current.score += finalScore;
          statsRef.current.enemiesDestroyed++;
          setScore(statsRef.current.score);
          
          spawnExplosion(enemy.pos.x + enemy.size.x/2, enemy.pos.y + enemy.size.y/2, enemy.color, enemy.type === 'boss' ? 20 : 8);
          spawnFloatingText(enemy.pos.x + enemy.size.x/2, enemy.pos.y, `+${finalScore}`, '#facc15'); // Yellow text
          
          if (statsRef.current.combo > 1) {
             spawnFloatingText(enemy.pos.x + enemy.size.x/2, enemy.pos.y - 15, `${statsRef.current.combo}x COMBO`, '#22d3ee');
          }

          // Mission Logic: Elimination Kill
          if (mission.type === 'ELIMINATION' && !mission.isComplete) {
            mission.currentValue++;
          }
          
          if (enemy.type === 'boss') {
            mission.isComplete = true; // Boss Mission Complete
            playPowerUp();
            spawnPowerUp(enemy.pos.x + enemy.size.x/2 - 10, enemy.pos.y + enemy.size.y/2);
             spawnPowerUp(enemy.pos.x + enemy.size.x/2 + 20, enemy.pos.y + enemy.size.y/2);
          } else if (Math.random() < 0.15) {
             spawnPowerUp(enemy.pos.x + enemy.size.x/2 - 10, enemy.pos.y + enemy.size.y/2);
          }
        }
      }
    });
    
    // 2. Enemy Projectiles hit Player
    projectilesRef.current.filter(proj => !proj.isPlayer).forEach(proj => {
      if (p.pos.x < proj.pos.x + proj.size &&
          p.pos.x + p.size.x > proj.pos.x &&
          p.pos.y < proj.pos.y + proj.size &&
          p.pos.y + p.size.y > proj.pos.y) {
          
        proj.damage = 0; // Destroy bullet
        p.hp -= 15;
        p.weaponType = 'BLASTER'; // Downgrade weapon
        setHealth(p.hp);
        playExplosion();
        addShake(10); // Shake on hit
        statsRef.current.combo = 0; setCombo(0); // Lose combo
        spawnExplosion(p.pos.x + p.size.x/2, p.pos.y + p.size.y/2, '#ef4444', 5);
        
        if (p.hp <= 0) {
          playGameOver();
          onGameOver(statsRef.current);
        }
      }
    });

    // 3. Enemies collide with Player
    enemiesRef.current.forEach(e => {
      if (e.hp > 0 && 
          p.pos.x < e.pos.x + e.size.x &&
          p.pos.x + p.size.x > e.pos.x &&
          p.pos.y < e.pos.y + e.size.y &&
          p.pos.y + p.size.y > e.pos.y) {
            
        p.hp -= 20;
        p.weaponType = 'BLASTER';
        if (e.type !== 'boss') e.hp = 0; // Bosses don't die on ramming, just damage player
        
        // Elimination mission counts rams as kills? Maybe. Let's say yes for gameplay flow.
        if (e.type !== 'boss' && mission.type === 'ELIMINATION') {
           mission.currentValue++;
        }
        
        setHealth(p.hp);
        playExplosion();
        addShake(15); // Big shake on collision
        statsRef.current.combo = 0; setCombo(0); // Lose combo
        spawnExplosion(p.pos.x + p.size.x/2, p.pos.y + p.size.y/2, '#ef4444', 10);
        
        if (p.hp <= 0) {
          playGameOver();
          onGameOver(statsRef.current);
        }
      }
    });

    // 4. Powerups hit Player
    powerupsRef.current.forEach(pu => {
       if (p.pos.x < pu.pos.x + pu.size.x &&
           p.pos.x + p.size.x > pu.pos.x &&
           p.pos.y < pu.pos.y + pu.size.y &&
           p.pos.y + p.size.y > pu.pos.y) {
           
           pu.hp = 0; // Mark for removal

           if (pu.powerUpType === 'HEALTH') {
              playPowerUp();
              p.hp = Math.min(p.maxHp, p.hp + 20);
              setHealth(p.hp);
           } else {
             playWeaponUp();
             // Apply Weapon
             if (pu.powerUpType === 'WEAPON_SPREAD') p.weaponType = 'SPREAD';
             if (pu.powerUpType === 'WEAPON_RAPID') p.weaponType = 'RAPID';
             if (pu.powerUpType === 'WEAPON_PLASMA') p.weaponType = 'PLASMA';
           }
           
           spawnExplosion(pu.pos.x + 12, pu.pos.y + 12, pu.color, 8);
           spawnFloatingText(pu.pos.x, pu.pos.y, pu.powerUpType?.replace('WEAPON_', '') || 'HP', '#fff');
       }
    });

    // Cleanup
    projectilesRef.current = projectilesRef.current.filter(p => 
      p.damage > 0 && p.pos.y > -50 && p.pos.y < height + 50
    );
    enemiesRef.current = enemiesRef.current.filter(e => e.hp > 0 && (e.type === 'boss' ? true : e.pos.y < height + 100));
    powerupsRef.current = powerupsRef.current.filter(pu => pu.hp > 0 && pu.pos.y < height + 50);
  };

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Clear
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    
    // Apply Shake
    if (shakeIntensityRef.current > 0) {
      const dx = (Math.random() - 0.5) * shakeIntensityRef.current;
      const dy = (Math.random() - 0.5) * shakeIntensityRef.current;
      ctx.translate(dx, dy);
    }

    // Draw Stars with Parallax
    ctx.fillStyle = '#ffffff';
    starsRef.current.forEach(star => {
      const twinkle = Math.sin((frameCountRef.current * 0.05) + (star.x * 20)) * 0.15;
      const alpha = Math.max(0.1, Math.min(1, star.brightness + twinkle));
      ctx.globalAlpha = alpha;
      const yPos = (star.y * height + frameCountRef.current * star.speed) % height;
      ctx.fillRect(star.x * width, yPos, star.size, star.size);
    });
    ctx.globalAlpha = 1.0;

    // Draw Powerups
    powerupsRef.current.forEach(pu => {
        ctx.fillStyle = pu.color;
        ctx.shadowColor = pu.color;
        ctx.shadowBlur = 10;
        const px = pu.pos.x;
        const py = pu.pos.y;
        const s = pu.size.x;

        ctx.strokeStyle = pu.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, s, s);
        ctx.globalAlpha = 0.3;
        ctx.fillRect(px, py, s, s);
        ctx.globalAlpha = 1.0;

        ctx.fillStyle = '#fff';
        ctx.font = '16px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let symbol = '+';
        if (pu.powerUpType === 'WEAPON_SPREAD') symbol = 'S';
        if (pu.powerUpType === 'WEAPON_RAPID') symbol = 'R';
        if (pu.powerUpType === 'WEAPON_PLASMA') symbol = 'P';
        ctx.fillText(symbol, px + s/2, py + s/2 + 2);
        ctx.shadowBlur = 0;
    });

    // Draw Projectiles
    projectilesRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 5;
      ctx.shadowColor = p.color;
      
      if (!p.isPlayer) {
        // Enemy Projectile (Orbs/Beams)
        ctx.beginPath();
        ctx.arc(p.pos.x + p.size/2, p.pos.y + p.size/2, p.size/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (p.type === 'PLASMA') {
        ctx.fillRect(p.pos.x, p.pos.y, p.size, p.size * 3);
      } else if (p.type === 'SPREAD') {
        ctx.beginPath();
        ctx.arc(p.pos.x + p.size/2, p.pos.y + p.size/2, p.size/2, 0, Math.PI*2);
        ctx.fill();
      } else if (p.type === 'RAPID') {
        ctx.fillRect(p.pos.x, p.pos.y, p.size, p.size * 2);
      } else {
        ctx.beginPath();
        ctx.ellipse(p.pos.x + 2, p.pos.y + 6, 2, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    });

    // Draw Enemies & Boss
    enemiesRef.current.forEach(e => {
      ctx.fillStyle = e.color;
      ctx.shadowBlur = 5;
      ctx.shadowColor = e.color;

      const ex = e.pos.x;
      const ey = e.pos.y;
      const ew = e.size.x;
      const eh = e.size.y;

      if (e.type === 'enemy_basic') {
        ctx.beginPath();
        ctx.moveTo(ex + ew/2, ey + eh);
        ctx.lineTo(ex + ew, ey); 
        ctx.lineTo(ex + ew/2, ey + eh * 0.3);
        ctx.lineTo(ex, ey);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(ex + ew/2, ey + eh * 0.4, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'enemy_fast') {
        ctx.beginPath();
        ctx.moveTo(ex + ew/2, ey + eh);
        ctx.lineTo(ex + ew, ey);
        ctx.lineTo(ex + ew/2, ey + eh * 0.2);
        ctx.lineTo(ex, ey);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.moveTo(ex + ew/2, ey + eh);
        ctx.lineTo(ex + ew/2 + 2, ey);
        ctx.lineTo(ex + ew/2 - 2, ey);
        ctx.fill();
      } else if (e.type === 'enemy_kamikaze') {
        // Triangle pointing towards velocity
        ctx.save();
        ctx.translate(ex + ew/2, ey + eh/2);
        const angle = Math.atan2(e.velocity.y, e.velocity.x) - Math.PI/2;
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, ew/2); // Nose
        ctx.lineTo(-ew/2, -eh/2);
        ctx.lineTo(0, -eh/4); // Indent
        ctx.lineTo(ew/2, -eh/2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.restore();
      } else if (e.type === 'boss') {
         // Massive Boss Sprite
         ctx.fillStyle = e.phase === 2 ? '#d946ef' : e.color; // Flashier in phase 2
         ctx.beginPath();
         // Main Body (Hexagon-ish)
         ctx.moveTo(ex + ew/2, ey + eh);
         ctx.lineTo(ex + ew, ey + eh * 0.6);
         ctx.lineTo(ex + ew, ey + eh * 0.2);
         ctx.lineTo(ex + ew/2, ey);
         ctx.lineTo(ex, ey + eh * 0.2);
         ctx.lineTo(ex, ey + eh * 0.6);
         ctx.closePath();
         ctx.fill();
         
         // Cannons
         ctx.fillStyle = '#581c87';
         ctx.fillRect(ex - 10, ey + eh*0.4, 20, 30);
         ctx.fillRect(ex + ew - 10, ey + eh*0.4, 20, 30);
         
         // Core
         const coreColor = e.phase === 2 ? '#f472b6' : '#fff';
         ctx.fillStyle = coreColor;
         ctx.shadowColor = coreColor;
         ctx.shadowBlur = 20;
         ctx.beginPath();
         ctx.arc(ex + ew/2, ey + eh/2, 12, 0, Math.PI * 2);
         ctx.fill();
         ctx.shadowBlur = 0;
         
         // Boss Health Bar
         const barW = 300;
         const barH = 20;
         const barX = width/2 - barW/2;
         const barY = 70; // Moved down to accommodate mission text
         
         ctx.fillStyle = 'rgba(0,0,0,0.5)';
         ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
         ctx.fillStyle = '#ef4444';
         ctx.fillRect(barX, barY, barW * (e.hp / e.maxHp), barH);
         ctx.strokeStyle = '#fff';
         ctx.lineWidth = 2;
         ctx.strokeRect(barX, barY, barW, barH);
         
         ctx.fillStyle = '#fff';
         ctx.textAlign = 'center';
         ctx.font = '12px "Share Tech Mono"';
         ctx.fillText(`DREADNOUGHT CLASS`, width/2, barY - 5);
      }
      ctx.shadowBlur = 0;
    });

    // Draw Particles (Now includes Trails)
    ctx.globalCompositeOperation = 'screen';
    particlesRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      
      if (playerConfig.trailType === 'plasma' && p.life < 0.7 && p.size > 2) {
          // Circular plasma particles
          ctx.beginPath();
          ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI*2);
          ctx.fill();
      } else {
          // Standard rect particles
          ctx.fillRect(p.pos.x, p.pos.y, p.size, p.size);
      }
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;

    // Draw Player
    if (playerRef.current.hp > 0 || gameState === GameState.CUSTOMIZE) {
      const p = playerRef.current;
      const px = p.pos.x;
      const py = p.pos.y;
      const pw = p.size.x;
      const ph = p.size.y;
      
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = p.color;
      
      ctx.beginPath();
      ctx.moveTo(px + pw/2, py);
      ctx.lineTo(px + pw * 0.65, py + ph * 0.6);
      ctx.lineTo(px + pw, py + ph * 0.8);
      ctx.lineTo(px + pw * 0.65, py + ph);
      ctx.lineTo(px + pw * 0.55, py + ph * 0.9);
      ctx.lineTo(px + pw * 0.45, py + ph * 0.9);
      ctx.lineTo(px + pw * 0.35, py + ph);
      ctx.lineTo(px, py + ph * 0.8);
      ctx.lineTo(px + pw * 0.35, py + ph * 0.6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.moveTo(px + pw/2, py + ph * 0.2);
      ctx.lineTo(px + pw * 0.55, py + ph * 0.4);
      ctx.lineTo(px + pw * 0.45, py + ph * 0.4);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + pw * 0.65, py + ph * 0.6);
      ctx.lineTo(px + pw, py + ph * 0.8);
      ctx.moveTo(px + pw * 0.35, py + ph * 0.6);
      ctx.lineTo(px, py + ph * 0.8);
      ctx.stroke();
      
      if (p.weaponType === 'SPREAD') {
        ctx.fillStyle = '#eab308';
        ctx.fillRect(px, py + ph * 0.5, 4, 10);
        ctx.fillRect(px + pw - 4, py + ph * 0.5, 4, 10);
      } else if (p.weaponType === 'PLASMA') {
        ctx.fillStyle = '#a855f7';
        ctx.fillRect(px + pw/2 - 3, py + ph * 0.1, 6, 10);
      }
      
      ctx.shadowBlur = 0;
    }

    // Draw Floating Texts
    floatingTextsRef.current.forEach(ft => {
      ctx.globalAlpha = ft.life;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 16px "Share Tech Mono"'; // Using different font for clarity
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.pos.x, ft.pos.y);
      ctx.globalAlpha = 1.0;
    });

    ctx.restore(); // END Shake transform

    // Draw HUD: Mission Status (Fixed position, does not shake)
    if (gameState === GameState.PLAYING) {
      const m = statsRef.current.mission;
      
      // Background bar
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(width/2 - 150, 10, 300, 30);
      ctx.strokeStyle = '#4ade80'; // green-400
      ctx.lineWidth = 1;
      ctx.strokeRect(width/2 - 150, 10, 300, 30);
      
      ctx.fillStyle = '#4ade80';
      ctx.font = '12px "Share Tech Mono"';
      ctx.textAlign = 'center';
      
      let statusText = '';
      if (m.type === 'ELIMINATION') {
         statusText = `KILLS: ${m.currentValue} / ${m.targetValue}`;
      } else if (m.type === 'SURVIVAL') {
         const timeLeft = Math.max(0, Math.ceil(m.targetValue - m.currentValue / 60));
         statusText = `TIME REMAINING: ${timeLeft}s`;
         // Danger color for survival
         ctx.fillStyle = timeLeft < 10 ? '#ef4444' : '#4ade80';
      } else if (m.type === 'BOSS') {
         statusText = 'OBJECTIVE: DESTROY TARGET';
         ctx.fillStyle = '#d946ef';
      }
      
      ctx.fillText(`WAVE ${statsRef.current.wave} - ${statusText}`, width/2, 30);
      
      // Mission Complete Overlay
      if (statsRef.current.mission.isComplete) {
         ctx.fillStyle = 'rgba(0,0,0,0.7)';
         ctx.fillRect(0, height/2 - 40, width, 80);
         
         // Flash effect on transition start
         const flashAlpha = Math.max(0, 1 - waveTransitionTimer.current / 15);
         if (flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.8})`;
            ctx.fillRect(0, 0, width, height);
         }

         // Text Pulse
         const textAlpha = 0.5 + Math.sin(frameCountRef.current * 0.1) * 0.5;
         ctx.fillStyle = `rgba(74, 222, 128, ${textAlpha})`;
         ctx.font = '30px "Press Start 2P"';
         ctx.textAlign = 'center';
         ctx.fillText("MISSION ACCOMPLISHED", width/2, height/2 + 10);
      }
    }
  };

  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (gameState === GameState.PLAYING || gameState === GameState.CUSTOMIZE) {
      update(canvas);
    }
    draw(ctx, canvas.width, canvas.height);

    requestRef.current = requestAnimationFrame(loop);
  }, [gameState, playerConfig]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [loop]);

  const handleTouch = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (gameState !== GameState.PLAYING) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
       clientX = e.touches[0].clientX;
       clientY = e.touches[0].clientY;
    } else {
       clientX = (e as React.MouseEvent).clientX;
       clientY = (e as React.MouseEvent).clientY;
    }

    targetPosRef.current = {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }, [gameState]);

  useEffect(() => {
    if (gameState === GameState.MENU) {
      playerRef.current.hp = 100;
      playerRef.current.weaponType = 'BLASTER';
      enemiesRef.current = [];
      projectilesRef.current = [];
      particlesRef.current = [];
      powerupsRef.current = [];
      floatingTextsRef.current = [];
      // Reset Stats and Mission
      statsRef.current = { 
        score: 0, 
        wave: 1, 
        enemiesDestroyed: 0, 
        shotsFired: 0,
        combo: 0,
        maxCombo: 0,
        mission: { type: 'ELIMINATION', description: '', targetValue: 10, currentValue: 0, isComplete: false }
      };
      setScore(0);
      setCombo(0);
      setHealth(100);
      frameCountRef.current = 0;
      waveTransitionTimer.current = 0;
      shakeIntensityRef.current = 0;
      comboTimerRef.current = 0;
    }
  }, [gameState]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full block cursor-crosshair"
      onTouchMove={handleTouch}
      onTouchStart={handleTouch}
      onMouseMove={handleTouch}
      onMouseDown={handleTouch}
    />
  );
};