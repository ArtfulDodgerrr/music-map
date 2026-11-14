/* Shared data, helpers, panel and typeahead. Global namespace: MM */
/* Modified from original: Apple Music replaced with Spotify links. */
var MM = (function () {
  'use strict';
  var MM = {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  MM.$ = $;
  MM.fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
  MM.norm = function (s) {
    return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  };
  MM.esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  MM.isTouch = function () { return window.matchMedia('(hover: none)').matches; };
  MM.isNarrow = function () { return window.innerWidth <= 720; };

  // colours
  function hex2rgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
  MM.tint = function (hex, t) {
    var c = hex2rgb(hex);
    return 'rgb(' + c.map(function (v) { return Math.round(v + (255 - v) * t); }).join(',') + ')';
  };
  MM.light = function () {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'light';
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  };
  // sub-group tint as in the static image; darkened in light theme for contrast
  MM.subColor = function (col, si) {
    var t = 0.18 * si + 0.15;
    if (MM.light()) {
      var c = hex2rgb(col), k = 0.78 - 0.04 * si;
      return 'rgb(' + c.map(function (v) { return Math.round(v * k); }).join(',') + ')';
    }
    return MM.tint(col, t);
  };
  MM.baseColor = function (col) {
    if (!MM.light()) return col;
    var c = hex2rgb(col);
    return 'rgb(' + c.map(function (v) { return Math.round(v * 0.8); }).join(',') + ')';
  };

  // ---------- data
  MM.nodes = []; MM.byNorm = new Map(); MM.artists = new Map(); MM.out = []; MM.inn = []; MM.recs = {}; MM.fams = [];
  MM.load = function () {
    return Promise.all([fetch('data/map.json').then(chk), fetch('data/graph.json').then(chk)]).then(function (r) {
      var map = r[0], g = r[1];
      MM.fams = map.fams;
      map.fams.forEach(function (f) {
        f.c.forEach(function (c) {
          c.s.forEach(function (s, si) {
            s.a.forEach(function (a) {
              a.fam = f.n; a.cl = c.n; a.sg = s.n; a.col = c.col; a.si = s.si != null ? s.si : si; MM.artists.set(a.n, a);
            });
          });
        });
      });
      MM.recs = g.r;
      g.n.forEach(function (n, i) {
        var o = { i: i, name: n[0], pic: n[1], fans: n[2], plays: n[3], rec: !!(n[4] & 1), inMap: !!(n[4] & 2), played: !!(n[4] & 4), info: MM.artists.get(n[0]) || null, pick: g.r[n[0]] || null };
        if (o.info) o.info.p = n[3];
        MM.nodes.push(o); MM.byNorm.set(MM.norm(n[0]), o);
        MM.out.push([]); MM.inn.push([]);
      });
      g.e.forEach(function (e) {
        var s = e[3] || 0;
        MM.out[e[0]].push([e[1], e[2], s]); MM.inn[e[1]].push([e[0], e[2], s]);
      });
      return MM;
    });
  };
  function chk(r) { if (!r.ok) throw new Error(r.url + ' ' + r.status); return r.json(); }
  MM.find = function (name) { return name ? MM.byNorm.get(MM.norm(name)) || null : null; };
  MM.imgUrl = function (n) {
    if (n.info && n.info.i) return 'art/' + n.info.i;
    if (n.pic) return 'https://cdn-images.dzcdn.net/images/artist/' + n.pic + '/250x250-000000-80-0-0.jpg';
    return null;
  };
  MM.spotifySearch = function (name) { return 'https://open.spotify.com/search/' + encodeURIComponent(name); };

  // ---------- panel
  var panel = $('#panel');
  var P = MM.panel = { cur: null, onClose: null };
  P.locked = false;   // set by a click: hovering other artists won't replace the card
  P.hide = function () { panel.hidden = true; P.cur = null; P.locked = false; if (P.onClose) P.onClose(); };
  P.showArtist = function (n, ctx, opts) {
    opts = opts || {};
    if (!n) return;
    if (opts.hover && P.locked && !panel.hidden) return;
    if (opts.soft) P.locked = false;          // default card (e.g. Explore centre): shown, not pinned
    else if (!opts.hover) P.locked = true;     // explicit click/tap pins the card
    P.cur = n; panel.hidden = false; panel.dataset.ctx = ctx;
    var url = MM.imgUrl(n), info = n.info, pick = n.pick, h = '';
    var col = info ? MM.baseColor(info.col) : null;
    h += '<button class="x" aria-label="Close" data-a="close">&times;</button>';
    h += url ? '<img class="cover" src="' + MM.esc(url) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;cover ph&quot;>♪</div>\'">' : '<div class="cover ph">♪</div>';
    h += '<div class="body"><h2>' + MM.esc(n.name) + (n.rec ? ' <span style="color:var(--gold)">★</span>' : '') + '</h2>';
    if (info) h += '<div class="crumb"><i style="background:' + col + '"></i>' + MM.esc(info.cl) + ' &rsaquo; ' + MM.esc(info.sg) + '</div>';
    else if (n.rec) h += '<div class="crumb">Recommended pick' + (pick && pick.tier ? ' &middot; ' + MM.esc(pick.tier.toLowerCase()) : '') + '</div>';
    else h += '<div class="crumb">' + (n.played ? 'In your library (not on the map)' : 'New to you') + '</div>';
    h += '<dl>';
    var plays = info ? info.p : n.plays;
    if (plays > 0) h += '<dt>Tracks</dt><dd>' + MM.fmt(plays) + ' tracks in your playlists</dd>';
    if (info && info.al) h += '<dt>Top album</dt><dd>' + MM.esc(info.al) + '</dd>';
    if (pick) h += '<dt>Pick</dt><dd>' + MM.esc(pick.rel) + (pick.yr ? ' (' + MM.esc(pick.yr) + ')' : '') + '</dd>';
    h += '</dl></div><div class="rest">';
    if (pick && pick.why) h += '<div class="why"><b>★ Why:</b> ' + MM.esc(pick.why) + '</div>';
    h += '<div class="btns">';
    var sp = (info && info.sp) || null;
    h += '<a class="btn" target="_blank" rel="noopener" href="' + MM.esc(sp || MM.spotifySearch(n.name)) + '">Spotify</a>';
    h += '</div>';
    if (ctx === 'map') h += '<button class="btn pri" data-a="explore">Explore similar &rarr;</button>';
    else {
      if (opts.canCentre) h += '<button class="btn pri" data-a="centre">Centre on ' + MM.esc(n.name) + ' &rarr;</button>';
      if (info && ctx === 'explore') h += '<div class="btns"><a class="btn" href="#map/' + encodeURIComponent(n.name) + '">Show on map</a></div>';
    }
    h += '</div>';
    panel.innerHTML = h;
    panel.scrollTop = 0;
  };
  P.showHtml = function (html) { panel.hidden = false; panel.dataset.ctx = 'blend'; P.cur = null; panel.innerHTML = '<button class="x" aria-label="Close" data-a="close">&times;</button><div class="body" style="padding-top:16px">' + html + '</div>'; };
  panel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    var a = b.dataset.a;
    if (a === 'close') { P.hide(); }
    else if (a === 'explore' && P.cur) MM.go(['explore', P.cur.name]);
    else if (a === 'centre' && P.cur) MM.go(['explore', P.cur.name]);
  });

  // ---------- typeahead
  MM.typeahead = function (input, list, pick, opts) {
    opts = opts || {};
    var items = [], sel = -1;
    function score(n, q) {
      var k = MM.norm(n.name); if (!k) return -1;
      var s = -1;
      if (k === q) s = 100; else if (k.indexOf(q) === 0) s = 80;
      else {
        var words = n.name.toLowerCase().split(/[\s\-_.&,()/]+/);
        if (words.some(function (w) { return MM.norm(w).indexOf(q) === 0; })) s = 60;
        else if (k.indexOf(q) > -1) s = 40;
      }
      if (s < 0) return s;
      return s + (n.info ? 12 : 0) + (n.rec ? 6 : 0) + Math.min(8, Math.log10((n.plays || 0) + 1) * 2) + Math.min(3, Math.log10((n.fans || 0) + 1) * .5);
    }
    function render() {
      var q = MM.norm(input.value);
      if (!q) { close(); return; }
      var res = [];
      for (var i = 0; i < MM.nodes.length; i++) {
        var n = MM.nodes[i];
        if (opts.filter && !opts.filter(n)) continue;
        var s = score(n, q); if (s > 0) res.push([s, n]);
      }
      res.sort(function (a, b) { return b[0] - a[0]; });
      items = res.slice(0, 8).map(function (r) { return r[1]; });
      sel = items.length ? 0 : -1;
      list.innerHTML = items.length ? items.map(function (n, i) {
        var tag = n.rec ? '★ pick' : n.info ? 'on map' : n.played ? 'played' : '';
        var sw = n.info ? '<span class="sw" style="background:' + MM.baseColor(n.info.col) + '"></span>' : '<span class="sw"></span>';
        return '<li role="option" data-i="' + i + '" class="' + (i === sel ? 'sel' : '') + '">' + sw + '<span class="nm">' + MM.esc(n.name) + '</span><span class="tag">' + tag + '</span></li>';
      }).join('') : '<li style="color:var(--dim)">No match</li>';
      list.classList.add('open');
    }
    function close() { list.classList.remove('open'); items = []; sel = -1; }
    function choose(i) { var n = items[i]; if (!n) return; input.value = ''; close(); input.blur(); pick(n); }
    function mark() { Array.prototype.forEach.call(list.children, function (li, i) { li.classList.toggle('sel', i === sel); }); }
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); mark(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
      else if (e.key === 'Enter') { choose(Math.max(0, sel)); e.preventDefault(); }
      else if (e.key === 'Escape') { input.value = ''; close(); input.blur(); }
    });
    list.addEventListener('pointerdown', function (e) { var li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); choose(+li.dataset.i); } });
    document.addEventListener('pointerdown', function (e) { if (!list.contains(e.target) && e.target !== input) close(); });
  };

  // ---------- theme
  MM.initTheme = function () {
    try { var t = localStorage.getItem('mm-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) { }
    var meta = document.querySelector('meta[name=theme-color]');
    function sync() { if (meta) meta.setAttribute('content', MM.light() ? '#f5f4f0' : '#0c0e13'); }
    sync();
    $('#themebtn').addEventListener('click', function () {
      var t = MM.light() ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('mm-theme', t); } catch (e) { }
      sync(); if (MM.onTheme) MM.onTheme();
    });
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () { sync(); if (MM.onTheme) MM.onTheme(); });
  };
  return MM;
})();
