/* Map view: zoomable nested circle packing (family > cluster > sub-group > artist). */
var MapView = (function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var svg, world, hl, W = 800, H = 600, root, nodes = [], focus, view, ready = false, selected = null;
  var hintEl, crumbsEl;

  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function tw(s, f, upper) {   // rough text width
    var w = 0;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); w += c > 0x2e80 ? 1.0 : (upper ? .72 : .56); }
    return w * f;
  }
  function size() {
    var r = svg.getBoundingClientRect(); W = Math.max(200, r.width); H = Math.max(200, r.height);
  }

  function init() {
    if (ready) return;
    svg = document.getElementById('mapsvg'); hintEl = document.getElementById('maphint'); crumbsEl = document.getElementById('crumbs');
    var defs = mk('defs', null, svg);
    var cp = mk('clipPath', { id: 'cc', clipPathUnits: 'objectBoundingBox' }, defs); mk('circle', { cx: .5, cy: .5, r: .5 }, cp);
    world = mk('g', null, svg);
    var data = {
      n: 'root', kind: 'root', children: MM.fams.map(function (f) {
        return {
          n: f.n, kind: 'fam', children: f.c.map(function (c) {
            return {
              n: c.n, kind: 'cl', col: c.col, cap: c.cap, children: c.s.map(function (s) {
                return {
                  n: s.n, kind: 'sg', col: c.col, si: s.si, children: s.a.map(function (a) {
                    return { n: a.n, kind: 'leaf', col: c.col, si: s.si, a: a, v: Math.pow(a.w, 0.55) };
                  })
                };
              })
            };
          })
        };
      })
    };
    root = d3.hierarchy(data).sum(function (d) { return d.v || 0; }).sort(function (a, b) { return b.value - a.value; });
    d3.pack().size([1000, 1000]).padding(5)(root);
    nodes = root.descendants().slice(1);
    nodes.forEach(function (d) {
      var dd = d.data, g = mk('g', { 'class': 'node ' + dd.kind }, world); g.__d = d; d._g = g;
      d._anc = new Set(d.ancestors());
      if (dd.kind === 'leaf') {
        g.setAttribute('class', 'node leaf');
        d._bgd = mk('circle', { 'class': 'bgd' }, g);
        d._ph = mk('circle', { fill: 'var(--bg2)' }, g);
        var node = MM.find(dd.n); d._url = node ? MM.imgUrl(node) : null;
        d._img = mk('image', { preserveAspectRatio: 'xMidYMid slice', 'clip-path': 'url(#cc)', width: 1, height: 1 }, g);
        d._img.style.display = 'none';
        d._ring = mk('circle', { 'class': 'ring' }, g);
        if (!d._url) { d._ini = mk('text', { 'class': 'ini' }, g); d._ini.textContent = Array.from(dd.n)[0]; }
        d._lab = mk('text', { 'class': 'lname' }, g); d._lab.textContent = dd.n;
        d._labw = tw(dd.n, 1);
      } else {
        d._c = mk('circle', { 'class': 'disc ' + ({ fam: 'fam-c', cl: 'cl-c', sg: 'sg-c' })[dd.kind] }, g);
        var p = mk('g', { 'class': 'pill ' + dd.kind }, g);
        d._pill = p; d._pr = mk('rect', { rx: 11, ry: 11 }, p); d._pt = mk('text', null, p);
        d._pt.textContent = dd.kind === 'fam' ? dd.n.toUpperCase() : dd.n;
      }
    });
    hl = mk('circle', { 'class': 'hl' }, world); hl.style.display = 'none';
    colorize();
    MM.onTheme = colorize;
    size();
    focus = root; view = [root.x, root.y, root.r * 2];

    svg.addEventListener('click', onClick, true);
    svg.addEventListener('pointerover', onOver);
    initFreeZoom();
    window.addEventListener('resize', function () { if (!document.getElementById('view-map').classList.contains('on')) return; size(); apply(); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('view-map').classList.contains('on') && !MM.panel.cur) up(); });
    ready = true;
    labelState(); crumbs(); apply();
  }

  function colorize() {
    nodes.forEach(function (d) {
      var dd = d.data;
      if (dd.kind === 'cl') { var c = MM.baseColor(dd.col); d._c.setAttribute('stroke', c); d._c.setAttribute('fill', c); }
      else if (dd.kind === 'sg') { var s = MM.subColor(dd.col, dd.si); d._c.setAttribute('stroke', s); d._c.setAttribute('fill', s); }
      else if (dd.kind === 'leaf') { d._ring.setAttribute('stroke', MM.subColor(dd.col, dd.si)); d._bgd.setAttribute('fill', MM.baseColor(dd.col)); }
    });
  }

  // -------- rendering
  function apply() {
    var v = view, HE = viewH(), k = Math.min(W, HE) * 0.9 / v[2], i, d, cx, cy, rr, vis;
    for (i = 0; i < nodes.length; i++) {
      d = nodes[i];
      cx = (d.x - v[0]) * k + W / 2; cy = (d.y - v[1]) * k + HE / 2; rr = d.r * k;
      d._cx = cx; d._cy = cy; d._rr = rr;
      vis = rr >= 2 && cx + rr > -10 && cx - rr < W + 10 && cy + rr > -10 && cy - rr < H + 10;
      if (vis !== d._vis) { d._g.style.display = vis ? '' : 'none'; d._vis = vis; }
      if (!vis) continue;
      if (d.data.kind === 'leaf') leaf(d, cx, cy, rr); else nonleaf(d, cx, cy, rr);
    }
    if (selected && selected._vis) { var ra = selected._rr * 0.66; hl.setAttribute('cx', selected._cx); hl.setAttribute('cy', selected._cy - selected._rr * 0.2); hl.setAttribute('r', ra + 5); hl.style.display = ''; }
    else hl.style.display = 'none';
  }
  function viewH() {   // on phones the bottom sheet covers the lower part of the map
    var p = document.getElementById('panel');
    return (MM.isNarrow() && !p.hidden && p.dataset.ctx === 'map') ? Math.max(200, H - p.offsetHeight) : H;
  }
  function setc(el, cx, cy, r) { el.setAttribute('cx', cx); el.setAttribute('cy', cy); el.setAttribute('r', r); }
  function nonleaf(d, cx, cy, rr) {
    setc(d._c, cx, cy, rr);
    if (d._pon) {
      var kind = d.data.kind, f = kind === 'sg' ? Math.max(10, Math.min(16, rr * .12)) : Math.max(11, Math.min(22, rr * .1));
      var text = d._pt.textContent, w = tw(text, f, kind === 'fam') + 22 + (kind === 'fam' ? text.length * f * .06 : 0), h = f * 1.7;
      d._pt.setAttribute('x', cx); d._pt.setAttribute('y', cy - rr + 1); d._pt.style.fontSize = f + 'px';
      d._pr.setAttribute('x', cx - w / 2); d._pr.setAttribute('y', cy - rr - h / 2); d._pr.setAttribute('width', w); d._pr.setAttribute('height', h);
      d._pr.setAttribute('rx', h / 2); d._pr.setAttribute('ry', h / 2);
      if (kind === 'fam') d._pt.style.letterSpacing = '.06em';
    }
  }
  function leaf(d, cx, cy, rr) {
    setc(d._bgd, cx, cy, rr);
    var ra = rr * 0.66, ay = cy - rr * 0.2;
    if (rr < 4) { d._ph.style.display = d._ring.style.display = 'none'; d._img.style.display = 'none'; d._lab.style.display = 'none'; if (d._ini) d._ini.style.display = 'none'; return; }
    d._ph.style.display = d._ring.style.display = '';
    setc(d._ph, cx, ay, ra); setc(d._ring, cx, ay, ra + 1);
    d._ring.setAttribute('stroke-width', Math.max(1.4, ra * 0.08));
    if (d._url) {
      if (ra >= 6 && !d._loaded && cx > -ra && cx < W + ra && cy > -ra && cy < H + ra) { d._img.setAttribute('href', d._url); d._loaded = true; }
      if (d._loaded && ra >= 5) {
        d._img.style.display = '';
        d._img.setAttribute('x', cx - ra); d._img.setAttribute('y', ay - ra); d._img.setAttribute('width', 2 * ra); d._img.setAttribute('height', 2 * ra);
      } else d._img.style.display = 'none';
    } else if (d._ini) { d._ini.style.display = ''; d._ini.setAttribute('x', cx); d._ini.setAttribute('y', ay); d._ini.style.fontSize = ra * 0.9 + 'px'; }
    var showLab = d._lon || rr >= 34;   // progressive disclosure: any leaf big enough on screen gets its name
    if (showLab !== d._lshow) { d._lab.classList.toggle('on', showLab); d._lshow = showLab; }
    if (showLab) {
      var chord = rr * 1.45, f = Math.min(rr * 0.2, 15), ly = cy + rr * 0.74;
      var fit = chord / d._labw;
      if (fit < f) f = fit;
      if (f < 7.5) { d._lab.style.display = 'none'; }
      else {
        d._lab.style.display = ''; d._lab.setAttribute('x', cx); d._lab.setAttribute('y', ly); d._lab.style.fontSize = f + 'px';
      }
    }
  }

  // -------- state: labels, dimming, breadcrumb
  function labelState() {
    var fd = focus.depth;
    nodes.forEach(function (d) {
      var kind = d.data.kind, rel = d._anc.has(focus) || focus._anc && focus._anc.has(d) || focus === root;
      if (kind === 'leaf') {
        d._lon = fd >= 2 && d._anc.has(focus);
        d._lab.classList.toggle('on', d._lon); d._lshow = d._lon;
      } else {
        d._pon = d.parent === focus;
        d._pill.classList.toggle('on', d._pon);
      }
      d._g.classList.toggle('dim', !rel);
    });
  }
  function crumbs() {
    var path = focus.ancestors().reverse(), h = '';
    path.forEach(function (d, i) {
      if (i) h += '<span class="sep">&rsaquo;</span>';
      h += '<button data-i="' + i + '">' + MM.esc(i ? d.data.n : 'All') + '</button>';
    });
    crumbsEl.innerHTML = h;
    crumbsEl.querySelectorAll('button').forEach(function (b) { b.onclick = function () { zoom(path[+b.dataset.i]); }; });
  }

  function zoom(target, instant) {
    if (!ready) return;
    focus = target; labelState(); crumbs();
    var tv = [target.x, target.y, target.r * 2];
    if (hintEl) hintEl.classList.add('off');
    d3.select(svg).interrupt();
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (instant || reduce) { view = tv; apply(); return; }
    d3.select(svg).transition().duration(780).ease(d3.easeCubicInOut).tween('zoom', function () {
      var i = d3.interpolateZoom(view, tv);
      return function (t) { view = i(t); apply(); };
    });
  }
  function up() { if (focus !== root) zoom(focus.parent); }

  // -------- continuous zoom/pan (wheel, trackpad pinch, touch pinch, drag)
  var suppressClick = false, settleT = null;
  function scaleK(vw) { return Math.min(W, viewH()) * 0.9 / vw; }
  function clampView() {
    var maxW = root.r * 2 * 1.4, minW = 6;   // fully zoomed out .. a single leaf filling the screen
    view[2] = Math.max(minW, Math.min(maxW, view[2]));
    var lim = root.r;                         // keep the view centre over the map
    view[0] = Math.max(root.x - lim, Math.min(root.x + lim, view[0]));
    view[1] = Math.max(root.y - lim, Math.min(root.y + lim, view[1]));
  }
  // Zoom by factor f (>1 = in) keeping screen point (px,py) fixed.
  function zoomAt(px, py, f) {
    var HE = viewH(), k = scaleK(view[2]);
    var wx = view[0] + (px - W / 2) / k, wy = view[1] + (py - HE / 2) / k;
    view = [view[0], view[1], view[2] / f]; clampView();
    var k2 = scaleK(view[2]);
    view[0] = wx - (px - W / 2) / k2; view[1] = wy - (py - HE / 2) / k2; clampView();
    freeMoved();
  }
  function panBy(dx, dy) {
    var k = scaleK(view[2]); view = [view[0] - dx / k, view[1] - dy / k, view[2]]; clampView(); freeMoved();
  }
  // After free movement: re-derive the focus from what's on screen (deepest circle that
  // contains the view centre and roughly fills the view), so labels + breadcrumb follow.
  function freeMoved() {
    d3.select(svg).interrupt();
    if (hintEl) hintEl.classList.add('off');
    apply();
    clearTimeout(settleT);
    settleT = setTimeout(function () {
      var f = root, moved = true;
      while (moved && f.children) {
        moved = false;
        for (var i = 0; i < f.children.length; i++) {
          var c = f.children[i];
          if (!c.children) continue;
          var dx = view[0] - c.x, dy = view[1] - c.y;
          if (dx * dx + dy * dy <= c.r * c.r && c.r * 2 >= view[2] * 0.55) { f = c; moved = true; break; }
        }
      }
      if (f !== focus) { focus = f; labelState(); crumbs(); apply(); }
    }, 90);
  }
  // Trackpads send a stream of small, often fractional, often diagonal deltas; mouse wheels send
  // line-mode or large integer vertical-only notches. Once a trackpad is seen, keep treating
  // it as one for the burst of events that follows.
  var lastTrackpad = 0;
  function isMouseWheel(e) {
    var now = e.timeStamp || 0;
    if (e.deltaMode === 1 || e.deltaMode === 2) return true;            // Firefox mouse wheel
    if (e.deltaX !== 0) { lastTrackpad = now; return false; }            // sideways motion = trackpad
    if (now - lastTrackpad < 300) { lastTrackpad = now; return false; }  // inside a trackpad burst
    var wd = e.wheelDeltaY;                                               // Chrome/Safari: notches are multiples of 120
    if (wd && Math.abs(wd) % 120 === 0) return true;
    if (Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50) return true;
    lastTrackpad = now; return false;
  }
  function svgPt(e) { var r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  function initFreeZoom() {
    // Mouse wheel / two-finger scroll / Chrome+Firefox trackpad pinch (ctrl+wheel)
    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = svgPt(e), m = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      var dx = e.deltaX * m, dy = e.deltaY * m;
      if (e.ctrlKey) { zoomAt(p[0], p[1], Math.exp(-dy * 0.012)); return; }   // trackpad pinch (Chrome/Firefox/Edge)
      if (isMouseWheel(e)) { zoomAt(p[0], p[1], Math.exp(-dy * 0.0022)); return; }   // notched mouse wheel zooms
      panBy(-dx, -dy);   // two-finger trackpad scroll pans
    }, { passive: false });

    // Safari (macOS trackpad + iOS) pinch gestures: stop page zoom, zoom the map instead
    var gScale = 1, gPt = null;
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
      svg.addEventListener(t, function (e) {
        e.preventDefault();
        if (t === 'gesturestart') { gScale = 1; gPt = svgPt(e); return; }
        if (t === 'gesturechange' && gPt && !pointers.size) { zoomAt(gPt[0], gPt[1], e.scale / gScale); gScale = e.scale; }
      }, { passive: false });
    });
    document.addEventListener('gesturestart', function (e) { if (document.getElementById('view-map').classList.contains('on')) e.preventDefault(); }, { passive: false });

    // Pointer drag (pan) + two-finger pinch on touch screens
    var pointers = new Map(), last = null, dist0 = 0, travel = 0;
    svg.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button > 0) return;
      pointers.set(e.pointerId, svgPt(e)); travel = 0; last = null; dist0 = 0;
    });
    svg.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      var p = svgPt(e), prev = pointers.get(e.pointerId);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        var dx = p[0] - prev[0], dy = p[1] - prev[1]; travel += Math.abs(dx) + Math.abs(dy);
        if (travel > 6) { if (svg.setPointerCapture) try { svg.setPointerCapture(e.pointerId); } catch (_) {} panBy(dx, dy); }
      } else if (pointers.size === 2) {
        var ps = Array.from(pointers.values()), mx = (ps[0][0] + ps[1][0]) / 2, my = (ps[0][1] + ps[1][1]) / 2;
        var dist = Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]);
        travel += 20;
        if (dist0 && last) { panBy(mx - last[0], my - last[1]); zoomAt(mx, my, dist / dist0); }
        dist0 = dist; last = [mx, my];
      }
    });
    function end(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId); last = null; dist0 = 0;
      if (travel > 6) { suppressClick = true; setTimeout(function () { suppressClick = false; }, 0); }
    }
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  }

  // -------- interaction
  function stepToward(d) {
    var anc = d.ancestors().reverse(), fa = focus.ancestors(), lca = root;
    for (var i = 0; i < anc.length; i++) { if (fa.indexOf(anc[i]) > -1) lca = anc[i]; else break; }
    return anc[Math.min(anc.length - 1, lca.depth + 1)];
  }
  function onClick(e) {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; return; }
    var g = e.target.closest('g.node');
    if (!g) { MM.panel.hide(); up(); return; }
    var d = g.__d;
    if (d === focus) { e.stopPropagation(); return; }
    var t = stepToward(d);
    if (d.data.kind === 'leaf' && (t === d || d._rr >= 26)) { select(d, true); return; }
    zoom(t);
  }
  function onOver(e) {
    if (MM.isTouch()) return;
    var g = e.target.closest('g.leaf'); if (!g) return;
    var d = g.__d; if (d._rr < 5 || d === selected) return;
    select(d, false);
  }
  function select(d, pin) {
    if (!pin && MM.panel.locked && MM.panel.cur) return;   // a clicked artist stays put on hover
    selected = d;
    var n = MM.find(d.data.n); if (n) MM.panel.showArtist(n, 'map', { hover: !pin });
    if (MM.isNarrow()) zoom(focus); else apply();
  }
  function clearSel() { selected = null; if (ready) { if (MM.isNarrow()) zoom(focus); else apply(); } }

  function focusArtist(name) {
    var d = nodes.filter(function (x) { return x.data.kind === 'leaf' && MM.norm(x.data.n) === MM.norm(name); })[0];
    if (!d) return false;
    selected = d; var n = MM.find(d.data.n); if (n) MM.panel.showArtist(n, 'map');
    zoom(d.parent);
    return true;
  }
  function show() {
    document.getElementById('loading').style.display = 'none';
    init(); size(); apply();
  }
  return { clearSel: clearSel, show: show, focusArtist: focusArtist, resetView: function () { if (ready && focus !== root) zoom(root); }, resize: function () { if (ready) { size(); apply(); } }, has: function (n) { return !!MM.artists.get(n); } };
})();
