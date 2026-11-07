/* Airsoft Conflict — cartina da navigazione stampabile (PDF dalla stampa del browser).
   Foglio 1: solo la cartina, pulita: nord della griglia UTM in alto, griglia ogni 100 m (più marcata ogni 500 m) con
   le coordinate complete ai bordi (0375000E, 4983500N), cornice a tratti, nord, scala grafica e numerica, datum.
   Foglio 2: aree operative e coordinate.
   AC_STAMPA.apri(campo, { formato:'A4'|'A3', orient:'auto'|'v'|'o', scala:0|n, titolo, decl, aree, simboli, sentieri, nomiFaz }) */
(function () {
  'use strict';
  var U = window.AC_UTM;
  var SCALE = [1000, 2000, 2500, 4000, 5000, 7500, 10000, 12500, 15000, 20000, 25000, 40000, 50000];
  var FOGLI = { A4: [210, 297], A3: [297, 420] };
  var BANDE = 'CDEFGHJKLMNPQRSTUVWXX';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function f1(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function migl(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function banda(lat) { return BANDE[Math.max(0, Math.min(20, Math.floor((lat + 80) / 8)))]; }
  // MGRS (WGS84): quadrato di 100 km con due lettere, poi est e nord a 5 cifre (1 m) o meno
  function mgrs(lat, lon, cifre) {
    var u = U.daLatLon(lat, lon), z = u.zona, set = (z - 1) % 3;
    var colL = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'][set], rigL = 'ABCDEFGHJKLMNPQRSTUV';
    var e100 = Math.floor(u.E / 100000), n100 = Math.floor(u.N / 100000) % 20;
    var col = colL.charAt(e100 - 1), rig = rigL.charAt((n100 + (z % 2 === 0 ? 5 : 0)) % 20);
    var d = Math.pow(10, 5 - (cifre || 5)), e = Math.floor((u.E % 100000) / d), n = Math.floor((u.N % 100000) / d);
    var p = function (v) { v = String(v); while (v.length < (cifre || 5)) v = '0' + v; return v; };
    return z + banda(lat) + ' ' + col + rig + ' ' + p(e) + ' ' + p(n);
  }
  var NOMI_TIPO = { mob: 'Base principale', chiave: 'Punto chiave', base: 'Area', torre: 'Torre radio' };

  function prepara(c, o) {
    var w = c.w, h = c.h, g = c.geo;
    var cen = U.daPixel(g, w / 2, h / 2), zona = U.daLatLon(cen.lat, cen.lon).zona, nord = cen.lat >= 0;
    var utm = function (lat, lon) { return U.daLatLon(lat, lon, zona); };
    var px2utm = function (x, y) { var ll = U.daPixel(g, x, y); return utm(ll.lat, ll.lon); };
    var p0 = px2utm(0, 0), p1 = px2utm(w, 0), p2 = px2utm(0, h), p3 = px2utm(w, h);
    // pixel -> UTM (affine: su pochi km l'errore è trascurabile)
    var A = { a: (p1.E - p0.E) / w, b: (p1.N - p0.N) / w, c: (p2.E - p0.E) / h, d: (p2.N - p0.N) / h, e: p0.E, f: p0.N };
    var Es = [p0.E, p1.E, p2.E, p3.E], Ns = [p0.N, p1.N, p2.N, p3.N];
    var bb = { e0: Math.min.apply(null, Es), e1: Math.max.apply(null, Es), n0: Math.min.apply(null, Ns), n1: Math.max.apply(null, Ns) };
    var mW = bb.e1 - bb.e0, mH = bb.n1 - bb.n0;
    // impaginazione: margine 8 mm, fascia etichette 7 mm, cartiglio in basso
    var F = FOGLI[o.formato] || FOGLI.A4, best = null;
    ['v', 'o'].forEach(function (or) {
      if (o.orient !== 'auto' && o.orient !== or) return;
      var W = or === 'v' ? F[0] : F[1], H = or === 'v' ? F[1] : F[0], car = 0;
      var fx0 = 17, fy0 = 15, fx1 = W - 9, fy1 = H - 13;
      var fw = fx1 - fx0, fh = fy1 - fy0, need = Math.max(mW * 1000 / fw, mH * 1000 / fh);
      if (!best || need < best.need) best = { or: or, W: W, H: H, car: car, fx0: fx0, fy0: fy0, fx1: fx1, fy1: fy1, fw: fw, fh: fh, need: need };
    });
    var S = o.scala || SCALE.filter(function (s) { return s >= best.need; })[0] || Math.ceil(best.need / 1000) * 1000;
    var k = 1000 / S;   // mm sulla carta per metro
    var cE = (bb.e0 + bb.e1) / 2, cN = (bb.n0 + bb.n1) / 2;
    var E0 = cE - best.fw / 2 / k, N1 = cN + best.fh / 2 / k, E1 = E0 + best.fw / k, N0 = N1 - best.fh / k;
    var X = function (E) { return best.fx0 + (E - E0) * k; }, Y = function (N) { return best.fy0 + (N1 - N) * k; };
    // convergenza: angolo tra nord geografico e nord della griglia al centro
    var a1 = utm(cen.lat, cen.lon), a2 = utm(cen.lat + 0.01, cen.lon), conv = Math.atan2(a2.E - a1.E, a2.N - a1.N) * 180 / Math.PI;
    return { c: c, o: o, zona: zona, nord: nord, banda: banda(cen.lat), cen: cen, utm: utm, A: A, P: best, S: S, k: k, E0: E0, E1: E1, N0: N0, N1: N1, X: X, Y: Y, conv: conv, maxS: S };
  }
  // waypoint numerati: aree e simboli, da nord-ovest a sud-est
  function waypoint(R) {
    var c = R.c, ord = function (a, b) { return Math.round((b.N - a.N) / 150) || (a.E - b.E); };
    var aree = (R.o.aree === false ? [] : c.punti || []).filter(function (p) { return p.lat != null; }).map(function (p) { var u = R.utm(p.lat, p.lon); return { p: p, E: u.E, N: u.N }; }).sort(ord);
    aree.forEach(function (x, i) { x.n = String(i + 1); });
    var simb = (R.o.simboli === false ? [] : c.segni || []).filter(function (g) { return g.lat != null; }).map(function (g) { var u = R.utm(g.lat, g.lon); return { g: g, E: u.E, N: u.N }; }).sort(ord);
    simb.forEach(function (x, i) { x.n = 'S' + (i + 1); });
    return { aree: aree, simb: simb };
  }

  var COLORI_AREE = ['#4caf50', '#f2d13a', '#9c5fc7', '#f08a24', '#2bb3b1', '#c2185b', '#8d6e63', '#7cb342', '#5c6bc0', '#26a69a'];
  function pad(n, cifre) { n = String(Math.round(n)); while (n.length < cifre) n = '0' + n; return n; }
  function etE(E) { return pad(E, 7) + 'E'; }
  function etN(N) { return pad(N, 7) + 'N'; }
  function foglio1(R, WP) {
    var P = R.P, k = R.k, X = R.X, Y = R.Y, A = R.A, c = R.c, o = R.o, s = '';
    s += '<svg xmlns="http://www.w3.org/2000/svg" width="' + P.W + 'mm" height="' + P.H + 'mm" viewBox="0 0 ' + P.W + ' ' + P.H + '" font-family="Arial, Helvetica, sans-serif">';
    s += '<defs><clipPath id="cornice"><rect x="' + P.fx0 + '" y="' + P.fy0 + '" width="' + P.fw + '" height="' + P.fh + '"/></clipPath></defs>';
    // cartina: pixel -> mm
    var m = [A.a * k, -A.b * k, A.c * k, -A.d * k, X(A.e), Y(A.f)].map(function (v) { return v.toFixed(5); }).join(' ');
    s += '<g clip-path="url(#cornice)"><rect x="' + P.fx0 + '" y="' + P.fy0 + '" width="' + P.fw + '" height="' + P.fh + '" fill="#fff"/>';
    s += '<image href="' + c.img + '" x="0" y="0" width="' + c.w + '" height="' + c.h + '" transform="matrix(' + m + ')" preserveAspectRatio="none"/>';
    // griglia: ogni 100 m sottile, ogni 500 m marcata
    var passo = 100; while (passo * k < 3) passo = passo === 100 ? 200 : passo === 200 ? 500 : passo * 2;
    var forte = passo < 500 ? 500 : passo * 5;
    for (var E = Math.ceil(R.E0 / passo) * passo; E <= R.E1; E += passo) { var mg = E % forte === 0; s += '<line x1="' + f1(X(E)) + '" y1="' + P.fy0 + '" x2="' + f1(X(E)) + '" y2="' + P.fy1 + '" stroke="' + (mg ? '#000' : '#555') + '" stroke-width="' + (mg ? .3 : .12) + '" stroke-opacity="' + (mg ? .9 : .6) + '"/>'; }
    for (var N = Math.ceil(R.N0 / passo) * passo; N <= R.N1; N += passo) { var mg2 = N % forte === 0; s += '<line x1="' + P.fx0 + '" y1="' + f1(Y(N)) + '" x2="' + P.fx1 + '" y2="' + f1(Y(N)) + '" stroke="' + (mg2 ? '#000' : '#555') + '" stroke-width="' + (mg2 ? .3 : .12) + '" stroke-opacity="' + (mg2 ? .9 : .6) + '"/>'; }
    // aree operative: cerchi colorati con bordo tratteggiato e nome dentro
    var ic = 0;
    WP.aree.forEach(function (x) {
      var p = x.p, cx = X(x.E), cy = Y(x.N), r = Math.max(2, (p.raggio || 30) * k);
      var col = p.tipo === 'mob' ? (p.fazione === 'rossa' ? '#d9483b' : '#3f7fbf') : COLORI_AREE[ic++ % COLORI_AREE.length];
      s += '<circle cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="' + f1(r) + '" fill="' + col + '" fill-opacity=".55" stroke="' + col + '" stroke-width=".45" stroke-dasharray="1.2 .7"/>';
      s += '<text x="' + f1(cx) + '" y="' + f1(cy + 1.2) + '" font-size="' + (o.formato === 'A3' ? 4 : 3.4) + '" font-weight="700" fill="#333" text-anchor="middle">' + esc(p.nome || '') + '</text>';
    });
    // sentieri
    if (o.sentieri !== false) (c.tracce || []).filter(function (t) { return !t.nascosta; }).forEach(function (t) {
      var d = t.pts.map(function (p, i) { var u = R.utm(p[0], p[1]); return (i ? 'L' : 'M') + f1(X(u.E)) + ' ' + f1(Y(u.N)); }).join('');
      s += '<path d="' + d + '" fill="none" stroke="#d61fc8" stroke-width=".6" stroke-linejoin="round" stroke-linecap="round"/>';
    });
    // simboli: quadratino bianco con icona nera
    if (window.AC_SIMB) WP.simb.forEach(function (x) {
      var g = x.g, cx = X(x.E), cy = Y(x.N), r = 2.2 * (g.dim || 1);
      s += window.AC_SIMB.svg(g.sym, cx, cy, r, { chiaro: true });
      if (g.nome) s += '<text x="' + f1(cx + r + .9) + '" y="' + f1(cy + 1.1) + '" font-size="3" font-weight="700" fill="#333">' + esc(g.nome) + '</text>';
    });
    // nord, scala grafica, scala numerica (dentro la cornice)
    var nx = P.fx1 - 10, ny = P.fy0 + 12;
    s += '<circle cx="' + nx + '" cy="' + ny + '" r="5" fill="#fff" fill-opacity=".85" stroke="#000" stroke-width=".35"/>';
    s += '<path d="M' + nx + ' ' + (ny - 7.5) + 'L' + (nx + 2.6) + ' ' + (ny + 3) + 'L' + nx + ' ' + (ny + 1.2) + 'Z" fill="#000"/><path d="M' + nx + ' ' + (ny - 7.5) + 'L' + (nx - 2.6) + ' ' + (ny + 3) + 'L' + nx + ' ' + (ny + 1.2) + 'Z" fill="#fff" stroke="#000" stroke-width=".3"/>';
    s += '<text x="' + nx + '" y="' + (ny - 8.6) + '" font-size="3.6" font-weight="700" text-anchor="middle" fill="#000" paint-order="stroke" stroke="#fff" stroke-width=".8">N</text>';
    var tot = [100, 200, 250, 500, 1000, 2000].filter(function (v) { return v * k <= P.fw * .32; }).pop() || 100, seg = tot / 2;
    var sx = P.fx0 + 8, sy = P.fy1 - 8;
    s += '<rect x="' + (sx - 3) + '" y="' + (sy - 6.5) + '" width="' + f1(tot * k + 13) + '" height="10" fill="#fff" fill-opacity=".8"/>';
    for (var i = 0; i < 2; i++) s += '<rect x="' + f1(sx + i * seg * k) + '" y="' + sy + '" width="' + f1(seg * k) + '" height="1.2" fill="' + (i % 2 ? '#fff' : '#000') + '" stroke="#000" stroke-width=".25"/>';
    for (var j = 0; j <= 2; j++) s += '<text x="' + f1(sx + j * seg * k) + '" y="' + (sy - 1.6) + '" font-size="3" text-anchor="middle" fill="#000">' + Math.round(j * seg) + (j === 2 ? ' m' : '') + '</text>';
    var st = '1:' + R.S;
    s += '<rect x="' + (P.fx1 - 6 - st.length * 1.9) + '" y="' + (P.fy1 - 10.5) + '" width="' + (st.length * 1.9 + 4) + '" height="5.6" fill="#fff" fill-opacity=".8"/>';
    s += '<text x="' + (P.fx1 - 4) + '" y="' + (P.fy1 - 6.4) + '" font-size="3.2" text-anchor="end" fill="#000">' + st + '</text>';
    s += '</g>';
    // cornice a tratti alternati (ogni passo della griglia) e bordo
    var cb = '', bw = 1.1;
    var tratti = function (v0, v1, lato) {
      for (var v = Math.floor(v0 / passo) * passo, n = 0; v < v1; v += passo) {
        var a = Math.max(v, v0), b = Math.min(v + passo, v1), nero = Math.round(v / passo) % 2 === 0; if (b <= a) continue;
        if (!nero) continue;
        if (lato === 'su') cb += '<rect x="' + f1(X(a)) + '" y="' + P.fy0 + '" width="' + f1((b - a) * k) + '" height="' + bw + '" fill="#000"/>';
        if (lato === 'giu') cb += '<rect x="' + f1(X(a)) + '" y="' + (P.fy1 - bw) + '" width="' + f1((b - a) * k) + '" height="' + bw + '" fill="#000"/>';
        if (lato === 'sx') cb += '<rect x="' + P.fx0 + '" y="' + f1(Y(b)) + '" width="' + bw + '" height="' + f1((b - a) * k) + '" fill="#000"/>';
        if (lato === 'dx') cb += '<rect x="' + (P.fx1 - bw) + '" y="' + f1(Y(b)) + '" width="' + bw + '" height="' + f1((b - a) * k) + '" fill="#000"/>';
      }
    };
    tratti(R.E0, R.E1, 'su'); tratti(R.E0, R.E1, 'giu'); tratti(R.N0, R.N1, 'sx'); tratti(R.N0, R.N1, 'dx');
    s += '<rect x="' + P.fx0 + '" y="' + P.fy0 + '" width="' + P.fw + '" height="' + P.fh + '" fill="none" stroke="#000" stroke-width=".35"/>';
    s += '<rect x="' + (P.fx0 + bw) + '" y="' + (P.fy0 + bw) + '" width="' + (P.fw - 2 * bw) + '" height="' + (P.fh - 2 * bw) + '" fill="none" stroke="#000" stroke-width=".2"/>' + cb;
    // coordinate complete sulle linee marcate: in alto l'Est, a sinistra il Nord (in verticale)
    for (var E2 = Math.ceil(R.E0 / forte) * forte; E2 <= R.E1; E2 += forte) s += '<text x="' + f1(X(E2)) + '" y="' + (P.fy0 - 1.8) + '" font-size="3.2" text-anchor="middle" fill="#000">' + etE(E2) + '</text>';
    for (var N2 = Math.ceil(R.N0 / forte) * forte; N2 <= R.N1; N2 += forte) s += '<text transform="translate(' + (P.fx0 - 2) + ' ' + f1(Y(N2)) + ') rotate(-90)" font-size="3.2" text-anchor="middle" fill="#000">' + etN(N2) + '</text>';
    s += '<text x="' + P.fx1 + '" y="' + (P.fy1 + 5) + '" font-size="3" text-anchor="end" fill="#000">WGS 84 / UTM zone ' + R.zona + (R.nord ? 'N' : 'S') + '</text>';
    s += '</svg>';
    return s;
  }

  function foglio2(R, WP) {
    var c = R.c, o = R.o, h = '<div class="f2"><h1>' + esc(o.titolo || c.nome || 'Cartina') + '</h1>';
    h += '<table><tr><th>Area operativa</th><th>Coordinate UTM (WGS 84, zona ' + R.zona + R.banda + ')</th></tr>';
    WP.aree.forEach(function (x) { h += '<tr><td>' + esc(x.p.nome) + '</td><td class="m">' + R.zona + R.banda + ' ' + etE(x.E) + ' ' + etN(x.N) + '</td></tr>'; });
    WP.simb.filter(function (x) { return x.g.nome; }).forEach(function (x) { h += '<tr><td>' + esc(x.g.nome) + '</td><td class="m">' + R.zona + R.banda + ' ' + etE(x.E) + ' ' + etN(x.N) + '</td></tr>'; });
    h += '</table></div>';
    return h;
  }

  function apri(c, o) {
    if (!c || !c.geo || !c.img) { alert('La cartina deve avere l\'immagine ed essere georeferenziata.'); return; }
    var R = prepara(c, o), WP = waypoint(R), P = R.P;
    var css = '@page{size:' + (o.formato || 'A4') + ' ' + (P.or === 'v' ? 'portrait' : 'landscape') + ';margin:0}' +
      'html,body{margin:0;padding:0;background:#888}body{font-family:Arial,Helvetica,sans-serif;color:#111}' +
      '.foglio{width:' + P.W + 'mm;height:' + P.H + 'mm;background:#fff;margin:0 auto 8mm;overflow:hidden;position:relative;page-break-after:always;break-after:page}' +
      '.foglio:last-child{page-break-after:auto;break-after:auto}.foglio>svg{display:block}' +
      '.f2{padding:16mm 16mm 10mm}h1{font-size:16pt;margin:0 0 6mm}h2{font-size:12pt;margin:6mm 0 2mm;border-bottom:.4mm solid #000}' +
      '.sub{margin:0 0 3mm;color:#333;font-size:9pt}table{width:100%;border-collapse:collapse;font-size:11pt}' +
      'th{text-align:left;background:#eee;border:.2mm solid #999;padding:2mm 3mm}td{border:.2mm solid #bbb;padding:2mm 3mm;vertical-align:middle}' +
      'td.n{font-weight:700;text-align:center;width:9mm}td.m{font-family:"Courier New",monospace;white-space:nowrap}td.ic{width:7mm}td small{color:#555}' +
      'tr{page-break-inside:avoid}.guida ol{font-size:9pt;line-height:1.45;padding-left:5mm}' +
      '.barra{position:sticky;top:0;background:#222;color:#fff;padding:8px 12px;font-size:14px;display:flex;gap:12px;align-items:center;z-index:2}.barra button{font-size:14px;padding:6px 14px;cursor:pointer}' +
      '@media print{html,body{background:#fff}.foglio{margin:0}.barra{display:none!important}}';
    var html = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>' + esc((o.titolo || c.nome || 'Cartina') + ' · scala 1:' + R.S) + '</title><style>' + css + '</style></head><body>' +
      '<div class="barra"><button onclick="window.print()">Stampa / Salva PDF</button><span>Formato ' + (o.formato || 'A4') + ' ' + (P.or === 'v' ? 'verticale' : 'orizzontale') + ' · scala 1:' + migl(R.S) + ' · nella stampa scegli "Salva come PDF", margini "Nessuno" e scala 100%.</span></div>' +
      '<div class="foglio">' + foglio1(R, WP) + '</div><div class="foglio">' + foglio2(R, WP) + '</div></body></html>';
    var w = window.open('', '_blank');
    if (!w) { alert('Il browser ha bloccato la nuova finestra: consenti i popup per questo sito e riprova.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    return R;
  }
  // scale possibili per un formato (per il menu): la più grande che ci sta e quelle più piccole
  function scalePossibili(c, o) { if (!c || !c.geo) return []; var R = prepara(c, Object.assign({}, o, { scala: 0 })); return SCALE.filter(function (s) { return s >= R.S; }); }
  window.AC_STAMPA = { apri: apri, mgrs: mgrs, scalePossibili: scalePossibili, prepara: prepara };
})();
