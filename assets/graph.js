/* ============================================================================
   Jovey — Wiki Map  ·  assets/graph.js
   An Obsidian-style force-directed graph of the site: the Jovey hub, the three
   growth pillars, the "Theory behind Action" series, and every blog post — linked
   by pillar (data-cats), by series, and by a few thematic "related" wikilinks.

   Self-contained, no dependencies. Exposes window.JoveyMap with:
     • JoveyMap.open()            open the pop-over overlay (Obsidian "graph view")
     • JoveyMap.close()
     • JoveyMap.mount(el, opts)   render inline into a container (the /map/ page)

   Any <button data-jovey-map> on the page opens the overlay automatically.
   Uses ONLY the brand tokens — no invented colours or fonts.
   ============================================================================ */
(function () {
  'use strict';

  /* -- Brand tokens (kept in sync with :root in blog.css) ------------------- */
  var T = {
    ink:  '#212226', bg:   '#F8F9FA', muted: '#6a6a71',
    line: '#e1e6ec', card: '#ffffff', blue:  '#3b6e8f'
  };
  var PILLARS = {
    personal:  { label: 'Personal',  color: '#D9822B', ink: '#B4661A' },
    spiritual: { label: 'Spiritual', color: '#B0519E', ink: '#9E3F8E' },
    vitality:  { label: 'Vitality',  color: '#1FA39A', ink: '#177F77' }
  };

  /* -- Content model -------------------------------------------------------- *
     Edit here to add posts. `cats` are the pillar ids (same as blog data-cats);
     `series` groups posts under a shared hub; `related` are thematic wikilinks.  */
  var POSTS = [
    { id: 'transformative-learning',   en: 'Transformative Learning',    th: 'พลังแห่งการเรียนรู้สู่การเปลี่ยนแปลง', cats: ['personal', 'spiritual'], series: 'theory' },
    { id: 'three-part-structure',      en: 'Three-part Structure',       th: 'การเล่าเรื่องด้วย Three-part structure', cats: ['personal'],              series: 'theory' },
    { id: 'the-devil-we-share',        en: 'The Devil We Share',         th: 'ปีศาจ ของเราเป็นตัวเดียวกันไหม',        cats: ['personal'] },
    { id: 'destiny-and-the-present',   en: 'Destiny & the Present',      th: 'โชคชะตา ทำให้เรารู้คุณค่าของปัจจุบัน',   cats: ['spiritual'] },
    { id: 'the-power-of-now',          en: 'The Power of Now',           th: 'สิ่งเดียวที่คุณมี คือ ปัจจุบัน',          cats: ['spiritual'] },
    { id: '10-romanticize-your-process', en: 'Romanticize Your Process', th: '10 วิธีตกหลุมรักในกระบวนการของคุณ',     cats: ['personal', 'spiritual'] }
  ];
  // thematic post↔post links (the "wiki" backbone) — [a, b]
  var RELATED = [
    ['destiny-and-the-present', 'the-power-of-now'],       // ปัจจุบัน · the present moment
    ['the-power-of-now', '10-romanticize-your-process'],    // presence within the process
    ['transformative-learning', 'the-devil-we-share']       // reframing meaning · Rethink
  ];

  /* -- Build nodes & edges from the model ----------------------------------- */
  function buildGraph() {
    var nodes = [];
    var edges = [];
    var byId = {};
    function add(n) { byId[n.id] = n; nodes.push(n); return n; }

    add({ id: 'jovey', type: 'hub', label: 'Jovey', sub: 'Every Journey’s Companion', url: '/' });
    Object.keys(PILLARS).forEach(function (pid) {
      var p = PILLARS[pid];
      add({ id: pid, type: 'pillar', pillar: pid, label: p.label, url: '/growth/' + pid + '/' });
      edges.push({ a: 'jovey', b: pid, type: 'pillar' });
    });
    add({ id: 'theory', type: 'series', label: 'Theory behind Action', url: '/blog/#personal' });
    edges.push({ a: 'jovey', b: 'theory', type: 'series' });

    POSTS.forEach(function (p) {
      add({
        id: p.id, type: 'post', label: p.th, en: p.en,
        url: '/blog/' + p.id + '/', cats: p.cats.slice(), pillar: p.cats[0]
      });
      p.cats.forEach(function (c, i) {
        edges.push({ a: p.id, b: c, type: 'cat', pillar: c, primary: i === 0 });
      });
      if (p.series) edges.push({ a: p.id, b: p.series, type: 'seriesLink' });
    });
    RELATED.forEach(function (pair) {
      if (byId[pair[0]] && byId[pair[1]]) edges.push({ a: pair[0], b: pair[1], type: 'related' });
    });

    // degree → node weight (bigger, more-connected nodes)
    nodes.forEach(function (n) { n.deg = 0; });
    edges.forEach(function (e) { byId[e.a].deg++; byId[e.b].deg++; });
    return { nodes: nodes, edges: edges, byId: byId };
  }

  /* -- Geometry / node sizing (world units) --------------------------------- */
  function baseRadius(n) {
    if (n.type === 'hub') return 30;
    if (n.type === 'pillar') return 19;
    if (n.type === 'series') return 15;
    return 8 + Math.min(n.deg, 4) * 1.6;        // posts grow a little with degree
  }
  function nodeColor(n) {
    if (n.type === 'hub') return T.blue;
    if (n.type === 'series') return T.muted;
    if (n.pillar) return PILLARS[n.pillar].color;
    return T.blue;
  }
  function edgeStyle(e) {
    if (e.type === 'related') return { color: T.muted, alpha: 0.34, width: 1, dash: [4, 5], len: 130, k: 0.008 };
    if (e.type === 'cat')     return { color: PILLARS[e.pillar].color, alpha: e.primary ? 0.5 : 0.32, width: e.primary ? 1.7 : 1.2, dash: null, len: 92, k: 0.02 };
    if (e.type === 'seriesLink') return { color: T.muted, alpha: 0.4, width: 1.3, dash: [1, 4], len: 72, k: 0.03 };
    if (e.type === 'series')  return { color: T.muted, alpha: 0.35, width: 1.3, dash: [1, 4], len: 120, k: 0.02 };
    return { color: T.line, alpha: 0.6, width: 1.6, dash: null, len: 150, k: 0.03 }; // pillar↔hub
  }

  /* ==========================================================================
     Simulation + renderer — one instance per canvas.
     World coords are centred on the origin; a camera (scale s, offset ox/oy)
     maps world→screen so we get Obsidian-style zoom & pan.
     ========================================================================== */
  function createInstance(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var G = buildGraph();
    var nodes = G.nodes, edges = G.edges, byId = G.byId;

    // adjacency for hover-highlight
    var adj = {}; nodes.forEach(function (n) { adj[n.id] = {}; });
    edges.forEach(function (e) { adj[e.a][e.b] = true; adj[e.b][e.a] = true; });

    // structured seeding — hub centred, pillars in a triangle, series to the left,
    // posts clustered around their pillar(s). Deterministic, so the settled
    // composition is the same on every visit; physics just relaxes it.
    // (canvas y grows downward: negative sin = up) — a WIDE composition to suit
    // landscape frames: Personal left, Spiritual right, Vitality up, series lower-left;
    // dual-pillar posts average to the bottom bridge between the two pillars.
    // Portrait frames get the same layout with the axes swapped (tall composition).
    var ANG = { personal: Math.PI, spiritual: 0, vitality: -Math.PI / 2 };
    function seedLayout() {
      var postIdx = {};
      var portrait = W >= 2 && H > W;
      nodes.forEach(function (n, i) {
        n.vx = 0; n.vy = 0; n._s = 1;            // _s = eased hover-scale
        if (n.type === 'hub') { n.x = 0; n.y = 0; return; }
        if (n.type === 'pillar') { n.x = Math.cos(ANG[n.id]) * 150; n.y = Math.sin(ANG[n.id]) * 150; return; }
        if (n.type === 'series') { n.x = -170; n.y = 95; return; }
        // posts: average the angles of their pillars, fan siblings apart
        var a = 0;
        n.cats.forEach(function (c) { a += ANG[c]; });
        a /= n.cats.length;
        var k = (postIdx[n.pillar] = (postIdx[n.pillar] || 0) + 1);
        a += (k % 2 ? 1 : -1) * 0.26 * Math.ceil(k / 2);
        n.x = Math.cos(a) * 250 + Math.sin(i * 12.9) * 10;
        n.y = Math.sin(a) * 250 + Math.cos(i * 7.3) * 10;
      });
      if (portrait) nodes.forEach(function (n) { var t = n.x; n.x = n.y; n.y = t; });
    }

    var cam = { s: 1, ox: 0, oy: 0 };
    var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    var alpha = 1;                     // simulation "temperature"
    var autoFit = true;                // keep the graph framed until the user pans/zooms/drags
    var hover = null, dragging = null, dragMoved = false;
    var panning = false, panStart = null;
    var focusPillar = null;            // legend filter
    var pointer = { x: 0, y: 0, has: false };
    var raf = null, settled = false, clock = 0;
    var gx = 0.009, gy = 0.020;        // anisotropic gravity (set from frame aspect)
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* -- sizing -- */
    function resize() {
      var rect = canvas.getBoundingClientRect();
      W = Math.max(1, rect.width); H = Math.max(1, rect.height);
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var landscape = W >= H || W < 2;   // hidden tabs measure 0 — assume landscape
      gx = landscape ? 0.009 : 0.020;
      gy = landscape ? 0.020 : 0.009;
    }

    function worldBounds() {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach(function (n) {
        var r = baseRadius(n) + 26;
        if (n.x - r < minX) minX = n.x - r; if (n.y - r < minY) minY = n.y - r;
        if (n.x + r > maxX) maxX = n.x + r; if (n.y + r > maxY) maxY = n.y + r;
      });
      return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }
    function fit(animate) {
      var b = worldBounds();
      var bw = b.maxX - b.minX, bh = b.maxY - b.minY;
      // screen-space margins reserve room for the labels (rendered at constant px)
      // plus the hint/legend chrome — proportional on small frames, capped on large
      var mx = Math.min(170, W * 0.30), my = Math.min(120, H * 0.22);
      var availW = Math.max(W - mx, 120), availH = Math.max(H - my, 120);
      var s = Math.min(availW / bw, availH / bh);
      s = Math.max(0.25, Math.min(s, 2.2));
      var cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
      var target = { s: s, ox: W / 2 - cx * s, oy: H / 2 - cy * s };
      if (animate === false) { cam = target; }
      else { cam._to = target; }        // eased toward in tick()
    }

    /* -- coordinate transforms -- */
    function toScreen(n) { return { x: n.x * cam.s + cam.ox, y: n.y * cam.s + cam.oy }; }
    function toWorld(px, py) { return { x: (px - cam.ox) / cam.s, y: (py - cam.oy) / cam.s }; }

    /* -- physics: repulsion + springs + gravity ------------------------------ */
    function physics() {
      var a = alpha;
      // repulsion (O(n²) — trivial for ~11 nodes)
      for (var i = 0; i < nodes.length; i++) {
        var p = nodes[i];
        for (var j = i + 1; j < nodes.length; j++) {
          var q = nodes[j];
          var dx = p.x - q.x, dy = p.y - q.y;
          var d2 = dx * dx + dy * dy || 0.01;
          var d = Math.sqrt(d2);
          if (d > 480) continue;
          var f = (3200 * a) / d2;
          var ux = dx / d, uy = dy / d;
          p.vx += ux * f; p.vy += uy * f;
          q.vx -= ux * f; q.vy -= uy * f;
        }
      }
      // springs
      edges.forEach(function (e) {
        var s = edgeStyle(e), p = byId[e.a], q = byId[e.b];
        var dx = q.x - p.x, dy = q.y - p.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var f = (d - s.len) * s.k * a;
        var ux = dx / d, uy = dy / d;
        p.vx += ux * f; p.vy += uy * f;
        q.vx -= ux * f; q.vy -= uy * f;
      });
      // anisotropic gravity — pull harder along the frame's short axis so the
      // cluster settles as a wide ellipse in landscape, tall in portrait
      nodes.forEach(function (n) {
        n.vx += -n.x * gx * a; n.vy += -n.y * gy * a;
        n.vx *= 0.86; n.vy *= 0.86;
        if (n === dragging) return;
        n.x += n.vx; n.y += n.vy;
      });
    }

    /* -- drawing -------------------------------------------------------------- */
    function draw() {
      ctx.clearRect(0, 0, W, H);
      var dim = function (id) {
        if (focusPillar) {
          var n = byId[id];
          if (!(n.pillar === focusPillar || id === focusPillar || (n.cats && n.cats.indexOf(focusPillar) >= 0))) return true;
        }
        if (hover) return !(id === hover || adj[hover][id]);
        return false;
      };

      // edges — cross-pillar links get a colour gradient between their endpoints
      edges.forEach(function (e) {
        var st = edgeStyle(e), na = byId[e.a], nb = byId[e.b];
        var p = toScreen(na), q = toScreen(nb);
        var faded = dim(e.a) || dim(e.b);
        var lit = hover && (e.a === hover || e.b === hover);
        var stroke = st.color;
        if (e.type === 'related') {
          var g = ctx.createLinearGradient(p.x, p.y, q.x, q.y);
          g.addColorStop(0, nodeColor(na)); g.addColorStop(1, nodeColor(nb));
          stroke = g;
        }
        ctx.save();
        ctx.globalAlpha = faded ? st.alpha * 0.14 : (lit ? Math.min(1, st.alpha + 0.4) : st.alpha);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = (lit ? st.width + 0.8 : st.width) * Math.max(0.6, Math.min(cam.s, 1.6));
        if (st.dash) ctx.setLineDash(st.dash.map(function (v) { return v * cam.s; }));
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        ctx.restore();
      });

      // nodes
      nodes.forEach(function (n) {
        var lit = hover === n.id;
        n._s += ((lit ? 1.16 : 1) - n._s) * 0.18;   // eased hover pop
        var s = toScreen(n), r = baseRadius(n) * cam.s * n._s;
        if (n.type === 'hub' && !reduce) r += (Math.sin(clock * 0.0016) + 1) * 0.9 * cam.s; // gentle breathe
        var col = nodeColor(n);
        var faded = dim(n.id);
        ctx.save();
        ctx.globalAlpha = faded ? 0.2 : 1;
        // soft glow (echoes the orb / particle aesthetic)
        if (!faded) {
          ctx.shadowColor = col; ctx.shadowBlur = (lit ? 26 : 14) * Math.max(0.7, cam.s);
        }
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.shadowBlur = 0;
        // inner disc for hub/pillar so labels sit on a calm centre
        if (n.type === 'hub' || n.type === 'pillar') {
          ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.52, 0, Math.PI * 2);
          ctx.fillStyle = T.card; ctx.globalAlpha = faded ? 0.2 : 0.92; ctx.fill();
        }
        // second-pillar ring for multi-cat posts
        if (n.type === 'post' && n.cats && n.cats.length > 1) {
          ctx.globalAlpha = faded ? 0.2 : 0.9;
          ctx.beginPath(); ctx.arc(s.x, s.y, r + 2.4, 0, Math.PI * 2);
          ctx.lineWidth = 2; ctx.strokeStyle = PILLARS[n.cats[1]].color; ctx.stroke();
        }
        // white keyline
        ctx.globalAlpha = faded ? 0.2 : 1;
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
        ctx.restore();

        drawLabel(n, s, r, faded, lit);
      });
    }

    function drawLabel(n, s, r, faded, lit) {
      // hub & pillars always labelled; post labels fade in with zoom (Obsidian-style),
      // and always show when hovered or neighbouring the hovered node
      var la = 1;
      if (n.type === 'post') {
        var near = lit || (hover && adj[hover] && adj[hover][n.id]);
        la = near ? 1 : Math.max(0, Math.min(1, (cam.s - 0.35) / 0.25));
        if (la < 0.05) return;
      }
      if (faded && !lit) return;
      var big = n.type === 'hub';
      var fs = (big ? 15 : n.type === 'pillar' ? 13 : 12);
      var fam = (n.type === 'hub' || n.type === 'pillar') ? "'Prata', serif" : "'Anuphan', sans-serif";
      ctx.save();
      ctx.globalAlpha = la;
      ctx.font = (lit ? '600 ' : '') + fs + "px " + fam;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      var text = n.label;
      if (n.type === 'post' && text.length > 26 && !lit) text = text.slice(0, 25) + '…';
      var ty = s.y + r + 5;
      // legibility halo
      ctx.lineWidth = 3.4; ctx.strokeStyle = 'rgba(248,249,250,.92)';
      ctx.lineJoin = 'round'; ctx.strokeText(text, s.x, ty);
      ctx.fillStyle = lit ? T.ink : (n.type === 'post' ? T.muted : T.ink);
      ctx.fillText(text, s.x, ty);
      ctx.restore();
    }

    /* -- main loop ------------------------------------------------------------ */
    function tick() {
      // keep the whole graph framed while it settles (until the user takes control)
      if (autoFit && alpha > 0.05) fit(true);
      // ease camera toward a fit target, if any
      if (cam._to) {
        cam.s += (cam._to.s - cam.s) * 0.14;
        cam.ox += (cam._to.ox - cam.ox) * 0.14;
        cam.oy += (cam._to.oy - cam.oy) * 0.14;
        if (Math.abs(cam._to.s - cam.s) < 0.001) { cam.s = cam._to.s; cam.ox = cam._to.ox; cam.oy = cam._to.oy; cam._to = null; }
      }
      clock = performance.now();
      if (alpha > 0.02 || dragging) { physics(); alpha *= 0.97; }
      draw();
      raf = requestAnimationFrame(tick);
    }

    function reheat(v) { alpha = Math.max(alpha, v == null ? 0.6 : v); settled = false; }

    /* -- hit testing ---------------------------------------------------------- */
    function nodeAt(px, py) {
      var w = toWorld(px, py), best = null, bd = Infinity;
      nodes.forEach(function (n) {
        var dx = n.x - w.x, dy = n.y - w.y, d = Math.sqrt(dx * dx + dy * dy);
        var r = baseRadius(n) + 6;
        if (d < r && d < bd) { bd = d; best = n; }
      });
      return best;
    }

    /* -- pointer events ------------------------------------------------------- */
    function relPos(ev) {
      var rect = canvas.getBoundingClientRect();
      var t = ev.touches && ev.touches[0];
      return { x: (t ? t.clientX : ev.clientX) - rect.left, y: (t ? t.clientY : ev.clientY) - rect.top };
    }
    function onDown(ev) {
      var p = relPos(ev); var n = nodeAt(p.x, p.y);
      dragMoved = false;
      if (n) { dragging = n; n.vx = n.vy = 0; reheat(0.5); }
      else { panning = true; panStart = { x: p.x - cam.ox, y: p.y - cam.oy }; autoFit = false; }
      if (ev.cancelable) ev.preventDefault();
    }
    function onMove(ev) {
      var p = relPos(ev); pointer.x = p.x; pointer.y = p.y; pointer.has = true;
      if (dragging) {
        var w = toWorld(p.x, p.y); dragging.x = w.x; dragging.y = w.y; dragMoved = true; autoFit = false; reheat(0.4);
      } else if (panning) {
        cam.ox = p.x - panStart.x; cam.oy = p.y - panStart.y; cam._to = null;
      } else {
        var n = nodeAt(p.x, p.y);
        var id = n ? n.id : null;
        if (id !== hover) { hover = id; canvas.style.cursor = id ? 'pointer' : 'grab'; }
        updateTip(n, p);
      }
    }
    function onUp() {
      if (dragging && !dragMoved) navigate(dragging);
      dragging = null; panning = false;
    }
    function onLeave() { hover = null; panning = false; dragging = null; updateTip(null); }
    function onWheel(ev) {
      ev.preventDefault();
      var p = relPos(ev);
      var w = toWorld(p.x, p.y);
      var f = Math.exp(-ev.deltaY * 0.0016);
      var ns = Math.max(0.25, Math.min(cam.s * f, 3));
      cam.s = ns; cam.ox = p.x - w.x * ns; cam.oy = p.y - w.y * ns; cam._to = null; autoFit = false;
    }
    function navigate(n) {
      if (!n || !n.url) return;
      var top = window.top || window;
      top.location.href = n.url;
    }

    /* -- tooltip (DOM, positioned over canvas) -------------------------------- */
    var tip = null;
    function ensureTip() {
      if (tip) return tip;
      tip = document.createElement('div');
      tip.className = 'jgraph-tip';
      (canvas.parentNode || document.body).appendChild(tip);
      return tip;
    }
    function updateTip(n, p) {
      var el = ensureTip();
      if (!n) { el.style.opacity = '0'; return; }
      var kind = n.type === 'post' ? 'บทความ' : n.type === 'pillar' ? 'Growth Pillar'
        : n.type === 'series' ? 'ซีรีส์' : 'Home';
      el.innerHTML = '<b>' + escapeHtml(n.label) + '</b>' +
        (n.en && n.en !== n.label ? '<span>' + escapeHtml(n.en) + '</span>' : '') +
        '<em>' + kind + (n.type === 'post' ? ' · คลิกเพื่ออ่าน' : n.url ? ' · คลิกเพื่อไป' : '') + '</em>';
      var s = toScreen(n), r = baseRadius(n) * cam.s;
      el.style.left = s.x + 'px';
      el.style.top = (s.y - r - 10) + 'px';
      el.style.opacity = '1';
    }
    function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    /* -- wire up -------------------------------------------------------------- */
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', function (e) { onMove(e); if (e.cancelable) e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchend', onUp);

    // react only to REAL size changes — ResizeObserver fires once on observe(),
    // which must not disturb the already-settled first paint. A genuine resize
    // (rotation, hidden-tab 0×0 → visible) re-settles for the new aspect.
    function onResize() {
      var rect = canvas.getBoundingClientRect();
      if (Math.abs(rect.width - W) < 1 && Math.abs(rect.height - H) < 1) return;
      resize();
      if (autoFit) {
        seedLayout();                            // re-compose for the new aspect
        alpha = 1;
        for (var k = 0; k < 320; k++) { physics(); alpha *= 0.99; }
        alpha = reduce ? 0 : 0.02;
        fit(false);
      }
      draw();
    }
    var ro = ('ResizeObserver' in window) ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', onResize);

    resize();
    seedLayout();
    // fully settle the layout synchronously so the very first paint is the final
    // composition (preview tabs & background tabs suspend rAF — never rely on it)
    for (var k = 0; k < 500; k++) { physics(); alpha *= 0.99; }
    alpha = reduce ? 0 : 0.02;
    fit(false);
    if (reduce) { draw(); } else { tick(); }

    return {
      setPillar: function (pid) { focusPillar = (focusPillar === pid ? null : pid); reheat(0.15); return focusPillar; },
      recenter: function () { autoFit = true; fit(true); reheat(0.25); },
      zoomBy: function (f) {
        var w = toWorld(W / 2, H / 2);
        var ns = Math.max(0.25, Math.min(cam.s * f, 3));
        cam.s = ns; cam.ox = W / 2 - w.x * ns; cam.oy = H / 2 - w.y * ns;
        cam._to = null; autoFit = false; draw();
      },
      reheat: reheat,
      focusPillar: function () { return focusPillar; },
      destroy: function () {
        if (raf) cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        canvas.removeEventListener('mousedown', onDown);
        canvas.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        canvas.removeEventListener('mouseleave', onLeave);
        canvas.removeEventListener('wheel', onWheel);
        if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
      }
    };
  }

  /* ==========================================================================
     UI chrome — legend, controls, overlay. Reused by overlay + inline mount.
     ========================================================================== */
  function buildChrome(host, inst, opts) {
    opts = opts || {};
    var legend = document.createElement('div');
    legend.className = 'jgraph-legend';
    Object.keys(PILLARS).forEach(function (pid) {
      var p = PILLARS[pid];
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'jgraph-chip'; b.dataset.pillar = pid;
      b.innerHTML = '<i style="background:' + p.color + '"></i>' + p.label;
      b.addEventListener('click', function () {
        var active = inst.setPillar(pid);
        [].forEach.call(legend.children, function (c) { c.classList.toggle('is-on', c.dataset.pillar === active); });
      });
      legend.appendChild(b);
    });
    host.appendChild(legend);

    var tools = document.createElement('div');
    tools.className = 'jgraph-tools';
    function tool(icon, label, fn) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'jgraph-tool'; b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = svgIcon(icon);
      b.addEventListener('click', fn);
      tools.appendChild(b);
    }
    tool('minus', 'ซูมออก (zoom out)', function () { inst.zoomBy(1 / 1.35); });
    tool('plus', 'ซูมเข้า (zoom in)', function () { inst.zoomBy(1.35); });
    tool('recenter', 'จัดกึ่งกลาง (recenter)', function () { inst.recenter(); });
    host.appendChild(tools);

    var hint = document.createElement('p');
    hint.className = 'jgraph-hint';
    hint.textContent = 'ลากเพื่อสำรวจ · เลื่อนเพื่อซูม · คลิกโหนดเพื่อเปิด';
    host.appendChild(hint);
  }

  function svgIcon(name) {
    if (name === 'recenter') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>';
    if (name === 'close') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    if (name === 'plus') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    if (name === 'minus') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>';
    return '';
  }

  /* -- inline mount (the /map/ page) ---------------------------------------- */
  function mount(container, opts) {
    injectCSS();
    container.classList.add('jgraph-stage');
    var canvas = document.createElement('canvas');
    canvas.className = 'jgraph-canvas';
    container.appendChild(canvas);
    var inst = createInstance(canvas, opts);
    buildChrome(container, inst, opts);
    return inst;
  }

  /* -- pop-over overlay (Obsidian "graph view") ----------------------------- */
  var overlay = null, overlayInst = null, lastFocus = null;
  function open() {
    injectCSS();
    if (overlay) { overlay.classList.add('is-open'); return; }
    lastFocus = document.activeElement;
    overlay = document.createElement('div');
    overlay.className = 'jgraph-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Jovey Wiki Map');
    overlay.innerHTML =
      '<div class="jgraph-panel">' +
        '<header class="jgraph-bar">' +
          '<div><span class="jgraph-eyebrow">Wiki Map</span>' +
          '<h2>แผนที่ความคิด</h2></div>' +
          '<button type="button" class="jgraph-close" aria-label="ปิดแผนที่">' + svgIcon('close') + '</button>' +
        '</header>' +
        '<div class="jgraph-stage" data-stage></div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    var stage = overlay.querySelector('[data-stage]');
    var canvas = document.createElement('canvas');
    canvas.className = 'jgraph-canvas';
    stage.appendChild(canvas);
    // force a synchronous layout so the canvas has real size before first measure
    // (no rAF here — hidden/background tabs suspend it and the overlay would stall)
    void overlay.offsetWidth;
    overlayInst = createInstance(canvas, {});
    buildChrome(stage, overlayInst, {});
    overlay.classList.add('is-open');

    overlay.querySelector('.jgraph-close').addEventListener('click', close);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    var ov = overlay, inst = overlayInst;
    overlay = null; overlayInst = null;
    setTimeout(function () {
      if (inst) inst.destroy();
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    }, 260);
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }

  /* -- styles (injected once) ----------------------------------------------- */
  var cssInjected = false;
  function injectCSS() {
    if (cssInjected) return; cssInjected = true;
    var css = [
      ".jgraph-stage{position:relative;width:100%;height:100%;overflow:hidden}",
      ".jgraph-canvas{display:block;width:100%;height:100%;touch-action:none}",
      ".jgraph-tip{position:absolute;transform:translate(-50%,-100%);pointer-events:none;z-index:6;",
      "  background:rgba(255,255,255,.97);border:1px solid var(--line,#e1e6ec);border-radius:12px;",
      "  padding:8px 12px;max-width:240px;text-align:center;opacity:0;transition:opacity .12s;",
      "  box-shadow:0 10px 30px rgba(20,20,30,.14);font-family:'Anuphan',sans-serif}",
      ".jgraph-tip b{display:block;font-size:13.5px;color:var(--ink,#212226);line-height:1.35}",
      ".jgraph-tip span{display:block;font-size:11.5px;color:var(--muted,#6a6a71);margin-top:1px}",
      ".jgraph-tip em{display:block;font-style:normal;font-size:10.5px;letter-spacing:.02em;color:var(--muted,#6a6a71);margin-top:4px;font-family:'Quicksand',sans-serif;font-weight:600}",
      ".jgraph-legend{position:absolute;left:16px;bottom:16px;z-index:5;display:flex;flex-wrap:wrap;gap:7px}",
      ".jgraph-chip{display:inline-flex;align-items:center;gap:7px;font-family:'Quicksand',sans-serif;font-weight:600;",
      "  font-size:12.5px;color:var(--ink,#212226);background:rgba(255,255,255,.86);backdrop-filter:blur(6px);",
      "  border:1px solid var(--line,#e1e6ec);border-radius:999px;padding:6px 12px;cursor:pointer;transition:.15s}",
      ".jgraph-chip i{width:10px;height:10px;border-radius:50%;display:inline-block}",
      ".jgraph-chip:hover{border-color:#c9d2dc;transform:translateY(-1px)}",
      ".jgraph-chip.is-on{background:var(--ink,#212226);color:#fff;border-color:var(--ink,#212226)}",
      ".jgraph-tools{position:absolute;right:16px;bottom:16px;z-index:5;display:flex;gap:8px}",
      ".jgraph-tool{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;cursor:pointer;",
      "  background:rgba(255,255,255,.86);backdrop-filter:blur(6px);border:1px solid var(--line,#e1e6ec);color:var(--ink,#212226);transition:.15s}",
      ".jgraph-tool:hover{border-color:#c9d2dc;transform:translateY(-1px)}",
      ".jgraph-tool svg{width:20px;height:20px}",
      ".jgraph-hint{position:absolute;left:0;right:0;top:14px;margin:0 auto;z-index:5;width:max-content;max-width:90%;",
      "  font-family:'Quicksand',sans-serif;font-weight:600;font-size:11.5px;letter-spacing:.02em;color:var(--muted,#6a6a71);",
      "  background:rgba(255,255,255,.7);backdrop-filter:blur(6px);border-radius:999px;padding:5px 14px;text-align:center;pointer-events:none}",
      /* overlay */
      ".jgraph-overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:min(4vw,40px);",
      "  background:rgba(33,34,38,.34);backdrop-filter:blur(8px);opacity:0;transition:opacity .26s ease}",
      ".jgraph-overlay.is-open{opacity:1}",
      ".jgraph-panel{width:min(1120px,100%);height:min(80vh,760px);background:var(--bg,#F8F9FA);border:1px solid var(--line,#e1e6ec);",
      "  border-radius:26px;box-shadow:0 40px 120px rgba(20,20,30,.32);display:flex;flex-direction:column;overflow:hidden;",
      "  transform:scale(.975);transition:transform .26s ease}",
      ".jgraph-overlay.is-open .jgraph-panel{transform:scale(1)}",
      ".jgraph-bar{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line,#e1e6ec)}",
      ".jgraph-eyebrow{font-family:'Quicksand',sans-serif;font-weight:700;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--blue,#3b6e8f)}",
      ".jgraph-bar h2{font-family:'Prata',serif;font-weight:400;font-size:20px;color:var(--ink,#212226);margin:2px 0 0}",
      ".jgraph-close{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;cursor:pointer;",
      "  background:var(--card,#fff);border:1px solid var(--line,#e1e6ec);color:var(--ink,#212226);transition:.15s}",
      ".jgraph-close:hover{background:var(--ink,#212226);color:#fff;border-color:var(--ink,#212226)}",
      ".jgraph-close svg{width:20px;height:20px}",
      ".jgraph-panel .jgraph-stage{flex:1;min-height:0}",
      "@media (max-width:640px){.jgraph-panel{height:86vh;border-radius:20px}.jgraph-bar h2{font-size:17px}",
      "  .jgraph-legend{left:10px;bottom:10px;right:56px}.jgraph-tools{right:10px;bottom:10px;flex-direction:column}",
      "  .jgraph-tool{width:36px;height:36px}.jgraph-hint{display:none}}"
      /* no dark variant — the whole site is intentionally light-only */
    ].join('\n');
    var style = document.createElement('style');
    style.id = 'jgraph-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* -- auto-wire launchers -------------------------------------------------- */
  function wireLaunchers() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-jovey-map]');
      if (b) { e.preventDefault(); open(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireLaunchers);
  else wireLaunchers();

  window.JoveyMap = { open: open, close: close, mount: mount };
})();
