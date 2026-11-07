/* Airsoft Conflict — editor delle cartine (da computer).
   Carichi l'immagine o il PDF del campo, la georeferenzi con punti di controllo (UTM WGS84 o lat/lon),
   crei le aree (basi, punti chiave, punti base, torri) e le colleghi tra loro. */
(function () {
  'use strict';
  var U = window.AC_UTM;
  var TIPI = [['mob', '⚑ Base principale (MOB)'], ['chiave', '★ Punto chiave'], ['base', '● Punto base'], ['torre', '📡 Torre radio']];
  var FAZ = [['blu', 'Fazione blu'], ['rossa', 'Fazione rossa']], COLF = { blu: '#2f7fd6', rossa: '#d23a2c' };
  function conFazione(t) { return t === 'mob'; }
  function simbolo(t) { return t === 'mob' ? '⚑' : t === 'chiave' ? '★' : t === 'torre' ? '📡' : '●'; }
  var LATO = 3000;   // lato massimo dell'immagine salvata (pixel)

  function el(tag, cls, testo) { var e = document.createElement(tag); if (cls) e.className = cls; if (testo != null) e.textContent = testo; return e; }
  function btn(testo, cls, fn) { var b = el('button', 'btn' + (cls ? ' ' + cls : ''), testo); b.type = 'button'; if (fn) b.onclick = fn; return b; }
  function campoF(etichetta, input) { var l = el('label', 'campo'); l.appendChild(el('span', null, etichetta)); l.appendChild(input); return l; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function idNuovo() { return Math.random().toString(36).slice(2, 8); }
  var BANDE = 'CDEFGHJKLMNPQRSTUVWXX';
  function utmTesto(lat, lon) {
    if (lat == null) return '';
    var u = U.daLatLon(lat, lon), b = BANDE[Math.max(0, Math.min(20, Math.floor((lat + 80) / 8)))];
    return u.zona + b + ' ' + Math.round(u.E) + ' ' + Math.round(u.N);
  }
  // "32T 375063 4983251", "32 375063 4983251", "375063 4983251" (zona predefinita) oppure "44.9917, 7.4150"
  function leggiCoordinate(t, zonaPred) {
    t = String(t || '').trim();
    var num = t.match(/-?\d+(?:[.,]\d+)?/g); if (!num) return null;
    num = num.map(function (n) { return parseFloat(n.replace(',', '.')); });
    if (num.length === 2 && Math.abs(num[0]) <= 90 && Math.abs(num[1]) <= 180) return { lat: num[0], lon: num[1] };
    var m = t.match(/^\s*(\d{1,2})\s*([C-Xc-x])?\s+(\d{5,7}(?:[.,]\d+)?)\s*[,;\s]\s*(\d{6,8}(?:[.,]\d+)?)/);
    var zona, banda, E, N;
    if (m) { zona = +m[1]; banda = m[2]; E = parseFloat(m[3].replace(',', '.')); N = parseFloat(m[4].replace(',', '.')); }
    else if (num.length === 2 && num[0] > 100000) { zona = zonaPred || 32; E = num[0]; N = num[1]; }
    else return null;
    if (zona < 1 || zona > 60) return null;
    var nord = banda ? banda.toUpperCase() >= 'N' : true;
    var ll = U.aLatLon(zona, nord, E, N);
    return isFinite(ll.lat) && isFinite(ll.lon) ? { lat: ll.lat, lon: ll.lon, zona: zona } : null;
  }

  // immagine o PDF -> dataURL JPEG ridotto
  function caricaPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = 'vendor/pdfjs/pdf.min.js';
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = function () { ko(new Error('Lettore PDF non disponibile')); };
      document.head.appendChild(s);
    });
  }
  function daCanvas(cv) {
    var q = .85, d = cv.toDataURL('image/jpeg', q);
    while (d.length > 4500000 && q > .5) { q -= .08; d = cv.toDataURL('image/jpeg', q); }
    return { d: d, w: cv.width, h: cv.height };
  }
  function leggiFile(file) {
    if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
      return Promise.all([caricaPdfJs(), file.arrayBuffer()]).then(function (r) {
        return r[0].getDocument({ data: r[1] }).promise;
      }).then(function (pdf) {
        var n = 1;
        if (pdf.numPages > 1) { n = parseInt(prompt('Il PDF ha ' + pdf.numPages + ' pagine: quale contiene la cartina?', '1'), 10) || 1; n = Math.max(1, Math.min(pdf.numPages, n)); }
        return pdf.getPage(n);
      }).then(function (pg) {
        var v = pg.getViewport({ scale: 1 }), s = LATO / Math.max(v.width, v.height), vp = pg.getViewport({ scale: s });
        var cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        return pg.render({ canvasContext: cx, viewport: vp }).promise.then(function () { return daCanvas(cv); });
      });
    }
    return new Promise(function (ok, ko) {
      var r = new FileReader(); r.onerror = ko;
      r.onload = function () {
        var i = new Image(); i.onerror = function () { ko(new Error('Immagine non leggibile')); };
        i.onload = function () {
          var s = Math.min(1, LATO / Math.max(i.width, i.height)), cv = document.createElement('canvas');
          cv.width = Math.round(i.width * s); cv.height = Math.round(i.height * s);
          var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(i, 0, 0, cv.width, cv.height);
          ok(daCanvas(cv));
        };
        i.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  // ---------- cartografia dal web, già georeferenziata: uno sfondo e, sopra, i livelli che vuoi
  var TAIMS = 'https://geomap.reteunitaria.piemonte.it/ws/taims/rp-01/taimswms/';
  var REGIONE = '© Regione Piemonte – BDTRE';
  var SFONDI = [
    { id: 'otm', nome: 'OpenTopoMap (sentieri, curve di livello, edifici)', tipo: 'xyz', url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png', maxz: 17, crediti: '© OpenStreetMap contributors, SRTM · © OpenTopoMap (CC-BY-SA)' },
    { id: 'colori', nome: 'Regione Piemonte · BDTRE a colori', tipo: 'wms', caps: 'https://geomap.reteunitaria.piemonte.it/WEBCAT/CAPABILITIES/wms_regp_sfondo_bdtre.xml', layers: ['regp_sfondo_bdtre'], crediti: REGIONE },
    { id: 'bn', nome: 'Regione Piemonte · BDTRE in bianco e nero', tipo: 'wms', caps: 'https://geomap.reteunitaria.piemonte.it/WEBCAT/CAPABILITIES/wms_regp_sfondo_bdtre.xml', layers: ['regp_sfondo_bdtre_bn'], crediti: REGIONE },
    { id: 'bianco', nome: 'Nessuno sfondo (solo i livelli scelti)', tipo: 'vuoto' }
  ];
  // foto satellitare da sovrapporre in trasparenza (piastrelle in Web Mercator)
  var SATELLITE = { id: 'sat', nome: 'Foto satellitare', tipo: 'xyz', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxz: 18, crediti: 'Foto: Esri, Maxar, Earthstar Geographics' };
  // servizi da cui scegliere i livelli da sovrapporre (letti dal servizio stesso)
  var SERVIZI = [
    { id: 'oro', nome: 'Orografia (curve di livello, forme del terreno)', caps: TAIMS + 'bdtre_oro?service=WMS&request=GetCapabilities', auto: /altimetri|curv|forme/i },
    { id: 'viab', nome: 'Viabilità (strade, piste, sentieri)', caps: TAIMS + 'bdtre_viab?service=WMS&request=GetCapabilities', auto: /strad|sentier|percors|mulatt|pista|viabil/i },
    { id: 'topo', nome: 'Topografia (edifici, manufatti)', caps: TAIMS + 'bdtre_topo?service=WMS&request=GetCapabilities', auto: /edific|costru|manufat/i },
    { id: 'idro', nome: 'Idrografia (torrenti, canali)', caps: TAIMS + 'bdtre_idro?service=WMS&request=GetCapabilities', auto: /corsi|acqua|idro|canal|torrent/i }
  ];
  var CRS_BUONI = ['EPSG:32632', 'EPSG:25832', 'EPSG:3857', 'EPSG:900913', 'EPSG:4326'];
  var cacheCaps = {};
  function caps(url) { if (!cacheCaps[url]) cacheCaps[url] = leggiCaps(url).catch(function (e) { delete cacheCaps[url]; throw e; }); return cacheCaps[url]; }
  function leggiCaps(url) {
    return fetch(url, { mode: 'cors' }).then(function (r) { if (!r.ok) throw new Error('il servizio risponde ' + r.status); return r.text(); }, function () {
      throw new Error('CORS');
    }).then(function (t) {
      var x = new DOMParser().parseFromString(t, 'text/xml'), root = x.documentElement;
      if (!root || /exception/i.test(root.nodeName)) throw new Error('risposta del servizio non valida');
      var ver = root.getAttribute('version') || '1.3.0';
      var gm = x.getElementsByTagName('GetMap')[0], href = '';
      if (gm) { var or = gm.getElementsByTagName('OnlineResource'); for (var i = 0; i < or.length; i++) { href = or[i].getAttribute('xlink:href') || or[i].getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''; if (href) break; } }
      var formati = gm ? Array.prototype.map.call(gm.getElementsByTagName('Format'), function (f) { return f.textContent.trim(); }) : [];
      var layers = [];
      Array.prototype.forEach.call(x.getElementsByTagName('Layer'), function (L) {
        var n = null, tt = null;
        for (var k = 0; k < L.children.length; k++) { if (L.children[k].nodeName === 'Name') n = L.children[k].textContent.trim(); if (L.children[k].nodeName === 'Title') tt = L.children[k].textContent.trim(); }
        if (n) layers.push({ nome: n, titolo: tt || n });
      });
      var crs = Array.prototype.map.call(x.getElementsByTagName(ver >= '1.3' ? 'CRS' : 'SRS'), function (e) { return e.textContent.trim().toUpperCase(); });
      return { ver: ver, href: href || url.split('?')[0], formati: formati, layers: layers, crs: crs };
    });
  }  function verso(crs, lat, lon) {
    if (crs === 'EPSG:32632' || crs === 'EPSG:25832') { var u = U.daLatLon(lat, lon, 32); return [u.E, u.N]; }
    if (crs === 'EPSG:3857' || crs === 'EPSG:900913') { var R = 6378137; return [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))]; }
    return [lon, lat];
  }  function daCrs(crs, X, Y) {
    if (crs === 'EPSG:32632' || crs === 'EPSG:25832') return U.aLatLon(32, true, X, Y);
    if (crs === 'EPSG:3857' || crs === 'EPSG:900913') { var R = 6378137; return { lon: X / R * 180 / Math.PI, lat: (2 * Math.atan(Math.exp(Y / R)) - Math.PI / 2) * 180 / Math.PI }; }
    return { lon: X, lat: Y };
  }  function caricaImg(url) {
    return new Promise(function (ok, ko) { var i = new Image(); i.crossOrigin = 'anonymous'; i.onload = function () { ok(i); }; i.onerror = function () { ko(new Error('CORS')); }; i.src = url; });
  }  function urlGetMap(cp, crs, layers, bb, w, h, trasp) {
    var v13 = cp.ver >= '1.3', b = (v13 && crs === 'EPSG:4326') ? [bb[1], bb[0], bb[3], bb[2]] : bb;
    var fmt = cp.formati.indexOf('image/png') >= 0 || !cp.formati.length ? 'image/png' : cp.formati[0];
    var p = { SERVICE: 'WMS', VERSION: cp.ver, REQUEST: 'GetMap', LAYERS: layers.join(','), STYLES: '', FORMAT: fmt, TRANSPARENT: trasp ? 'TRUE' : 'FALSE', WIDTH: w, HEIGHT: h, BBOX: b.join(',') };
    p[v13 ? 'CRS' : 'SRS'] = crs;
    var hh = cp.href, base = /[?&]$/.test(hh) ? hh : hh + (hh.indexOf('?') >= 0 ? '&' : '?');
    return base + Object.keys(p).map(function (k) { return k + '=' + encodeURIComponent(p[k]); }).join('&');
  }
  function mercY(lat) { return 6378137 * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }

  /* Prepara il piano: proiezione comune, riquadro, dimensioni e la lista dei livelli da disegnare.
     scelta: { sfondo: id, livelli: [{ caps, nome }], wmsAltro: { caps, layer } }  zona: { lat, lon, larghezza, altezza } */
  function piano(scelta, zona, lato) {
    var sf = SFONDI.filter(function (x) { return x.id === scelta.sfondo; })[0] || SFONDI[0];
    var gruppi = {};   // livelli sovrapposti, raggruppati per servizio
    (scelta.livelli || []).forEach(function (l) { (gruppi[l.caps] = gruppi[l.caps] || []).push(l.nome); });
    if (scelta.wmsAltro && scelta.wmsAltro.caps) (gruppi[scelta.wmsAltro.caps] = gruppi[scelta.wmsAltro.caps] || []).push(scelta.wmsAltro.layer || '');
    var urls = Object.keys(gruppi); if (sf.tipo === 'wms') urls.unshift(sf.caps);
    return Promise.all(urls.map(function (u) { return caps(u).then(function (c) { return { url: u, c: c }; }); })).then(function (lista) {
      var cp = {}; lista.forEach(function (x) { cp[x.url] = x.c; });
      // con OpenTopoMap si lavora in Web Mercator (le sue piastrelle), altrimenti in UTM 32N se il servizio lo offre
      var comuni = CRS_BUONI.filter(function (k) { return lista.every(function (x) { return x.c.crs.indexOf(k) >= 0 || (k === 'EPSG:25832' && x.c.crs.indexOf('EPSG:32632') >= 0); }); });
      var sat = (scelta.satellite || 0) > 0;
      var crs = sf.tipo === 'xyz' || sat ? 'EPSG:3857' : (comuni[0] || 'EPSG:3857');
      if (lista.some(function (x) { return x.c.crs.indexOf(crs) < 0 && !(crs === 'EPSG:3857' && x.c.crs.indexOf('EPSG:900913') >= 0); }))
        throw new Error('i livelli scelti non hanno una proiezione in comune con lo sfondo');
      var u = U.daLatLon(zona.lat, zona.lon, 32), hw = zona.larghezza / 2, hh = zona.altezza / 2;
      var ang = [[u.E - hw, u.N + hh], [u.E + hw, u.N + hh], [u.E + hw, u.N - hh], [u.E - hw, u.N - hh]].map(function (q) { var ll = U.aLatLon(32, true, q[0], q[1]); return verso(crs, ll.lat, ll.lon); });
      var bb = [Math.min.apply(null, ang.map(function (q) { return q[0]; })), Math.min.apply(null, ang.map(function (q) { return q[1]; })),
        Math.max.apply(null, ang.map(function (q) { return q[0]; })), Math.max.apply(null, ang.map(function (q) { return q[1]; }))];
      var asp = (bb[2] - bb[0]) / (bb[3] - bb[1]), W, H;
      if (asp >= 1) { W = Math.round(lato); H = Math.round(lato / asp); } else { H = Math.round(lato); W = Math.round(lato * asp); }
      var strati = [];
      if (sf.tipo === 'xyz') strati.push({ tipo: 'xyz', sf: sf });
      if (sat) strati.push({ tipo: 'xyz', sf: SATELLITE, alpha: Math.min(1, scelta.satellite / 100) });
      if (sf.tipo === 'wms') strati.push({ tipo: 'wms', cp: cp[sf.caps], layers: sf.layers, trasp: false });
      Object.keys(gruppi).forEach(function (k) {
        var nomi = gruppi[k].filter(Boolean); if (!nomi.length && cp[k].layers[0]) nomi = [cp[k].layers[0].nome];
        strati.push({ tipo: 'wms', cp: cp[k], layers: nomi, trasp: true });
      });
      var crediti = [sf.crediti].concat(sat ? [SATELLITE.crediti] : []).concat(Object.keys(gruppi).length ? [REGIONE] : []).filter(Boolean)
        .filter(function (x, i, a) { return a.indexOf(x) === i; }).join(' · ');
      return { crs: crs, bb: bb, W: W, H: H, strati: strati, crediti: crediti };
    });
  }
  // piastrelle XYZ (OpenTopoMap) che coprono il riquadro in Web Mercator, con la posizione in pixel
  function piastrelle(sf, bb, W) {
    var R = 6378137, giro = 2 * Math.PI * R, mpp = (bb[2] - bb[0]) / W;
    var z = Math.min(sf.maxz, Math.max(1, Math.round(Math.log2(giro / 256 / mpp))));
    var n = Math.pow(2, z), dim = giro / n;
    function tx(X) { return (X + giro / 2) / dim; } function ty(Y) { return (giro / 2 - Y) / dim; }
    var out = [];
    for (var x = Math.floor(tx(bb[0])); x <= Math.floor(tx(bb[2])); x++) for (var y = Math.floor(ty(bb[3])); y <= Math.floor(ty(bb[1])); y++) {
      var X0 = x * dim - giro / 2, Y0 = giro / 2 - y * dim;
      out.push({ url: sf.url.replace('{z}', z).replace('{x}', x).replace('{y}', y), x: (X0 - bb[0]) / mpp, y: (bb[3] - Y0) / mpp, s: dim / mpp });
    }
    return out;
  }
  // anteprima veloce: immagini sovrapposte (non serve il permesso del server per salvarle)
  function anteprima(box, p) {
    box.innerHTML = '';
    var bw = box.clientWidth || 800, bh = box.clientHeight || 600, sc0 = Math.min(bw / p.W, bh / p.H);
    var fr = el('div', 'ed-ante-fr'); fr.style.width = Math.round(p.W * sc0) + 'px'; fr.style.height = Math.round(p.H * sc0) + 'px'; box.appendChild(fr);
    var w = Math.min(1600, Math.round(p.W * sc0 * (window.devicePixelRatio || 1))), h = Math.round(w * p.H / p.W);
    p.strati.forEach(function (s) {
      if (s.tipo === 'xyz') {
        var lay = el('div', 'ed-ante-l'); fr.appendChild(lay); if (s.alpha != null) lay.style.opacity = s.alpha;
        piastrelle(s.sf, p.bb, w).forEach(function (t) { var i = new Image(); i.src = t.url; i.style.left = (t.x / w * 100) + '%'; i.style.top = (t.y / h * 100) + '%'; i.style.width = (t.s / w * 100) + '%'; lay.appendChild(i); });
      } else { var i = new Image(); i.className = 'ed-ante-i'; i.src = urlGetMap(s.cp, p.crs, s.layers, p.bb, w, h, s.trasp); fr.appendChild(i); }
    });
    var cr = el('span', 'ed-ante-cr', p.crediti); fr.appendChild(cr);
  }
  // cartina finale su canvas, pezzo per pezzo
  function componi(p, avanzamento) {
    var cv = document.createElement('canvas'); cv.width = p.W; cv.height = p.H;
    var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, p.W, p.H);
    var T = 1000, lavori = [];
    p.strati.forEach(function (s, si) {
      if (s.tipo === 'xyz') piastrelle(s.sf, p.bb, p.W).forEach(function (t) { lavori.push({ si: si, url: t.url, x: t.x, y: t.y, w: t.s, h: t.s, alpha: s.alpha }); });
      else for (var py = 0; py < p.H; py += T) for (var px = 0; px < p.W; px += T) {
        var w = Math.min(T, p.W - px), h = Math.min(T, p.H - py), bb = p.bb;
        var b = [bb[0] + (bb[2] - bb[0]) * px / p.W, bb[3] - (bb[3] - bb[1]) * (py + h) / p.H, bb[0] + (bb[2] - bb[0]) * (px + w) / p.W, bb[3] - (bb[3] - bb[1]) * py / p.H];
        lavori.push({ si: si, url: urlGetMap(s.cp, p.crs, s.layers, b, w, h, s.trasp), x: px, y: py, w: w, h: h });
      }
    });
    var fatti = 0, imgs = [];
    // si scaricano a gruppi di 6 per non sovraccaricare i server
    function lotto(i) {
      if (i >= lavori.length) return Promise.resolve();
      return Promise.all(lavori.slice(i, i + 6).map(function (l, k) {
        return caricaImg(l.url).then(function (im) { imgs[i + k] = im; fatti++; if (avanzamento) avanzamento(fatti, lavori.length); });
      })).then(function () { return lotto(i + 6); });
    }
    return lotto(0).then(function () {
      // nell'ordine: prima lo sfondo, poi la foto satellitare in trasparenza, poi i livelli
      lavori.forEach(function (l, i) { cx.globalAlpha = l.alpha != null ? l.alpha : 1; cx.drawImage(imgs[i], l.x, l.y, l.w, l.h); });
      cx.globalAlpha = 1;
      var W = p.W, H = p.H, cr = p.crediti;
      cx.font = '600 ' + Math.max(11, Math.round(W / 110)) + 'px sans-serif'; var tw = cx.measureText(cr).width, pad = W / 220, fh = Math.max(11, W / 110);
      cx.fillStyle = 'rgba(255,255,255,.85)'; cx.fillRect(W - tw - pad * 3, H - fh - pad * 2.4, tw + pad * 3, fh + pad * 2.4);
      cx.fillStyle = '#222'; cx.textAlign = 'right'; cx.textBaseline = 'bottom'; cx.fillText(cr, W - pad * 1.5, H - pad);
      var r; try { r = daCanvas(cv); } catch (e) { throw new Error('CORS'); }
      r.angoli = [[0, 0, p.bb[0], p.bb[3]], [W, 0, p.bb[2], p.bb[3]], [W, H, p.bb[2], p.bb[1]], [0, H, p.bb[0], p.bb[1]]].map(function (a) { var ll = daCrs(p.crs, a[2], a[3]); return { x: a[0], y: a[1], lat: ll.lat, lon: ll.lon }; });
      return r;
    });
  }

  // ---------- file GPS: punti (GPX wpt, WPT OziExplorer, KML Placemark) e tracce (GPX trk/rte, KML LineString)
  function leggiGps(file) {
    return file.text().then(function (t) {
      var punti = [], tracce = [], nome = file.name.replace(/\.[^.]+$/, '');
      var testa = t.slice(0, 400).toLowerCase();
      if (testa.indexOf('<gpx') >= 0 || testa.indexOf('<kml') >= 0 || /\.(gpx|kml)$/i.test(file.name)) {
        var x = new DOMParser().parseFromString(t, 'text/xml');
        if (x.getElementsByTagName('parsererror').length) throw new Error('file non leggibile');
        var figlio = function (e, tag) { var f = e.getElementsByTagName(tag)[0]; return f ? f.textContent.trim() : ''; };
        Array.prototype.forEach.call(x.getElementsByTagName('wpt'), function (w) {
          punti.push({ nome: figlio(w, 'name') || 'Punto', lat: +w.getAttribute('lat'), lon: +w.getAttribute('lon') });
        });
        [['trk', 'trkpt'], ['rte', 'rtept']].forEach(function (tt) {
          Array.prototype.forEach.call(x.getElementsByTagName(tt[0]), function (tr, i) {
            var pts = Array.prototype.map.call(tr.getElementsByTagName(tt[1]), function (p) { return [+p.getAttribute('lat'), +p.getAttribute('lon')]; });
            if (pts.length > 1) tracce.push({ nome: figlio(tr, 'name') || (nome + (i ? ' ' + (i + 1) : '')), pts: pts });
          });
        });
        Array.prototype.forEach.call(x.getElementsByTagName('Placemark'), function (pm) {
          var n = figlio(pm, 'name');
          var pt = pm.getElementsByTagName('Point')[0], ls = pm.getElementsByTagName('LineString')[0];
          function coo(e) { return figlio(e, 'coordinates').split(/\s+/).filter(Boolean).map(function (q) { var v = q.split(','); return [+v[1], +v[0]]; }); }
          if (pt) { var c0 = coo(pt)[0]; if (c0) punti.push({ nome: n || 'Punto', lat: c0[0], lon: c0[1] }); }
          if (ls) { var pts = coo(ls); if (pts.length > 1) tracce.push({ nome: n || nome, pts: pts }); }
        });
      } else {
        // WPT di OziExplorer: righe "numero,nome,lat,lon,..."
        t.split(/\r?\n/).forEach(function (r) {
          var v = r.split(','); if (v.length < 4) return;
          var la = parseFloat(v[2]), lo = parseFloat(v[3]);
          if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && /^\s*-?\d/.test(v[2])) punti.push({ nome: v[1].trim() || 'Punto', lat: la, lon: lo });
        });
      }
      punti = punti.filter(function (p) { return isFinite(p.lat) && isFinite(p.lon); });
      tracce.forEach(function (tr) { tr.pts = semplifica(tr.pts.filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); }), 1.5); });
      return { punti: punti, tracce: tracce.filter(function (tr) { return tr.pts.length > 1; }) };
    });
  }
  // Douglas-Peucker in metri: toglie i punti superflui di una traccia (tolleranza tol)
  function semplifica(pts, tol) {
    if (pts.length < 3) return pts;
    var la0 = pts[0][0] * Math.PI / 180, kx = Math.cos(la0) * 111320, ky = 110540;
    var xy = pts.map(function (p) { return [p[1] * kx, p[0] * ky]; }), tieni = new Uint8Array(pts.length);
    tieni[0] = tieni[pts.length - 1] = 1;
    var pila = [[0, pts.length - 1]];
    while (pila.length) {
      var seg = pila.pop(), a = seg[0], b = seg[1], dmax = 0, idx = -1;
      var ax = xy[a][0], ay = xy[a][1], bx = xy[b][0], by = xy[b][1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      for (var i = a + 1; i < b; i++) {
        var u = L ? ((xy[i][0] - ax) * dx + (xy[i][1] - ay) * dy) / L : 0; u = Math.max(0, Math.min(1, u));
        var d = Math.hypot(xy[i][0] - ax - u * dx, xy[i][1] - ay - u * dy);
        if (d > dmax) { dmax = d; idx = i; }
      }
      if (dmax > tol) { tieni[idx] = 1; pila.push([a, idx], [idx, b]); }
    }
    return pts.filter(function (p, i) { return tieni[i]; }).map(function (p) { return [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6]; });
  }

  /* opts: { campo (completo o null), onSalva(campo, imgNuova) -> Promise<campo>, onElimina(campo) -> Promise, onChiudi() } */
  function apri(box, opts) {
    var c = opts.campo ? JSON.parse(JSON.stringify(opts.campo)) : { id: null, nome: '', w: 0, h: 0, img: '', geo: null, mPerPx: null, controllo: [], punti: [], link: [] };
    c.controllo = c.controllo || []; c.punti = c.punti || []; c.link = c.link || []; c.tracce = c.tracce || [];
    var imgNuova = null, modificato = false, tab = c.img ? 'aree' : 'cartina', sel = null, selCp = null, linkDa = null, zonaPred = 32;
    box.innerHTML = '';
    var root = el('div', 'ed'); box.appendChild(root);
    var mapBox = el('div', 'ed-map'), inner = el('div', 'ed-inner'), img = new Image(), svgNS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(svgNS, 'svg');
    img.className = 'ed-img'; img.draggable = false; svg.setAttribute('class', 'ed-svg');
    inner.appendChild(img); inner.appendChild(svg); mapBox.appendChild(inner);
    var vuoto = el('div', 'ed-vuoto'); mapBox.appendChild(vuoto);
    var aiuto = el('div', 'ed-aiuto'); mapBox.appendChild(aiuto);
    var zoomBox = el('div', 'ed-zoom');
    zoomBox.appendChild(btn('+', 'icon', function () { zoomA(1.3, vw / 2, vh / 2); }));
    zoomBox.appendChild(btn('−', 'icon', function () { zoomA(1 / 1.3, vw / 2, vh / 2); }));
    zoomBox.appendChild(btn('⤢', 'icon', function () { adatta(); }));
    mapBox.appendChild(zoomBox);
    var side = el('aside', 'ed-side');
    root.appendChild(mapBox); root.appendChild(side);
    var file = el('input'); file.type = 'file'; file.accept = 'image/*,application/pdf,.pdf'; file.hidden = true; root.appendChild(file);
    var fileGps = el('input'); fileGps.type = 'file'; fileGps.accept = '.gpx,.wpt,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml,text/plain'; fileGps.hidden = true; root.appendChild(fileGps);
    var importa = null;   // file GPS letto e in attesa di conferma: { punti, tracce, scelti, conTracce }
    fileGps.onchange = function () {
      var f = fileGps.files[0]; fileGps.value = ''; if (!f) return;
      leggiGps(f).then(function (r) {
        if (!r.punti.length && !r.tracce.length) { alert('Nel file non ho trovato punti né tracce.'); return; }
        r.punti.forEach(function (p) {
          var q = U.aPixel(c.geo, p.lat, p.lon); p.x = q.x; p.y = q.y;
          p.fuori = q.x < 0 || q.y < 0 || q.x > c.w || q.y > c.h;
          p.scelto = !p.fuori; p.tipo = 'base';
        });
        importa = r; importa.conTracce = true;
        if (!r.punti.length) { aggiungiTracce(r.tracce); importa = null; return; }
        tab = 'aree'; sel = null; disegna(); pannello();
      }, function (e) { alert('Non riesco a leggere il file: ' + (e.message || e)); });
    };
    function aggiungiTracce(trs) {
      trs.forEach(function (tr) { c.tracce.push({ id: idNuovo(), nome: tr.nome, pts: tr.pts }); });
      cambiato();
    }
    function apriGps() { if (!c.geo) { alert('Prima la cartina deve essere georeferenziata (scheda 2 Coordinate, o presa dal web).'); return; } fileGps.click(); }

    // ---------- georeferenziazione e coordinate dei punti
    function ricalcola() {
      var cps = c.controllo.filter(function (p) { return p.lat != null; });
      var g = U.georef(cps);
      c.geo = g ? { cx: g.cx, cy: g.cy } : null; c.mPerPx = g ? g.mPerPx : null; c._err = g ? g : null;
      c.punti.forEach(function (p) {
        if (!c.geo) { if (p.fonte !== 'coord') { p.lat = null; p.lon = null; } return; }
        if (p.fonte === 'coord' && p.lat != null) { var q = U.aPixel(c.geo, p.lat, p.lon); p.x = q.x; p.y = q.y; }
        else if (p.x != null) { var ll = U.daPixel(c.geo, p.x, p.y); p.lat = ll.lat; p.lon = ll.lon; }
      });
    }
    function cambiato() { modificato = true; ricalcola(); disegna(); pannello(); }

    // ---------- pan e zoom
    var vw = 0, vh = 0, sc = 1, tx = 0, ty = 0;
    function adatta() {
      vw = mapBox.clientWidth; vh = mapBox.clientHeight; if (!c.w || !vw) return;
      sc = Math.min(vw / c.w, vh / c.h) * .95; tx = (vw - c.w * sc) / 2; ty = (vh - c.h * sc) / 2; applica();
    }
    function applica() { inner.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + sc + ')'; disegna(); }
    function zoomA(f, cx, cy) { var ns = Math.max(.05, Math.min(8, sc * f)); tx = cx - (cx - tx) * ns / sc; ty = cy - (cy - ty) * ns / sc; sc = ns; applica(); }
    function aImmagine(e) { var r = mapBox.getBoundingClientRect(); return { x: (e.clientX - r.left - tx) / sc, y: (e.clientY - r.top - ty) / sc }; }
    function puntoSotto(q) { var R = 16 / sc; return c.punti.filter(function (p) { return Math.hypot(p.x - q.x, p.y - q.y) < Math.max(R, raggioPx(p) * .8); })[0]; }
    function cpSotto(q) { var R = 14 / sc; return c.controllo.filter(function (p) { return Math.hypot(p.x - q.x, p.y - q.y) < R; })[0]; }
    function raggioPx(p) { return c.mPerPx ? (p.raggio || 30) / c.mPerPx : 18 / sc; }
    var drag = null;
    mapBox.addEventListener('pointerdown', function (e) {
      if (!c.img || e.button > 0 || e.target.closest('.ed-zoom')) return;
      mapBox.setPointerCapture(e.pointerId);
      var q = aImmagine(e), cosa = null;
      if (tab === 'aree') { var p = puntoSotto(q); if (p) cosa = { tipo: 'punto', p: p }; }
      if (tab === 'geo') { var cp = cpSotto(q); if (cp) cosa = { tipo: 'cp', p: cp }; }
      drag = { x: e.clientX, y: e.clientY, tx: tx, ty: ty, cosa: cosa, mosso: false };
    });
    mapBox.addEventListener('pointermove', function (e) {
      if (!drag) { if (c.img) { var q0 = aImmagine(e); aggiornaAiuto(q0); } return; }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.mosso = true;
      if (!drag.mosso) return;
      if (drag.cosa) {
        var q = aImmagine(e); drag.cosa.p.x = q.x; drag.cosa.p.y = q.y;
        if (drag.cosa.tipo === 'punto') { drag.cosa.p.fonte = 'mappa'; sel = drag.cosa.p.id; }
        else selCp = drag.cosa.p;
        modificato = true; disegna();
      } else { tx = drag.tx + dx; ty = drag.ty + dy; applica(); }
    });
    mapBox.addEventListener('pointerup', function (e) {
      var d = drag; drag = null; if (!d) return;
      if (d.mosso) { if (d.cosa) cambiato(); return; }
      clic(aImmagine(e));
    });
    mapBox.addEventListener('wheel', function (e) { e.preventDefault(); var r = mapBox.getBoundingClientRect(); zoomA(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    mapBox.addEventListener('dragover', function (e) { e.preventDefault(); });
    mapBox.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) caricaImmagine(e.dataTransfer.files[0]); });

    function clic(q) {
      if (q.x < 0 || q.y < 0 || q.x > c.w || q.y > c.h) return;
      if (tab === 'geo') {
        var cp = cpSotto(q);
        if (cp) { selCp = cp; }
        else { cp = { x: q.x, y: q.y, lat: null, lon: null }; c.controllo.push(cp); selCp = cp; modificato = true; }
        disegna(); pannello(true);
      } else if (tab === 'aree') {
        var p = puntoSotto(q);
        if (p) sel = p.id;
        else {
          var mobs = c.punti.filter(function (x) { return x.tipo === 'mob'; });
          p = { id: idNuovo(), nome: 'Area ' + (c.punti.length + 1), tipo: mobs.length < 2 ? 'mob' : 'base', x: q.x, y: q.y, raggio: 30, fonte: 'mappa' };
          if (p.tipo === 'mob') p.fazione = mobs.some(function (x) { return x.fazione === 'blu'; }) ? 'rossa' : 'blu';
          c.punti.push(p); sel = p.id; cambiato(); setTimeout(function () { var n = side.querySelector('.ed-nome-punto'); if (n) { n.focus(); n.select(); } }, 30); return;
        }
        disegna(); pannello();
      } else if (tab === 'link') {
        var p2 = puntoSotto(q);
        if (!p2) { linkDa = null; disegna(); pannello(); return; }
        if (!linkDa) { linkDa = p2.id; }
        else if (linkDa === p2.id) { linkDa = null; }
        else { toggleLink(linkDa, p2.id); linkDa = p2.id; }
        disegna(); pannello();
      }
    }
    function toggleLink(a, b) {
      var i = c.link.findIndex(function (l) { return (l[0] === a && l[1] === b) || (l[0] === b && l[1] === a); });
      if (i >= 0) c.link.splice(i, 1); else c.link.push([a, b]);
      modificato = true;
    }
    function aggiornaAiuto(q) {
      var t = { cartina: 'Trascina per spostarti, rotella per lo zoom', geo: 'Clicca un incrocio della griglia (o un punto noto) e scrivi le sue coordinate', aree: 'Clicca un punto vuoto per creare un\'area · trascina un\'area per spostarla', link: linkDa ? 'Clicca l\'area da collegare (o scollegare) · clic sul vuoto per finire' : 'Clicca la prima area, poi quelle da collegare' }[tab];
      var pos = '';
      if (c.geo && q && q.x >= 0 && q.y >= 0 && q.x <= c.w && q.y <= c.h) { var ll = U.daPixel(c.geo, q.x, q.y); pos = ' · ' + utmTesto(ll.lat, ll.lon); }
      aiuto.textContent = t + pos;
    }

    // ---------- disegno (stessa simbologia della mappa di gioco, in neutro)
    function disegna() {
      if (!c.img) { svg.innerHTML = ''; return; }
      var k = 1 / sc, s = '';
      if (c.geo) c.tracce.forEach(function (tr) {
        var d = tr.pts.map(function (p, i) { var q = U.aPixel(c.geo, p[0], p[1]); return (i ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1); }).join('');
        s += '<path d="' + d + '" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="' + (6 * k) + '" stroke-linejoin="round"/>';
        s += '<path d="' + d + '" fill="none" stroke="#ff9f1c" stroke-width="' + (3 * k) + '" stroke-dasharray="' + (8 * k) + ' ' + (5 * k) + '" stroke-linejoin="round"/>';
      });
      c.link.forEach(function (l) {
        var a = c.punti.filter(function (p) { return p.id === l[0]; })[0], b = c.punti.filter(function (p) { return p.id === l[1]; })[0];
        if (!a || !b) return;
        var xy = 'x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"';
        s += '<line ' + xy + ' stroke="#000" stroke-opacity=".5" stroke-width="' + (7 * k) + '" stroke-linecap="round"/>';
        s += '<line ' + xy + ' stroke="#f1ece0" stroke-width="' + (3 * k) + '" stroke-dasharray="' + (10 * k) + ' ' + (8 * k) + '" stroke-linecap="round"/>';
      });
      c.punti.forEach(function (p) {
        var r = Math.max(raggioPx(p), 14 * k), on = p.id === sel || p.id === linkDa;
        var fc = conFazione(p.tipo) && COLF[p.fazione], col = fc || (p.tipo === 'chiave' ? '#ffe08a' : '#cfcab8');
        s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + r + '" fill="' + (fc || '#9a9a8c') + '" fill-opacity="' + (fc ? .6 : .45) + '" stroke="' + (on ? '#ffd23f' : col) + '" stroke-width="' + ((on ? 5 : 3) * k) + '"/>';
        var sim = p.tipo === 'base' ? '' : simbolo(p.tipo);
        if (sim) s += '<text x="' + p.x + '" y="' + p.y + '" font-size="' + (20 * k) + '" text-anchor="middle" dominant-baseline="central" class="ed-sim" fill="' + (fc ? '#fff' : '#ffe08a') + '">' + sim + '</text>';
        s += '<text x="' + p.x + '" y="' + (p.y + r + 12 * k) + '" font-size="' + (14 * k) + '" text-anchor="middle" dominant-baseline="central" class="ed-lab">' + esc(p.nome.toUpperCase()) + '</text>';
        var alt = [p.nomi && p.nomi.blu, p.nomi && p.nomi.rossa];
        if (alt[0] || alt[1]) s += '<text x="' + p.x + '" y="' + (p.y + r + 27 * k) + '" font-size="' + (11 * k) + '" text-anchor="middle" dominant-baseline="central" class="ed-lab"><tspan fill="#8fc0ff">' + esc(alt[0] || p.nome) + '</tspan><tspan fill="#cfcab8"> · </tspan><tspan fill="#ff9a8f">' + esc(alt[1] || p.nome) + '</tspan></text>';
      });
      c.controllo.forEach(function (p, i) {
        var on = p === selCp, col = p.lat == null ? '#ff6b5a' : '#ffd23f', d = 12 * k;
        s += '<path d="M' + (p.x - d) + ' ' + p.y + 'H' + (p.x + d) + 'M' + p.x + ' ' + (p.y - d) + 'V' + (p.y + d) + '" stroke="#000" stroke-width="' + (5 * k) + '"/>';
        s += '<path d="M' + (p.x - d) + ' ' + p.y + 'H' + (p.x + d) + 'M' + p.x + ' ' + (p.y - d) + 'V' + (p.y + d) + '" stroke="' + col + '" stroke-width="' + (2.5 * k) + '"/>';
        if (on) s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (16 * k) + '" fill="none" stroke="#2f9bff" stroke-width="' + (3 * k) + '"/>';
        s += '<text x="' + (p.x + 16 * k) + '" y="' + (p.y - 14 * k) + '" font-size="' + (14 * k) + '" class="ed-lab" fill="' + col + '">' + (i + 1) + '</text>';
      });
      svg.innerHTML = s;
    }

    // ---------- pannello laterale
    function pannello(focusCoord) {
      side.innerHTML = '';
      var head = el('div', 'ed-head');
      var nome = el('input'); nome.placeholder = 'Nome del campo'; nome.value = c.nome || '';
      nome.oninput = function () { c.nome = nome.value; modificato = true; };
      head.appendChild(nome);
      head.appendChild(btn('✕', 'icon', chiudi));
      side.appendChild(head);
      var tabs = el('div', 'ed-tabs');
      [['cartina', '1 Cartina'], ['geo', '2 Coordinate'], ['aree', '3 Aree'], ['link', '4 Collegamenti']].forEach(function (t) {
        var b = btn(t[1], tab === t[0] ? 'on' : '', function () { tab = t[0]; sel = null; selCp = null; linkDa = null; disegna(); pannello(); aggiornaAiuto(); });
        if (!c.img && t[0] !== 'cartina') b.disabled = true;
        tabs.appendChild(b);
      });
      side.appendChild(tabs);
      var body = el('div', 'ed-body'); side.appendChild(body);
      ({ cartina: pCartina, geo: pGeo, aree: pAree, link: pLink })[tab](body, focusCoord);
      side.appendChild(stato());
      var foot = el('div', 'ed-foot');
      foot.appendChild(btn('Salva cartina', 'accent', salva));
      if (c.id && opts.onElimina) foot.appendChild(btn('Elimina', 'pericolo', function () {
        if (!confirm('Eliminare la cartina "' + (c.nome || '') + '"? I conflict che la usano resteranno senza mappa.')) return;
        opts.onElimina(c).then(function () { modificato = false; opts.onChiudi(); }, function (e) { alert('Errore: ' + (e.message || e)); });
      }));
      side.appendChild(foot);
      vuoto.hidden = !!c.img;
      aggiornaAiuto();
    }
    function stato() {
      var mobB = c.punti.filter(function (p) { return p.tipo === 'mob' && p.fazione === 'blu'; }).length, mobR = c.punti.filter(function (p) { return p.tipo === 'mob' && p.fazione === 'rossa'; }).length;
      var b = el('div', 'ed-stato'), ch = c.punti.filter(function (p) { return p.tipo === 'chiave'; }).length;
      var collegati = {}; c.link.forEach(function (l) { collegati[l[0]] = collegati[l[1]] = 1; });
      var isolati = c.punti.filter(function (p) { return !collegati[p.id]; }).length;
      var righe = [
        [!!c.img, c.img ? 'Cartina caricata (' + c.w + '×' + c.h + ')' : 'Manca la cartina'],
        [!!c.geo, c.geo ? 'Georeferenziata · errore medio ' + c._err.medio.toFixed(1) + ' m' : 'Non georeferenziata: senza coordinate il GPS non funziona'],
        [mobB === 1 && mobR === 1, 'Basi principali: ' + mobB + ' blu, ' + mobR + ' rossa (ne serve una per fazione)'],
        [ch >= 1, ch + ' punti chiave · ' + c.punti.length + ' aree in tutto'],
        [!isolati && c.link.length > 0, c.link.length + ' collegamenti' + (isolati ? ' · ' + isolati + ' aree non collegate' : '')]
      ];
      righe.forEach(function (r) { var x = el('div', r[0] ? 'ok' : 'ko', (r[0] ? '✓ ' : '! ') + r[1]); b.appendChild(x); });
      return b;
    }
    function pCartina(body) {
      if (c.img && window.S40F) {
        body.appendChild(el('h4', 'ed-tit', 'Stile della mappa in gioco'));
        var temi = el('div', 'ed-temi'), TEMI = window.S40F.TEMI;
        Object.keys(TEMI).forEach(function (k) {
          var b = el('button', 'ed-tema' + ((c.tema || 'seppia') === k ? ' on' : '')); b.type = 'button';
          var th = new Image(); th.alt = ''; b.appendChild(th); b.appendChild(el('span', null, TEMI[k].nome));
          miniatura().then(function (src) { return k === 'originale' ? src : window.S40F.applicaTema(src, k); }).then(function (u) { if (u) th.src = u; });
          b.onclick = function () { c.tema = k; modificato = true; pannello(); };
          temi.appendChild(b);
        });
        body.appendChild(temi);
        body.appendChild(el('p', 'ed-txt muto', 'Lo stile cambia solo la mappa che vedono i giocatori nell\'app; qui nell\'editor resta la cartina originale.'));
      }
      if (c.img) {
        body.appendChild(el('h4', 'ed-tit', 'Sentieri da tracce GPS'));
        body.appendChild(el('p', 'ed-txt', 'Cammina il percorso con il GPS (o un\'app come Gaia, OsmAnd, Wikiloc) e importa la traccia: compare come sentiero sulla mappa di gioco.'));
        body.appendChild(btn('Importa traccia (GPX, KML)…', '', apriGps));
        c.tracce.forEach(function (tr, i) {
          var r0 = el('div', 'ed-riga'), n = el('input'); n.value = tr.nome; n.oninput = function () { tr.nome = n.value; modificato = true; };
          r0.appendChild(n); r0.appendChild(btn('✕', 'icon', function () { c.tracce.splice(i, 1); cambiato(); }));
          body.appendChild(r0);
        });
      }
      body.appendChild(el('h4', 'ed-tit', 'Dal web, già georeferenziata'));
      var centro = el('input'); centro.placeholder = '32T 375000 4983000 oppure 44.99, 7.41';
      if (geoScelta.centro) centro.value = geoScelta.centro;
      else if (c.geo) { var ll0 = U.daPixel(c.geo, c.w / 2, c.h / 2); centro.value = utmTesto(ll0.lat, ll0.lon); }
      centro.onchange = function () { geoScelta.centro = centro.value; };
      // ricerca del posto per nome (OpenStreetMap) e scelta del centro cliccando sulla mappa
      var cerca = el('form', 'ed-cerca'), qIn = el('input'); qIn.placeholder = 'Cerca un posto (es. Giaveno, Colle del Lys)';
      var bC = el('button', 'btn', 'Cerca'); bC.type = 'submit'; cerca.appendChild(qIn); cerca.appendChild(bC);
      var risultati = el('div', 'ed-risultati');
      cerca.onsubmit = function (e) {
        e.preventDefault(); var q = qIn.value.trim(); if (!q) return;
        risultati.innerHTML = ''; risultati.appendChild(el('small', 'ed-txt muto', 'Cerco…'));
        fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=it&countrycodes=it&q=' + encodeURIComponent(q))
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function (lista) {
            risultati.innerHTML = '';
            if (!lista.length) { risultati.appendChild(el('small', 'ed-txt ko', 'Nessun posto trovato con questo nome.')); return; }
            lista.forEach(function (x) {
              var b = btn(x.display_name, 'ed-ris', function () {
                var la = +x.lat, lo = +x.lon;
                centro.value = utmTesto(la, lo); geoScelta.centro = centro.value; centro.classList.remove('errato');
                risultati.innerHTML = '';
                sceltaSuMappa(la, lo, 15);
              });
              risultati.appendChild(b);
            });
          }, function () { risultati.innerHTML = ''; risultati.appendChild(el('small', 'ed-txt ko', 'Ricerca non disponibile in questo momento.')); });
      };
      body.appendChild(campoF('Cerca il posto', cerca)); body.appendChild(risultati);
      var rC = el('div', 'ed-riga ed-centro'); rC.appendChild(centro);
      rC.appendChild(btn('⌖ Scegli sulla mappa', '', function () {
        var ll = leggiCoordinate(centro.value, zonaPred);
        if (ll) sceltaSuMappa(ll.lat, ll.lon, 15); else sceltaSuMappa(45.04, 7.35, 12);
      }));
      body.appendChild(campoF('Centro della zona', rC));
      // mappa da trascinare: un clic fissa il centro, il riquadro mostra la zona che verrà presa
      function sceltaSuMappa(lat0, lon0, z0) {
        chiudiAnteprima();
        ante = el('div', 'ed-ante ed-pick'); mapBox.appendChild(ante);
        var testa = el('div', 'ed-riga'); testa.appendChild(el('b', null, 'Clicca sul punto centrale della zona')); ante.appendChild(testa);
        var vp = el('div', 'ed-pick-vp'), lt = el('div', 'ed-pick-t'), rq = el('div', 'ed-pick-rq'), mk = el('div', 'ed-pick-mk');
        vp.appendChild(lt); vp.appendChild(rq); vp.appendChild(mk); ante.appendChild(vp);
        var zm = el('div', 'ed-pick-zoom'); zm.appendChild(btn('+', '', function () { zoom(1); })); zm.appendChild(btn('−', '', function () { zoom(-1); })); vp.appendChild(zm);
        vp.appendChild(el('span', 'ed-ante-cr', SFONDI[0].crediti));
        var piede = el('div', 'ed-riga'), info = el('span', 'ed-txt muto', 'Trascina per muoverti, rotellina o +/− per lo zoom.');
        var usa = btn('Usa questo centro', 'accent', function () {
          centro.value = utmTesto(sel0.lat, sel0.lon); geoScelta.centro = centro.value; centro.classList.remove('errato'); chiudiAnteprima();
          msg.className = 'ed-txt muto'; msg.textContent = 'Centro scelto. Ora "Anteprima" o "Prendi questa zona".';
        });
        piede.appendChild(info); piede.appendChild(usa); piede.appendChild(btn('Annulla', '', chiudiAnteprima)); ante.appendChild(piede);
        var z = z0, sel0 = { lat: lat0, lon: lon0 };
        function mondo(la, lo, zz) { var n = 256 * Math.pow(2, zz), s0 = Math.sin(la * Math.PI / 180); return { x: (lo + 180) / 360 * n, y: (0.5 - Math.log((1 + s0) / (1 - s0)) / (4 * Math.PI)) * n }; }
        function geo(x, y, zz) { var n = 256 * Math.pow(2, zz), lo = x / n * 360 - 180, m = Math.PI * (1 - 2 * y / n); return { lat: 180 / Math.PI * Math.atan(Math.sinh(m)), lon: lo }; }
        var c0 = mondo(lat0, lon0, z), cx = c0.x, cy = c0.y;
        function disegna() {
          var W = vp.clientWidth, H = vp.clientHeight, x0 = cx - W / 2, y0 = cy - H / 2, n = Math.pow(2, z);
          lt.innerHTML = '';
          for (var ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + H) / 256); ty++) for (var tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + W) / 256); tx++) {
            if (ty < 0 || ty >= n) continue;
            var i = new Image(); i.src = SFONDI[0].url.replace('{z}', z).replace('{x}', ((tx % n) + n) % n).replace('{y}', ty);
            i.style.left = (tx * 256 - x0) + 'px'; i.style.top = (ty * 256 - y0) + 'px'; i.draggable = false; lt.appendChild(i);
          }
          var p = mondo(sel0.lat, sel0.lon, z), mpp = 156543.03392 * Math.cos(sel0.lat * Math.PI / 180) / n;
          var w = geoScelta.lar / mpp, h = geoScelta.alt / mpp, X = p.x - x0, Y = p.y - y0;
          mk.style.left = X + 'px'; mk.style.top = Y + 'px';
          rq.style.left = (X - w / 2) + 'px'; rq.style.top = (Y - h / 2) + 'px'; rq.style.width = w + 'px'; rq.style.height = h + 'px';
          info.textContent = utmTesto(sel0.lat, sel0.lon) + ' · zona ' + (geoScelta.lar >= 1000 ? geoScelta.lar / 1000 + ' km' : geoScelta.lar + ' m') + ' × ' + (geoScelta.alt >= 1000 ? geoScelta.alt / 1000 + ' km' : geoScelta.alt + ' m');
        }
        function zoom(d, px, py) {
          var nz = Math.max(5, Math.min(SFONDI[0].maxz, z + d)); if (nz === z) return;
          var W = vp.clientWidth, H = vp.clientHeight; px = px == null ? W / 2 : px; py = py == null ? H / 2 : py;
          var g0 = geo(cx - W / 2 + px, cy - H / 2 + py, z); z = nz;
          var q = mondo(g0.lat, g0.lon, z); cx = q.x - px + W / 2; cy = q.y - py + H / 2; disegna();
        }
        var giu = null, mosso = false;
        vp.addEventListener('pointerdown', function (e) { if (e.target.closest('button')) return; vp.setPointerCapture(e.pointerId); giu = { x: e.clientX, y: e.clientY }; mosso = false; });
        vp.addEventListener('pointermove', function (e) {
          if (!giu) return; var dx = e.clientX - giu.x, dy = e.clientY - giu.y;
          if (!mosso && Math.hypot(dx, dy) < 5) return; mosso = true;
          cx -= dx; cy -= dy; giu = { x: e.clientX, y: e.clientY }; disegna();
        });
        vp.addEventListener('pointerup', function (e) {
          if (giu && !mosso) {
            var r0 = vp.getBoundingClientRect(); sel0 = geo(cx - vp.clientWidth / 2 + e.clientX - r0.left, cy - vp.clientHeight / 2 + e.clientY - r0.top, z); disegna();
            // il punto cliccato diventa subito il centro (anche se poi si preme Anteprima o Prendi questa zona senza "Usa questo centro")
            centro.value = utmTesto(sel0.lat, sel0.lon); geoScelta.centro = centro.value; centro.classList.remove('errato');
            msg.className = 'ed-txt muto'; msg.textContent = 'Centro aggiornato: ' + centro.value;
          }
          giu = null;
        });
        vp.addEventListener('wheel', function (e) { e.preventDefault(); var r0 = vp.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1 : -1, e.clientX - r0.left, e.clientY - r0.top); }, { passive: false });
        requestAnimationFrame(disegna);
      }
      var dim = el('div', 'due');
      var lar = el('select'), alt = el('select');
      [400, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000].forEach(function (m) {
        [lar, alt].forEach(function (s2) { var o = el('option', null, m >= 1000 ? (m / 1000).toString().replace('.', ',') + ' km' : m + ' m'); o.value = m; s2.appendChild(o); });
      });
      lar.value = geoScelta.lar; alt.value = geoScelta.alt;
      lar.onchange = function () { geoScelta.lar = +lar.value; }; alt.onchange = function () { geoScelta.alt = +alt.value; };
      dim.appendChild(campoF('Larghezza', lar)); dim.appendChild(campoF('Altezza', alt));
      body.appendChild(dim);
      var sSel = el('select'); SFONDI.forEach(function (o) { var x = el('option', null, o.nome); x.value = o.id; sSel.appendChild(x); });
      sSel.value = geoScelta.sfondo; sSel.onchange = function () { geoScelta.sfondo = sSel.value; };
      body.appendChild(campoF('Sfondo', sSel));
      // foto satellitare sopra lo sfondo: 0 = niente, 100 = solo foto
      var sr = el('label', 'pcs-bar ed-sat'), rg = el('input'); rg.type = 'range'; rg.min = 0; rg.max = 100; rg.step = 5; rg.value = geoScelta.satellite || 0;
      var vv = el('b', null, (geoScelta.satellite || 0) + '%');
      rg.oninput = function () { geoScelta.satellite = +rg.value; vv.textContent = rg.value + '%'; };
      sr.appendChild(el('span', null, 'Foto satellitare')); sr.appendChild(rg); sr.appendChild(vv);
      body.appendChild(sr);
      body.appendChild(el('small', 'ed-txt muto', '0% = nessuna foto · 50% = foto in trasparenza sulla cartina · 100% = solo foto'));
      body.appendChild(el('span', 'ed-sotto', 'Livelli da sovrapporre (Regione Piemonte)'));
      SERVIZI.forEach(function (sv) {
        var d = el('details', 'ed-liv'); var sm = el('summary', null, sv.nome); d.appendChild(sm);
        var cont = el('div', 'ed-liv-c', 'Caricamento…'); d.appendChild(cont);
        var scelti = geoScelta.livelli.filter(function (l) { return l.caps === sv.caps; }).length;
        if (scelti) sm.appendChild(el('b', 'ed-liv-n', ' · ' + scelti));
        caps(sv.caps).then(function (cp) {
          cont.innerHTML = '';
          if (!geoScelta.toccato[sv.id]) {   // la prima volta si propongono i livelli utili (curve, sentieri, edifici, acqua)
            geoScelta.toccato[sv.id] = true;
            cp.layers.forEach(function (L, i) { if (i && sv.auto.test(L.titolo + ' ' + L.nome) && !geoScelta.livelli.some(function (x) { return x.caps === sv.caps && x.nome === L.nome; })) geoScelta.livelli.push({ caps: sv.caps, nome: L.nome }); });
          }
          cp.layers.forEach(function (L) {
            var lab = el('label', 'ed-chk'), cb = el('input'); cb.type = 'checkbox';
            cb.checked = geoScelta.livelli.some(function (x) { return x.caps === sv.caps && x.nome === L.nome; });
            cb.onchange = function () {
              geoScelta.livelli = geoScelta.livelli.filter(function (x) { return !(x.caps === sv.caps && x.nome === L.nome); });
              if (cb.checked) geoScelta.livelli.push({ caps: sv.caps, nome: L.nome });
              var n = geoScelta.livelli.filter(function (x) { return x.caps === sv.caps; }).length, b0 = sm.querySelector('b');
              if (b0) b0.remove(); if (n) sm.appendChild(el('b', 'ed-liv-n', ' · ' + n));
            };
            lab.appendChild(cb); lab.appendChild(el('span', null, L.titolo)); cont.appendChild(lab);
          });
          var n = geoScelta.livelli.filter(function (x) { return x.caps === sv.caps; }).length, b0 = sm.querySelector('b');
          if (b0) b0.remove(); if (n) sm.appendChild(el('b', 'ed-liv-n', ' · ' + n));
        }, function (e) { cont.textContent = e.message === 'CORS' ? 'Non raggiungibile da qui.' : 'Non disponibile (' + e.message + ').'; d.classList.add('ko'); });
        body.appendChild(d);
      });
      var dA = el('details', 'ed-liv'); dA.appendChild(el('summary', null, 'Altro servizio WMS (indirizzo)'));
      var cA = el('div', 'ed-liv-c'); dA.appendChild(cA);
      var altro = el('input'); altro.placeholder = 'https://…?service=WMS&request=GetCapabilities'; altro.value = geoScelta.wmsAltro.caps || '';
      var lay = el('input'); lay.placeholder = 'nome del livello (vuoto = il primo)'; lay.value = geoScelta.wmsAltro.layer || '';
      altro.onchange = lay.onchange = function () { geoScelta.wmsAltro = { caps: altro.value.trim(), layer: lay.value.trim() }; };
      cA.appendChild(altro); cA.appendChild(lay); body.appendChild(dA);
      var msg = el('p', 'ed-txt muto');
      function zona() {
        var ll = leggiCoordinate(centro.value, zonaPred);
        if (!ll) { centro.classList.add('errato'); msg.className = 'ed-txt ko'; msg.textContent = 'Scrivi il centro in UTM (32T 375000 4983000) o lat, lon.'; return null; }
        if (geoScelta.wmsAltro.caps && !/^https:\/\//.test(geoScelta.wmsAltro.caps)) { msg.className = 'ed-txt ko'; msg.textContent = 'L\'indirizzo del servizio WMS deve iniziare con https://'; return null; }
        geoScelta.centro = centro.value;
        return { lat: ll.lat, lon: ll.lon, larghezza: geoScelta.lar, altezza: geoScelta.alt };
      }
      function errore(e) {
        msg.className = 'ed-txt ko';
        msg.textContent = e.message === 'CORS'
          ? 'Un servizio non permette alle app esterne di scaricare la cartina (blocco del browser). Prova un altro sfondo o togli quel livello, oppure carica un\'immagine o un PDF qui sotto.'
          : 'Non riesco a preparare la cartina: ' + e.message;
      }
      var riga = el('div', 'ed-riga');
      riga.appendChild(btn('Anteprima', '', function () {
        chiudiAnteprima(); var z = zona(); if (!z) return;
        msg.className = 'ed-txt muto'; msg.textContent = 'Preparo l\'anteprima…';
        piano(geoScelta, z, LATO).then(function (p) { mostraAnteprima(p); msg.textContent = 'Anteprima sulla cartina: se ti piace premi "Prendi questa zona".'; }, errore);
      }));
      var vai = btn(c.img ? 'Sostituisci con questa zona' : 'Prendi questa zona', 'accent', function () {
        chiudiAnteprima(); var z = zona(); if (!z) return;
        vai.disabled = true; msg.className = 'ed-txt muto'; msg.textContent = 'Collegamento ai servizi…';
        piano(geoScelta, z, LATO).then(function (p) {
          return componi(p, function (n, tot) { msg.textContent = 'Scarico la cartina… ' + n + '/' + tot; });
        }).then(function (r) { chiudiAnteprima(); applicaGeoportale(r); }, function (e) { vai.disabled = false; errore(e); });
      });
      riga.appendChild(vai);
      body.appendChild(riga); body.appendChild(msg);
      body.appendChild(el('h4', 'ed-tit', 'Da un file'));
      body.appendChild(el('p', 'ed-txt', 'Un\'immagine (JPG, PNG) oppure il PDF del campo. Meglio se ha la griglia UTM stampata, così la georeferenzi con precisione.'));
      body.appendChild(btn(c.img ? 'Sostituisci con un file…' : 'Carica immagine o PDF…', '', function () { file.click(); }));
      if (c.img) body.appendChild(el('p', 'ed-txt muto', 'Sostituendo la cartina, le aree con coordinate restano al loro posto.'));
    }
    // ritaglio piccolo della cartina per le miniature degli stili
    var miniProm = null;
    function miniatura() {
      if (miniProm) return miniProm;
      miniProm = new Promise(function (ok) {
        var im = new Image();
        im.onload = function () {
          var cv = document.createElement('canvas'), s0 = Math.min(im.naturalWidth, im.naturalHeight) * 0.45;
          cv.width = cv.height = 220;
          cv.getContext('2d').drawImage(im, (im.naturalWidth - s0) / 2, (im.naturalHeight - s0) / 2, s0, s0, 0, 0, 220, 220);
          ok(cv.toDataURL('image/jpeg', 0.85));
        };
        im.src = c.img;
      });
      return miniProm;
    }
    var geoScelta = { sfondo: 'otm', satellite: 0, livelli: [], toccato: {}, wmsAltro: {}, lar: 1200, alt: 1500 };
    var ante = null;
    function mostraAnteprima(p) {
      chiudiAnteprima();
      ante = el('div', 'ed-ante'); mapBox.appendChild(ante);
      var box2 = el('div', 'ed-ante-box'); ante.appendChild(box2);
      ante.appendChild(btn('✕ Chiudi anteprima', 'ed-ante-x', chiudiAnteprima));
      anteprima(box2, p);
    }
    function chiudiAnteprima() { if (ante) { ante.remove(); ante = null; } }
    function applicaGeoportale(r) {
      // le aree esistenti restano dove sono nel mondo reale: si ricalcolano dalle loro coordinate
      c.punti.forEach(function (p) { if (p.lat != null) p.fonte = 'coord'; });
      c.w = r.w; c.h = r.h; c.img = r.d; imgNuova = r.d; miniProm = null;
      c.controllo = r.angoli.map(function (a) { return { x: a.x, y: a.y, lat: a.lat, lon: a.lon, testo: utmTesto(a.lat, a.lon) }; });
      img.onload = function () { adatta(); };
      img.src = r.d;
      tab = 'aree'; cambiato();
    }
    function pGeo(body, focusCoord) {
      body.appendChild(el('p', 'ed-txt', 'Clicca sulla cartina un punto di cui conosci le coordinate (meglio gli incroci della griglia UTM, lontani tra loro) e scrivile qui. Bastano 2 punti, con 3 o più è più preciso.'));
      body.appendChild(el('p', 'ed-txt muto', 'Formato: 32T 375000 4983000 (zona, Est, Nord in metri) oppure 44.9917, 7.4150'));
      if (!c.controllo.length) body.appendChild(el('p', 'ed-txt muto', 'Nessun punto di controllo.'));
      c.controllo.forEach(function (p, i) {
        var r = el('div', 'ed-cp' + (p === selCp ? ' on' : ''));
        var t = el('b', null, String(i + 1)); r.appendChild(t);
        var inp = el('input'); inp.placeholder = '32T 375000 4983000'; inp.value = p.lat != null ? (p.testo || utmTesto(p.lat, p.lon)) : '';
        inp.onfocus = function () { selCp = p; disegna(); };
        inp.onchange = function () {
          if (!inp.value.trim()) { p.lat = p.lon = null; cambiato(); return; }
          var ll = leggiCoordinate(inp.value, zonaPred);
          if (!ll) { inp.classList.add('errato'); return; }
          if (ll.zona) zonaPred = ll.zona;
          p.lat = ll.lat; p.lon = ll.lon; p.testo = inp.value.trim(); cambiato();
        };
        r.appendChild(inp);
        var err = c._err && p.lat != null ? c._err.errori[c.controllo.filter(function (q) { return q.lat != null; }).indexOf(p)] : null;
        r.appendChild(el('small', err != null && err > 5 ? 'ko' : 'muto', err != null ? err.toFixed(1) + ' m' : '—'));
        r.appendChild(btn('✕', 'icon', function () { c.controllo.splice(i, 1); if (selCp === p) selCp = null; cambiato(); }));
        body.appendChild(r);
        if (focusCoord && p === selCp) setTimeout(function () { inp.focus(); }, 20);
      });
      if (c._err && c._err.medio > 5) body.appendChild(el('p', 'ed-txt ko', 'Errore alto: controlla di aver cliccato i punti giusti e scritto bene le coordinate.'));
      if (c.geo) body.appendChild(el('p', 'ed-txt muto', 'Scala: 1 pixel = ' + c.mPerPx.toFixed(2) + ' m. Muovendo il mouse sulla cartina vedi le coordinate in basso.'));
    }
    function pAree(body) {
      if (importa) return pImporta(body);
      var p = c.punti.filter(function (x) { return x.id === sel; })[0];
      if (p) {
        var f = el('div', 'ed-form');
        var n = el('input'); n.className = 'ed-nome-punto'; n.value = p.nome; n.oninput = function () { p.nome = n.value; modificato = true; disegna(); aggiornaLista(); };
        f.appendChild(campoF('Nome', n));
        var t = el('select'); TIPI.forEach(function (o) { var x = el('option', null, o[1]); x.value = o[0]; t.appendChild(x); }); t.value = p.tipo;
        t.onchange = function () {
          p.tipo = t.value;
          if (conFazione(p.tipo) && !p.fazione) p.fazione = c.punti.some(function (x) { return x !== p && x.tipo === p.tipo && x.fazione === 'blu'; }) ? 'rossa' : 'blu';
          if (!conFazione(p.tipo)) delete p.fazione;
          cambiato();
        };
        f.appendChild(campoF('Tipo', t));
        if (conFazione(p.tipo)) {
          var fz = el('div', 'seg ed-seg');
          FAZ.forEach(function (o) {
            var b = btn(o[1], 'seg-b s-' + o[0] + (p.fazione === o[0] ? ' on' : ''), function () { p.fazione = o[0]; cambiato(); });
            fz.appendChild(b);
          });
          f.appendChild(campoF('Di quale fazione è', fz));
        }
        // in quali tipi di giocata compare l'area (la stessa cartina serve per tutti)
        p.usi = p.usi || { conflict: true, allenamento: true, pcs: true, dmz: true };
        var us = el('div', 'ed-usi');
        [['conflict', 'Conflict'], ['allenamento', 'Allenamento'], ['pcs', 'PCS'], ['dmz', 'DMZ']].forEach(function (o) {
          var b = btn((p.usi[o[0]] ? '✓ ' : '') + o[1], 'chip' + (p.usi[o[0]] ? ' on' : ''), function () { p.usi[o[0]] = !p.usi[o[0]]; modificato = true; pannello(); });
          us.appendChild(b);
        });
        f.appendChild(campoF('Usata in', us));
        var nb = el('input'), nr = el('input'); p.nomi = p.nomi || {};
        nb.placeholder = nr.placeholder = 'come sopra';
        nb.value = p.nomi.blu || ''; nr.value = p.nomi.rossa || '';
        nb.oninput = function () { p.nomi.blu = nb.value; modificato = true; disegna(); };
        nr.oninput = function () { p.nomi.rossa = nr.value; modificato = true; disegna(); };
        var dn = el('div', 'due'); dn.appendChild(campoF('Nome per i blu', nb)); dn.appendChild(campoF('Nome per i rossi', nr));
        f.appendChild(dn);
        var nq = el('input'); nq.placeholder = 'es. sul palo della recinzione, lato sentiero'; nq.value = p.notaQr || '';
        nq.oninput = function () { p.notaQr = nq.value; modificato = true; };
        f.appendChild(campoF('Dove mettere il QR (va sul foglio da stampare)', nq));
        var r = el('input'); r.type = 'number'; r.min = 5; r.max = 200; r.value = p.raggio || 30;
        r.onchange = function () { p.raggio = Math.max(5, Math.min(200, +r.value || 30)); cambiato(); };
        f.appendChild(campoF('Raggio dell\'area (metri)', r));
        var co = el('input'); co.placeholder = c.geo ? '32T 375000 4983000' : 'Prima georeferenzia la cartina'; co.value = p.lat != null ? utmTesto(p.lat, p.lon) : ''; co.disabled = !c.geo;
        co.onchange = function () {
          var ll = leggiCoordinate(co.value, zonaPred); if (!ll) { co.classList.add('errato'); return; }
          p.lat = ll.lat; p.lon = ll.lon; p.fonte = 'coord'; cambiato();
        };
        f.appendChild(campoF('Coordinate (UTM o lat, lon)', co));
        var az = el('div', 'ed-riga');
        az.appendChild(btn('Fatto', '', function () { sel = null; disegna(); pannello(); }));
        az.appendChild(btn('Elimina area', 'pericolo', function () {
          c.punti = c.punti.filter(function (x) { return x.id !== p.id; });
          c.link = c.link.filter(function (l) { return l[0] !== p.id && l[1] !== p.id; }); sel = null; cambiato();
        }));
        f.appendChild(az);
        body.appendChild(f);
      } else {
        body.appendChild(el('p', 'ed-txt', 'Clicca sulla cartina dove vuoi un\'area, oppure creala dalle coordinate o da un file del GPS.'));
        body.appendChild(btn('Importa punti dal GPS (GPX, WPT, KML)…', '', apriGps));
        var nuovo = el('div', 'ed-riga'), co2 = el('input'); co2.placeholder = c.geo ? '32T 375000 4983000' : 'Serve la georeferenziazione'; co2.disabled = !c.geo;
        nuovo.appendChild(co2);
        nuovo.appendChild(btn('Aggiungi', '', function () {
          var ll = leggiCoordinate(co2.value, zonaPred); if (!ll) { co2.classList.add('errato'); return; }
          var q = U.aPixel(c.geo, ll.lat, ll.lon);
          if (q.x < 0 || q.y < 0 || q.x > c.w || q.y > c.h) { alert('Quelle coordinate sono fuori dalla cartina.'); return; }
          var np = { id: idNuovo(), nome: 'Area ' + (c.punti.length + 1), tipo: 'base', x: q.x, y: q.y, lat: ll.lat, lon: ll.lon, raggio: 30, fonte: 'coord' };
          c.punti.push(np); sel = np.id; cambiato();
        }));
        body.appendChild(nuovo);
      }
      var lista = el('div', 'ed-lista'); body.appendChild(lista);
      function aggiornaLista() {
        lista.innerHTML = '';
        lista.appendChild(el('h4', null, 'Aree (' + c.punti.length + ')'));
        c.punti.forEach(function (q) {
          var b = btn(simbolo(q.tipo) + ' ' + q.nome + (conFazione(q.tipo) ? (q.fazione === 'rossa' ? ' · rossa' : q.fazione === 'blu' ? ' · blu' : ' · fazione?') : ''), 'ed-voce' + (q.id === sel ? ' on' : '') + (conFazione(q.tipo) && q.fazione ? ' f-' + q.fazione : ''), function () {
            sel = q.id; tx = vw / 2 - q.x * sc; ty = vh / 2 - q.y * sc; applica(); pannello();
          });
          lista.appendChild(b);
        });
      }
      aggiornaLista();
    }
    function pImporta(body) {
      var r = importa;
      body.appendChild(el('h4', 'ed-tit', 'Punti nel file: ' + r.punti.length));
      var fuori = r.punti.filter(function (p) { return p.fuori; }).length;
      if (fuori) body.appendChild(el('p', 'ed-txt muto', fuori + ' sono fuori dalla cartina e non si possono aggiungere.'));
      var tipo = el('select'); TIPI.filter(function (o) { return !conFazione(o[0]); }).forEach(function (o) { var x = el('option', null, o[1]); x.value = o[0]; tipo.appendChild(x); });
      tipo.value = 'base'; body.appendChild(campoF('Come tipo di area (lo cambi dopo, area per area)', tipo));
      var lista = el('div', 'ed-lista');
      r.punti.forEach(function (p) {
        var lab = el('label', 'ed-chk' + (p.fuori ? ' spento' : '')), cb = el('input'); cb.type = 'checkbox'; cb.checked = p.scelto; cb.disabled = p.fuori;
        cb.onchange = function () { p.scelto = cb.checked; disegna(); };
        lab.appendChild(cb); lab.appendChild(el('span', null, p.nome)); lista.appendChild(lab);
      });
      body.appendChild(lista);
      if (r.tracce.length) {
        var lt = el('label', 'ed-chk'), ct = el('input'); ct.type = 'checkbox'; ct.checked = r.conTracce; ct.onchange = function () { r.conTracce = ct.checked; };
        lt.appendChild(ct); lt.appendChild(el('span', null, 'Aggiungi anche ' + r.tracce.length + (r.tracce.length > 1 ? ' tracce' : ' traccia') + ' come sentieri')); body.appendChild(lt);
      }
      var az = el('div', 'ed-riga');
      az.appendChild(btn('Annulla', '', function () { importa = null; disegna(); pannello(); }));
      az.appendChild(btn('Aggiungi ' + r.punti.filter(function (p) { return p.scelto; }).length + ' aree', 'accent', function () {
        r.punti.filter(function (p) { return p.scelto && !p.fuori; }).forEach(function (p) {
          c.punti.push({ id: idNuovo(), nome: p.nome, tipo: tipo.value, x: p.x, y: p.y, lat: p.lat, lon: p.lon, raggio: 30, fonte: 'coord' });
        });
        if (r.conTracce && r.tracce.length) r.tracce.forEach(function (tr) { c.tracce.push({ id: idNuovo(), nome: tr.nome, pts: tr.pts }); });
        importa = null; cambiato();
      }));
      body.appendChild(az);
    }
    function pLink(body) {
      body.appendChild(el('p', 'ed-txt', 'Due aree collegate sono nella stessa rete radio: si può conquistare un\'area solo se è collegata a una già tenuta. Clicca un\'area, poi le aree da collegare; cliccando di nuovo un collegamento esistente lo togli.'));
      if (linkDa) { var a = c.punti.filter(function (p) { return p.id === linkDa; })[0]; body.appendChild(el('p', 'ed-txt ok', 'Da: ' + (a ? a.nome : ''))); }
      var lista = el('div', 'ed-lista'); lista.appendChild(el('h4', null, 'Collegamenti (' + c.link.length + ')'));
      function nm(id) { var p = c.punti.filter(function (q) { return q.id === id; })[0]; return p ? p.nome : '?'; }
      c.link.forEach(function (l, i) {
        var r = el('div', 'ed-riga'); r.appendChild(el('span', null, nm(l[0]) + ' — ' + nm(l[1])));
        r.appendChild(btn('✕', 'icon', function () { c.link.splice(i, 1); modificato = true; disegna(); pannello(); }));
        lista.appendChild(r);
      });
      body.appendChild(lista);
    }

    // ---------- immagine
    function caricaImmagine(f) {
      aiuto.textContent = 'Caricamento della cartina…';
      leggiFile(f).then(function (r) {
        if (c.w && (c.w !== r.w || c.h !== r.h)) {
          var sx = r.w / c.w, sy = r.h / c.h;
          c.punti.forEach(function (p) { p.x *= sx; p.y *= sy; }); c.controllo.forEach(function (p) { p.x *= sx; p.y *= sy; });
        }
        c.w = r.w; c.h = r.h; c.img = r.d; imgNuova = r.d; img.src = r.d; miniProm = null;
        if (!c.nome && f.name) c.nome = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        tab = c.controllo.length ? tab : 'geo';
        img.onload = function () { adatta(); };
        cambiato();
      }, function (e) { alert('Non riesco a leggere il file: ' + (e.message || e)); aggiornaAiuto(); });
    }
    file.onchange = function () { if (file.files[0]) caricaImmagine(file.files[0]); file.value = ''; };
    vuoto.appendChild(el('span', 'ed-vuoto-ic', '⤓'));
    vuoto.appendChild(el('b', null, 'Trascina qui la cartina'));
    vuoto.appendChild(el('span', null, 'immagine o PDF'));
    vuoto.appendChild(btn('Scegli il file…', 'accent', function () { file.click(); }));

    function salva() {
      if (!c.img) { alert('Carica prima la cartina.'); return; }
      if (!(c.nome || '').trim()) { alert('Dai un nome al campo.'); return; }
      var out = {
        id: c.id, nome: c.nome.trim(), w: c.w, h: c.h, geo: c.geo, mPerPx: c.mPerPx,
        controllo: c.controllo.map(function (p) { return { x: p.x, y: p.y, lat: p.lat, lon: p.lon, testo: p.testo || null }; }),
        punti: c.punti.map(function (p) { return { id: p.id, nome: p.nome.trim() || 'Area', tipo: p.tipo, x: p.x, y: p.y, lat: p.lat == null ? null : p.lat, lon: p.lon == null ? null : p.lon, raggio: p.raggio || 30, fonte: p.fonte || 'mappa',
          fazione: conFazione(p.tipo) ? (p.fazione || null) : null, notaQr: (p.notaQr || '').trim() || null,
          usi: p.usi || { conflict: true, allenamento: true, pcs: true, dmz: true },
          nomi: { blu: (p.nomi && p.nomi.blu || '').trim() || null, rossa: (p.nomi && p.nomi.rossa || '').trim() || null } }; }),
        link: c.link.map(function (l) { return [l[0], l[1]]; }),
        tracce: c.tracce.map(function (tr) { return { id: tr.id, nome: (tr.nome || '').trim() || 'Sentiero', pts: tr.pts.map(function (p) { return { la: p[0], lo: p[1] }; }) }; }),
        tema: c.tema || 'seppia',
        parti: c.parti || 0, imgVer: c.imgVer || null, aggiornato: Date.now()
      };
      opts.onSalva(out, imgNuova).then(function (salvato) {
        c.id = salvato.id; c.parti = salvato.parti; c.imgVer = salvato.imgVer; imgNuova = null; modificato = false; pannello();
      }, function (e) { alert('Salvataggio non riuscito: ' + (e.message || e)); });
    }
    function chiudi() {
      if (modificato && !confirm('Hai modifiche non salvate. Uscire lo stesso?')) return;
      modificato = false; opts.onChiudi();
    }

    if (c.img) { img.onload = adatta; img.src = c.img; }
    ricalcola();
    window.addEventListener('resize', adatta);
    pannello();
    return {
      modificato: function () { return modificato; },
      chiudi: function () { window.removeEventListener('resize', adatta); box.innerHTML = ''; }
    };
  }

  window.AC_MAPPE = { apri: apri, leggiCoordinate: leggiCoordinate, utmTesto: utmTesto };
})();
