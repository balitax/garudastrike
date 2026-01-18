
let audioCtx: AudioContext | null = null;

export const initAudio = () => {
  if (typeof window === 'undefined') return;
  
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
};

export const playShoot = (type: string = 'BLASTER') => {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  // Alter pitch based on weapon
  const startFreq = type === 'PLASMA' ? 200 : (type === 'SPREAD' ? 660 : 880);
  const endFreq = type === 'PLASMA' ? 50 : 110;

  osc.type = type === 'PLASMA' ? 'sawtooth' : 'square';
  osc.frequency.setValueAtTime(startFreq, t);
  osc.frequency.exponentialRampToValueAtTime(endFreq, t + 0.1);
  
  gain.gain.setValueAtTime(0.05, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.1);
};

export const playExplosion = (isBoss: boolean = false) => {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const duration = isBoss ? 0.8 : 0.3;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(isBoss ? 80 : 100, t);
  osc.frequency.exponentialRampToValueAtTime(10, t + duration);
  
  gain.gain.setValueAtTime(isBoss ? 0.3 : 0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration);
};

export const playPowerUp = () => {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  
  const playTone = (freq: number, startTime: number) => {
    const osc = audioCtx!.createOscillator();
    const gain = audioCtx!.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    
    gain.gain.setValueAtTime(0.1, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
    
    osc.connect(gain);
    gain.connect(audioCtx!.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.15);
  };
  
  playTone(523.25, t); // C5
  playTone(659.25, t + 0.1); // E5
  playTone(783.99, t + 0.2); // G5
};

export const playWeaponUp = () => {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();

  // Modulate
  lfo.frequency.value = 15;
  lfo.type = 'square';
  lfoGain.gain.value = 500;

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(440, t);
  osc.frequency.linearRampToValueAtTime(880, t + 0.4);

  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  
  gain.gain.setValueAtTime(0.1, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.4);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  lfo.start(t);
  osc.start(t);
  lfo.stop(t + 0.4);
  osc.stop(t + 0.4);
};

export const playGameOver = () => {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(440, t);
  osc.frequency.linearRampToValueAtTime(50, t + 1.5);
  
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.linearRampToValueAtTime(0, t + 1.5);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 1.5);
};

export const playWaveTransition = () => {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  // Slide up
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(110, t); // Low A
  osc.frequency.exponentialRampToValueAtTime(880, t + 0.6); // High A
  
  // Volume envelope
  gain.gain.setValueAtTime(0.1, t);
  gain.gain.linearRampToValueAtTime(0.1, t + 0.4);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.6);

  // Add a "shimmer" layer
  const osc2 = audioCtx.createOscillator();
  const gain2 = audioCtx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(440, t);
  osc2.frequency.linearRampToValueAtTime(880 * 2, t + 0.8);
  
  gain2.gain.setValueAtTime(0, t);
  gain2.gain.linearRampToValueAtTime(0.05, t + 0.1);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

  osc2.connect(gain2);
  gain2.connect(audioCtx.destination);
  osc2.start(t);
  osc2.stop(t + 0.8);
};
