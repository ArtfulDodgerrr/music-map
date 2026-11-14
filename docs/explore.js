/* Explore view: similar-artist neighbourhood explorer + blend mode. */
var Explore = (function () {
  'use strict';
  var svg, gl, gn, W = 800, H = 600, ready = false;
  var cur = { mode: 'single', a: null, b: null };
  var prev = new Map(), trail = [], selId = null, hoverT = null, centreId = null, lastLayout = null;
  var NOTE = {
    full: '',
    limited: 'Limited data — built from the artists that link here, plus their other neighbours.',
    bandcamp: 'No streaming-service data — built from Bandcamp "fans also bought" recommendations.',
    notes: 'Limited data — linked through curated recommendation notes.',
    group: 'Limited data — showing this artist\'s neighbours on the map.',
    curated: 'Limited data — hand-picked neighbourhood.',
    none: 'No similarity data for this artist yet.'
  };
  function sim(r) { return Math.max(0.06, 1 - r / 24); }
  function sc() { return Math.max(0.72, Math.min(1, Math.min(W, H) / 640)); }

  // ---- neighbourhood computation
  function direct(i) {
    var m = new Map();
    function add(j, v, src) {
      var o = m.get(j);
      if (o) { o.s = Math.max(o.s, v) + 0.12; if (src === 0) o.src = 0; } else m.set(j, { id: j, s: v, src: src, hop: 1 });
    }
    MM.out[i].forEach(function (e) { add(e[0], sim(e[1]), e[2]); });
    MM.inn[i].forEach(function (e) { add(e[0], sim(e[1]), e[2]); });
    return m;
  }
  function kindOf(i) {
    var o = MM.out[i], n = MM.inn[i];
    if (o.some(function (e) { return e[2] === 0; })) return 'full';
    var c = [0, 0, 0, 0, 0], tot = 0;
    o.concat(n).forEach(function (e) { c[e[2]]++; tot++; });
    if (!tot) return 'none';
    var best = 0; for (var s = 1; s < 5; s++) if (c[s] > c[best]) best = s;
    return ['limited', 'bandcamp', 'notes', 'group', 'curated'][best];
  }
  function expand(i, m, want) {
    var cand = new Map();
    Array.from(m.values()).sort(function (a, b) { return b.s - a.s; }).slice(0, 14).forEach(function (d) {
      MM.out[d.id].forEach(function (e) {
        var t = e[0]; if (t === i || m.has(t)) return;
        var o = cand.get(t) || { id: t, s: 0, via: d.id, vs: 0, hop: 2, src: e[2] };
        var v = sim(e[1]) * d.s; o.s += v * 0.55; if (v > o.vs) { o.vs = v; o.via = d.id; } cand.set(t, o);
      });
    });
    Array.from(cand.values()).sort(function (a, b) { return b.s - a.s; }).slice(0, want).forEach(function (o) { m.set(o.id, o); });
  }
  function neighbourhood(i) {
    var cap = MM.isNarrow() ? 16 : 30;
    var m = direct(i), list = Array.from(m.values()).sort(function (a, b) { return b.s - a.s; });
    if (list.length > cap) { list = list.slice(0, cap); m = new Map(list.map(function (o) { return [o.id, o]; })); }
    if (list.length < 14) expand(i, m, Math.min(cap - list.length, 22 - list.length));
    return Array.from(m.values());
  }

  // ---- node descriptors
  function describe(id, role) {
    var n = MM.nodes[id], s = sc(), info = n.info, r;
    var basis = info ? info.w : n.plays;
    var type = n.rec ? 'rec' : (n.played ? 'played' : 'new');
    if (role === 'ctr') r = s * 44;
    else if (type === 'played') r = s * (11 + 22 * Math.sqrt(Math.min(1, basis / 2500)));
    else if (type === 'rec') r = s * 17;
    else r = s * (8 + Math.min(8, Math.log10(n.fans + 10) * 1.3));
    var ring = info ? MM.subColor(info.col, info.si) : 'var(--mut)';
    return { id: id, n: n, name: n.name, type: type, r: r, ring: ring, role: role };
  }

  // ---- layout (force sim in px, then fit to viewport)
  function fit(L, availX, availY) {
    var mx = 1, my = 1;
    L.forEach(function (d) { mx = Math.max(mx, Math.abs(d.x) + d.r); my = Math.max(my, Math.abs(d.y) + d.r + 10); });
    var fx = Math.max(0.3, Math.min(2.3, availX / mx)), fy = Math.max(0.3, Math.min(2.3, availY / my));
    L.forEach(function (d) { d.x *= fx; d.y *= fy; });
  }
  function layoutSingle(c) {
    var hood = neighbourhood(c), s = sc();
    var ids = new Set(hood.map(function (o) { return o.id; }));
    var co = [], cnt = new Map();
    hood.forEach(function (o) {
      MM.out[o.id].forEach(function (e) {
        if (ids.has(e[0]) && e[0] !== o.id) { co.push({ a: o.id, b: e[0], r: e[1] }); cnt.set(o.id, (cnt.get(o.id) || 0) + 1); cnt.set(e[0], (cnt.get(e[0]) || 0) + 1); }
      });
    });
    hood.forEach(function (o) { if (o.hop === 1) o.s += 0.08 * Math.min(3, cnt.get(o.id) || 0); });
    var h1 = hood.filter(function (o) { return o.hop === 1; });
    var smin = d3.min(h1, function (o) { return o.s; }) || 0, smax = d3.max(h1, function (o) { return o.s; }) || 1;
    var N = hood.length + 1, availX = (W - reserve()) / 2 - 56, availY = (H - 110) / 2 - 22;
    var Rs = Math.max(Math.min(availX, availY), 34 * Math.sqrt(N) + 40 * s);
    var nodes = [Object.assign(describe(c, 'ctr'), { fx: 0, fy: 0, x: 0, y: 0, dist: 0 })];
    hood.forEach(function (o, k) {
      var d = describe(o.id, o.hop === 2 ? 'hop2' : 'nb');
      var sn = smax > smin ? (o.s - smin) / (smax - smin) : 0.5;
      d.sn = o.hop === 2 ? 0 : sn; d.hop = o.hop; d.via = o.via; d.src = o.src; d.s = o.s;
      d.dist = o.hop === 2 ? Rs * 1.02 : Rs * (0.34 + (1 - sn) * 0.6);
      var ang = k * 2.39996323; d.x = Math.cos(ang) * d.dist; d.y = Math.sin(ang) * d.dist;
      nodes.push(d);
    });
    var idx = new Map(nodes.map(function (d, i) { return [d.id, i]; }));
    var links = co.filter(function (e) { return idx.has(e.a) && idx.has(e.b); }).map(function (e) { return { source: idx.get(e.a), target: idx.get(e.b) }; });
    var simu = d3.forceSimulation(nodes)
      .force('rad', d3.forceRadial(function (d) { return d.dist; }, 0, 0).strength(function (d) { return d.role === 'ctr' ? 0 : 0.85; }))
      .force('col', d3.forceCollide(function (d) { return d.r + 13 * s; }).strength(0.9).iterations(3))
      .force('chg', d3.forceManyBody().strength(-26))
      .force('lnk', d3.forceLink(links).distance(Rs * 0.5).strength(0.035))
      .stop();
    for (var t = 0; t < 360; t++) simu.tick();
    fit(nodes, availX, availY);
    // links
    var lk = [];
    nodes.forEach(function (d) {
      if (d.role === 'ctr') return;
      if (d.hop === 2 && d.via != null && idx.has(d.via)) lk.push({ a: d.via, b: d.id, k: 'spoke h2', o: 0.22 });
      else lk.push({ a: c, b: d.id, k: 'spoke', o: 0.2 + 0.45 * (d.sn || 0) });
    });
    co.forEach(function (e) { if (idx.has(e.a) && idx.has(e.b) && e.a !== c && e.b !== c) lk.push({ a: e.a, b: e.b, k: 'colink', o: null }); });
    return { nodes: nodes, links: lk, kind: kindOf(c), count: hood.length };
  }
  // weighted shortest-path distances over the undirected similarity graph (lower = more similar)
  function dijkstra(src, maxD) {
    var D = new Map([[src, 0]]), PV = new Map(), heap = [[0, src]];
    function push(x) { heap.push(x); var i = heap.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } }
    function pop() {
      var top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; var i = 0, n = heap.length; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < n && heap[l][0] < heap[m][0]) m = l; if (r < n && heap[r][0] < heap[m][0]) m = r; if (m === i) break; var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } }
      return top;
    }
    while (heap.length) {
      var cur = pop(), d = cur[0], u = cur[1];
      if (d > D.get(u)) continue;
      var nb = MM.out[u].concat(MM.inn[u]);
      for (var k = 0; k < nb.length; k++) {
        var v = nb[k][0], nd = d + 1 + nb[k][1] / 12;
        if (nd <= maxD && (!D.has(v) || nd < D.get(v))) { D.set(v, nd); PV.set(v, u); push([nd, v]); }
      }
    }
    D.prev = PV; return D;
  }
  function layoutBlend(a, b) {
    var DA = dijkstra(a, 9), DB = dijkstra(b, 9), s = sc(), cand = [], path = [];
    if (DA.has(b)) { for (var u = b; u !== a && u != null; u = DA.prev.get(u)) path.push(u); path.reverse(); path.pop(); }
    var onPath = new Set(path);
    DA.forEach(function (da, id) {
      if (id === a || id === b || !DB.has(id)) return;
      var db = DB.get(id), both = da <= 2.9 && db <= 2.9;
      cand.push({ id: id, da: da, db: db, both: both, path: onPath.has(id), comb: (onPath.has(id) ? 3 : 1) * Math.exp(-0.75 * (da + db)) * (1 + 0.15 * Math.log10(1 + MM.nodes[id].fans + (MM.nodes[id].plays || 0) * 50)) });
    });
    cand.sort(function (x, y) { return y.comb - x.comb; });
    var cap = MM.isNarrow() ? 20 : 30; cand = cand.slice(0, cap);
    var availX = (W - reserve()) / 2 - 56, availY = (H - 110) / 2 - 22;
    var cmax = d3.max(cand, function (o) { return o.comb; }) || 1;
    var nodes = [
      Object.assign(describe(a, 'ctr'), { fx: -availX * 0.88, fy: 0, x: -availX * 0.88, y: 0, side: 'A' }),
      Object.assign(describe(b, 'ctr'), { fx: availX * 0.88, fy: 0, x: availX * 0.88, y: 0, side: 'B' })
    ];
    nodes[0].r *= 0.85; nodes[1].r *= 0.85;
    cand.forEach(function (o, k) {
      var d = describe(o.id, 'nb'); d.both = o.both; d.sn = o.comb / cmax; d.hop = 1;
      d.tx = (o.da - o.db) / (o.da + o.db) * availX * 0.7; d.x = d.tx + (k % 5 - 2) * 8; d.y = (k % 2 ? 1 : -1) * (20 + k * 9);
      nodes.push(d);
    });
    var simu = d3.forceSimulation(nodes)
      .force('x', d3.forceX(function (d) { return d.tx || 0; }).strength(function (d) { return d.role === 'ctr' ? 0 : 0.45; }))
      .force('y', d3.forceY(0).strength(0.05))
      .force('col', d3.forceCollide(function (d) { return d.r + 15 * s; }).strength(0.9).iterations(3))
      .force('chg', d3.forceManyBody().strength(-30)).stop();
    for (var t = 0; t < 340; t++) simu.tick();
    fit(nodes, availX, availY);
    // draw the real similarity edges among the shown artists
    var set = new Set(nodes.map(function (d) { return d.id; })), lk = [], seen = new Set();
    nodes.forEach(function (d) {
      MM.out[d.id].forEach(function (e) {
        if (!set.has(e[0]) || e[0] === d.id) return;
        var key = Math.min(d.id, e[0]) + '|' + Math.max(d.id, e[0]); if (seen.has(key)) return; seen.add(key);
        var inc = d.id === a || e[0] === a ? 'A' : (d.id === b || e[0] === b ? 'B' : '');
        lk.push({ a: d.id, b: e[0], k: inc ? 'spoke ' + inc : 'colink', o: inc ? Math.max(.15, sim(e[1]) * .6) : null });
      });
    });
    return { nodes: nodes, links: lk, cand: cand, path: path, dist: DA.has(b) ? DA.get(b) : null, count: cand.filter(function (o) { return o.both; }).length, joined: Math.min.apply(null, cand.map(function (o) { return o.da + o.db; }).concat([99])) < 99 };
  }
  function reserve() { return MM.isNarrow() ? 0 : 340; }

  // ---- drawing
  function trunc(s, n) { var a = Array.from(s); return a.length > n ? a.slice(0, n - 1).join('') + '…' : s; }
  function build(g, d) {
    g.append('circle').attr('class', 'glow');
    g.append('circle').attr('class', 'rg');
    g.append('image').attr('class', 'face').attr('clip-path', 'url(#cc2)').attr('preserveAspectRatio', 'xMidYMid slice').attr('referrerpolicy', 'no-referrer');
    g.append('text').attr('class', 'ini').style('text-anchor', 'middle').style('dominant-baseline', 'central').style('fill', 'var(--mut)').style('font-weight', 700).style('pointer-events', 'none');
    g.append('text').attr('class', 'star').text('★');
    g.append('text').attr('class', 'nm');
    g.append('text').attr('class', 'sub');
  }
  function style(g, dur) {
    g.each(function (d) {
      var el = d3.select(this), n = d.n, isC = d.role === 'ctr', fs = (isC ? 15 : 11.5) * Math.max(.9, sc());
      this.setAttribute('class', 'xn ' + d.type + (isC ? ' ctr' : '') + (d.role === 'hop2' ? ' hop2' : '') + (d.id === selId ? ' sel' : ''));
      var t = el.select('.glow').attr('r', d.r + 5), rg = el.select('.rg').attr('r', d.r).style('stroke', d.type === 'rec' ? null : d.ring);
      var url = MM.imgUrl(n), img = el.select('.face');
      if (url) {
        if (img.attr('href') !== url) img.attr('href', url);
        img.style('display', null).attr('x', -d.r).attr('y', -d.r).attr('width', 2 * d.r).attr('height', 2 * d.r).style('opacity', d.type === 'new' ? 0.38 : 1);
        el.select('.ini').text('');
      } else { img.style('display', 'none'); el.select('.ini').text(Array.from(n.name)[0]).style('font-size', d.r * .9 + 'px'); }
      el.select('.star').style('display', d.type === 'rec' ? null : 'none').attr('x', d.r * .72).attr('y', -d.r * .72).style('font-size', Math.max(11, d.r * .6) + 'px');
      el.select('.nm').text(trunc(n.name, isC ? 30 : (MM.isNarrow() ? 15 : 20))).attr('y', d.r + fs + 2).style('font-size', fs + 'px');
      var sub = d.both ? 'both' : (d.type === 'new' ? 'new' : (d.type === 'rec' ? 'pick' : ''));
      el.select('.sub').text(sub).attr('y', d.r + fs + 12).style('font-size', 9 * Math.max(.95, sc()) + 'px');
    });
  }
  function render(L, fromId) {
    var cy = (H + 40) / 2 - 6, cx = (W - reserve()) / 2, reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches, dur = reduce ? 0 : 750;
    var fromPos = prev.get(fromId) || { x: 0, y: 0 };
    function T(sel) { return dur ? sel.transition().duration(dur).ease(d3.easeCubicInOut) : sel; }
    var ns = gn.selectAll('g.xn').data(L.nodes, function (d) { return d.id; });
    var ex = ns.exit(); ex.on('click', null); (dur ? ex.transition().duration(dur * .6).style('opacity', 0).attr('transform', 'translate(' + cx + ',' + cy + ')') : ex).remove();
    var en = ns.enter().append('g').attr('class', 'xn').style('opacity', 0)
      .attr('transform', function () { return 'translate(' + (cx + fromPos.x) + ',' + (cy + fromPos.y) + ')'; });
    en.each(function (d) { build(d3.select(this), d); });
    var all = en.merge(ns);
    all.each(function (d) { this.__d = d; });
    style(all, dur);
    T(all).attr('transform', function (d) { return 'translate(' + (cx + d.x) + ',' + (cy + d.y) + ')'; }).style('opacity', function (d) { return d.role === 'hop2' ? 0.8 : 1; });
    all.filter(function (d) { return d.role === 'ctr'; }).raise();
    // links
    var pos = new Map(L.nodes.map(function (d) { return [d.id, d]; }));
    function startPos(id) { var p = prev.get(id) || fromPos; return { x: cx + p.x, y: cy + p.y }; }
    var ls = gl.selectAll('line').data(L.links, function (l) { return l.a + '|' + l.b + '|' + l.k; });
    (dur ? ls.exit().transition().duration(dur * .5).style('opacity', 0) : ls.exit()).remove();
    var le = ls.enter().append('line')
      .attr('x1', function (l) { return startPos(l.a).x; }).attr('y1', function (l) { return startPos(l.a).y; })
      .attr('x2', function (l) { return startPos(l.b).x; }).attr('y2', function (l) { return startPos(l.b).y; }).style('opacity', 0);
    var la = le.merge(ls).attr('class', function (l) { return l.k; });
    T(la).attr('x1', function (l) { return cx + pos.get(l.a).x; }).attr('y1', function (l) { return cy + pos.get(l.a).y; })
      .attr('x2', function (l) { return cx + pos.get(l.b).x; }).attr('y2', function (l) { return cy + pos.get(l.b).y; })
      .style('opacity', 1).style('stroke-opacity', function (l) { return l.o == null ? null : l.o; })
      .attr('stroke-width', function (l) { return l.k === 'colink' ? 1 : 1.3; });
    prev = new Map(L.nodes.map(function (d) { return [d.id, { x: d.x, y: d.y }]; }));
    lastLayout = L;
  }

  // ---- interaction
  function nodeClick(e, d) {
    e.stopPropagation();
    if (cur.mode === 'blend') {
      if (d.role === 'ctr') { go1(d.id); return; }
      go1(d.id); return;
    }
    if (d.role === 'ctr') { selId = null; showCentre(); return; }
    if (MM.isTouch() || MM.isNarrow()) {
      if (selId !== d.id) { selId = d.id; style(gn.selectAll('g.xn'), 0); MM.panel.showArtist(d.n, 'explore', { canCentre: true }); return; }
    }
    go1(d.id);
  }
  function go1(id) { MM.go(['explore', MM.nodes[id].name]); }
  function showCentre() {
    if (cur.mode === 'blend') { showBlendPanel(); return; }
    if (centreId == null) return;
    if (MM.isNarrow()) { MM.panel.hide(); return; }
    MM.panel.showArtist(MM.nodes[centreId], 'explore', { canCentre: false, soft: true });
  }
  function showBlendPanel() {
    if (!lastLayout || !lastLayout.cand) return;
    var A = MM.nodes[cur.a], B = MM.nodes[cur.b], L = lastLayout;
    var rows = L.cand.slice(0, 14).map(function (o) {
      var n = MM.nodes[o.id];
      return '<li data-id="' + o.id + '"><span class="n">' + MM.esc(n.name) + (n.rec ? ' <span style="color:var(--gold)">★</span>' : '') + '</span>' + (o.both ? '<span class="b">both</span>' : '') + '</li>';
    }).join('');
    var sum = (L.count ? L.count + ' artist' + (L.count === 1 ? '' : 's') + ' close to both' : 'No artist is directly close to both') + ' · ranked by how well each one bridges the two.';
    var path = L.path.length ? '<div class="crumb" style="margin-top:8px"><b style="color:var(--fg)">Shortest path:</b> ' + [A.name].concat(L.path.map(function (i) { return MM.nodes[i].name; })).concat([B.name]).map(MM.esc).join(' &rarr; ') + '</div>' : '';
    MM.panel.showHtml('<div class="kicker">Blend</div><h2 style="margin:2px 0 4px;font-size:18px">' + MM.esc(A.name) + ' + ' + MM.esc(B.name) + '</h2><div class="crumb" style="font-size:12.5px">' + sum + '</div>' + path + '<ul class="blendlist">' + rows + '</ul>');
  }
  function bindOnce() {
    svg.addEventListener('click', function () { selId = null; if (ready && lastLayout) style(gn.selectAll('g.xn'), 0); if (MM.isNarrow()) MM.panel.hide(); else showCentre(); });
    document.getElementById('panel').addEventListener('click', function (e) {
      var li = e.target.closest('.blendlist li'); if (li) go1(+li.dataset.id);
    });
    gn.on('click', function (e) { var g = e.target.closest('g.xn'); if (g) nodeClick(e, g.__d); });
    gn.on('pointerover', function (e) {
      if (MM.isTouch()) return;
      var g = e.target.closest('g.xn'); if (!g) return; clearTimeout(hoverT);
      var d = g.__d; MM.panel.showArtist(d.n, 'explore', { canCentre: d.role !== 'ctr', hover: true });
    });
    gn.on('pointerout', function (e) {
      if (MM.isTouch()) return;
      var to = e.relatedTarget; if (to && to.closest && to.closest('g.xn')) return;
      clearTimeout(hoverT); hoverT = setTimeout(function () { if (!document.getElementById('panel').matches(':hover')) showCentre(); }, 500);
    });
    document.getElementById('exback').addEventListener('click', function () {
      if (trail.length > 1) { trail.pop(); var n = MM.nodes[trail[trail.length - 1]]; MM.go(['explore', n.name]); }
    });
    var bb = document.getElementById('blendbtn'), bs = document.getElementById('bsearch'), bq = document.getElementById('bq');
    document.getElementById('blendlist').addEventListener('click', showBlendPanel);
    bb.addEventListener('click', function () {
      if (cur.mode === 'blend') { MM.go(['explore', MM.nodes[cur.a].name]); return; }
      bs.hidden = !bs.hidden; bb.classList.toggle('on', !bs.hidden); if (!bs.hidden) bq.focus();
    });
    MM.typeahead(bq, document.getElementById('bres'), function (n) {
      if (centreId == null || n.i === centreId) return;
      MM.go(['blend', MM.nodes[centreId].name, n.name]);
    });
    window.addEventListener('resize', function () { if (!document.getElementById('view-explore').classList.contains('on')) return; size(); redo(); });
  }
  function size() { var r = svg.getBoundingClientRect(); W = Math.max(260, r.width); H = Math.max(300, r.height); }
  function init() {
    if (ready) return;
    svg = document.getElementById('exsvg');
    var defs = d3.select(svg).append('defs'); defs.append('clipPath').attr('id', 'cc2').attr('clipPathUnits', 'objectBoundingBox').append('circle').attr('cx', .5).attr('cy', .5).attr('r', .5);
    gl = d3.select(svg).append('g'); gn = d3.select(svg).append('g');
    size(); bindOnce(); ready = true;
  }
  function redo() { if (cur.a != null) draw(cur.a, cur.b, null, true); }

  function draw(a, b, fromId, instant) {
    var L, note = '';
    if (b != null) {
      L = layoutBlend(a, b);
      note = 'Blend: artists that bridge ' + MM.nodes[a].name + ' and ' + MM.nodes[b].name + '.' + (L.path.length ? ' Path: ' + [MM.nodes[a].name].concat(L.path.map(function (i) { return MM.nodes[i].name; })).concat([MM.nodes[b].name]).join(' → ') : '');
      centreId = a;
    } else {
      L = layoutSingle(a); centreId = a;
      note = NOTE[L.kind] || '';
      if (L.kind === 'full' && L.count < 6) note = 'Limited data — only a few close neighbours were found.';
    }
    if (instant) prev = new Map();
    render(L, fromId);
    document.getElementById('exnote').textContent = note;
    updateTools();
    selId = null;
    if (b != null) { if (MM.isNarrow()) MM.panel.hide(); else showBlendPanel(); } else showCentre();
  }
  function updateTools() {
    var tr = document.getElementById('trail'); tr.innerHTML = '';
    trail.forEach(function (id, i) {
      if (i) { var s = document.createElement('span'); s.className = 'sep'; s.textContent = '>'; tr.appendChild(s); }
      var bt = document.createElement('button'); bt.textContent = MM.nodes[id].name; bt.onclick = function () { MM.go(['explore', MM.nodes[id].name]); };
      tr.appendChild(bt);
    });
    document.getElementById('exback').disabled = trail.length < 2 || cur.mode === 'blend';
    var bl = document.getElementById('blendlist'); bl.hidden = !(cur.mode === 'blend' && MM.isNarrow());
    var bb = document.getElementById('blendbtn');
    bb.textContent = cur.mode === 'blend' ? 'Exit blend' : 'Blend';
    bb.classList.toggle('on', cur.mode === 'blend' || !document.getElementById('bsearch').hidden);
    if (cur.mode === 'blend') document.getElementById('bsearch').hidden = true;
  }

  // route: {a: name, b: name|null}
  function show(route) {
    init(); size();
    var a = MM.find(route.a) || MM.nodes.filter(function (n) { return !!n.info; })[0] || MM.nodes[0];
    var b = route.b ? MM.find(route.b) : null;
    if (b && b.i === a.i) b = null;
    var from = centreId;
    cur = { mode: b ? 'blend' : 'single', a: a.i, b: b ? b.i : null };
    if (!b) {
      var at = trail.indexOf(a.i);
      if (at > -1) trail.length = at + 1; else trail.push(a.i);
      if (trail.length > 8) trail.shift();
    } else if (!trail.length) trail.push(a.i);
    // fade in animation target: new nodes emerge from the clicked node
    draw(a.i, b ? b.i : null, from, false);
  }
  return { clearSel: function () { if (!ready) return; selId = null; if (lastLayout) style(gn.selectAll('g.xn'), 0); }, show: show, resize: function () { if (ready) { size(); redo(); } } };
})();
