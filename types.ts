
export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  CUSTOMIZE = 'CUSTOMIZE'
}

export type TrailType = 'standard' | 'plasma' | 'turbo';
export type WeaponType = 'BLASTER' | 'SPREAD' | 'RAPID' | 'PLASMA' | 'ENEMY_PULSE' | 'ENEMY_BEAM';
export type PowerUpType = 'HEALTH' | 'WEAPON_SPREAD' | 'WEAPON_RAPID' | 'WEAPON_PLASMA';
export type MissionType = 'ELIMINATION' | 'SURVIVAL' | 'BOSS';

export interface PlayerConfig {
  color: string;
  trailType: TrailType;
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  pos: Vector2D;
  size: Vector2D;
  velocity: Vector2D;
  color: string;
  hp: number;
  maxHp: number;
  type: 'player' | 'enemy_basic' | 'enemy_fast' | 'enemy_kamikaze' | 'boss' | 'powerup';
  powerUpType?: PowerUpType; // Only for type === 'powerup'
  weaponType?: WeaponType;   // Only for type === 'player'
  scoreValue: number;
  // Visuals
  hitTimer?: number; // For flashing white when hit
  rotation?: number; // For rotating enemies
  bankAngle?: number; // For player tilting
  // Boss specific
  phase?: number;
  attackTimer?: number;
  moveTimer?: number;
}

export interface Projectile {
  id: string;
  pos: Vector2D;
  velocity: Vector2D;
  isPlayer: boolean;
  damage: number;
  color: string;
  size: number;
  type?: WeaponType; // To determine render style
}

export interface Particle {
  id: string;
  pos: Vector2D;
  velocity: Vector2D;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface FloatingText {
  id: string;
  text: string;
  pos: Vector2D;
  velocity: Vector2D;
  life: number;
  color: string;
  size: number;
}

export interface MissionState {
  type: MissionType;
  description: string;
  targetValue: number; // e.g., number of kills needed or seconds to survive
  currentValue: number; // e.g., current kills or time passed
  isComplete: boolean;
  timer?: number; // Internal timer for survival
}

export interface GameStats {
  score: number;
  wave: number;
  enemiesDestroyed: number;
  shotsFired: number;
  combo: number;
  maxCombo: number;
  mission: MissionState;
}