import React, { useState, useEffect, useRef } from 'react';
import type { GameState } from '@snake/shared';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { gameClient } from './api';
import { i18n } from './i18n';
import './App.css';

export const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isAlive, setIsAlive] = useState(false);
  const [screen, setScreen] = useState<'start' | 'game' | 'death'>('start');
  const [nickname, setNickname] = useState('');
  const [playerScore, setPlayerScore] = useState(0);
  const [playerMass, setPlayerMass] = useState(0);
  const [locale, setLocale] = useState<'en' | 'es'>(i18n.getLocale());
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const inputStateRef = useRef({ up: false, down: false, left: false, right: false, boost: false });

  useEffect(() => {
    const unsubscribe = i18n.subscribe(() => {
      setLocale(i18n.getLocale());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (screen !== 'game') return;

      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        inputStateRef.current.up = true;
        e.preventDefault();
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        inputStateRef.current.down = true;
        e.preventDefault();
      }
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        inputStateRef.current.left = true;
        e.preventDefault();
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        inputStateRef.current.right = true;
        e.preventDefault();
      }
      if (e.key === ' ') {
        inputStateRef.current.boost = true;
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') inputStateRef.current.up = false;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') inputStateRef.current.down = false;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') inputStateRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') inputStateRef.current.right = false;
      if (e.key === ' ') inputStateRef.current.boost = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [screen]);

  useEffect(() => {
    if (screen !== 'game') return;

    const sendInput = () => {
      let direction = 1; // default right
      if (inputStateRef.current.up) direction = 0;
      else if (inputStateRef.current.down) direction = 2;
      else if (inputStateRef.current.left) direction = 3;
      else if (inputStateRef.current.right) direction = 1;

      gameClient.sendInput(direction, inputStateRef.current.boost);
    };

    const inputInterval = setInterval(sendInput, 50);
    return () => clearInterval(inputInterval);
  }, [screen]);

  useEffect(() => {
    const unsubscribe = gameClient.subscribe({
      onStateUpdate(state: GameState) {
        setGameState(state);
        // Update player score based on first snake
        if (state.snakes.length > 0) {
          setPlayerScore(Math.floor(state.snakes[0].mass * 10));
          setPlayerMass(state.snakes[0].mass);
        }
      },
      onError(error: string) {
        console.error('Game error:', error);
      },
      onConnected() {
        setIsAlive(true);
      },
      onDisconnected() {
        setIsAlive(false);
      },
    });

    return unsubscribe;
  }, []);

  const handleStartGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;

    try {
      await gameClient.connect(nickname);
      setScreen('game');
    } catch (err) {
      console.error('Failed to connect:', err);
    }
  };

  const handleRestart = () => {
    gameClient.disconnect();
    setScreen('start');
    setGameState(null);
    setPlayerScore(0);
    setPlayerMass(0);
  };

  const changeLanguage = (lang: 'en' | 'es') => {
    i18n.setLocale(lang);
  };

  return (
    <div className="app">
      {screen === 'start' && (
        <div className="screen start-screen">
          <div className="screen-content">
            <h1>{i18n.t('game.title')}</h1>
            <form onSubmit={handleStartGame}>
              <input
                ref={nicknameInputRef}
                type="text"
                maxLength={16}
                placeholder={i18n.t('game.enterNickname')}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="nickname-input"
              />
              <button type="submit" className="play-button">
                {i18n.t('game.play')}
              </button>
            </form>

            <div className="language-selector">
              <button
                onClick={() => changeLanguage('en')}
                className={locale === 'en' ? 'active' : ''}
              >
                English
              </button>
              <button
                onClick={() => changeLanguage('es')}
                className={locale === 'es' ? 'active' : ''}
              >
                Español
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === 'game' && (
        <div className="screen game-screen">
          <GameCanvas gameState={gameState} isAlive={isAlive} />
          <HUD gameState={gameState} playerScore={playerScore} playerMass={playerMass} />
        </div>
      )}

      {screen === 'death' && (
        <div className="screen death-screen">
          <div className="screen-content">
            <h2>{i18n.t('game.you_died')}</h2>
            <div className="death-score">
              {i18n.t('game.your_score')}: <span className="score">{playerScore}</span>
            </div>
            <button onClick={handleRestart} className="restart-button">
              {i18n.t('game.restart')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
