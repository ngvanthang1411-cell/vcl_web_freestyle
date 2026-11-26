import { useEffect, useRef } from 'react';

/**
 * Lightweight 60fps celebratory confetti canvas for the results screen.
 *
 * Respects `prefers-reduced-motion` and automatically stops its animation
 * loop once all particles have settled out of frame.
 */

const COLORS = ['#F78501', '#FE9B2A', '#FF4D9D', '#BE70FA', '#34D399', '#FBBF24'];

export default function ConfettiCanvas({ active = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 64 }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.45;
      const speed = 5.5 + Math.random() * 8.5;
      return {
        x: width * (0.25 + Math.random() * 0.5),
        y: height * 0.22 + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        w: 6 + Math.random() * 5,
        h: 3.5 + Math.random() * 3,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.22,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: 1,
        drag: 0.985 + Math.random() * 0.008,
      };
    });

    let raf = null;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      let alive = 0;

      for (const p of particles) {
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + 0.18;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        if (p.y > height * 0.72) p.alpha = Math.max(0, p.alpha - 0.024);

        if (p.alpha > 0.01 && p.y < height + 40) {
          alive += 1;
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
      }

      if (alive > 0) {
        raf = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
}
