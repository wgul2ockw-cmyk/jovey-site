(() => {
  // Cursor-following single thick ring of neon confetti:
  //   • dots spawn ONLY along one ring (radius ≈ 32% of min(W,H)), thick band
  //   • each dot chases the cursor at its OWN pace → staggered trailing physics
  //   • the ring idles at screen center when the pointer is away
  //   • no spin — dashes hold fixed angles and point toward the cursor; gentle shimmer
  //   • hovering a blog card MORPHS the ring into that card's rounded-rect shape
  //     (same trailing physics); leaving eases it back to a cursor-following ring
  //   • eased follow (no spring) → smooth and never overshoots; responsive; 60fps via rAF
  const canvas = document.getElementById('field');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0;
  let particles = [];
  const mouse = { x: -99999, y: -99999 };
  let hoverEl = null;   // a hovered .post-card → the outline follows it instead of the cursor
  let morph = 0;        // 0 = circle ring (cursor) · 1 = rounded-rect matching the card (eases)
  let baseRadius = 1;   // circle-ring radius (set on resize)
  let cardA = 0, cardB = 0, cardR = 0;  // last card's half-width, half-height, corner radius (+margin)

  const RING_FRAC = 0.322;    // ring radius as a fraction of min(W,H) — reduced ~30%
  const RING_THICK = 0.28;    // radial spread of the ring — ×2 thicker band
  const DOT_SPACING = 6;      // ~1 dot per this many px along the ring
  const FOLLOW = 0.22;        // eased follow rate — pure ease approaches, never passes → zero bounce
  const WOBBLE = 4;           // gentle radial shimmer (px)

  // vibrant confetti palette — neon pink / purple / orange / blue / yellow.
  // Pages may tint the field to their own hue family via
  // <canvas id="field" data-palette="#hex,#hex,…"> (growth pillar pages).
  const PALETTE = (canvas.dataset.palette || '#FF5E7E,#B15BFF,#FF9F43,#48dbfb,#feca57')
    .split(',').map(s => s.trim()).filter(Boolean);

  const TWO_PI = Math.PI * 2;

  const CARD_RADIUS = 24;     // matches .post-card border-radius
  const CARD_MARGIN = 12;     // how far outside the card edge the outline sits

  // distance from a card's centre to its rounded-rect outline along unit dir (dx,dy).
  // lets the dots trace the card's SHAPE (smooth-cornered rectangle) instead of a circle.
  function rrDist(dx, dy, a, b, r) {
    const tx = Math.abs(dx) > 1e-6 ? a / Math.abs(dx) : Infinity;
    const ty = Math.abs(dy) > 1e-6 ? b / Math.abs(dy) : Infinity;
    let tt = Math.min(tx, ty);                             // hit on the sharp rectangle
    if (Math.abs(tt * dx) > a - r && Math.abs(tt * dy) > b - r) {
      // that hit is past the straight edge → re-solve against the corner arc
      const ccx = Math.sign(dx) * (a - r), ccy = Math.sign(dy) * (b - r);
      const bq = dx * ccx + dy * ccy;
      const disc = bq * bq - (ccx * ccx + ccy * ccy - r * r);
      if (disc >= 0) tt = bq + Math.sqrt(disc);            // outer intersection with corner circle
    }
    return tt;
  }

  function seed() {
    particles = [];
    // one massive ring — dots spawn only along it
    const radius = baseRadius;
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
        ease: 0.03 + Math.random() * 0.05,
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
    baseRadius = Math.min(W, H) * RING_FRAC;
    seed();
    if (reduceMotion.matches) drawStatic();   // reduced-motion: repaint the static ring
  }

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('touchmove', e => {
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('pointerleave', () => { mouse.x = -99999; mouse.y = -99999; });

  // hovering a blog card hands the ring from the cursor to that card; leaving
  // the card hands it back. Cards are static (the filter only toggles display),
  // so a one-time bind is enough.
  function bindCards() {
    document.querySelectorAll('.post-card, .g-card, .g-pillar, .g-quote, .g-empty, .ms-card, .about-card').forEach(card => {
      if (card.__fieldBound) return;
      card.__fieldBound = true;
      card.addEventListener('mouseenter', () => { hoverEl = card; });
      card.addEventListener('mouseleave', () => { if (hoverEl === card) hoverEl = null; });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindCards);
  else bindCards();

  // reduced-motion: paint one calm, centred ring — no cursor-follow, no wobble, no loop
  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      const x = cx + Math.cos(p.ang) * p.radius;
      const y = cy + Math.sin(p.ang) * p.radius;
      const ang = Math.atan2(cy - y, cx - x);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.weight;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-p.size / 2, 0);
      ctx.lineTo(p.size / 2, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  let lastT = performance.now() / 1000;

  function tick() {
    if (reduceMotion.matches) { drawStatic(); return; }  // reduced-motion: static, stop looping
    const t = performance.now() / 1000;
    // frames → time: identical feel on 60Hz and 120Hz displays,
    // and no giant jump when the tab resumes from background
    const dt60 = Math.min(3, (t - lastT) * 60);
    lastT = t;
    ctx.clearRect(0, 0, W, H);

    // target CENTRE + shape: a hovered card (outline morphs to the card's
    // rounded-rect shape) or the cursor (circle ring, idling at screen centre)
    let tmx, tmy, want = 0;
    if (hoverEl) {
      const r = hoverEl.getBoundingClientRect();
      if (r.width > 0) {
        tmx = r.left + r.width / 2;
        tmy = r.top + r.height / 2;
        cardA = r.width / 2 + CARD_MARGIN;      // remember the card shape so the outline
        cardB = r.height / 2 + CARD_MARGIN;     // can hold while morph decays back to a
        cardR = CARD_RADIUS + CARD_MARGIN;      // circle after the pointer leaves
        want = 1;
      } else {
        hoverEl = null;                         // card filtered out mid-hover
      }
    }
    if (!hoverEl) {
      const hasMouse = mouse.x > -9999;
      tmx = hasMouse ? mouse.x : cx + Math.sin(t * 0.3) * W * 0.12;
      tmy = hasMouse ? mouse.y : cy + Math.cos(t * 0.24) * H * 0.12;
    }
    // ease circle → rounded-rect (and back) with the same feel as the trailing
    // centre, so the ring melts seamlessly into the card's shape
    morph += (want - morph) * 0.08 * dt60;

    for (const p of particles) {
      // each dot eases its OWN center toward the cursor at its own rate —
      // slower dots lag further behind → a trailing, physical follow
      p.fx += (tmx - p.fx) * p.ease * dt60;
      p.fy += (tmy - p.fy) * p.ease * dt60;

      // each dot holds its angle; its REACH blends from a circle (cursor) to the
      // card's rounded-rect outline (hover) — so the shape morphs, not the angles
      const ca = Math.cos(p.ang), sa = Math.sin(p.ang);
      const wob = Math.sin(t * p.wobSpd + p.wob) * WOBBLE;
      let reach = p.radius;                               // circle-ring radius (cursor mode)
      if (morph > 0.001 && cardA > 0) {
        const thick = p.radius / baseRadius;              // keep each dot's band offset (~0.86–1.14)
        const rect = rrDist(ca, sa, cardA, cardB, cardR) * thick;
        reach += (rect - reach) * morph;                 // circle → card-shaped outline
      }
      const rr = reach + wob;
      const tx = p.fx + ca * rr;                          // point around its lagged center
      const ty = p.fy + sa * rr;

      // pure eased follow — approaches the target, never passes it → no overshoot, no bounce
      const k = Math.min(1, FOLLOW * dt60);   // clamp keeps it stable on long frames
      p.x += (tx - p.x) * k;
      p.y += (ty - p.y) * k;
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
  if (!reduceMotion.matches) tick();
  // react if the user flips the OS "reduce motion" setting mid-session
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) drawStatic();   // running loop self-halts next frame
    else tick();                              // resume the animation
  });
})();
