/* Coordinate: UTM WGS84 <-> latitudine/longitudine, e georeferenziazione di un'immagine
   da punti di controllo (pixel dell'immagine + coordinate reali). */
(function () {
  'use strict';
  var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  var e2 = f * (2 - f), ep2 = e2 / (1 - e2), D = Math.PI / 180;

  function zonaDi(lon) { return Math.floor((lon + 180) / 6) + 1; }

  // latitudine/longitudine (gradi) -> { zona, nord, E, N } in metri
  function daLatLon(lat, lon, zonaForzata) {
    var zona = zonaForzata || zonaDi(lon), lon0 = ((zona - 1) * 6 - 180 + 3) * D;
    var phi = lat * D, lam = lon * D;
    var N = a / Math.sqrt(1 - e2 * Math.sin(phi) * Math.sin(phi));
    var T = Math.tan(phi) * Math.tan(phi), C = ep2 * Math.cos(phi) * Math.cos(phi), A = Math.cos(phi) * (lam - lon0);
    var M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * phi
      - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * phi)
      + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * phi)
      - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * phi));
    var E = k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120) + 500000;
    var Nn = k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6) / 720));
    if (lat < 0) Nn += 10000000;
    return { zona: zona, nord: lat >= 0, E: E, N: Nn };
  }

  // { zona, nord, E, N } -> { lat, lon } in gradi
  function aLatLon(zona, nord, E, Nn) {
    var x = E - 500000, y = nord ? Nn : Nn - 10000000;
    var lon0 = ((zona - 1) * 6 - 180 + 3) * D;
    var M = y / k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
    var e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    var phi1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
      + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) * Math.sin(phi1)), T1 = Math.tan(phi1) * Math.tan(phi1);
    var C1 = ep2 * Math.cos(phi1) * Math.cos(phi1), R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1) * Math.sin(phi1), 1.5);
    var Dd = x / (N1 * k0);
    var lat = phi1 - (N1 * Math.tan(phi1) / R1) * (Dd * Dd / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(Dd, 4) / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(Dd, 6) / 720);
    var lon = lon0 + (Dd - (1 + 2 * T1 + C1) * Math.pow(Dd, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(Dd, 5) / 120) / Math.cos(phi1);
    return { lat: lat / D, lon: lon / D };
  }

  // risolve un sistema lineare (eliminazione di Gauss)
  function risolvi(A, b) {
    var n = b.length, M = A.map(function (r, i) { return r.concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      var t = M[c]; M[c] = M[p]; M[p] = t;
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (r = 0; r < n; r++) if (r !== c) { var k = M[r][c] / M[c][c]; for (var j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
    }
    return M.map(function (r, i) { return r[n] / r[i]; });
  }
  // minimi quadrati: righe X (n x m), valori y -> coefficienti
  function mq(X, y) {
    var m = X[0].length, A = [], b = [];
    for (var i = 0; i < m; i++) { A.push([]); b.push(0); for (var j = 0; j < m; j++) A[i].push(0); }
    X.forEach(function (r, k) { for (var i = 0; i < m; i++) { b[i] += r[i] * y[k]; for (var j = 0; j < m; j++) A[i][j] += r[i] * r[j]; } });
    return risolvi(A, b);
  }

  /* Georeferenziazione: punti [{x,y,lat,lon}] -> { cx, cy, mPerPx, errori:[m], medio }
     cx/cy: pixel = cx[0]*lon + cx[1]*lat + cx[2] (stessa forma usata dal motore di gioco).
     2 punti: scala + rotazione; da 3 punti: trasformazione affine completa. */
  function georef(punti) {
    if (!punti || punti.length < 2) return null;
    var lat0 = 0, lon0 = 0; punti.forEach(function (p) { lat0 += p.lat; lon0 += p.lon; }); lat0 /= punti.length; lon0 /= punti.length;
    var R = 6371000, kE = Math.cos(lat0 * D) * R * D, kN = R * D;
    var en = punti.map(function (p) { return { E: (p.lon - lon0) * kE, N: (p.lat - lat0) * kN, x: p.x, y: p.y }; });
    var a1, b1, c1, a2, b2, c2;
    if (punti.length === 2) {
      // x = p*E + q*N + c ; y = q*E - p*N + d  (similitudine, asse y dell'immagine verso il basso)
      var X = [], y = [];
      en.forEach(function (q) { X.push([q.E, q.N, 1, 0]); y.push(q.x); X.push([-q.N, q.E, 0, 1]); y.push(q.y); });
      var s = mq(X, y); if (!s) return null;
      a1 = s[0]; b1 = s[1]; c1 = s[2]; a2 = s[1]; b2 = -s[0]; c2 = s[3];
    } else {
      var Xa = en.map(function (q) { return [q.E, q.N, 1]; });
      var sx = mq(Xa, en.map(function (q) { return q.x; })), sy = mq(Xa, en.map(function (q) { return q.y; }));
      if (!sx || !sy) return null;
      a1 = sx[0]; b1 = sx[1]; c1 = sx[2]; a2 = sy[0]; b2 = sy[1]; c2 = sy[2];
    }
    var det = Math.abs(a1 * b2 - b1 * a2); if (!det) return null;
    var mPerPx = 1 / Math.sqrt(det);
    var cx = [a1 * kE, b1 * kN, c1 - a1 * kE * lon0 - b1 * kN * lat0];
    var cy = [a2 * kE, b2 * kN, c2 - a2 * kE * lon0 - b2 * kN * lat0];
    var errori = punti.map(function (p) {
      var x = cx[0] * p.lon + cx[1] * p.lat + cx[2], yy = cy[0] * p.lon + cy[1] * p.lat + cy[2];
      return Math.hypot(x - p.x, yy - p.y) * mPerPx;
    });
    return { cx: cx, cy: cy, mPerPx: mPerPx, errori: errori, medio: errori.reduce(function (s, e) { return s + e; }, 0) / errori.length };
  }
  function aPixel(geo, lat, lon) { return { x: geo.cx[0] * lon + geo.cx[1] * lat + geo.cx[2], y: geo.cy[0] * lon + geo.cy[1] * lat + geo.cy[2] }; }
  function daPixel(geo, x, y) {
    var a_ = geo.cx[0], b = geo.cx[1], d = geo.cy[0], e = geo.cy[1], X = x - geo.cx[2], Y = y - geo.cy[2], det = a_ * e - b * d;
    return { lon: (X * e - b * Y) / det, lat: (a_ * Y - d * X) / det };
  }

  window.AC_UTM = { daLatLon: daLatLon, aLatLon: aLatLon, zonaDi: zonaDi, georef: georef, aPixel: aPixel, daPixel: daPixel };
})();
