const COLORS = ['#4ecdc4', '#5ee06a', '#8c7bff', '#ffd166', '#ff5d73'];

interface Worm {
  x: number;
  y: number;
  angle: number;
  turn: number;
  color: string;
  trail: Array<[number, number]>;
}

export function startHeroBackground(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let w = 0;
  let h = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const count = w < 640 ? 4 : 7;
  const worms: Worm[] = Array.from({ length: count }, (_, i) => ({
    x: Math.random() * w,
    y: Math.random() * h,
    angle: Math.random() * Math.PI * 2,
    turn: (Math.random() - 0.5) * 0.04,
    color: COLORS[i % COLORS.length],
    trail: [],
  }));

  let visible = true;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  }).observe(canvas);

  let last = performance.now();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (!visible || document.hidden || now - last < 33) return;
    const dt = Math.min(2, (now - last) / 16.7);
    last = now;

    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const worm of worms) {
      if (Math.random() < 0.02) worm.turn = (Math.random() - 0.5) * 0.06;
      worm.angle += worm.turn * dt;
      worm.x += Math.cos(worm.angle) * 1.6 * dt;
      worm.y += Math.sin(worm.angle) * 1.6 * dt;
      if (worm.x < -60) worm.x = w + 60;
      if (worm.x > w + 60) worm.x = -60;
      if (worm.y < -60) worm.y = h + 60;
      if (worm.y > h + 60) worm.y = -60;
      worm.trail.unshift([worm.x, worm.y]);
      if (worm.trail.length > 70) worm.trail.pop();

      ctx.strokeStyle = worm.color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 14;
      ctx.beginPath();
      let [px, py] = worm.trail[0];
      ctx.moveTo(px, py);
      for (let i = 1; i < worm.trail.length; i++) {
        const [x, y] = worm.trail[i];
        if (Math.abs(x - px) > 100 || Math.abs(y - py) > 100) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        px = x;
        py = y;
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
  requestAnimationFrame(frame);
}
