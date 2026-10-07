import React, { useEffect, useRef, useState } from 'react';
import type { GameState } from '@snake/shared';
import { i18n } from '../i18n';

interface GameCanvasProps {
  gameState: GameState | null;
  isAlive: boolean;
  onDeath?: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  gameState,
  isAlive,
  onDeath,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const [fps, setFps] = useState(0);
  const fpsCounterRef = useRef({ lastTime: Date.now(), frames: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const now = Date.now();
      const elapsed = now - fpsCounterRef.current.lastTime;

      if (elapsed >= 1000) {
        setFps(fpsCounterRef.current.frames);
        fpsCounterRef.current.frames = 0;
        fpsCounterRef.current.lastTime = now;
      } else {
        fpsCounterRef.current.frames++;
      }

      // Clear canvas with dark background
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid (subtle)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      const gridSize = 50;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw food
      ctx.fillStyle = '#20c997';
      for (const food of gameState.food) {
        const radius = Math.sqrt(food.x * food.x + food.y * food.y) % 8 + 4;
        ctx.beginPath();
        ctx.arc(food.x % canvas.width, food.y % canvas.height, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw snakes
      for (const snake of gameState.snakes) {
        ctx.fillStyle = snake.color;
        ctx.strokeStyle = snake.protected ? '#ffd700' : snake.color;
        ctx.lineWidth = 2;

        // Draw body
        for (let i = 0; i < snake.segments.length; i++) {
          const segment = snake.segments[i];
          const x = segment[0] % canvas.width;
          const y = segment[1] % canvas.height;
          const radius = 8 - Math.min(i * 0.5, 4);

          ctx.beginPath();
          ctx.arc(x, y, Math.max(radius, 2), 0, Math.PI * 2);
          ctx.fill();

          if (snake.protected) {
            ctx.strokeRect(x - 10, y - 10, 20, 20);
          }
        }

        // Draw eyes (head)
        if (snake.segments.length > 0) {
          const head = snake.segments[0];
          const x = head[0] % canvas.width;
          const y = head[1] % canvas.height;

          ctx.fillStyle = '#fff';
          const eyeSize = 2;
          const eyeDistance = 5;

          // Determine eye position based on direction
          let eyeX1 = x;
          let eyeY1 = y - eyeDistance;
          let eyeX2 = x;
          let eyeY2 = y - eyeDistance;

          ctx.beginPath();
          ctx.arc(eyeX1, eyeY1, eyeSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(eyeX2, eyeY2 + 4, eyeSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  return (
    <div className="canvas-container">
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100vw',
          height: '100vh',
          backgroundColor: '#1a1a2e',
        }}
      />
      {/* FPS counter in dev mode */}
      {import.meta.env.DEV && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            color: '#20c997',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        >
          FPS: {fps}
        </div>
      )}
    </div>
  );
};
