import React, { useState, useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameState, GameStats, PlayerConfig } from './types';
import { generateMissionDebrief } from './services/geminiService';
import { initAudio } from './utils/sound';

const COLORS = [
  { name: 'COBALT', value: '#3b82f6' },
  { name: 'CRIMSON', value: '#ef4444' },
  { name: 'EMERALD', value: '#22c55e' },
  { name: 'AMBER', value: '#eab308' },
  { name: 'VOID', value: '#a855f7' },
  { name: 'CYBER', value: '#06b6d4' },
];

const TRAILS = [
  { id: 'standard', name: 'ION DRIVE' },
  { id: 'plasma', name: 'PLASMA CORE' },
  { id: 'turbo', name: 'AFTERBURNER' },
];

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [health, setHealth] = useState(100);
  const [lastStats, setLastStats] = useState<GameStats | null>(null);
  const [debrief, setDebrief] = useState<string>("");
  const [showControls, setShowControls] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig>({
    color: '#3b82f6',
    trailType: 'standard'
  });

  // Load High Score
  useEffect(() => {
    const storedHighScore = localStorage.getItem('garuda_highscore');
    if (storedHighScore) {
      setHighScore(parseInt(storedHighScore, 10));
    }
  }, []);

  // Listen for PWA install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleStart = () => {
    initAudio(); // Unlock AudioContext on user interaction
    setGameState(GameState.PLAYING);
    setDebrief("");
    setCombo(0);
  };

  const handleInstallClick = () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        setInstallPrompt(null);
      }
    });
  };

  const handleGameOver = async (stats: GameStats) => {
    setGameState(GameState.GAME_OVER);
    setLastStats(stats);
    
    // Update High Score
    if (stats.score > highScore) {
      setHighScore(stats.score);
      localStorage.setItem('garuda_highscore', stats.score.toString());
    }
    
    // Get Static Debrief
    const text = await generateMissionDebrief(stats);
    setDebrief(text);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden crt-flicker">
      <div className="scanlines"></div>
      
      {/* Background/Game Layer */}
      <GameCanvas 
        gameState={gameState} 
        onGameOver={handleGameOver}
        setScore={setScore}
        setCombo={setCombo}
        setHealth={setHealth}
        playerConfig={playerConfig}
        highScore={highScore}
      />

      {/* UI Overlay */}
      {(gameState === GameState.PLAYING || gameState === GameState.GAME_OVER) && (
        <div className="absolute top-4 left-4 font-arcade text-green-400 z-10 pointer-events-none drop-shadow-md">
          <div>SCORE: {score.toString().padStart(6, '0')}</div>
          <div className="text-yellow-500 text-xs mt-1">HI: {Math.max(score, highScore).toString().padStart(6, '0')}</div>
          {/* HP Moved to GameCanvas render */}
          
          {/* Combo Meter */}
          {combo > 1 && (
            <div className="mt-4 animate-pulse">
              <div className="text-cyan-400 text-xl font-bold italic">COMBO x{combo}</div>
              <div className="w-24 h-1 bg-gray-800 mt-1">
                <div className="h-full bg-cyan-400 w-full animate-[ping_0.5s_ease-in-out]"></div> 
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls Legend Overlay */}
      {gameState === GameState.PLAYING && (
        <div 
          className="absolute top-4 right-4 z-20 flex flex-col items-end pointer-events-auto"
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          <button
            onClick={() => setShowControls(prev => !prev)}
            className="mb-2 px-2 py-1 bg-gray-900/50 border border-gray-600 text-[10px] font-mono text-gray-400 hover:text-white hover:bg-gray-800 transition-colors backdrop-blur-sm"
          >
            {showControls ? '[-]' : '[?]'}
          </button>
          
          {showControls && (
            <div className="flex flex-col items-end space-y-1 bg-black/60 p-3 rounded border border-gray-800 shadow-lg backdrop-blur-sm">
              <div className="flex items-center space-x-3 mb-1">
                <span className="text-[10px] font-mono text-gray-400">MOVE</span>
                <span className="text-[10px] font-arcade text-green-400">TOUCH/DRAG</span>
              </div>
              <div className="flex items-center space-x-3 mb-1">
                <span className="text-[10px] font-mono text-gray-400">FIRE</span>
                <span className="text-[10px] font-arcade text-green-400">AUTO</span>
              </div>
              <div className="w-full h-px bg-gray-700/50 my-1"></div>
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-mono text-gray-500 mb-1">UPGRADES</span>
                <div className="flex space-x-2">
                   <div className="flex flex-col items-center">
                     <span className="text-[8px] font-arcade text-yellow-500">S</span>
                     <span className="text-[8px] font-mono text-gray-600 scale-75">SPREAD</span>
                   </div>
                   <div className="flex flex-col items-center">
                     <span className="text-[8px] font-arcade text-cyan-500">R</span>
                     <span className="text-[8px] font-mono text-gray-600 scale-75">RAPID</span>
                   </div>
                   <div className="flex flex-col items-center">
                     <span className="text-[8px] font-arcade text-purple-500">P</span>
                     <span className="text-[8px] font-mono text-gray-600 scale-75">PLASMA</span>
                   </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Menu */}
      {gameState === GameState.MENU && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20 backdrop-blur-sm">
          <div className="text-center p-8 border-4 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)] bg-black max-w-md w-full mx-4">
            <h1 className="text-4xl md:text-6xl font-arcade text-green-500 mb-2 tracking-tighter">
              GARUDA<br/>STRIKE
            </h1>
            <p className="text-gray-400 mb-6 font-mono text-sm">DEFEND THE SKIES</p>
            
            <div className="mb-6 p-2 bg-gray-900 border border-gray-700">
               <span className="text-yellow-500 font-arcade text-sm">HI-SCORE: {highScore.toString().padStart(6, '0')}</span>
            </div>

            <div className="space-y-4">
              <button 
                onClick={handleStart}
                className="w-full py-4 bg-green-600 hover:bg-green-500 text-black font-arcade font-bold text-lg transition-all border-b-4 border-green-800 active:border-b-0 active:translate-y-1"
              >
                LAUNCH MISSION
              </button>
              
              <button 
                onClick={() => setGameState(GameState.CUSTOMIZE)}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-green-400 font-arcade text-sm transition-all border border-green-500/50"
              >
                HANGAR / CUSTOMIZE
              </button>
              
              {installPrompt && (
                <button 
                  onClick={handleInstallClick}
                  className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-blue-400 font-arcade text-sm transition-all border border-blue-500/50 animate-pulse"
                >
                  INSTALL SYSTEM
                </button>
              )}

              <div className="text-xs text-gray-500 mt-4 font-mono">
                CONTROLS:<br/>
                TOUCH & DRAG to Move<br/>
                AUTO-FIRE Enabled
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hangar / Customization Screen */}
      {gameState === GameState.CUSTOMIZE && (
        <div className="absolute inset-0 flex flex-col items-center justify-end md:justify-center pb-12 md:pb-0 bg-transparent z-20">
          {/* Note: The ship is rendered by GameCanvas in the background */}
          
          <div className="bg-black/90 p-6 border-2 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] max-w-md w-full mx-4 backdrop-blur-md">
            <div className="flex justify-between items-center mb-6 border-b border-blue-900 pb-2">
              <h2 className="text-xl font-arcade text-blue-400">HANGAR BAY</h2>
              <div className="text-xs font-mono text-blue-600">SYS: ONLINE</div>
            </div>

            <div className="space-y-6">
              {/* Color Selection */}
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-2">HULL COATING</label>
                <div className="grid grid-cols-6 gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => setPlayerConfig(prev => ({...prev, color: c.value}))}
                      className={`w-full aspect-square rounded-sm border-2 transition-all ${playerConfig.color === c.value ? 'border-white scale-110 shadow-[0_0_10px_white]' : 'border-transparent opacity-60 hover:opacity-100'}`}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              {/* Trail Selection */}
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-2">PROPULSION CORE</label>
                <div className="grid grid-cols-3 gap-2">
                  {TRAILS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setPlayerConfig(prev => ({...prev, trailType: t.id as any}))}
                      className={`py-2 px-1 text-[10px] md:text-xs font-mono border ${playerConfig.trailType === t.id ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-900 border-gray-700 text-gray-500'}`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8">
              <button 
                onClick={() => setGameState(GameState.MENU)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-arcade text-sm transition-all border-b-4 border-blue-800 active:border-b-0 active:translate-y-1"
              >
                CONFIRM LOADOUT
              </button>
            </div>
          </div>
          
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 text-blue-900/20 font-arcade text-9xl whitespace-nowrap pointer-events-none">
            PREVIEW
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === GameState.GAME_OVER && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 z-20 backdrop-blur-md">
          <div className="text-center p-6 border-4 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.6)] bg-black max-w-lg w-full mx-4">
            <h2 className="text-4xl font-arcade text-red-500 mb-4 animate-pulse">MISSION FAILED</h2>
            
            {lastStats?.score && lastStats.score > highScore && (
               <div className="mb-4 text-yellow-400 font-arcade animate-bounce">NEW HIGH SCORE!</div>
            )}
            
            <div className="grid grid-cols-2 gap-4 text-left mb-6 font-mono text-lg border p-4 border-gray-800">
              <div className="text-gray-400">FINAL SCORE</div>
              <div className="text-right text-yellow-400">{lastStats?.score}</div>
              <div className="text-gray-400">MAX COMBO</div>
              <div className="text-right text-cyan-400">{lastStats?.maxCombo}</div>
              <div className="text-gray-400">ENEMIES DOWN</div>
              <div className="text-right text-green-400">{lastStats?.enemiesDestroyed}</div>
            </div>

            <div className="mb-6 bg-gray-900 p-4 border border-gray-700 rounded relative">
              <div className="absolute -top-3 left-4 bg-black px-2 text-xs text-gray-400 border border-gray-700">
                COMMANDER'S LOG
              </div>
              
              <p className="text-sm font-mono text-green-400 leading-relaxed italic">
                "{debrief}"
              </p>
            </div>

            <button 
              onClick={handleStart}
              className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-arcade text-sm transition-all border-b-4 border-red-800 active:border-b-0 active:translate-y-1"
            >
              RETRY SORTIE
            </button>
            <button 
              onClick={() => setGameState(GameState.MENU)}
              className="w-full mt-3 py-2 bg-transparent hover:bg-gray-800 text-gray-400 font-mono text-sm border border-gray-700"
            >
              RETURN TO BASE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;