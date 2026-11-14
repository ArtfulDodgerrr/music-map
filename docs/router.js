/* Hash router: #map, #map/<artist>, #explore, #explore/<artist>, #blend/<a>/<b> */
(function () {
  'use strict';
  MM.go = function (parts) { location.hash = '#' + parts.map(encodeURIComponent).join('/'); };
  function parse() {
    var h = location.hash.replace(/^#\/?/, '');
    if (!h) return { v: 'map' };
    var p = h.split('/').map(function (s) { try { return decodeURIComponent(s); } catch (e) { return s; } });
    return { v: p[0], a: p[1] || null, b: p[2] || null };
  }
  var loaded = false, lastEx = null;
  try { lastEx = sessionStorage.getItem('mm.lastEx'); } catch (e) {}
  // No artist in the link: start somewhere different each visit, from the most-played artists.
  function randomStart() {
    var pool = MM.nodes.filter(function (n) { return !!n.info; })
      .sort(function (a, b) { return (b.info.p || 0) - (a.info.p || 0); }).slice(0, 50);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].name : 'Future';
  }
  function route() {
    if (!loaded) return;
    var r = parse(), isEx = r.v === 'explore' || r.v === 'blend';
    document.getElementById('view-map').classList.toggle('on', !isEx);
    document.getElementById('view-explore').classList.toggle('on', isEx);
    document.getElementById('tab-map').classList.toggle('on', !isEx);
    document.getElementById('tab-explore').classList.toggle('on', isEx);
    MM.panel.hide();
    if (isEx) {
      var a = r.a || lastEx || randomStart();
      lastEx = a; try { sessionStorage.setItem('mm.lastEx', a); } catch (e) {} Explore.show({ a: a, b: r.v === 'blend' ? r.b : null });
      document.getElementById('tab-explore').setAttribute('href', '#explore/' + encodeURIComponent(a));
      document.title = 'Explore ' + a + ' · Music Map';
    } else {
      MapView.show();
      if (r.a) {
        if (!MapView.focusArtist(r.a)) { var n = MM.find(r.a); if (n) { MM.go(['explore', n.name]); return; } }
        document.title = r.a + ' · Music Map';
      } else { MapView.resetView(); document.title = 'Music Map'; }
    }
  }
  window.addEventListener('hashchange', route);

  MM.panel.onClose = function () { MapView.clearSel(); Explore.clearSel(); };
  MM.initTheme();
  MM.load().then(function () {
    loaded = true;
    // global search: artists on the map zoom in the Map view; everything else opens in Explore
    MM.typeahead(document.getElementById('q'), document.getElementById('qres'), function (n) {
      var r = parse(), inEx = r.v === 'explore' || r.v === 'blend';
      if (inEx || !n.info) MM.go(['explore', n.name]);
      else if (r.a === n.name) MapView.focusArtist(n.name);
      else MM.go(['map', n.name]);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && e.target.tagName !== 'INPUT') { e.preventDefault(); document.getElementById('q').focus(); }
    });
    route();
  }).catch(function (e) {
    var l = document.getElementById('loading'); l.textContent = 'Could not load data: ' + e.message; l.classList.add('err');
  });
})();
