/* Airsoft Conflict — editor delle cartine (da computer).
   Carichi l'immagine o il PDF del campo, la georeferenzi con punti di controllo (UTM WGS84 o lat/lon),
   crei le aree (basi, punti chiave, punti base, torri) e le colleghi tra loro. */
(function () {
  'use strict';
  var U = window.AC_UTM;
  var TIPI = [['mob', '⚑ Base di partenza (MOB)'], ['chiave', '★ Punto chiave'], ['base', '● Punto base'], ['torre', '📡 Torre radio']];
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

  /* opts: { campo (completo o null), onSalva(campo, imgNuova) -> Promise<campo>, onElimina(campo) -> Promise, onChiudi() } */
  function apri(box, opts) {
    var c = opts.campo ? JSON.parse(JSON.stringify(opts.campo)) : { id: null, nome: '', w: 0, h: 0, img: '', geo: null, mPerPx: null, controllo: [], punti: [], link: [] };
    c.controllo = c.controllo || []; c.punti = c.punti || []; c.link = c.link || [];
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
          p = { id: idNuovo(), nome: 'Area ' + (c.punti.length + 1), tipo: c.punti.filter(function (x) { return x.tipo === 'mob'; }).length < 2 ? 'mob' : 'base', x: q.x, y: q.y, raggio: 30, fonte: 'mappa' };
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
      c.link.forEach(function (l) {
        var a = c.punti.filter(function (p) { return p.id === l[0]; })[0], b = c.punti.filter(function (p) { return p.id === l[1]; })[0];
        if (!a || !b) return;
        var xy = 'x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"';
        s += '<line ' + xy + ' stroke="#000" stroke-opacity=".5" stroke-width="' + (7 * k) + '" stroke-linecap="round"/>';
        s += '<line ' + xy + ' stroke="#f1ece0" stroke-width="' + (3 * k) + '" stroke-dasharray="' + (10 * k) + ' ' + (8 * k) + '" stroke-linecap="round"/>';
      });
      c.punti.forEach(function (p) {
        var r = Math.max(raggioPx(p), 14 * k), on = p.id === sel || p.id === linkDa;
        var col = p.tipo === 'mob' ? '#e8c96a' : p.tipo === 'chiave' ? '#ffe08a' : '#cfcab8';
        s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + r + '" fill="#9a9a8c" fill-opacity=".45" stroke="' + (on ? '#2f9bff' : col) + '" stroke-width="' + ((on ? 5 : 3) * k) + '"/>';
        var sim = p.tipo === 'mob' ? '⚑' : p.tipo === 'chiave' ? '★' : p.tipo === 'torre' ? '📡' : '';
        if (sim) s += '<text x="' + p.x + '" y="' + p.y + '" font-size="' + (20 * k) + '" text-anchor="middle" dominant-baseline="central" class="ed-sim" fill="' + (p.tipo === 'mob' ? '#fff' : '#ffe08a') + '">' + sim + '</text>';
        s += '<text x="' + p.x + '" y="' + (p.y + r + 12 * k) + '" font-size="' + (14 * k) + '" text-anchor="middle" dominant-baseline="central" class="ed-lab">' + esc(p.nome.toUpperCase()) + '</text>';
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
      var b = el('div', 'ed-stato'), mob = c.punti.filter(function (p) { return p.tipo === 'mob'; }).length, ch = c.punti.filter(function (p) { return p.tipo === 'chiave'; }).length;
      var collegati = {}; c.link.forEach(function (l) { collegati[l[0]] = collegati[l[1]] = 1; });
      var isolati = c.punti.filter(function (p) { return !collegati[p.id]; }).length;
      var righe = [
        [!!c.img, c.img ? 'Cartina caricata (' + c.w + '×' + c.h + ')' : 'Manca la cartina'],
        [!!c.geo, c.geo ? 'Georeferenziata · errore medio ' + c._err.medio.toFixed(1) + ' m' : 'Non georeferenziata: senza coordinate il GPS non funziona'],
        [mob >= 2, mob + ' basi di partenza (ne servono 2)'],
        [ch >= 1, ch + ' punti chiave · ' + c.punti.length + ' aree in tutto'],
        [!isolati && c.link.length > 0, c.link.length + ' collegamenti' + (isolati ? ' · ' + isolati + ' aree non collegate' : '')]
      ];
      righe.forEach(function (r) { var x = el('div', r[0] ? 'ok' : 'ko', (r[0] ? '✓ ' : '! ') + r[1]); b.appendChild(x); });
      return b;
    }
    function pCartina(body) {
      body.appendChild(el('p', 'ed-txt', 'Carica la cartina del campo: un\'immagine (JPG, PNG) oppure il PDF. Meglio se ha la griglia UTM stampata, così la georeferenzi con precisione.'));
      body.appendChild(btn(c.img ? 'Sostituisci la cartina…' : 'Carica immagine o PDF…', 'accent', function () { file.click(); }));
      if (c.img) body.appendChild(el('p', 'ed-txt muto', 'Se la sostituisci con una dello stesso campo e stesse proporzioni, le aree restano al loro posto. Le coordinate vanno controllate.'));
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
      var p = c.punti.filter(function (x) { return x.id === sel; })[0];
      if (p) {
        var f = el('div', 'ed-form');
        var n = el('input'); n.className = 'ed-nome-punto'; n.value = p.nome; n.oninput = function () { p.nome = n.value; modificato = true; disegna(); aggiornaLista(); };
        f.appendChild(campoF('Nome', n));
        var t = el('select'); TIPI.forEach(function (o) { var x = el('option', null, o[1]); x.value = o[0]; t.appendChild(x); }); t.value = p.tipo;
        t.onchange = function () { p.tipo = t.value; cambiato(); };
        f.appendChild(campoF('Tipo', t));
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
        body.appendChild(el('p', 'ed-txt', 'Clicca sulla cartina dove vuoi un\'area, oppure creala dalle coordinate.'));
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
          var b = btn((q.tipo === 'mob' ? '⚑ ' : q.tipo === 'chiave' ? '★ ' : q.tipo === 'torre' ? '📡 ' : '● ') + q.nome, 'ed-voce' + (q.id === sel ? ' on' : ''), function () {
            sel = q.id; tx = vw / 2 - q.x * sc; ty = vh / 2 - q.y * sc; applica(); pannello();
          });
          lista.appendChild(b);
        });
      }
      aggiornaLista();
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
        c.w = r.w; c.h = r.h; c.img = r.d; imgNuova = r.d; img.src = r.d;
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
        punti: c.punti.map(function (p) { return { id: p.id, nome: p.nome.trim() || 'Area', tipo: p.tipo, x: p.x, y: p.y, lat: p.lat == null ? null : p.lat, lon: p.lon == null ? null : p.lon, raggio: p.raggio || 30, fonte: p.fonte || 'mappa' }; }),
        link: c.link.map(function (l) { return [l[0], l[1]]; }),
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
