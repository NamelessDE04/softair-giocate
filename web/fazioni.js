/* Softair 4.0 — giocate a fazioni (modello Arma Reforger: Conflict).
   Lo stato della partita si ricalcola sempre dall'elenco degli eventi con il loro orario:
   - { tipo:'zona', uid, team, pt, t }      il giocatore è nel cerchio del punto pt (pt null = fuori); ripetuto ogni 45 s
   - { tipo:'ordine', team, pt, azione, t } ordine del comandante umano alla sua fazione
   Così ogni telefono arriva allo stesso risultato anche se gli eventi arrivano in ritardo (zone senza rete). */
(function () {
  'use strict';

  var REGOLE = { raggio: 30, tConquista: 300, tNeutro: 180, minGiocatori: 1, chiavi: 2, tVittoria: 600 };
  var SCADENZA = 100000;   // una presenza vale 100 s dopo l'ultimo segnale
  var PASSO = 2000;        // il motore ragiona a passi di 2 s

  function regole(g) { return Object.assign({}, REGOLE, g.regole || {}); }
  function punto(campo, id) { return campo.punti.filter(function (p) { return p.id === id; })[0]; }
  function vicini(campo, id) {
    var v = []; campo.link.forEach(function (l) { if (l[0] === id) v.push(l[1]); else if (l[1] === id) v.push(l[0]); }); return v;
  }
  function px(campo, lat, lon) { var c = campo.geo; return { x: c.cx[0] * lon + c.cx[1] * lat + c.cx[2], y: c.cy[0] * lon + c.cy[1] * lat + c.cy[2] }; }
  function latlon(campo, x, y) {
    var c = campo.geo, a = c.cx[0], b = c.cx[1], d = c.cy[0], e = c.cy[1], X = x - c.cx[2], Y = y - c.cy[2], det = a * e - b * d;
    return { lon: (X * e - b * Y) / det, lat: (a * Y - d * X) / det };
  }
  function metri(a, b) {
    var R = 6371000, la = (a.lat + b.lat) / 2 * Math.PI / 180;
    var dx = (b.lon - a.lon) * Math.PI / 180 * Math.cos(la) * R, dy = (b.lat - a.lat) * Math.PI / 180 * R;
    return Math.sqrt(dx * dx + dy * dy);
  }
  // in quale cerchio si trova una posizione (il più vicino)
  function zonaDi(g, campo, pos) {
    var r = regole(g).raggio, best = null, bd = 1e9;
    campo.punti.forEach(function (p) { if (p.tipo === 'mob') return; var d = metri(pos, p); if (d <= r && d < bd) { bd = d; best = p.id; } });
    return best;
  }

  // ---------- motore
  function stato(g, campo, eventi, tNow) {
    var R = regole(g), owner = {}, prog = {}, conteso = {}, presenti = {};
    var squadre = g.fazioni.map(function (f) { return f.team; });
    campo.punti.forEach(function (p) { owner[p.id] = null; });
    g.fazioni.forEach(function (f) { owner[f.mob] = f.team; (f.partenza || []).forEach(function (q) { owner[q] = f.team; }); });
    var chiavi = campo.punti.filter(function (p) { return p.tipo === 'chiave'; }).map(function (p) { return p.id; });
    var ev = eventi.filter(function (e) { return e.tipo === 'zona'; }).sort(function (a, b) { return a.t - b.t; });
    var ultimo = {}, k = 0, trans = [], vitDa = {}, vincitore = null, tFine = g.inizio + g.durata * 60000;
    var fine = Math.min(tNow, tFine);
    function attaccabile(team, pid) { return vicini(campo, pid).some(function (q) { return owner[q] === team; }); }
    function conta(t) {
      var c = {}; campo.punti.forEach(function (p) { c[p.id] = {}; });
      Object.keys(ultimo).forEach(function (u) {
        var e = ultimo[u]; if (!e.pt || t - e.t > SCADENZA || !c[e.pt]) return;
        c[e.pt][e.team] = (c[e.pt][e.team] || 0) + 1;
      });
      return c;
    }
    for (var t = g.inizio; t <= fine && !vincitore; t += PASSO) {
      while (k < ev.length && ev[k].t <= t) { ultimo[ev[k].uid] = ev[k]; k++; }
      presenti = conta(t);
      campo.punti.forEach(function (p) {
        if (p.tipo === 'mob') return;
        var pres = presenti[p.id], qui = Object.keys(pres).filter(function (s) { return pres[s] > 0 && squadre.indexOf(s) >= 0; });
        conteso[p.id] = qui.length > 1;
        if (qui.length > 1) return;                       // conteso: tutto fermo
        var pr = prog[p.id];
        if (qui.length === 1) {
          var X = qui[0], n = pres[X];
          if (owner[p.id] === X) { if (pr && pr.team !== X) { pr.v -= PASSO; if (pr.v <= 0) delete prog[p.id]; } return; }
          if (!attaccabile(X, p.id) || n < R.minGiocatori) return;
          var rate = Math.min(2, 1 + 0.5 * (n - 1));
          if (!pr || pr.team !== X) {
            pr = prog[p.id] = { team: X, v: 0 };
            trans.push({ t: t, tipo: owner[p.id] ? 'attacco' : 'avanzata', pt: p.id, team: X, contro: owner[p.id] });
          }
          pr.v += rate * PASSO;
          var serve = (owner[p.id] ? R.tConquista : R.tNeutro) * 1000;
          if (pr.v >= serve) {
            trans.push({ t: t, tipo: 'conquista', pt: p.id, team: X, contro: owner[p.id] });
            owner[p.id] = X; delete prog[p.id];
          }
        } else if (pr) { pr.v -= PASSO / 2; if (pr.v <= 0) delete prog[p.id]; }
      });
      squadre.forEach(function (s) {
        var n = chiavi.filter(function (c) { return owner[c] === s; }).length;
        if (n >= R.chiavi) {
          if (vitDa[s] == null) { vitDa[s] = t; trans.push({ t: t, tipo: 'contovittoria', team: s }); }
          if (t - vitDa[s] >= R.tVittoria * 1000) { vincitore = s; trans.push({ t: t, tipo: 'vittoria', team: s }); }
        } else if (vitDa[s] != null) { vitDa[s] = null; trans.push({ t: t, tipo: 'stopvittoria', team: s }); }
      });
    }
    if (!vincitore && tNow >= tFine) {
      var conti = squadre.map(function (s) { return { s: s, n: chiavi.filter(function (c) { return owner[c] === s; }).length, tot: Object.keys(owner).filter(function (q) { return owner[q] === s; }).length }; })
        .sort(function (a, b) { return b.n - a.n || b.tot - a.tot; });
      if (conti.length > 1 && (conti[0].n > conti[1].n || conti[0].tot > conti[1].tot)) { vincitore = conti[0].s; trans.push({ t: tFine, tipo: 'vittoria', team: vincitore, aTempo: true }); }
      else trans.push({ t: tFine, tipo: 'pareggio' });
    }
    var serveDi = function (pid) { return (owner[pid] ? R.tConquista : R.tNeutro) * 1000; };
    return {
      owner: owner, prog: prog, conteso: conteso, presenti: presenti, chiavi: chiavi, transizioni: trans, vincitore: vincitore,
      finita: !!vincitore || tNow >= tFine, regole: R, serveDi: serveDi,
      attaccabile: function (team, pid) { return vicini(campo, pid).some(function (q) { return owner[q] === team; }); },
      chiaviDi: function (s) { return chiavi.filter(function (c) { return owner[c] === s; }).length; },
      vittoriaTra: function (s) { return vitDa[s] == null ? null : vitDa[s] + R.tVittoria * 1000 - Math.min(tNow, tFine); }
    };
  }

  // ---------- comandante automatico: ordini ricavati dallo stato, uguali su ogni telefono della fazione
  function distanzaHop(campo, da, a) {
    var vis = {}; vis[da] = 0; var coda = [da];
    while (coda.length) { var x = coda.shift(); if (x === a) return vis[x]; vicini(campo, x).forEach(function (y) { if (vis[y] == null) { vis[y] = vis[x] + 1; coda.push(y); } }); }
    return 99;
  }
  function ordiniIA(g, campo, st, team) {
    var f = g.fazioni.filter(function (x) { return x.team === team; })[0], nemici = g.fazioni.filter(function (x) { return x.team !== team; });
    var o = [], nome = function (id) { return punto(campo, id).nome; };
    Object.keys(st.prog).forEach(function (pid) {
      var pr = st.prog[pid];
      if (st.owner[pid] === team && pr.team !== team) o.push({ prio: punto(campo, pid).tipo === 'chiave' ? 9 : 6, azione: 'difendi', pt: pid, testo: nome(pid) + ' sotto attacco: serve rinforzo!' });
    });
    Object.keys(st.conteso).forEach(function (pid) {
      if (st.conteso[pid] && st.owner[pid] === team) o.push({ prio: 7, azione: 'difendi', pt: pid, testo: 'Scontro a ' + nome(pid) + ': tenete la posizione' });
    });
    nemici.forEach(function (n) {
      var tra = st.vittoriaTra(n.team);
      if (tra != null) {
        var bersaglio = st.chiavi.filter(function (c) { return st.owner[c] === n.team && st.attaccabile(team, c); })[0];
        if (bersaglio) o.push({ prio: 10, azione: 'attacca', pt: bersaglio, testo: 'Il nemico vince tra ' + mmss(tra) + ': attaccate ' + nome(bersaglio) + '!' });
      }
    });
    var mia = st.vittoriaTra(team);
    if (mia != null) o.push({ prio: 8, azione: 'tieni', testo: 'Tenete i punti chiave: vittoria tra ' + mmss(mia) });
    var libere = st.chiavi.filter(function (c) { return st.owner[c] !== team && st.attaccabile(team, c); })
      .sort(function (a, b) { return distanzaHop(campo, f.mob, a) - distanzaHop(campo, f.mob, b); });
    if (libere.length) o.push({ prio: 5, azione: 'attacca', pt: libere[0], testo: (st.owner[libere[0]] ? 'Attaccate ' : 'Conquistate ') + nome(libere[0]) + ' (punto chiave)' });
    else {
      // nessuna chiave raggiungibile: allargare la rete verso la chiave più vicina
      var verso = campo.punti.filter(function (p) { return p.tipo !== 'mob' && st.owner[p.id] !== team && st.attaccabile(team, p.id); })
        .sort(function (a, b) { return Math.min.apply(null, st.chiavi.map(function (c) { return distanzaHop(campo, a.id, c); })) - Math.min.apply(null, st.chiavi.map(function (c) { return distanzaHop(campo, b.id, c); })); })[0];
      if (verso) o.push({ prio: 4, azione: 'attacca', pt: verso.id, testo: 'Prendete ' + verso.nome + ' per aprire la strada' });
    }
    return o.sort(function (a, b) { return b.prio - a.prio; }).slice(0, 2);
  }
  function ordiniUmani(eventi, team) {
    return eventi.filter(function (e) { return e.tipo === 'ordine' && e.team === team; }).sort(function (a, b) { return b.t - a.t; }).slice(0, 2)
      .map(function (e) { return { azione: e.azione, pt: e.pt, testo: e.testo, t: e.t }; });
  }
  function mmss(ms) { ms = Math.max(0, ms); var s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

  // ---------- mappa di gioco
  /* opts: { g, campo, team (la mia fazione), uid, colori:{team:hex}, nomi:{team:nome}, ora():ms,
             comandante: bool (sono io il comandante umano), onOrdine(pt, azione), onTocco(lat,lon) (solo prova),
             gps: bool, onZona(pt) } */
  function vista(box, opts) {
    var campo = opts.campo, g = opts.g;
    box.innerHTML = '';
    box.classList.add('fz');
    var bar = el('div', 'fz-bar'), mapBox = el('div', 'fz-map'), inner = el('div', 'fz-inner'), img = new Image();
    img.src = campo.img; img.className = 'fz-img'; img.draggable = false;
    var svgNS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + campo.w + ' ' + campo.h); svg.setAttribute('class', 'fz-svg');
    inner.style.width = campo.w + 'px'; inner.style.height = campo.h + 'px';
    inner.appendChild(img); inner.appendChild(svg); mapBox.appendChild(inner);
    var stato_ = el('div', 'fz-stato'), ordini = el('div', 'fz-ordini'), pop = el('div', 'fz-pop');
    box.appendChild(bar); box.appendChild(mapBox); box.appendChild(pop); box.appendChild(ordini); box.appendChild(stato_);

    // --- pan e zoom
    var vw = 0, vh = 0, sc = 1, tx = 0, ty = 0, minSc = 0.2;
    function adatta() {
      vw = mapBox.clientWidth; vh = mapBox.clientHeight;
      minSc = Math.min(vw / campo.w, vh / campo.h);
      sc = Math.max(vw / campo.w, vh / campo.h) * 1.05;   // la mappa riempie lo schermo
      var cx = 0, cy = 0, n = 0;
      campo.punti.forEach(function (p) { var q = px(campo, p.lat, p.lon); cx += q.x; cy += q.y; n++; });
      tx = vw / 2 - cx / n * sc; ty = vh / 2 - cy / n * sc; applica();
    }
    function limita() {
      sc = Math.max(minSc, Math.min(3, sc));
      var w = campo.w * sc, h = campo.h * sc;
      tx = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, tx));
      ty = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, ty));
    }
    function applica() { limita(); inner.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + sc + ')'; disegna(); }
    function zoomA(f, cx, cy) { var ns = Math.max(minSc, Math.min(3, sc * f)); tx = cx - (cx - tx) * ns / sc; ty = cy - (cy - ty) * ns / sc; sc = ns; applica(); }
    var ptr = {}, mosso = false, start = null;
    mapBox.addEventListener('pointerdown', function (e) { mapBox.setPointerCapture(e.pointerId); ptr[e.pointerId] = { x: e.clientX, y: e.clientY }; mosso = false; start = { x: e.clientX, y: e.clientY }; });
    mapBox.addEventListener('pointermove', function (e) {
      if (!ptr[e.pointerId]) return;
      var ids = Object.keys(ptr), p = ptr[e.pointerId];
      if (ids.length === 1) { tx += e.clientX - p.x; ty += e.clientY - p.y; applica(); }
      else if (ids.length === 2) {
        var o = ptr[ids[0] === String(e.pointerId) ? ids[1] : ids[0]];
        var d0 = Math.hypot(p.x - o.x, p.y - o.y), d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y), r = mapBox.getBoundingClientRect();
        if (d0 > 0) zoomA(d1 / d0, (e.clientX + o.x) / 2 - r.left, (e.clientY + o.y) / 2 - r.top);
      }
      p.x = e.clientX; p.y = e.clientY;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) mosso = true;
    });
    function su(e) {
      var era = ptr[e.pointerId]; delete ptr[e.pointerId];
      if (era && !mosso && !Object.keys(ptr).length) tocco(e);
    }
    mapBox.addEventListener('pointerup', su); mapBox.addEventListener('pointercancel', function (e) { delete ptr[e.pointerId]; });
    mapBox.addEventListener('wheel', function (e) { e.preventDefault(); var r = mapBox.getBoundingClientRect(); zoomA(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    function tocco(e) {
      var r = mapBox.getBoundingClientRect(), x = (e.clientX - r.left - tx) / sc, y = (e.clientY - r.top - ty) / sc;
      // tocco su un punto: scheda del punto (e ordini, per il comandante)
      if (opts.onTocco) { var ll = latlon(campo, x, y); opts.onTocco(ll.lat, ll.lon); return; }
      var hit = campo.punti.filter(function (p) { var q = px(campo, p.lat, p.lon); return Math.hypot(q.x - x, q.y - y) < Math.max(40, 26 / sc); })[0];
      if (hit) schedaPunto(hit);
    }

    // --- GPS reale
    var mia = null, zonaMia = null, battito = null, watch = null, lock = null;
    function impostaPos(lat, lon, acc) {
      mia = { lat: lat, lon: lon, acc: acc || 0 };
      var z = acc > 35 ? zonaMia : zonaDi(g, campo, mia);   // con GPS troppo impreciso non si cambia zona
      if (z !== zonaMia) { zonaMia = z; if (opts.onZona) opts.onZona(z); }
      disegna();
    }
    if (opts.gps && navigator.geolocation) {
      watch = navigator.geolocation.watchPosition(function (p) { impostaPos(p.coords.latitude, p.coords.longitude, p.coords.accuracy); },
        function () { mostraPop('GPS non disponibile: controlla i permessi di posizione', 'ko'); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
      battito = setInterval(function () { if (zonaMia && opts.onZona) opts.onZona(zonaMia); }, 45000);
    }
    function tieniAcceso() {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(function (l) { lock = l; }, function () {});
    }
    if (opts.gps) { tieniAcceso(); document.addEventListener('visibilitychange', tieniAcceso); }

    // --- disegno
    var st = null, eventi = [], visti = 0, ultimoOrdine = '', primo = true;
    function col(team) { return team ? (opts.colori[team] || '#888') : '#8a8a80'; }
    function nomeF(team) { return team ? (opts.nomi[team] || 'Fazione') : 'Neutrale'; }
    function disegna() {
      if (!st) return;
      var R = st.regole, rpx = R.raggio / campo.mPerPx, k = 1 / sc, s = '';
      var fs = 15 * k, sw = 3 * k;
      campo.link.forEach(function (l) {
        var a = punto(campo, l[0]), b = punto(campo, l[1]), pa = px(campo, a.lat, a.lon), pb = px(campo, b.lat, b.lon);
        var mio = st.owner[a.id] === opts.team || st.owner[b.id] === opts.team;
        s += '<line x1="' + pa.x + '" y1="' + pa.y + '" x2="' + pb.x + '" y2="' + pb.y + '" stroke="#111" stroke-opacity=".55" stroke-width="' + (7 * k) + '"/>' +
          '<line x1="' + pa.x + '" y1="' + pa.y + '" x2="' + pb.x + '" y2="' + pb.y + '" stroke="#fff" stroke-width="' + (3.5 * k) + '"' + (mio ? '' : ' stroke-dasharray="' + (10 * k) + ' ' + (8 * k) + '"') + '/>';
      });
      campo.punti.forEach(function (p) {
        var q = px(campo, p.lat, p.lon), o = st.owner[p.id], c = col(o), pr = st.prog[p.id], cont = st.conteso[p.id];
        var r = p.tipo === 'mob' ? Math.max(rpx, 26 * k) : rpx;
        s += '<circle cx="' + q.x + '" cy="' + q.y + '" r="' + r + '" fill="' + c + '" fill-opacity="' + (p.tipo === 'mob' ? .55 : .28) + '" stroke="' + c + '" stroke-width="' + (p.tipo === 'mob' ? 5 * k : sw) + '"/>';
        if (pr) {
          var giro = 2 * Math.PI * (r + 7 * k), frac = Math.min(1, pr.v / st.serveDi(p.id));
          s += '<circle cx="' + q.x + '" cy="' + q.y + '" r="' + (r + 7 * k) + '" fill="none" stroke="' + col(pr.team) + '" stroke-width="' + (7 * k) + '" stroke-dasharray="' + (giro * frac) + ' ' + giro + '" transform="rotate(-90 ' + q.x + ' ' + q.y + ')"/>';
        }
        if (cont) s += '<circle class="fz-cont" cx="' + q.x + '" cy="' + q.y + '" r="' + (r + 14 * k) + '" fill="none" stroke="#ffd23f" stroke-width="' + (5 * k) + '" stroke-dasharray="' + (12 * k) + ' ' + (8 * k) + '"/>';
        var etichetta = (p.tipo === 'chiave' ? '★ ' : p.tipo === 'mob' ? '⚑ ' : p.tipo === 'torre' ? '📡 ' : '') + p.nome;
        s += '<text x="' + q.x + '" y="' + (q.y - r - 9 * k) + '" font-size="' + fs + '" text-anchor="middle" class="fz-lab">' + esc(etichetta) + '</text>';
        var n = st.presenti[p.id] || {}, conti = Object.keys(n).filter(function (t) { return n[t] > 0; }).map(function (t) { return n[t]; });
        if (conti.length) s += '<text x="' + q.x + '" y="' + (q.y + fs * .35) + '" font-size="' + (fs * 1.1) + '" text-anchor="middle" class="fz-n">' + Object.keys(n).filter(function (t) { return n[t] > 0; }).map(function (t) { return n[t]; }).join(' · ') + '</text>';
      });
      if (mia) {
        var m = px(campo, mia.lat, mia.lon);
        if (mia.acc) s += '<circle cx="' + m.x + '" cy="' + m.y + '" r="' + (mia.acc / campo.mPerPx) + '" fill="#4ea4ff" fill-opacity=".15" stroke="none"/>';
        s += '<circle cx="' + m.x + '" cy="' + m.y + '" r="' + (9 * k) + '" fill="#2f8cff" stroke="#fff" stroke-width="' + (3 * k) + '"/>';
      }
      (opts.extra ? opts.extra() : []).forEach(function (b) {
        var m = px(campo, b.lat, b.lon);
        s += '<circle cx="' + m.x + '" cy="' + m.y + '" r="' + (6 * k) + '" fill="' + col(b.team) + '" stroke="#fff" stroke-width="' + (1.5 * k) + '"/>';
      });
      svg.innerHTML = s;
    }
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // --- barra, stato, ordini, avvisi
    function aggiorna(evs) {
      if (evs) eventi = evs;
      var now = opts.ora();
      st = stato(g, campo, eventi, now);
      var nemico = g.fazioni.filter(function (f) { return f.team !== opts.team; })[0];
      var fine = g.inizio + g.durata * 60000;
      bar.innerHTML = '';
      bar.appendChild(chip(opts.team, 'Tu: ' + nomeF(opts.team)));
      bar.appendChild(el('span', 'fz-sp'));
      bar.appendChild(el('span', 'fz-score', '★ ' + st.chiaviDi(opts.team) + ' – ' + (nemico ? st.chiaviDi(nemico.team) : 0)));
      bar.appendChild(el('b', 'fz-clock', now < g.inizio ? 'tra ' + mmss(g.inizio - now) : st.finita ? 'FINE' : mmss(fine - now)));
      // la mia posizione
      var testo = '';
      if (now < g.inizio) testo = 'La partita inizia tra ' + mmss(g.inizio - now);
      else if (st.finita) testo = st.vincitore ? (st.vincitore === opts.team ? '🏆 VITTORIA!' : 'Sconfitta: vince ' + nomeF(st.vincitore)) : 'Pareggio';
      else if (!mia) testo = opts.gps ? 'In attesa del GPS…' : 'Tocca la mappa per spostarti';
      else if (!zonaMia) testo = 'Fuori dai punti' + (mia.acc ? ' · GPS ±' + Math.round(mia.acc) + ' m' : '');
      else {
        var p = punto(campo, zonaMia), pr = st.prog[zonaMia], o = st.owner[zonaMia];
        if (st.conteso[zonaMia]) testo = '⚔ ' + p.nome + ' CONTESO: conquista ferma';
        else if (pr && pr.team === opts.team) testo = '⏱ Conquista di ' + p.nome + ': ' + mmss(st.serveDi(zonaMia) - pr.v);
        else if (o === opts.team) testo = '🛡 Sei a ' + p.nome + ' (nostro)';
        else if (!st.attaccabile(opts.team, zonaMia)) testo = '✕ ' + p.nome + ' fuori dalla vostra rete: prendete prima un punto collegato';
        else testo = p.nome;
      }
      stato_.textContent = testo;
      stato_.className = 'fz-stato' + (/CONTESO|✕/.test(testo) ? ' warn' : /Conquista|VITTORIA/.test(testo) ? ' ok' : '');
      // ordini
      var f = g.fazioni.filter(function (x) { return x.team === opts.team; })[0];
      var ord = !opts.team || st.finita || now < g.inizio ? [] : f && f.comandante && f.comandante !== 'ia' ? ordiniUmani(eventi, opts.team) : ordiniIA(g, campo, st, opts.team);
      ordini.innerHTML = '';
      ordini.appendChild(el('small', null, f && f.comandante && f.comandante !== 'ia' ? 'ORDINI DEL COMANDANTE' : 'COMANDANTE AUTOMATICO'));
      if (!ord.length) ordini.appendChild(el('span', null, now < g.inizio ? 'In attesa dell\'inizio' : '—'));
      ord.forEach(function (o, i) { ordini.appendChild(el('span', i ? 'fz-o2' : 'fz-o1', o.testo || (o.azione + ' ' + o.pt))); });
      var firmaO = ord.length ? ord[0].testo : '';
      if (primo) { primo = false; visti = st.transizioni.length; ultimoOrdine = firmaO; disegna(); return; }  // all'apertura non si ripete il passato
      if (firmaO && firmaO !== ultimoOrdine) { mostraPop('📣 ' + firmaO, 'ordine'); vibra([60, 40, 60]); }
      ultimoOrdine = firmaO;
      // avvisi: solo transizioni nuove che riguardano la mia fazione o i punti chiave
      st.transizioni.slice(visti).forEach(function (tr) {
        var nm = tr.pt ? punto(campo, tr.pt).nome : '';
        if (tr.tipo === 'attacco' && tr.contro === opts.team) { mostraPop('⚠ Ti stanno attaccando ' + nm + '!', 'ko'); vibra([300, 100, 300]); }
        else if (tr.tipo === 'conquista' && tr.team === opts.team) { mostraPop('✓ ' + nm + ' conquistato!', 'ok'); vibra(120); }
        else if (tr.tipo === 'conquista' && tr.contro === opts.team) { mostraPop('✕ Abbiamo perso ' + nm, 'ko'); vibra([300, 100, 300]); }
        else if (tr.tipo === 'conquista') mostraPop(nomeF(tr.team) + ' ha preso ' + nm, '');
        else if (tr.tipo === 'contovittoria') mostraPop(tr.team === opts.team ? '★ Teniamo ' + st.regole.chiavi + ' punti chiave: vittoria tra ' + mmss(st.regole.tVittoria * 1000) : '⚠ Il nemico tiene ' + st.regole.chiavi + ' punti chiave: contrattaccate!', tr.team === opts.team ? 'ok' : 'ko');
        else if (tr.tipo === 'vittoria') mostraPop(tr.team === opts.team ? '🏆 Vittoria!' : 'Partita persa', tr.team === opts.team ? 'ok' : 'ko');
      });
      visti = st.transizioni.length;
      disegna();
    }
    function chip(team, testo) { var c = el('span', 'fz-chip', testo); c.style.background = col(team); return c; }
    function mostraPop(t, cls) {
      var p = el('div', 'fz-msg ' + (cls || ''), t); pop.appendChild(p);
      while (pop.children.length > 3) pop.removeChild(pop.firstChild);
      setTimeout(function () { p.classList.add('via'); setTimeout(function () { p.remove(); }, 400); }, 6000);
    }
    function vibra(v) { try { if (navigator.vibrate) navigator.vibrate(v); } catch (e) {} }
    function schedaPunto(p) {
      var o = st && st.owner[p.id], fp = el('div', 'fz-scheda');
      var tipo = { mob: 'Base principale (MOB)', chiave: 'Punto chiave', torre: 'Torre radio', deposito: 'Deposito', base: 'Base' }[p.tipo];
      fp.appendChild(el('b', null, p.nome)); fp.appendChild(el('small', null, tipo + ' · ' + nomeF(o)));
      if (p.tipo !== 'mob' && st) fp.appendChild(el('span', null, st.attaccabile(opts.team, p.id) || o === opts.team ? 'Nella vostra rete' : 'Fuori dalla vostra rete'));
      if (opts.comandante && opts.onOrdine && p.tipo !== 'mob') {
        var r = el('div', 'fz-az');
        [['attacca', 'Attaccate'], ['difendi', 'Difendete'], ['raggruppa', 'Raggruppatevi']].forEach(function (a) {
          var b = el('button', 'btn', a[1]); b.type = 'button';
          b.onclick = function () { opts.onOrdine(p.id, a[0], a[1] + ' ' + p.nome); fp.remove(); mostraPop('Ordine inviato: ' + a[1] + ' ' + p.nome, 'ordine'); };
          r.appendChild(b);
        });
        fp.appendChild(r);
      }
      var x = el('button', 'btn', 'Chiudi'); x.type = 'button'; x.onclick = function () { fp.remove(); }; fp.appendChild(x);
      var vecchia = box.querySelector('.fz-scheda'); if (vecchia) vecchia.remove();
      box.appendChild(fp);
    }
    function el(tag, cls, testo) { var e = document.createElement(tag); if (cls) e.className = cls; if (testo != null) e.textContent = testo; return e; }

    img.onload = adatta;
    window.addEventListener('resize', adatta);
    var tic = setInterval(function () { aggiorna(); }, 1000);
    return {
      aggiorna: aggiorna, posizione: impostaPos, centra: adatta,
      chiudi: function () {
        clearInterval(tic); clearInterval(battito); window.removeEventListener('resize', adatta);
        if (watch != null) navigator.geolocation.clearWatch(watch);
        document.removeEventListener('visibilitychange', tieniAcceso);
        if (lock) lock.release().catch(function () {});
        box.innerHTML = ''; box.classList.remove('fz');
      }
    };
  }

  // ---------- modalità prova: partita simulata con giocatori finti, tempo accelerato
  function prova(box, onEsci) {
    var campo = window.S40_CAMPI.tauri, vel = 10, t0 = Date.now(), base = Date.now();
    var ora = function () { return base + (Date.now() - t0) * vel; };
    var g = { id: 'prova', titolo: 'Prova fazioni', inizio: base + 5000, durata: 90, campo: 'tauri',
      fazioni: [{ team: 'blu', mob: 'HQ', partenza: ['Pista'], comandante: 'ia' }, { team: 'rossa', mob: 'Tral2', partenza: [], comandante: 'ia' }] };
    var eventi = [], bots = [];
    ['blu', 'rossa'].forEach(function (team) {
      var mob = punto(campo, team === 'blu' ? 'HQ' : 'Tral2');
      for (var i = 0; i < 4; i++) bots.push({ uid: team + i, team: team, lat: mob.lat + (Math.random() - .5) * 2e-4, lon: mob.lon + (Math.random() - .5) * 2e-4, meta: null, sosta: 0, zona: null, ultimo: 0 });
    });
    var io = { uid: 'io', team: 'blu', zona: null };
    var v = vista(box, {
      g: g, campo: campo, team: 'blu', uid: 'io', colori: { blu: '#1f6fb2', rossa: '#c0392b' }, nomi: { blu: 'Blu', rossa: 'Rossa' }, ora: ora,
      onTocco: function (lat, lon) { v.posizione(lat, lon, 6); },
      onZona: function (pt) { eventi.push({ tipo: 'zona', uid: 'io', team: 'blu', pt: pt, t: ora() }); io.zona = pt; },
      extra: function () { return bots; }
    });
    var hq = punto(campo, 'HQ'); v.posizione(hq.lat - 1e-4, hq.lon - 1e-4, 6);
    // i giocatori finti seguono gli ordini del comandante automatico della loro fazione
    var ultimoPasso = ora();
    var sim = setInterval(function () {
      var now = ora(), dt = (now - ultimoPasso) / 1000; ultimoPasso = now;
      if (now < g.inizio) { v.aggiorna(eventi); return; }
      var st = stato(g, campo, eventi, now);
      if (st.finita) { v.aggiorna(eventi); return; }
      bots.forEach(function (b, i) {
        if (!b.meta || (b.sosta <= 0 && arrivato(b))) {
          var ord = ordiniIA(g, campo, st, b.team), scelta;
          var conPt = ord.filter(function (o) { return o.pt; });
          scelta = conPt.length ? conPt[(i % 2 && conPt[1]) ? 1 : 0].pt : null;
          if (!scelta || Math.random() < .25) {
            var cand = campo.punti.filter(function (p) { return p.tipo !== 'mob' && (st.attaccabile(b.team, p.id) || st.owner[p.id] === b.team); });
            scelta = cand.length ? cand[Math.floor(Math.random() * cand.length)].id : null;
          }
          if (scelta) { var p = punto(campo, scelta); b.meta = { lat: p.lat + (Math.random() - .5) * 2e-4, lon: p.lon + (Math.random() - .5) * 2e-4 }; b.sosta = 120 + Math.random() * 200; }
        }
        if (b.meta) {
          var d = metri(b, b.meta), passo = 1.4 * dt;
          if (d > passo) { b.lat += (b.meta.lat - b.lat) * passo / d; b.lon += (b.meta.lon - b.lon) * passo / d; }
          else { b.lat = b.meta.lat; b.lon = b.meta.lon; b.sosta -= dt; }
        }
        var z = zonaDi(g, campo, b);
        if (z !== b.zona || (z && now - b.ultimo > 45000)) { eventi.push({ tipo: 'zona', uid: b.uid, team: b.team, pt: z, t: now }); b.zona = z; b.ultimo = now; }
      });
      if (io.zona && now - (io.ultimo || 0) > 45000) { eventi.push({ tipo: 'zona', uid: 'io', team: 'blu', pt: io.zona, t: now }); io.ultimo = now; }
      v.aggiorna(eventi);
    }, 250);
    function arrivato(b) { return b.meta && metri(b, b.meta) < 3; }
    return {
      velocita: function (x) { base = ora(); t0 = Date.now(); vel = x; },
      chiudi: function () { clearInterval(sim); v.chiudi(); }
    };
  }

  window.S40F = { stato: stato, ordiniIA: ordiniIA, vista: vista, prova: prova, zonaDi: zonaDi, REGOLE: REGOLE, mmss: mmss };
})();
