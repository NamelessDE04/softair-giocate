/* Airsoft Conflict — cartina da navigazione stampabile (PDF dalla stampa del browser).
   Foglio 1: cartina orientata sul nord della griglia UTM, griglia ogni 100 m (più marcata ogni km), etichette ai bordi,
   scala numerica e grafica, nord griglia / geografico / magnetico, datum e fuso, aree numerate, simboli, sentieri.
   Foglio 2: elenco dei waypoint (UTM, MGRS, lat/lon), legenda, come leggere una coordinata.
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
      var W = or === 'v' ? F[0] : F[1], H = or === 'v' ? F[1] : F[0], car = o.formato === 'A3' ? 40 : 34;
      var fx0 = 15, fy0 = 15, fx1 = W - 15, fy1 = H - 8 - car - 7;
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

  function foglio1(R, WP) {
    var P = R.P, k = R.k, X = R.X, Y = R.Y, A = R.A, c = R.c, o = R.o, s = '';
    s += '<svg xmlns="http://www.w3.org/2000/svg" width="' + P.W + 'mm" height="' + P.H + 'mm" viewBox="0 0 ' + P.W + ' ' + P.H + '" font-family="Arial, Helvetica, sans-serif">';
    s += '<defs><clipPath id="cornice"><rect x="' + P.fx0 + '" y="' + P.fy0 + '" width="' + P.fw + '" height="' + P.fh + '"/></clipPath></defs>';
    // cartina: pixel -> mm
    var m = [A.a * k, -A.b * k, A.c * k, -A.d * k, X(A.e), Y(A.f)].map(function (v) { return v.toFixed(5); }).join(' ');
    s += '<g clip-path="url(#cornice)"><rect x="' + P.fx0 + '" y="' + P.fy0 + '" width="' + P.fw + '" height="' + P.fh + '" fill="#f3f1ea"/>';
    s += '<image href="' + c.img + '" x="0" y="0" width="' + c.w + '" height="' + c.h + '" transform="matrix(' + m + ')" preserveAspectRatio="none"/>';
    // griglia UTM
    var passo = 100; while (passo * k < 3) passo = passo === 100 ? 200 : passo === 200 ? 500 : passo * 2;
    var gs = '';
    for (var E = Math.ceil(R.E0 / passo) * passo; E <= R.E1; E += passo) { var km = E % 1000 === 0; gs += '<line x1="' + f1(X(E)) + '" y1="' + P.fy0 + '" x2="' + f1(X(E)) + '" y2="' + P.fy1 + '" stroke="' + (km ? '#0a2a6b' : '#1d4fa8') + '" stroke-width="' + (km ? .35 : .15) + '" stroke-opacity="' + (km ? .9 : .7) + '"/>'; }
    for (var N = Math.ceil(R.N0 / passo) * passo; N <= R.N1; N += passo) { var km2 = N % 1000 === 0; gs += '<line x1="' + P.fx0 + '" y1="' + f1(Y(N)) + '" x2="' + P.fx1 + '" y2="' + f1(Y(N)) + '" stroke="' + (km2 ? '#0a2a6b' : '#1d4fa8') + '" stroke-width="' + (km2 ? .35 : .15) + '" stroke-opacity="' + (km2 ? .9 : .7) + '"/>'; }
    s += gs;
    // sentieri
    if (o.sentieri !== false) (c.tracce || []).filter(function (t) { return !t.nascosta; }).forEach(function (t) {
      var d = t.pts.map(function (p, i) { var u = R.utm(p[0], p[1]); return (i ? 'L' : 'M') + f1(X(u.E)) + ' ' + f1(Y(u.N)); }).join('');
      s += '<path d="' + d + '" fill="none" stroke="#fff" stroke-width=".9" stroke-opacity=".8" stroke-linejoin="round" stroke-linecap="round"/>';
      s += '<path d="' + d + '" fill="none" stroke="#8a2b0f" stroke-width=".5" stroke-dasharray="1.6 .9" stroke-linejoin="round" stroke-linecap="round"/>';
    });
    // aree numerate
    WP.aree.forEach(function (x) {
      var p = x.p, cx = X(x.E), cy = Y(x.N), r = Math.max(1.6, (p.raggio || 30) * k);
      var col = p.tipo === 'mob' ? (p.fazione === 'rossa' ? '#c0281b' : '#1f64c2') : p.tipo === 'chiave' ? '#b8860b' : '#2b2b2b';
      s += '<circle cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="' + f1(r) + '" fill="' + col + '" fill-opacity=".12" stroke="' + col + '" stroke-width=".45"/>';
      s += '<circle cx="' + f1(cx) + '" cy="' + f1(cy) + '" r=".45" fill="' + col + '"/>';
      var tw = 1.4 + x.n.length * 1.5;
      s += '<rect x="' + f1(cx + 1.2) + '" y="' + f1(cy - 4.2) + '" width="' + f1(tw) + '" height="3.2" rx=".5" fill="' + col + '"/>';
      s += '<text x="' + f1(cx + 1.2 + tw / 2) + '" y="' + f1(cy - 1.85) + '" font-size="2.5" font-weight="700" fill="#fff" text-anchor="middle">' + x.n + '</text>';
      s += '<text x="' + f1(cx) + '" y="' + f1(cy + r + 2.6) + '" font-size="2.3" font-weight="700" fill="#111" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width=".7">' + esc((p.nome || '').toUpperCase()) + '</text>';
    });
    // simboli
    if (window.AC_SIMB) WP.simb.forEach(function (x) {
      var g = x.g, cx = X(x.E), cy = Y(x.N), r = 2.3 * (g.dim || 1) * (o.formato === 'A3' ? 1.15 : 1);
      s += window.AC_SIMB.svg(g.sym, cx, cy, r, { k: .2 });
      s += '<text x="' + f1(cx + r + .8) + '" y="' + f1(cy - r + 1.4) + '" font-size="1.9" font-weight="700" fill="#111" paint-order="stroke" stroke="#fff" stroke-width=".6">' + x.n + (g.nome ? ' · ' + esc(g.nome) : '') + '</text>';
    });
    s += '</g>';
    // cornice ed etichette della griglia (fuori dalla cornice)
    s += '<rect x="' + P.fx0 + '" y="' + P.fy0 + '" width="' + P.fw + '" height="' + P.fh + '" fill="none" stroke="#000" stroke-width=".5"/>';
    var lab = '', piccole = passo * k >= 6;
    for (var E2 = Math.ceil(R.E0 / passo) * passo; E2 <= R.E1; E2 += passo) {
      var x2 = f1(X(E2)), kmE = E2 % 1000 === 0, t = kmE ? String(Math.floor(E2 / 1000) % 1000) : String((E2 % 1000) / 100);
      if (!kmE && !piccole) continue;
      [P.fy0 - 1.8, P.fy1 + 4.2].forEach(function (yy) { lab += '<text x="' + x2 + '" y="' + yy + '" font-size="' + (kmE ? 2.8 : 1.9) + '" font-weight="' + (kmE ? 700 : 400) + '" text-anchor="middle" fill="' + (kmE ? '#000' : '#333') + '">' + t + '</text>'; });
      lab += '<line x1="' + x2 + '" y1="' + (P.fy0 - .9) + '" x2="' + x2 + '" y2="' + P.fy0 + '" stroke="#000" stroke-width=".25"/><line x1="' + x2 + '" y1="' + P.fy1 + '" x2="' + x2 + '" y2="' + (P.fy1 + .9) + '" stroke="#000" stroke-width=".25"/>';
    }
    for (var N2 = Math.ceil(R.N0 / passo) * passo; N2 <= R.N1; N2 += passo) {
      var y2 = Y(N2), kmN = N2 % 1000 === 0, t2 = kmN ? String(Math.floor(N2 / 1000) % 1000) : String((N2 % 1000) / 100);
      if (!kmN && !piccole) continue;
      lab += '<text x="' + (P.fx0 - 1.2) + '" y="' + f1(y2 + .9) + '" font-size="' + (kmN ? 2.8 : 1.9) + '" font-weight="' + (kmN ? 700 : 400) + '" text-anchor="end" fill="' + (kmN ? '#000' : '#333') + '">' + t2 + '</text>';
      lab += '<text x="' + (P.fx1 + 1.2) + '" y="' + f1(y2 + .9) + '" font-size="' + (kmN ? 2.8 : 1.9) + '" font-weight="' + (kmN ? 700 : 400) + '" fill="' + (kmN ? '#000' : '#333') + '">' + t2 + '</text>';
    }
    s += lab;
    // coordinate complete agli angoli
    var e0 = Math.ceil(R.E0 / 1000) * 1000, n0 = Math.ceil(R.N0 / 1000) * 1000;
    s += '<text x="' + P.fx0 + '" y="' + (P.fy0 - 4.6) + '" font-size="2.2" fill="#000">UTM ' + R.zona + R.banda + ' · Est ' + migl(e0) + ' m (etichetta ' + (Math.floor(e0 / 1000) % 1000) + ') · Nord ' + migl(n0) + ' m (etichetta ' + (Math.floor(n0 / 1000) % 1000) + ')</text>';
    s += '<text x="' + P.fx1 + '" y="' + (P.fy0 - 4.6) + '" font-size="2.2" fill="#000" text-anchor="end">Griglia ogni ' + passo + ' m · in grassetto i chilometri</text>';
    // ---- cartiglio
    var by = P.fy1 + 9, bh = P.car - 2, bx = 8, bw = P.W - 16;
    s += '<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" fill="#fff" stroke="#000" stroke-width=".35"/>';
    var c1 = bx + 4, col2 = bx + bw * .34, col3 = bx + bw * .62;
    s += '<text x="' + c1 + '" y="' + (by + 7) + '" font-size="' + (o.formato === 'A3' ? 6 : 5) + '" font-weight="700">' + esc(o.titolo || c.nome || 'Cartina') + '</text>';
    s += '<text x="' + c1 + '" y="' + (by + 12.5) + '" font-size="2.6" fill="#333">Airsoft Conflict · ASD Tauri Softair</text>';
    s += '<text x="' + c1 + '" y="' + (by + 17) + '" font-size="2.4" fill="#333">Stampata il ' + new Date().toLocaleDateString('it-IT') + ' · waypoint sul foglio 2</text>';
    s += '<text x="' + c1 + '" y="' + (by + 22) + '" font-size="2.4" fill="#333">Datum WGS 84 · Proiezione UTM · Fuso ' + R.zona + R.banda + '</text>';
    s += '<text x="' + c1 + '" y="' + (by + 26.5) + '" font-size="2.4" fill="#333">Coordinate: prima Est (→), poi Nord (↑)</text>';
    // scala
    s += '<text x="' + col2 + '" y="' + (by + 7) + '" font-size="4.2" font-weight="700">Scala 1:' + migl(R.S) + '</text>';
    s += '<text x="' + col2 + '" y="' + (by + 11.5) + '" font-size="2.3" fill="#333">1 cm sulla carta = ' + migl(R.S / 100) + ' m · un quadretto = ' + passo + ' × ' + passo + ' m</text>';
    var tot = [100, 200, 250, 500, 1000, 2000].filter(function (v) { return v * k <= (col3 - col2 - 12); }).pop() || 100, seg = tot >= 250 ? tot / 5 : tot / 4;
    var sy = by + 15, sx = col2;
    for (var i = 0; i * seg < tot - 1e-6; i++) s += '<rect x="' + f1(sx + i * seg * k) + '" y="' + sy + '" width="' + f1(seg * k) + '" height="2" fill="' + (i % 2 ? '#fff' : '#000') + '" stroke="#000" stroke-width=".25"/>';
    for (var j = 0; j * seg <= tot + 1e-6; j++) s += '<text x="' + f1(sx + j * seg * k) + '" y="' + (sy + 5.2) + '" font-size="2.1" text-anchor="middle">' + Math.round(j * seg) + (j * seg >= tot - 1e-6 ? ' m' : '') + '</text>';
    s += '<text x="' + col2 + '" y="' + (by + 26.5) + '" font-size="2.2" fill="#333">Aree numerate · simboli S1, S2… · sentieri tratteggiati</text>';
    // nord: griglia, geografico, magnetico
    var nx = col3 + 7, ny = by + bh - 5, L = bh - 11, decl = parseFloat(String(o.decl || '').replace(',', '.')) || 0;
    var freccia = function (ang, col, lab, tratt, f) {
      var r = ang * Math.PI / 180, x2 = nx + Math.sin(r) * L * (f || 1), y2 = ny - Math.cos(r) * L * (f || 1);
      return '<line x1="' + nx + '" y1="' + ny + '" x2="' + f1(x2) + '" y2="' + f1(y2) + '" stroke="' + col + '" stroke-width=".45"' + (tratt ? ' stroke-dasharray="1 .7"' : '') + '/>' +
        '<text x="' + f1(x2) + '" y="' + f1(y2 - 1.2) + '" font-size="2.3" font-weight="700" text-anchor="middle" fill="' + col + '">' + lab + '</text>';
    };
    s += freccia(0, '#0a2a6b', 'NG', false, 1) + freccia(R.conv, '#000', '★N', false, .78) + (o.decl ? freccia(R.conv + decl, '#b3261e', 'NM', true, .56) : '');
    var tx = col3 + 18;
    s += '<text x="' + tx + '" y="' + (by + 7) + '" font-size="2.4" font-weight="700">Nord</text>';
    s += '<text x="' + tx + '" y="' + (by + 11.5) + '" font-size="2.2">NG nord della griglia (in alto)</text>';
    s += '<text x="' + tx + '" y="' + (by + 15.5) + '" font-size="2.2">★N nord geografico: ' + Math.abs(R.conv).toFixed(1).replace('.', ',') + '° ' + (R.conv >= 0 ? 'a est' : 'a ovest') + ' del NG</text>';
    if (o.decl) s += '<text x="' + tx + '" y="' + (by + 19.5) + '" font-size="2.2" fill="#b3261e">NM nord magnetico: declinazione ' + esc(o.decl) + '</text>';
    s += '<text x="' + tx + '" y="' + (by + 24) + '" font-size="1.9" fill="#555">Gli angoli sono indicativi: al campo</text>';
    s += '<text x="' + tx + '" y="' + (by + 27) + '" font-size="1.9" fill="#555">controllare la bussola con un punto noto.</text>';
    s += '</svg>';
    return s;
  }

  function foglio2(R, WP) {
    var c = R.c, o = R.o, h = '<div class="f2"><h1>' + esc(o.titolo || c.nome || 'Cartina') + ' · waypoint</h1>';
    h += '<p class="sub">Datum WGS 84 · UTM fuso ' + R.zona + R.banda + ' · Scala 1:' + migl(R.S) + ' · Griglia ogni 100 m · MGRS a 10 m</p>';
    if (WP.aree.length) {
      h += '<h2>Aree</h2><table><tr><th>N°</th><th>Nome</th><th>Tipo</th><th>UTM Est</th><th>UTM Nord</th><th>MGRS</th><th>Lat, Lon</th></tr>';
      WP.aree.forEach(function (x) {
        var p = x.p, alt = p.nomi && (p.nomi.blu || p.nomi.rossa) ? '<br><small>' + esc([p.nomi.blu && 'blu: ' + p.nomi.blu, p.nomi.rossa && 'rossi: ' + p.nomi.rossa].filter(Boolean).join(' · ')) + '</small>' : '';
        var tipo = (NOMI_TIPO[p.tipo] || 'Area') + (p.tipo === 'mob' && p.fazione ? ' ' + p.fazione : '') + (p.raggio ? ' · r ' + p.raggio + ' m' : '');
        h += '<tr><td class="n">' + x.n + '</td><td><b>' + esc(p.nome) + '</b>' + alt + '</td><td>' + esc(tipo) + '</td><td class="m">' + migl(x.E) + '</td><td class="m">' + migl(x.N) + '</td><td class="m">' + mgrs(p.lat, p.lon, 4) + '</td><td class="m">' + p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) + '</td></tr>';
      });
      h += '</table>';
    }
    if (WP.simb.length) {
      h += '<h2>Simboli</h2><table><tr><th>N°</th><th></th><th>Simbolo</th><th>Scritta</th><th>UTM Est</th><th>UTM Nord</th><th>MGRS</th></tr>';
      WP.simb.forEach(function (x) {
        var g = x.g, sb = window.AC_SIMB && window.AC_SIMB.PER_ID[g.sym];
        h += '<tr><td class="n">' + x.n + '</td><td class="ic">' + (window.AC_SIMB ? window.AC_SIMB.icona(g.sym, 20).replace('<svg ', '<svg style="filter:none" ') : '') + '</td><td>' + esc(sb ? sb.nome : g.sym) + '</td><td>' + esc(g.nome || '') + '</td><td class="m">' + migl(x.E) + '</td><td class="m">' + migl(x.N) + '</td><td class="m">' + mgrs(g.lat, g.lon, 4) + '</td></tr>';
      });
      h += '</table>';
    }
    var sent = (o.sentieri === false ? [] : c.tracce || []).filter(function (t) { return !t.nascosta; });
    if (sent.length) {
      h += '<h2>Sentieri</h2><table><tr><th>Nome</th><th>Lunghezza</th><th>Da</th><th>A</th></tr>';
      sent.forEach(function (t) {
        var L = 0; for (var i = 1; i < t.pts.length; i++) { var a = R.utm(t.pts[i - 1][0], t.pts[i - 1][1]), b = R.utm(t.pts[i][0], t.pts[i][1]); L += Math.hypot(b.E - a.E, b.N - a.N); }
        var p0 = R.utm(t.pts[0][0], t.pts[0][1]), p1 = R.utm(t.pts[t.pts.length - 1][0], t.pts[t.pts.length - 1][1]);
        h += '<tr><td>' + esc(t.nome) + '</td><td class="m">' + (L >= 1000 ? (L / 1000).toFixed(2).replace('.', ',') + ' km' : Math.round(L) + ' m') + '</td><td class="m">' + migl(p0.E) + ' / ' + migl(p0.N) + '</td><td class="m">' + migl(p1.E) + ' / ' + migl(p1.N) + '</td></tr>';
      });
      h += '</table>';
    }
    var es = WP.aree[0];
    h += '<div class="guida"><h2>Come leggere una coordinata</h2><ol>' +
      '<li>Trova il quadretto: <b>prima leggi verso destra</b> il numero della linea verticale a sinistra del punto (Est), <b>poi verso l\'alto</b> quello della linea orizzontale sotto il punto (Nord).</li>' +
      '<li>Ogni quadretto è di 100 × 100 m: stima i decimi dentro il quadretto (10 m) per avere 4 cifre per lato, come nella colonna MGRS.</li>' +
      '<li>Le etichette in grassetto ai bordi sono i chilometri; i numeri piccoli sono le centinaia di metri.</li>' +
      (es ? '<li>Esempio: <b>' + esc(es.p.nome) + '</b> è a Est ' + migl(es.E) + ', Nord ' + migl(es.N) + ', cioè <b>' + mgrs(es.p.lat, es.p.lon, 4) + '</b>.</li>' : '') +
      '<li>Con il GPS o il telefono imposta il formato <b>UTM/UPS</b> (o MGRS) e il datum <b>WGS 84</b>: i numeri coincidono con la carta.</li></ol></div>';
    h += '</div>';
    return h;
  }

  function apri(c, o) {
    if (!c || !c.geo || !c.img) { alert('La cartina deve avere l\'immagine ed essere georeferenziata.'); return; }
    var R = prepara(c, o), WP = waypoint(R), P = R.P;
    var css = '@page{size:' + (o.formato || 'A4') + ' ' + (P.or === 'v' ? 'portrait' : 'landscape') + ';margin:0}' +
      'html,body{margin:0;padding:0;background:#888}body{font-family:Arial,Helvetica,sans-serif;color:#111}' +
      '.foglio{width:' + P.W + 'mm;height:' + P.H + 'mm;background:#fff;margin:0 auto 8mm;overflow:hidden;position:relative;page-break-after:always;break-after:page}' +
      '.foglio:last-child{page-break-after:auto;break-after:auto}.foglio>svg{display:block}' +
      '.f2{padding:14mm 14mm 10mm}h1{font-size:18pt;margin:0 0 2mm}h2{font-size:12pt;margin:6mm 0 2mm;border-bottom:.4mm solid #000}' +
      '.sub{margin:0 0 3mm;color:#333;font-size:9pt}table{width:100%;border-collapse:collapse;font-size:8.5pt}' +
      'th{text-align:left;background:#eee;border:.2mm solid #999;padding:1mm 1.5mm}td{border:.2mm solid #bbb;padding:1mm 1.5mm;vertical-align:middle}' +
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
