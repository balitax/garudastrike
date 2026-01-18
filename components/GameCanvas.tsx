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
    size: { x: 40, y: 48 },
    velocity: { x: 0, y: 0 },
    color: playerConfig.color,
    hp: 100,
    maxHp: 100,
    type: 'player',
    weaponType: 'BLASTER',
    scoreValue: 0,
    hitTimer: 0,
    bankAngle: 0
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

  // Init Stars
  useEffect(() => {
    if (starsRef.current.length === 0) {
      for (let i = 0; i < 100; i++) {
        starsRef.current.push({
          x: Math.random(),
          y: Math.random(),
          size: Math.random() * 2 + 0.5,
          speed: Math.random() * 2 + 0.5,
          brightness: Math.random()
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
      description = 'DEFEAT DREADNOUGHT';
    } else {
      const rand = Math.random();
      if (wave > 2 && rand > 0.6) {
        type = 'SURVIVAL';
        target = 30 + (Math.min(wave, 10) * 2); // Seconds
        description = `SURVIVE ASSAULT: ${target}s`;
      }
    }

    statsRef.current.mission = {
      type,
      description,
      targetValue: target,
      currentValue: 0,
      isComplete: false,
      timer: 0
    };
  };

  const spawnBoss = (width: number, wave: number) => {
    const hp = 500 + (wave * 150);
    const size = { x: 120, y: 100 };
    
    enemiesRef.current.push({
      id: `boss-${wave}`,
      pos: { x: width / 2 - size.x / 2, y: -150 },
      size,
      velocity: { x: 0, y: 0 },
      hp,
      maxHp: hp,
      type: 'boss',
      color: '#a855f7',
      scoreValue: 5000 * Math.ceil(wave / 5),
      phase: 1,
      attackTimer: 0,
      moveTimer: 0,
      hitTimer: 0,
      rotation: 0
    });
  };

  const spawnEnemy = (width: number) => {
    const typeRoll = Math.random();
    let type: Entity['type'] = 'enemy_basic';
    let size = { x: 32, y: 32 };
    let hp = 1;
    let speed = 2;
    let color = '#ef4444';
    let score = 100;

    if (typeRoll > 0.85) {
      type = 'enemy_fast';
      size = { x: 24, y: 28 };
      speed = 4;
      hp = 1;
      color = '#f59e0b';
      score = 200;
    } else if (statsRef.current.wave > 2 && typeRoll > 0.70) {
      type = 'enemy_kamikaze';
      size = { x: 28, y: 28 };
      speed = 2.5;
      hp = 2;
      color = '#f97316';
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
      scoreValue: score,
      hitTimer: 0,
      rotation: 0
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
      velocity: { x: 0, y: 2 },
      hp: 1,
      maxHp: 1,
      type: 'powerup',
      powerUpType: pType,
      color: color,
      scoreValue: 0,
      rotation: 0
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
      for(let i=0; i<3; i++) {
        const angle = Math.PI + Math.random() * Math.PI;
        addP(Math.cos(angle) * 2, Math.sin(angle) * 2, '#34d399', 2, 0.3);
      }
    } else if (type === 'SPREAD') {
      for(let i=0; i<5; i++) {
        addP((Math.random()-0.5)*4, -Math.random()*4, '#eab308', 3, 0.3);
      }
    }
  };

  const spawnTrailParticles = () => {
    const p = playerRef.current;
    if (p.hp <= 0) return;

    if (frameCountRef.current % 3 !== 0) return;

    const engineLeftX = p.pos.x + p.size.x * 0.3;
    const engineRightX = p.pos.x + p.size.x * 0.7;
    const engineY = p.pos.y + p.size.y - 5;

    const spawnAt = (x: number, y: number) => {
        let color = '#3b82f6';
        if (playerConfig.trailType === 'plasma') color = '#22d3ee';
        if (playerConfig.trailType === 'turbo') color = '#fbbf24';
        
        particlesRef.current.push({
            id: Math.random().toString(),
            pos: { x: x + (Math.random() * 4 - 2), y: y },
            velocity: { x: (Math.random() - 0.5) * 0.5, y: Math.random() * 3 + 2 },
            life: 0.6,
            maxLife: 0.6,
            color: color,
            size: Math.random() * 3 + 1
        });
    };

    spawnAt(engineLeftX, engineY);
    spawnAt(engineRightX, engineY);
  };

  const fireWeapon = () => {
    const p = playerRef.current;
    const weapon = p.weaponType || 'BLASTER';
    
    playShoot(weapon);
    statsRef.current.shotsFired++;
    
    const noseX = p.pos.x + p.size.x / 2;
    const noseY = p.pos.y;
    spawnMuzzleFlash(noseX, noseY, weapon);

    const spawnBullet = (vx: number, vy: number, damage: number, size: number, color: string, type: WeaponType) => {
      projectilesRef.current.push({
        id: Math.random().toString(),
        pos: { x: noseX - size/2, y: noseY - size },
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
        spawnBullet(0, -12, 1, 4, '#eab308', 'SPREAD');
        spawnBullet(-3, -11, 1, 4, '#eab308', 'SPREAD');
        spawnBullet(3, -11, 1, 4, '#eab308', 'SPREAD');
        break;
      case 'PLASMA':
        spawnBullet(0, -16, 3, 8, '#a855f7', 'PLASMA');
        break;
      case 'RAPID':
        spawnBullet(0, -14, 1, 3, '#06b6d4', 'RAPID');
        break;
      case 'BLASTER':
      default:
        spawnBullet(0, -14, 1, 4, '#34d399', 'BLASTER');
        break;
    }
  };
  
  const spawnEnemyProjectile = (x: number, y: number, vx: number, vy: number, type: WeaponType) => {
      projectilesRef.current.push({
        id: Math.random().toString(),
        pos: { x: x - 5, y: y }, 
        velocity: { x: vx, y: vy },
        isPlayer: false,
        damage: 15,
        color: '#ef4444',
        size: 8,
        type: type
      });
  };

  const update = (canvas: HTMLCanvasElement) => {
    const width = canvas.width;
    const height = canvas.height;
    frameCountRef.current++;

    if (shakeIntensityRef.current > 0) {
      shakeIntensityRef.current *= 0.9;
      if (shakeIntensityRef.current < 0.5) shakeIntensityRef.current = 0;
    }

    if (comboTimerRef.current > 0) {
      comboTimerRef.current--;
      if (comboTimerRef.current <= 0) {
        statsRef.current.combo = 0;
        setCombo(0);
      }
    }

    // Initialize Game
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
      
      spawnTrailParticles();
      
      particlesRef.current.forEach(part => {
        part.pos.x += part.velocity.x;
        part.pos.y += part.velocity.y;
        part.life -= 0.02;
      });
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);
      return; 
    }

    if (gameState !== GameState.PLAYING) return;
    
    // Wave Transition
    if (statsRef.current.mission.isComplete) {
      waveTransitionTimer.current++;
      if (waveTransitionTimer.current === 1) {
        playWaveTransition();
      }
      if (waveTransitionTimer.current > 120) {
        statsRef.current.wave++;
        initMission(statsRef.current.wave);
        waveTransitionTimer.current = 0;
        projectilesRef.current = [];
        enemiesRef.current = [];
      }
      return;
    }

    // Move Player
    const p = playerRef.current;
    const targetX = targetPosRef.current.x - p.size.x / 2;
    const diffX = targetX - p.pos.x;
    
    const MAX_BANK = 0.4;
    const targetBank = Math.max(-MAX_BANK, Math.min(MAX_BANK, diffX * 0.02));
    p.bankAngle = (p.bankAngle || 0) + (targetBank - (p.bankAngle || 0)) * 0.1;
    
    p.pos.x += diffX * PLAYER_SPEED_LERP;
    p.pos.y += (targetPosRef.current.y - p.size.y - 20 - p.pos.y) * PLAYER_SPEED_LERP;

    p.pos.x = Math.max(0, Math.min(width - p.size.x, p.pos.x));
    p.pos.y = Math.max(0, Math.min(height - p.size.y, p.pos.y));
    
    if (p.hitTimer && p.hitTimer > 0) p.hitTimer--;

    spawnTrailParticles();

    // Auto Shoot
    const currentCooldown = p.weaponType === 'RAPID' ? RAPID_SHOOT_COOLDOWN : BASE_SHOOT_COOLDOWN;
    if (frameCountRef.current % currentCooldown === 0) {
      fireWeapon();
    }
    
    // Mission Updates
    const mission = statsRef.current.mission;
    if (mission.type === 'SURVIVAL') {
      mission.currentValue++;
      if (mission.currentValue >= mission.targetValue * 60) {
        mission.isComplete = true;
        playPowerUp();
      }
    } else if (mission.type === 'ELIMINATION') {
      if (mission.currentValue >= mission.targetValue) {
         mission.isComplete = true;
         playPowerUp();
      }
    }
    
    // Spawning Logic
    const currentWave = statsRef.current.wave;
    
    if (mission.type === 'BOSS') {
      const hasBoss = enemiesRef.current.some(e => e.type === 'boss');
      if (!hasBoss) {
        spawnBoss(width, currentWave);
      }
    } else {
      let rate = ENEMY_SPAWN_RATE - Math.floor(statsRef.current.score / 500);
      if (mission.type === 'SURVIVAL') {
        rate = Math.max(15, rate * 0.6);
      } else {
        rate = Math.max(20, rate);
      }
      
      if (frameCountRef.current % Math.floor(rate) === 0) {
        spawnEnemy(width);
      }
    }

    // Update Entities
    enemiesRef.current.forEach(e => {
      if (e.hitTimer && e.hitTimer > 0) e.hitTimer--;
      
      if (e.type === 'boss') {
         e.moveTimer = (e.moveTimer || 0) + 1;
         e.attackTimer = (e.attackTimer || 0) + 1;
         
         if (e.pos.y < 80) {
           e.pos.y += 2;
           e.pos.x += (width/2 - e.size.x/2 - e.pos.x) * 0.05;
         } else {
           const hoverX = (width/2 - e.size.x/2) + Math.sin(e.moveTimer * 0.02) * (width * 0.3);
           e.pos.x += (hoverX - e.pos.x) * 0.05;
         }
         
         if (e.hp < e.maxHp * 0.5) {
           e.phase = 2;
         } else {
           e.phase = 1;
         }
         
         const attackRate = e.phase === 2 ? 40 : 80;
         if (e.attackTimer > attackRate) {
           e.attackTimer = 0;
           const cx = e.pos.x + e.size.x / 2;
           const cy = e.pos.y + e.size.y;
           
           if (e.phase === 1) {
             spawnEnemyProjectile(cx - 30, cy - 20, 0, 5, 'ENEMY_PULSE');
             spawnEnemyProjectile(cx + 30, cy - 20, 0, 5, 'ENEMY_PULSE');
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
        e.rotation = (e.rotation || 0) + 0.1;
        const centerX = e.pos.x + e.size.x/2;
        const centerY = e.pos.y + e.size.y/2;
        const targetX = p.pos.x + p.size.x/2;
        const targetY = p.pos.y + p.size.y/2;
        
        const dx = targetX - centerX;
        const dy = targetY - centerY;
        const distance = Math.sqrt(dx*dx + dy*dy);
        
        if (distance > 0) {
            e.velocity.x += (dx / distance) * 0.1;
            e.velocity.y += (dy / distance) * 0.1;
            const maxSpeed = 5;
            const speed = Math.sqrt(e.velocity.x*e.velocity.x + e.velocity.y*e.velocity.y);
            if (speed > maxSpeed) {
                e.velocity.x = (e.velocity.x / speed) * maxSpeed;
                e.velocity.y = (e.velocity.y / speed) * maxSpeed;
            }
        }
        e.pos.x += e.velocity.x;
        e.pos.y += e.velocity.y;
      } else {
        e.pos.x += e.velocity.x;
        e.pos.y += e.velocity.y;
        if (e.velocity.x !== 0) {
             e.rotation = e.velocity.x * -0.1;
        } else {
            e.rotation = 0;
        }
      }
    });

    powerupsRef.current.forEach(pu => {
      pu.pos.x += pu.velocity.x;
      pu.pos.y += pu.velocity.y;
      pu.rotation = (pu.rotation || 0) + 0.05;
    });

    projectilesRef.current.forEach(proj => {
      proj.pos.x += proj.velocity.x;
      proj.pos.y += proj.velocity.y;
    });

    particlesRef.current.forEach(part => {
      part.pos.x += part.velocity.x;
      part.pos.y += part.velocity.y;
      part.life -= 0.02;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    floatingTextsRef.current.forEach(ft => {
      ft.pos.x += ft.velocity.x;
      ft.pos.y += ft.velocity.y;
      ft.life -= 0.02;
    });
    floatingTextsRef.current = floatingTextsRef.current.filter(ft => ft.life > 0);

    // Collisions
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
        enemy.hitTimer = 5;
        proj.damage = 0; 
        
        spawnExplosion(proj.pos.x, proj.pos.y, '#ffffff', 2);

        if (enemy.hp <= 0) {
          playExplosion(enemy.type === 'boss');
          addShake(enemy.type === 'boss' ? 20 : 5);
          
          comboTimerRef.current = COMBO_TIMEOUT_FRAMES;
          statsRef.current.combo++;
          if (statsRef.current.combo > statsRef.current.maxCombo) {
             statsRef.current.maxCombo = statsRef.current.combo;
          }
          setCombo(statsRef.current.combo);

          const multiplier = Math.min(3, 1 + (statsRef.current.combo * 0.1));
          const finalScore = Math.floor(enemy.scoreValue * multiplier);

          statsRef.current.score += finalScore;
          statsRef.current.enemiesDestroyed++;
          setScore(statsRef.current.score);
          
          spawnExplosion(enemy.pos.x + enemy.size.x/2, enemy.pos.y + enemy.size.y/2, enemy.color, enemy.type === 'boss' ? 20 : 8);
          spawnFloatingText(enemy.pos.x + enemy.size.x/2, enemy.pos.y, `+${finalScore}`, '#facc15');
          
          if (statsRef.current.combo > 1) {
             spawnFloatingText(enemy.pos.x + enemy.size.x/2, enemy.pos.y - 15, `${statsRef.current.combo}x COMBO`, '#22d3ee');
          }

          if (mission.type === 'ELIMINATION' && !mission.isComplete) {
            mission.currentValue++;
          }
          
          if (enemy.type === 'boss') {
            mission.isComplete = true;
            playPowerUp();
            spawnPowerUp(enemy.pos.x + enemy.size.x/2 - 10, enemy.pos.y + enemy.size.y/2);
            spawnPowerUp(enemy.pos.x + enemy.size.x/2 + 20, enemy.pos.y + enemy.size.y/2);
          } else if (Math.random() < 0.15) {
             spawnPowerUp(enemy.pos.x + enemy.size.x/2 - 10, enemy.pos.y + enemy.size.y/2);
          }
        }
      }
    });
    
    projectilesRef.current.filter(proj => !proj.isPlayer).forEach(proj => {
      if (p.pos.x < proj.pos.x + proj.size &&
          p.pos.x + p.size.x > proj.pos.x &&
          p.pos.y < proj.pos.y + proj.size &&
          p.pos.y + p.size.y > proj.pos.y) {
          
        proj.damage = 0;
        p.hp -= 15;
        p.hitTimer = 5;
        p.weaponType = 'BLASTER';
        setHealth(p.hp);
        playExplosion();
        addShake(10);
        statsRef.current.combo = 0; setCombo(0);
        spawnExplosion(p.pos.x + p.size.x/2, p.pos.y + p.size.y/2, '#ef4444', 5);
        
        if (p.hp <= 0) {
          playGameOver();
          onGameOver(statsRef.current);
        }
      }
    });

    enemiesRef.current.forEach(e => {
      if (e.hp > 0 && 
          p.pos.x < e.pos.x + e.size.x &&
          p.pos.x + p.size.x > e.pos.x &&
          p.pos.y < e.pos.y + e.size.y &&
          p.pos.y + p.size.y > e.pos.y) {
            
        p.hp -= 20;
        p.hitTimer = 10;
        p.weaponType = 'BLASTER';
        if (e.type !== 'boss') e.hp = 0;
        
        if (e.type !== 'boss' && mission.type === 'ELIMINATION') {
           mission.currentValue++;
        }
        
        setHealth(p.hp);
        playExplosion();
        addShake(15);
        statsRef.current.combo = 0; setCombo(0);
        spawnExplosion(p.pos.x + p.size.x/2, p.pos.y + p.size.y/2, '#ef4444', 10);
        
        if (p.hp <= 0) {
          playGameOver();
          onGameOver(statsRef.current);
        }
      }
    });

    powerupsRef.current.forEach(pu => {
       if (p.pos.x < pu.pos.x + pu.size.x &&
           p.pos.x + p.size.x > pu.pos.x &&
           p.pos.y < pu.pos.y + pu.size.y &&
           p.pos.y + p.size.y > pu.pos.y) {
           
           pu.hp = 0;

           if (pu.powerUpType === 'HEALTH') {
              playPowerUp();
              p.hp = Math.min(p.maxHp, p.hp + 20);
              setHealth(p.hp);
           } else {
             playWeaponUp();
             if (pu.powerUpType === 'WEAPON_SPREAD') p.weaponType = 'SPREAD';
             if (pu.powerUpType === 'WEAPON_RAPID') p.weaponType = 'RAPID';
             if (pu.powerUpType === 'WEAPON_PLASMA') p.weaponType = 'PLASMA';
           }
           
           spawnExplosion(pu.pos.x + 12, pu.pos.y + 12, pu.color, 8);
           spawnFloatingText(pu.pos.x, pu.pos.y, pu.powerUpType?.replace('WEAPON_', '') || 'HP', '#fff');
       }
    });

    projectilesRef.current = projectilesRef.current.filter(p => 
      p.damage > 0 && p.pos.y > -50 && p.pos.y < height + 50
    );
    enemiesRef.current = enemiesRef.current.filter(e => e.hp > 0 && (e.type === 'boss' ? true : e.pos.y < height + 100));
    powerupsRef.current = powerupsRef.current.filter(pu => pu.hp > 0 && pu.pos.y < height + 50);
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
    ctx.lineWidth = 1;

    const offset = (frameCountRef.current * 2) % 40;
    for (let y = offset; y < height; y += 40) {
      ctx.globalAlpha = Math.max(0, (y / height) * 0.3);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const centerX = width / 2;
    const bottomSpacing = 80;
    for (let x = -width; x < width * 2; x += bottomSpacing) {
       ctx.globalAlpha = 0.15;
       ctx.beginPath();
       const vanishingPointX = centerX;
       const vanishingPointY = -200;
       
       ctx.moveTo(vanishingPointX, vanishingPointY);
       ctx.lineTo(x, height);
       ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  };

  const drawPlayer = (ctx: CanvasRenderingContext2D, p: Entity) => {
    const cx = p.pos.x + p.size.x / 2;
    const cy = p.pos.y + p.size.y / 2;
    
    ctx.save();
    ctx.translate(cx, cy);
    if (p.bankAngle) ctx.rotate(p.bankAngle);
    
    if (p.hitTimer && p.hitTimer > 0) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
    }

    ctx.beginPath();
    ctx.moveTo(0, -p.size.y/2); 
    ctx.lineTo(6, -p.size.y/4);
    ctx.lineTo(8, p.size.y/4);
    ctx.lineTo(p.size.x/2, p.size.y/3);
    ctx.lineTo(p.size.x/2, p.size.y/2);
    ctx.lineTo(8, p.size.y/3);
    ctx.lineTo(4, p.size.y/2);
    ctx.lineTo(-4, p.size.y/2);
    ctx.lineTo(-8, p.size.y/3);
    ctx.lineTo(-p.size.x/2, p.size.y/2);
    ctx.lineTo(-p.size.x/2, p.size.y/3);
    ctx.lineTo(-8, p.size.y/4);
    ctx.lineTo(-6, -p.size.y/4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1e293b'; 
    ctx.beginPath();
    ctx.moveTo(0, -p.size.y/3);
    ctx.lineTo(3, -5);
    ctx.lineTo(0, 0);
    ctx.lineTo(-3, -5);
    ctx.fill();
    
    if (!p.hitTimer) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
        ctx.beginPath();
        ctx.rect(-6, p.size.y/2 - 2, 4, 8);
        ctx.rect(2, p.size.y/2 - 2, 4, 8);
        ctx.fill();
    }

    ctx.restore();
  };

  const drawEnemy = (ctx: CanvasRenderingContext2D, e: Entity) => {
    const cx = e.pos.x + e.size.x / 2;
    const cy = e.pos.y + e.size.y / 2;
    
    ctx.save();
    ctx.translate(cx, cy);
    if (e.rotation) ctx.rotate(e.rotation);

    if (e.hitTimer && e.hitTimer > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = e.color;
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 5;
    }

    if (e.type === 'enemy_basic') {
      ctx.fillRect(-e.size.x/2, -e.size.y/2, 6, e.size.y);
      ctx.fillRect(e.size.x/2 - 6, -e.size.y/2, 6, e.size.y);
      ctx.fillRect(-e.size.x/2, -4, e.size.x, 8);
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2;
      ctx.stroke();

    } else if (e.type === 'enemy_fast') {
      ctx.beginPath();
      ctx.moveTo(0, e.size.y/2);
      ctx.lineTo(e.size.x/2, -e.size.y/2);
      ctx.lineTo(0, -e.size.y/4);
      ctx.lineTo(-e.size.x/2, -e.size.y/2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-2, -e.size.y/2, 4, 6);

    } else if (e.type === 'enemy_kamikaze') {
      const spikes = 8;
      ctx.beginPath();
      for(let i=0; i<spikes * 2; i++) {
        const r = i % 2 === 0 ? e.size.x/2 : e.size.x/4;
        const a = (Math.PI * 2 * i) / (spikes * 2);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      const pulse = 4 + Math.sin(frameCountRef.current * 0.5) * 2;
      ctx.beginPath();
      ctx.arc(0, 0, pulse, 0, Math.PI*2);
      ctx.fill();

    } else if (e.type === 'boss') {
       ctx.beginPath();
       ctx.moveTo(0, e.size.y/2);
       ctx.lineTo(e.size.x/2, 0);
       ctx.lineTo(e.size.x/3, -e.size.y/2);
       ctx.lineTo(-e.size.x/3, -e.size.y/2);
       ctx.lineTo(-e.size.x/2, 0);
       ctx.closePath();
       ctx.fill();
       
       const tAngle = Math.sin(frameCountRef.current * 0.05) * 0.5;
       const drawTurret = (tx: number, ty: number) => {
         ctx.save();
         ctx.translate(tx, ty);
         ctx.rotate(tAngle);
         ctx.fillStyle = '#4c1d95';
         ctx.fillRect(-4, 0, 8, 15);
         ctx.beginPath();
         ctx.arc(0, 0, 8, 0, Math.PI*2);
         ctx.fill();
         ctx.restore();
       };
       
       drawTurret(-e.size.x/3, 0);
       drawTurret(e.size.x/3, 0);

       const coreColor = e.phase === 2 ? '#f472b6' : '#fff';
       ctx.fillStyle = coreColor;
       ctx.shadowColor = coreColor;
       ctx.shadowBlur = 15;
       ctx.beginPath();
       ctx.arc(0, -10, 15, 0, Math.PI*2);
       ctx.fill();
    }
    
    ctx.restore();
  };

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    
    if (shakeIntensityRef.current > 0) {
      const dx = (Math.random() - 0.5) * shakeIntensityRef.current;
      const dy = (Math.random() - 0.5) * shakeIntensityRef.current;
      ctx.translate(dx, dy);
    }

    ctx.fillStyle = '#ffffff';
    starsRef.current.forEach(star => {
      const twinkle = Math.sin((frameCountRef.current * 0.05) + (star.x * 20)) * 0.15;
      const alpha = Math.max(0.1, Math.min(1, star.brightness + twinkle));
      ctx.globalAlpha = alpha;
      const yPos = (star.y * height + frameCountRef.current * star.speed) % height;
      ctx.fillRect(star.x * width, yPos, star.size, star.size);
    });
    ctx.globalAlpha = 1.0;

    drawGrid(ctx, width, height);

    powerupsRef.current.forEach(pu => {
        ctx.save();
        ctx.translate(pu.pos.x + pu.size.x/2, pu.pos.y + pu.size.y/2);
        if (pu.rotation) ctx.rotate(pu.rotation);
        
        ctx.fillStyle = pu.color;
        ctx.shadowColor = pu.color;
        ctx.shadowBlur = 10;
        const s = pu.size.x;

        ctx.strokeStyle = pu.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(-s/2, -s/2, s, s);
        ctx.globalAlpha = 0.3;
        ctx.fillRect(-s/2, -s/2, s, s);
        ctx.globalAlpha = 1.0;

        ctx.rotate(-pu.rotation!); 
        
        ctx.fillStyle = '#fff';
        ctx.font = '16px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let symbol = '+';
        if (pu.powerUpType === 'WEAPON_SPREAD') symbol = 'S';
        if (pu.powerUpType === 'WEAPON_RAPID') symbol = 'R';
        if (pu.powerUpType === 'WEAPON_PLASMA') symbol = 'P';
        ctx.fillText(symbol, 0, 2);
        
        ctx.restore();
    });

    projectilesRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;
      
      if (!p.isPlayer) {
        ctx.beginPath();
        ctx.arc(p.pos.x + p.size/2, p.pos.y + p.size/2, p.size/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.pos.x + p.size/2, p.pos.y + p.size/2, p.size/4, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'PLASMA') {
        ctx.beginPath();
        ctx.ellipse(p.pos.x + p.size/2, p.pos.y + p.size/2, p.size/2, p.size * 1.5, 0, 0, Math.PI*2);
        ctx.fill();
      } else if (p.type === 'SPREAD') {
        ctx.beginPath();
        ctx.arc(p.pos.x + p.size/2, p.pos.y + p.size/2, p.size/2, 0, Math.PI*2);
        ctx.fill();
      } else if (p.type === 'RAPID') {
        ctx.fillRect(p.pos.x, p.pos.y, p.size, p.size * 4);
      } else {
        ctx.beginPath();
        ctx.ellipse(p.pos.x + p.size/2, p.pos.y + p.size/2, p.size/2, p.size * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    });

    enemiesRef.current.forEach(e => {
        drawEnemy(ctx, e);
    });

    ctx.globalCompositeOperation = 'screen';
    particlesRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      
      if (playerConfig.trailType === 'plasma' && p.life < 0.7 && p.size > 2) {
          ctx.beginPath();
          ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI*2);
          ctx.fill();
      } else {
          ctx.fillRect(p.pos.x, p.pos.y, p.size, p.size);
      }
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;

    if (playerRef.current.hp > 0 || gameState === GameState.CUSTOMIZE) {
      drawPlayer(ctx, playerRef.current);
    }

    floatingTextsRef.current.forEach(ft => {
      ctx.globalAlpha = ft.life;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 16px "Share Tech Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.pos.x, ft.pos.y);
      ctx.globalAlpha = 1.0;
    });

    ctx.restore();

    if (gameState === GameState.PLAYING) {
      const m = statsRef.current.mission;
      
      const boss = enemiesRef.current.find(e => e.type === 'boss');
      if (boss) {
         const barW = Math.min(300, width - 40);
         const barH = 20;
         const barX = width/2 - barW/2;
         const barY = 50; 
         
         ctx.fillStyle = 'rgba(0,0,0,0.5)';
         ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
         ctx.fillStyle = '#ef4444';
         ctx.fillRect(barX, barY, barW * (boss.hp / boss.maxHp), barH);
         ctx.strokeStyle = '#fff';
         ctx.lineWidth = 2;
         ctx.strokeRect(barX, barY, barW, barH);
         
         ctx.fillStyle = '#fff';
         ctx.textAlign = 'center';
         ctx.font = '10px "Share Tech Mono"';
         ctx.fillText(`BOSS: ${Math.ceil(boss.hp)}`, width/2, barY + 14);
      }

      // Calculate HUD positions
      const missionBarW = Math.min(400, width - 40);
      const missionBarH = 30;
      const missionBarX = width/2 - missionBarW/2;
      const missionBarY = height - 40; 

      // 1. Player Health Bar - Moved to Bottom Stack
      const hpBarW = Math.min(200, width * 0.4);
      const hpBarH = 10;
      const hpBarX = width / 2 - hpBarW / 2;
      const hpBarY = missionBarY - 18; // 8px gap above mission bar
      
      const p = playerRef.current;
      const hpPercent = Math.max(0, p.hp / p.maxHp);
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(hpBarX, hpBarY, hpBarW, hpBarH);
      ctx.strokeStyle = '#374151'; 
      ctx.lineWidth = 1;
      ctx.strokeRect(hpBarX, hpBarY, hpBarW, hpBarH);
      
      ctx.fillStyle = hpPercent > 0.5 ? '#22c55e' : (hpPercent > 0.25 ? '#eab308' : '#ef4444');
      ctx.fillRect(hpBarX, hpBarY, hpBarW * hpPercent, hpBarH);
      
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px "Share Tech Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(`HP ${Math.ceil(p.hp)}%`, width / 2, hpBarY - 4);


      // 2. Mission/Wave Bar - Bottom Center
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(missionBarX, missionBarY, missionBarW, missionBarH);
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1;
      ctx.strokeRect(missionBarX, missionBarY, missionBarW, missionBarH);
      
      ctx.fillStyle = '#4ade80';
      ctx.font = '12px "Share Tech Mono"';
      ctx.textAlign = 'center';
      
      let statusText = '';
      if (m.type === 'ELIMINATION') {
         statusText = `KILLS: ${m.currentValue} / ${m.targetValue}`;
      } else if (m.type === 'SURVIVAL') {
         const timeLeft = Math.max(0, Math.ceil(m.targetValue - m.currentValue / 60));
         statusText = `TIME REMAINING: ${timeLeft}s`;
         if (timeLeft < 10) ctx.fillStyle = '#ef4444';
      } else if (m.type === 'BOSS') {
         statusText = 'TARGET LOCKED';
         ctx.fillStyle = '#d946ef';
      }
      
      ctx.fillText(`WAVE ${statsRef.current.wave} - ${statusText}`, width/2, missionBarY + 19);
      
      if (statsRef.current.mission.isComplete) {
         ctx.fillStyle = 'rgba(0,0,0,0.7)';
         ctx.fillRect(0, height/2 - 40, width, 80);
         
         const flashAlpha = Math.max(0, 1 - waveTransitionTimer.current / 15);
         if (flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.8})`;
            ctx.fillRect(0, 0, width, height);
         }

         const textAlpha = 0.5 + Math.sin(frameCountRef.current * 0.1) * 0.5;
         ctx.fillStyle = `rgba(74, 222, 128, ${textAlpha})`;
         
         // Responsive font size and split text to avoid overflow
         const fontSize = Math.min(24, width / 20); // Reduced sizing slightly
         ctx.font = `${fontSize}px "Press Start 2P"`;
         ctx.textAlign = 'center';
         
         ctx.fillText("MISSION", width/2, height/2 - 5);
         ctx.fillText("ACCOMPLISHED", width/2, height/2 + 25);
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
    
    // Crucial for mobile: prevent scrolling/zooming while playing
    if (e.cancelable) {
       e.preventDefault();
    }
    
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
      className="absolute top-0 left-0 w-full h-full block cursor-crosshair touch-none"
      onTouchMove={handleTouch}
      onTouchStart={handleTouch}
      onMouseMove={handleTouch}
      onMouseDown={handleTouch}
    />
  );
};