// apps/web/app/tasks/milestone.ts
//
// Lightweight confetti burst for personal milestones (streak thresholds,
// personal-best closures, etc.). No external deps — uses canvas directly.

"use client";

/** Fire a short confetti burst from the center-top of the viewport. */
export function firePersonalMilestoneConfetti() {
  if (typeof window === "undefined") return;

  const PARTICLE_COUNT = 80;
  const COLORS = ["#7B5CFF", "#22D3EE", "#F472B6", "#4ADE80", "#F5B84A", "#60A5FA"];
  const DURATION = 2200;

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999";
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(devicePixelRatio, devicePixelRatio);

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    size: number;
    rotation: number;
    rotationSpeed: number;
    opacity: number;
  }

  const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
    x: window.innerWidth / 2,
    y: window.innerHeight * 0.25,
    vx: (Math.random() - 0.5) * 12,
    vy: Math.random() * -10 - 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    size: Math.random() * 6 + 3,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.3,
    opacity: 1,
  }));

  const start = performance.now();

  function frame(now: number) {
    const elapsed = now - start;
    if (elapsed > DURATION) {
      canvas.remove();
      return;
    }

    ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight);

    const progress = elapsed / DURATION;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25; // gravity
      p.vx *= 0.99; // drag
      p.rotation += p.rotationSpeed;
      p.opacity = Math.max(0, 1 - progress * 1.2);

      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rotation);
      ctx!.globalAlpha = p.opacity;
      ctx!.fillStyle = p.color;
      ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx!.restore();
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
