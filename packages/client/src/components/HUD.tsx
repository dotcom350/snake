import React from 'react';
import type { GameState } from '@snake/shared';
import { i18n } from '../i18n';
import './HUD.css';

interface HUDProps {
  gameState: GameState | null;
  playerScore: number;
  playerMass: number;
}

export const HUD: React.FC<HUDProps> = ({ gameState, playerScore, playerMass }) => {
  return (
    <div className="hud">
      {/* Score display */}
      <div className="score-panel">
        <div className="score-label">{i18n.t('game.score')}</div>
        <div className="score-value">{playerScore}</div>
        <div className="mass-label">{i18n.t('game.yourMass', { mass: playerMass.toFixed(0) })}</div>
      </div>

      {/* Leaderboard */}
      <div className="leaderboard-panel">
        <div className="leaderboard-title">{i18n.t('game.leaderboard')}</div>
        <div className="leaderboard-list">
          {gameState?.leaderboard.slice(0, 5).map((entry) => (
            <div key={entry.rank} className="leaderboard-entry">
              <span className="rank">#{entry.rank}</span>
              <span className="name">{entry.nickname}</span>
              <span className="score">{entry.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Player count */}
      <div className="player-count-panel">
        <div>{i18n.t('game.playerCount', { count: gameState?.snakes.length || 0 })}</div>
      </div>

      {/* Controls info */}
      <div className="controls-info">
        <div className="control-item">
          <span className="platform-specific">
            {/Mobile|Android|iPhone/.test(navigator.userAgent)
              ? i18n.t('game.press_to_boost')
              : i18n.t('game.space_to_boost')}
          </span>
        </div>
      </div>
    </div>
  );
};
