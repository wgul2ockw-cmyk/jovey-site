(() => {
  // Reading progress for a blog post:
  //   • a top rail of confetti dots that light up / "stack" left→right as you read
  //   • a small circular % gauge (bottom-right) that fades in while mid-article
  // Auto-injects — include this script on any post page; it no-ops elsewhere.
  const article = document.querySelector('.post');
  if (!article) return;

  const PALETTE = ['#FF5E7E', '#B15BFF', '#FF9F43', '#48dbfb', '#feca57'];
  const pick = i => PALETTE[(Math.random() * PALETTE.length) | 0] || PALETTE[i % PALETTE.length];

  // ── top rail ──────────────────────────────────────────────
  const rail = document.createElement('div');
  rail.className = 'read-rail';
  rail.setAttribute('aria-hidden', 'true');
  document.body.appendChild(rail);

  let dots = [];
  function buildDots() {
    rail.textContent = '';
    const count = Math.max(28, Math.round(window.innerWidth / 11)); // a bar every ~11px (dense)
    dots = [];
    for (let i = 0; i < count; i++) {
      const d = document.createElement('span');
      d.className = 'read-rail__dot';
      d.style.setProperty('--c', pick(i));
      rail.appendChild(d);
      dots.push(d);
    }
  }

  // ── circular % gauge ──────────────────────────────────────
  const R = 20, CIRC = 2 * Math.PI * R;
  const gauge = document.createElement('div');
  gauge.className = 'read-gauge';
  gauge.setAttribute('aria-hidden', 'true');
  gauge.innerHTML =
    '<svg viewBox="0 0 48 48">' +
      '<circle class="read-gauge__track" cx="24" cy="24" r="' + R + '"/>' +
      '<circle class="read-gauge__fill"  cx="24" cy="24" r="' + R + '"/>' +
    '</svg><span class="read-gauge__num">0%</span>';
  document.body.appendChild(gauge);
  const gFill = gauge.querySelector('.read-gauge__fill');
  const gNum = gauge.querySelector('.read-gauge__num');
  gFill.style.strokeDasharray = CIRC;
  gFill.style.strokeDashoffset = CIRC;

  // ── progress = how far through the article you've scrolled ──
  function getProgress() {
    const range = article.offsetHeight - window.innerHeight;
    if (range <= 0) return 0;
    const scrolled = -article.getBoundingClientRect().top; // px past the article top
    return Math.min(1, Math.max(0, scrolled / range));
  }

  let lastActive = -1, ticking = false;
  function render() {
    ticking = false;
    const p = getProgress();

    // dots: light up [0, active); dim the rest — only touch what changed
    const active = Math.round(p * dots.length);
    if (active !== lastActive) {
      const from = Math.max(0, Math.min(active, lastActive));
      const to = Math.max(active, lastActive);
      for (let i = from; i < to; i++) dots[i].classList.toggle('on', i < active);
      lastActive = active;
    }

    // gauge
    gFill.style.strokeDashoffset = CIRC * (1 - p);
    gNum.textContent = Math.round(p * 100) + '%';
    gauge.classList.toggle('show', p > 0.005 && p < 0.995);
  }

  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(render); } }

  buildDots();
  render();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { buildDots(); lastActive = -1; render(); });
})();
