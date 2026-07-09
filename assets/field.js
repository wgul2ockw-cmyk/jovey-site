(() => {
  // Cursor-following single thick ring of neon confetti:
  //   • dots spawn ONLY along one ring (radius ≈ 32% of min(W,H)), thick band
  //   • each dot chases the cursor at its OWN pace → staggered trailing physics
  //   • the ring idles at screen center when the pointer is away
  //   • no spin — dashes hold fixed angles and point toward the cursor; gentle shimmer
  //   • spring/friction keeps motion smooth; responsive; 60fps via rAF
  const canvas = document.getElementById('field');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0;
  let particles = [];
  const mouse = { x: -99999, y: -99999 };

  const RING_FRAC = 0.322;    // ring radius as a fraction of min(W,H) — reduced ~30%
  const RING_THICK = 0.28;    // radial spread of the ring — ×2 thicker band
  const DOT_SPACING = 6;      // ~1 dot per this many px along the ring
  const SPRING = 0.09;        // pull toward the target
  const FRICTION = 0.82;      // velocity damping — smooth, no jitter
  const WOBBLE = 7;           // gentle radial shimmer (px)

  // vibrant confetti palette — neon pink / purple / orange / blue / yellow
  const PALETTE = ['#FF5E7E', '#B15BFF', '#FF9F43', '#48dbfb', '#feca57'];

  const TWO_PI = Math.PI * 2;

  function seed() {
    particles = [];
    // one massive ring — dots spawn only along it
    const radius = Math.min(W, H) * RING_FRAC;
    const count = Math.round((TWO_PI * radius) / DOT_SPACING);
    for (let i = 0; i < count; i++) {
      particles.push({
        ang: Math.random() * TWO_PI,                      // fixed angle on the ring (no spin)
        radius: radius * (1 + (Math.random() - 0.5) * RING_THICK), // ring thickness
        color: PALETTE[(Math.random() * PALETTE.length) | 0],
        size: 5 + Math.random() * 4,                      // dash length 5–9px
        weight: 1 + Math.random() * 0.6,                  // ~1.3px thin
        phase: Math.random() * TWO_PI,
        pulse: 0.6 + Math.random() * 1.3,
        wob: Math.random() * TWO_PI,
        wobSpd: 0.4 + Math.random() * 0.8,
        // each dot chases the cursor at its own pace → staggered follow delay
        fx: cx, fy: cy,
        ease: 0.025 + Math.random() * 0.095,
        x: cx, y: cy, vx: 0, vy: 0
      });
    }
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    cx = W / 2;
    cy = H / 2;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('touchmove', e => {
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('pointerleave', () => { mouse.x = -99999; mouse.y = -99999; });

  let lastT = performance.now() / 1000;

  function tick() {
    const t = performance.now() / 1000;
    // frames → time: identical feel on 60Hz and 120Hz displays,
    // and no giant jump when the tab resumes from background
    const dt60 = Math.min(3, (t - lastT) * 60);
    lastT = t;
    ctx.clearRect(0, 0, W, H);

    // cursor target (idles at screen center with a small sway when away)
    const hasMouse = mouse.x > -9999;
    const tmx = hasMouse ? mouse.x : cx + Math.sin(t * 0.3) * W * 0.12;
    const tmy = hasMouse ? mouse.y : cy + Math.cos(t * 0.24) * H * 0.12;

    for (const p of particles) {
      // each dot eases its OWN center toward the cursor at its own rate —
      // slower dots lag further behind → a trailing, physical follow
      p.fx += (tmx - p.fx) * p.ease * dt60;
      p.fy += (tmy - p.fy) * p.ease * dt60;

      // no spin — each dot holds its angle; only a gentle radial shimmer
      const rr = p.radius + Math.sin(t * p.wobSpd + p.wob) * WOBBLE;
      const tx = p.fx + Math.cos(p.ang) * rr;            // ring point around its lagged center
      const ty = p.fy + Math.sin(p.ang) * rr;

      // spring toward the target; friction eases it in
      p.vx += (tx - p.x) * SPRING * dt60;
      p.vy += (ty - p.y) * SPRING * dt60;
      p.vx *= FRICTION;
      p.vy *= FRICTION;
      p.x += p.vx * dt60;
      p.y += p.vy * dt60;
    }

    for (const p of particles) {
      const alpha = 0.55 + 0.4 * Math.sin(t * p.pulse * 2 + p.phase);  // twinkle
      // each dash points toward the cursor
      const ang = Math.atan2(tmy - p.y, tmx - p.x);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.globalAlpha = Math.max(0.15, alpha);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.weight;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-p.size / 2, 0);
      ctx.lineTo(p.size / 2, 0);
      ctx.stroke();
      ctx.restore();
    }
    requestAnimationFrame(tick);
  }

  resize();
  tick();
})();
