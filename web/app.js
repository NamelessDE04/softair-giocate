/* Airsoft Conflict — interfaccia.
   Schermate: codice invito · promemoria · pagina del conflict (settimana / giorno / partita) · team · organizzazione. */
(function () {
  'use strict';

  var VERSIONE = '0.80';
  var S = window.S40, F = window.S40F;
  var TOOL = !!window.AC_TOOL;   // dentro l'app Android «Officina»: niente account, solo dispositivi
  var COLORI = { blu: '#2f7fd6', rossa: '#d23a2c' };
  var GIORNO = 86400000;
  var $ = function (id) { return document.getElementById(id); };
  var app = $('app');

  // ---------- piccoli aiuti
  function el(tag, cls, testo) { var e = document.createElement(tag); if (cls) e.className = cls; if (testo != null) e.textContent = testo; return e; }
  function bottone(testo, cls, fn) { var b = el('button', 'btn' + (cls ? ' ' + cls : ''), testo); b.type = 'button'; if (fn) b.onclick = fn; return b; }
  function toast(t) { var x = $('toast'); x.textContent = t; x.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { x.classList.remove('on'); }, 2600); }
  function errore(e) { console.error(e); toast('Errore: ' + (e && e.message || e)); }
  var GG = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'], MM = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
  function ora(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function dataBreve(ms) { var d = new Date(ms); return GG[d.getDay()] + ' ' + d.getDate() + ' ' + MM[d.getMonth()]; }
  function dataLunga(ms) { var d = new Date(ms); return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function stessoGiorno(a, b) { var x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); }
  function mezzanotte(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function traQuanto(ms) {
    var g = Math.round((mezzanotte(ms) - mezzanotte(Date.now())) / GIORNO);
    return g <= 0 ? 'OGGI' : g === 1 ? 'DOMANI' : 'TRA ' + g + ' GIORNI';
  }
  function telLink(t) { return 'tel:' + String(t || '').replace(/[^\d+]/g, ''); }
  function waLink(t) { var n = String(t || '').replace(/[^\d]/g, ''); if (n.length === 10) n = '39' + n; return 'https://wa.me/' + n; }
  function mapsLink(c) { return c.mapsUrl || ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.luogo || '')); }
  function link(testo, href, cls) { var a = el('a', cls || 'btn', testo); a.href = href; if (/^http/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; } return a; }
  function campoMeta(id, cat) { var c = D.campi.filter(function (x) { return x.id === id; })[0] || null; return c && cat ? perCategoria(c, cat) : c; }
  // carica la cartina completa (con l'immagine) e poi chiama fn; se nel frattempo si cambia schermata non fa nulla
  function conCampo(id, box, fn0, cat) {
    var fn = function (cm) { fn0(cat ? perCategoria(cm, cat) : cm); };
    var cc = id && S.campoInCache(id);
    if (cc) { fn(cc); return; }
    var w = el('p', 'hint centro', id ? 'Caricamento della cartina…' : 'Per questo conflict non è stata scelta una cartina.');
    box.appendChild(w); if (!id) return;
    var vivo = true, prima = chiusura; chiusura = function () { vivo = false; if (prima) prima(); };
    S.caricaCampo(id).then(function (cm) { if (!vivo) return; w.remove(); fn(cm); }, function (e) { if (vivo) w.textContent = 'Cartina non disponibile: ' + (e.message || e); });
  }
  function nomeFaz(c, id) { var f = (c.fazioni || []).filter(function (x) { return x.id === id; })[0]; return f ? f.nome : id; }
  function mieFaz(c) {
    var st = S.stato(), me = st.me;
    if (c.fazioneUtente && st.user && c.fazioneUtente[st.user.uid]) return c.fazioneUtente[st.user.uid];
    return me && me.team && c.fazioneDi ? c.fazioneDi[me.team] || null : null;
  }
  function addestramento(c) { return c.modo === 'addestramento'; }
  // conflict di prova: sempre in corso, la partita riparte da sola ogni 4 ore (o quando l'organizzatore la fa ripartire)
  var GIRO_PROVA = 4 * 3600000;
  function inizioProva(c) { var b = c.provaDa || c.inizio, now = Date.now(); return b + Math.max(0, Math.floor((now - b) / GIRO_PROVA)) * GIRO_PROVA; }
  function motore(c) {
    return {
      id: c.id, inizio: c.prova ? inizioProva(c) : c.inizio, durata: c.prova ? GIRO_PROVA / 60000 : (c.fine - c.inizio) / 60000, regole: Object.assign({}, c.regole || {}, addestramento(c) ? { attacco: 'blu' } : {}),
      fazioni: (c.fazioni || []).map(function (f) { return { team: f.id, mob: f.mob, partenza: f.partenza || [], comandante: (c.comandanti || {})[f.id] || 'ia' }; })
    };
  }
  function fase(c, now) {
    if (c.prova) return 'live';
    now = now || Date.now();
    if (now >= c.fine) return 'finito';
    if (now >= c.inizio) return 'live';
    if (stessoGiorno(now, c.inizio)) return 'giorno';
    return 'settimana';
  }
  function P(p) { return S.puo(p); }
  function organizza() { return P('conflitti') || P('team') || P('giocatori') || S.stato().dev; }
  function visibile(da, perm) { return P(perm) || da == null || Date.now() >= da; }

  // ---------- dati condivisi
  var D = { team: [], conflitti: [], adesioni: {}, contatti: {}, campi: [], scenari: [], allenamenti: [], dmz: [], privati: {} };
  var stopAdesioni = {};
  function teamDi(tid) { return D.team.filter(function (t) { return t.id === tid; })[0]; }
  function miaAdesione(cid) { var u = S.stato().user; return (D.adesioni[cid] || []).filter(function (a) { return a.id === u.uid; })[0]; }
  function attivi() { var now = Date.now(); return D.conflitti.filter(function (c) { return c.fine > now - 12 * 3600000; }).sort(function (a, b) { return a.inizio - b.inizio; }); }

  // ---------- navigazione (il tasto indietro del telefono torna alla schermata precedente)
  var pila = [{ v: 'home' }], chiusura = null;
  function corrente() { return pila[pila.length - 1]; }
  function vai(v, p) { pila.push({ v: v, p: p }); history.pushState({ n: pila.length }, ''); mostra(); }
  function indietro() { if (pila.length > 1) history.back(); }
  var ignoraPop = false;
  function tornaIndietro(n) { n = Math.min(n, pila.length - 1); if (n <= 0) return; pila.splice(pila.length - n, n); ignoraPop = true; history.go(-n); mostra(); }
  window.addEventListener('popstate', function () {
    if (ignoraPop) { ignoraPop = false; return; }
    if (!$('foglio').hidden) { chiudiFoglio(true); return; }
    if (pila.length > 1) pila.pop();
    mostra();
  });
  function sostituisci(v, p) { pila[pila.length - 1] = { v: v, p: p }; mostra(); }

  function mostra() {
    if (chiusura) { try { chiusura(); } catch (e) {} chiusura = null; }
    chiudiScanner();
    var c = corrente();
    app.innerHTML = ''; window.scrollTo(0, 0);
    $('pieno').hidden = true; $('pieno').innerHTML = '';
    document.body.classList.remove('a-pieno');
    var r = { home: home, conflitto: pagConflitto, team: pagTeam, teamModifica: pagTeamModifica, profilo: pagProfilo, organizza: pagOrganizza, allenamento: pagAllenamento, allenamentoModifica: pagAllenamentoModifica, radio: pagRadio, scenario: pagScenario, stampaQr: pagStampaQr, posa: pagPosa, giocatori: pagGiocatori, permessi: pagPermessi, mappa: pagMappa, conflittoModifica: pagConflittoModifica, prova: pagProva, dmz: pagDmz, dmzModifica: pagDmzModifica, dmzLive: pagDmzLive, mortaioProva: pagMortaioProva, banco: pagBanco, beaconProg: pagBeaconProg, provaTbeam: pagProvaTbeam, esercizio: pagEsercizio, lab: pagLab, chat: pagChat, officina: pagOfficina }[c.v];
    (r || home)(c.p);
  }
  function aPieno() { document.body.classList.add('a-pieno'); var p = $('pieno'); p.hidden = false; p.innerHTML = ''; return p; }
  function testata(titolo, conIndietro) {
    var h = el('div', 'testata');
    if (conIndietro !== false) h.appendChild(bottone('‹', 'icon indietro', indietro));
    h.appendChild(el('h2', null, titolo));
    app.appendChild(h);
    return h;
  }

  // ---------- foglio dal basso (menu, moduli)
  function apriFoglio(costruisci) {
    var f = $('foglio'); f.innerHTML = ''; f.classList.remove('foglio-alto'); f.appendChild(el('span', 'maniglia'));
    costruisci(f);
    f.hidden = false; $('velo').hidden = false;
    requestAnimationFrame(function () { f.classList.add('su'); });
    history.pushState({ foglio: 1 }, '');
  }
  function chiudiFoglio(daPop) {
    var f = $('foglio'); if (f.hidden) return;
    f.classList.remove('su'); $('velo').hidden = true;
    setTimeout(function () { f.hidden = true; f.innerHTML = ''; }, 200);
    if (!daPop) history.back();
  }
  $('velo').onclick = function () { chiudiFoglio(); };

  // menu a tendina sotto il bottone in alto a destra
  var ICO = {
    team: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>',
    profilo: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    organizza: '<path d="M4 6h16M4 12h10M4 18h13"/><circle cx="18" cy="12" r="2.2"/>',
    esci: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
    iniettore: '<path d="M18 3l3 3M16.5 4.5l3 3M19 6l-9 9-3-3 9-9M7 12l-4 4M4 15l2 2M10 15l-1 1"/>',
    chat: '<path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    prova: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
    beacon: '<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>'
  };
  function chiudiMenu() {
    var m = $('menuTendina'); if (!m) return;
    m.classList.remove('su'); $('btnMenu').classList.remove('aperto');
    document.removeEventListener('keydown', escMenu);
    setTimeout(function () { m.remove(); var o = $('menuVelo'); if (o) o.remove(); }, 160);
  }
  function escMenu(e) { if (e.key === 'Escape') chiudiMenu(); }
  function menu() {
    if ($('menuTendina')) { chiudiMenu(); return; }
    var st = S.stato(), me = st.me || {};
    var velo = el('div', 'menu-velo'); velo.id = 'menuVelo'; velo.onclick = chiudiMenu; document.body.appendChild(velo);
    var m = el('div', 'menu-tendina'); m.id = 'menuTendina';
    var chi = el('div', 'menu-chi');
    var nome = me.callsign || me.nome || (st.user && st.user.email) || '';
    chi.appendChild(el('span', 'menu-av', (nome[0] || '?').toUpperCase()));
    var tx = el('div'); tx.appendChild(el('b', null, nome));
    var t = teamDi(me.team); tx.appendChild(el('small', null, (t ? t.nome : 'Nessun team') + ' · ' + S.nomeRuolo(st.ruolo)));
    chi.appendChild(tx); m.appendChild(chi);
    var voci = [];
    if (TOOL) voci = OFF_VOCI.map(function (x) { return [x[0], x[2], x[4]]; });
    else {
    if (me.team) voci.push(['team', 'Il mio team', function () { vai('team', me.team); }]);
    voci.push(['profilo', 'Profilo', function () { vai('profilo'); }]);
    if (organizza()) voci.push(['organizza', 'Organizza', function () { vai('organizza'); }]);
    if (st.dev || (st.ruolo && st.ruolo !== 'truppa')) voci.push(['chat', 'Chat LoRa', function () { vai('chat'); }]);
    if (st.dev || P('conflitti')) voci.push(['prova', 'Prova e test', function () { vai('lab'); }]);
    voci.push(['esci', 'Esci', function () { S.logout(); }, 'menu-esci']);
    }
    voci.forEach(function (v) {
      var b = el('button', 'menu-voce' + (v[3] ? ' ' + v[3] : '')); b.type = 'button';
      b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + ICO[v[0]] + '</svg>';
      b.appendChild(el('span', null, v[1]));
      b.onclick = function () { chiudiMenu(); setTimeout(v[2], 30); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    $('btnMenu').classList.add('aperto');
    document.addEventListener('keydown', escMenu);
    requestAnimationFrame(function () { m.classList.add('su'); });
  }
  $('btnMenu').onclick = menu;

  // ================= HOME
  // pagine di debug tolte dalla home: si aprono con l'indirizzo …/#banco o …/#prova
  var apriNascosta = { '#banco': 'banco', '#iniettore': 'banco', '#beacon': 'beaconProg', '#prova': 'provaTbeam', '#provabandiera': 'provaTbeam' }[location.hash] || null;
  // link condiviso di un evento: …/#ev=c-ID (conflict) o #ev=a-ID (allenamento). Resta in sospeso anche durante l'accesso.
  var apriEvento = null, apriEs = null;
  (function () {
    // QR dell'esercitazione: #mortaio (display dell'HQ) e #rinascita (stampato all'HQ)
    var q = { '#mortaio': 'm', '#rinascita': 'r' }[location.hash], mc = /^#costruisci-(\w+)$/.exec(location.hash);
    if (mc) q = 'c:' + mc[1];
    try { if (q) sessionStorage.setItem('apriEs', q); apriEs = sessionStorage.getItem('apriEs'); } catch (e) { if (q) apriEs = q; }
    if (q) history.replaceState(null, '', location.pathname);
  })();
  (function () {
    var m = /^#ev=([ca])-(.+)$/.exec(location.hash);
    try { if (m) sessionStorage.setItem('apriEvento', m[1] + '-' + m[2]); apriEvento = sessionStorage.getItem('apriEvento'); } catch (e) { if (m) apriEvento = m[1] + '-' + m[2]; }
    if (m) history.replaceState(null, '', location.pathname);
  })();
  function linkEvento(tipo, id) { return location.origin + location.pathname + '#ev=' + tipo + '-' + id; }
  function condividiEvento(tipo, x) {
    var msg = (x.titolo || (tipo === 'a' ? 'Allenamento' : 'Conflict')) + (x.inizio ? ' · ' + dataLunga(x.inizio) + ' ore ' + ora(x.inizio) : '') + '\nSegna la tua presenza: ' + linkEvento(tipo, x.id);
    if (navigator.share) navigator.share({ text: msg }).catch(function () {}); else { navigator.clipboard && navigator.clipboard.writeText(msg); toast('Link copiato'); }
  }
  function finitoApriEvento() { apriEvento = null; try { sessionStorage.removeItem('apriEvento'); } catch (e) {} }
  // ================= OFFICINA DISPOSITIVI (anche nell'app Android, senza account)
  var OFF_VOCI = [
    ['organizza', '🔧', 'Collega e configura', 'bandiere, HQ, LoRa team leader, tag finti: nomi e impostazioni', function () { vai('officina'); }],
    ['iniettore', '⬇', 'Firmware', 'carica il firmware sulle schede col cavo', function () { location.href = 'firmware/index.html'; }],
    ['beacon', '◉', 'Beacon prog', 'programma i tag con l\'iniettore', function () { vai('beaconProg'); }],
    ['iniettore', '⌁', 'Iniettore', 'tutti i dati e i comandi del T-Beam collegato', function () { vai('banco'); }],
    ['prova', '⚑', 'Prova 3 T-Beam', 'bandiera, tag e conquista al banco', function () { vai('provaTbeam'); }],
    ['chat', '📡', 'Chat LoRa', 'messaggi sulla rete LoRa, senza internet', function () { vai('chat'); }]
  ];
  function homeTool() {
    app.appendChild(el('h2', 'off-tit', 'Officina dispositivi'));
    app.appendChild(el('p', 'hint', 'Tutto qui funziona senza internet e senza account: col cavo OTG o col Bluetooth del telefono. Per giocate, giocatori e assegnazione dei beacon usa l\'app web.'));
    OFF_VOCI.forEach(function (x) {
      var k = el('button', 'carta off-voce'); k.type = 'button';
      k.appendChild(el('span', 'off-ic', x[1])); var t = el('div'); t.appendChild(el('b', null, x[2])); t.appendChild(el('small', null, x[3])); k.appendChild(t);
      k.onclick = x[4]; app.appendChild(k);
    });
    var fw = el('small', 'hint off-fw', 'Firmware dentro questa app: …'); app.appendChild(fw);
    fetch('firmware/bin/build.json').then(function (r) { return r.json(); }).then(function (j) { fw.textContent = 'Firmware dentro questa app: ' + j.versione + ' (' + j.quando.slice(0, 10) + ')'; }).catch(function () { fw.textContent = ''; });
  }
  function pagOfficina() {
    testata('Officina dispositivi');
    var b = BANCO, box = el('div', 'officina'); app.appendChild(box);
    var REG = {}; try { REG = JSON.parse(localStorage.getItem('officina-reg') || '{}'); } catch (e) {}
    function salvaReg() { try { localStorage.setItem('officina-reg', JSON.stringify(REG)); } catch (e) {} }
    var conn = el('div', 'carta'); box.appendChild(conn);
    var pan = el('div'); box.appendChild(pan);
    var regBox = el('div', 'carta'); box.appendChild(regBox);
    var term = el('details', 'carta off-term'); term.appendChild(el('summary', null, 'Terminale (comandi a mano)')); box.appendChild(term);
    var tin = el('input'); tin.placeholder = 'es. info · soglia -75 · cmd tutte test'; var tgo = bottone('Manda', '', function () { if (tin.value.trim()) { bancoInvia(tin.value.trim()); tin.value = ''; } });
    var tr = el('div', 'riga2'); tr.appendChild(tin); tr.appendChild(tgo); term.appendChild(tr); var tpre = el('pre', 'off-pre'); term.appendChild(tpre);
    var sel = null;   // bandiera scelta quando si è collegati all'HQ (o 'tutte')
    function ruolo() {
      if (!b.via) return null;
      if (b.avvio === 'HQ' || b.hq) return 'HQ';
      if (b.avvio === 'LORA' || CHAT.io) return 'LORA';
      if (b.avvio === 'INIETTORE') return 'INIETTORE';
      if (b.avvio === 'TAG' || b.tag) return 'TAG';
      if (b.avvio === 'BANDIERA' || Object.keys(b.band).length) return 'BANDIERA';
      return '?';
    }
    var NOMI = { HQ: 'HQ', LORA: 'LoRa team leader', INIETTORE: 'Iniettore', TAG: 'Tag finto', BANDIERA: 'Bandiera', '?': 'non ancora riconosciuto' };
    function idCollegato(r) { if (r === 'HQ') return b.hq && b.hq.hq; if (r === 'LORA') return CHAT.io && CHAT.io.id; if (r === 'BANDIERA') return Object.keys(b.band)[0]; return null; }
    function ricorda(id, r, extra) { if (!id) return; var x = REG[id] = REG[id] || {}; x.ruolo = r; x.visto = Date.now(); if (b.versione) x.versione = b.versione; Object.assign(x, extra || {}); }
    function riga(etichetta, campo, valore, invia) { var r = el('div', 'off-riga'); r.appendChild(el('span', null, etichetta)); r.appendChild(campo); r.appendChild(bottone('Invia', 'piccolo', function () { invia(campo.value); })); return r; }
    function num(v, min, max) { var i = el('input'); i.type = 'number'; i.inputMode = 'numeric'; if (min != null) i.min = min; if (max != null) i.max = max; i.value = v == null ? '' : v; return i; }
    function formBandiera(k, pre, j) {
      var cmd = function (c) { bancoInvia(pre + c); toast('Mandato: ' + c + (pre ? ' (via radio, risponde tra qualche secondo)' : '')); };
      k.appendChild(riga('Soglia segnale tag (dBm)', num(j && j.soglia, -100, -30), null, function (v) { cmd('soglia ' + v); }));
      k.appendChild(el('small', 'hint', 'Più vicino a 0 = bisogna stare più vicini alla bandiera (-75 ≈ 5-8 m all\'aperto).'));
      k.appendChild(riga('Tempo di conquista (s)', num(j && j.tempo, 5, 3600), null, function (v) { cmd('tempo ' + v); }));
      k.appendChild(riga('Luminosità luci (0-255)', num(null, 0, 255), null, function (v) { cmd('luce ' + v); }));
      k.appendChild(riga('Manda lo stato ogni (s)', num(null, 2, 120), null, function (v) { cmd('ogni ' + v); }));
      var fz = select([['0', 'Neutra'], ['1', 'BLU'], ['2', 'ROSSI']], j && j.owner === 'blu' ? '1' : j && j.owner === 'rossa' ? '2' : '0');
      k.appendChild(riga('Di chi è l\'area adesso', fz, null, function (v) { cmd('fazione ' + v); }));
      var g = el('div', 'off-tasti');
      [['🔊 Prova luci e suono', 'test'], ['📍 Coordinate sul display 20 min', 'posizione 20'], ['🔇 Muto', 'muto 1'], ['🔔 Suono', 'muto 0'], ['↺ Area neutra', 'reset'], ['📨 Manda lo stato', 'invia'], ['ℹ Info', 'info'], ['⏻ Riavvia', 'riavvia']].forEach(function (x) {
        g.appendChild(bottone(x[0], 'piccolo', function () { if (x[1] === 'riavvia' && !confirm('Riavviare?')) return; cmd(x[1]); }));
      });
      k.appendChild(g);
      var av = el('details'); av.appendChild(el('summary', null, 'Avanzate'));
      av.appendChild(bottone('Inverti il segnale del cicalino (se suona sempre o mai)', 'piccolo', function () { cmd('buzzer'); }));
      av.appendChild(bottone('Togli i colpiti dalla memoria', 'piccolo', function () { cmd('morti -'); }));
      k.appendChild(av);
    }
    var firma = '', chiesto = null;
    function disegna() {
      var r = ruolo(), id = idCollegato(r);
      var cc = b.via === 'BT' ? b.dev : b.porta; if (b.via && r === '?' && chiesto !== cc) { chiesto = cc; setTimeout(function () { bancoInvia('info'); }, 600); }
      var f = JSON.stringify([b.via, r, id, Object.keys(b.band).sort(), sel, CHAT.io && [CHAT.io.nome, CHAT.io.f], b.versione, Object.keys(CHAT.lora).length, Object.keys(REG).length]);
      if (term.open) tpre.textContent = b.righe.slice(-40).join('\n');
      if (f === firma) return; firma = f;
      if (r && r !== '?') { ricorda(id, r); salvaReg(); }
      conn.innerHTML = '';
      if (!b.via) {
        conn.appendChild(el('b', null, 'Collega un dispositivo'));
        conn.appendChild(el('p', 'hint', (window.ACPonte ? 'Cavo OTG: attacca il T-Beam al telefono e premi «USB». ' : 'Cavo: dal computer con Chrome o Edge. ') + 'Bluetooth: per HQ, LoRa team leader e iniettore.'));
        var rr = el('div', 'riga2'); rr.appendChild(bottone('USB (cavo)', 'accent', bancoUsb)); rr.appendChild(bottone('Bluetooth', '', bancoBle)); conn.appendChild(rr);
      } else {
        var nomeLoc = id && REG[id] && REG[id].nome;
        conn.appendChild(el('b', 'off-blocco', '🔌 ' + NOMI[r] + (id ? ' · ' + id : '') + (nomeLoc ? ' · «' + nomeLoc + '»' : '')));
        conn.appendChild(el('small', 'hint off-blocco', 'Collegato via ' + b.via + (b.versione ? ' · firmware ' + b.versione : '')));
        var r2 = el('div', 'riga2');
        r2.appendChild(bottone('Chiedi chi è', 'piccolo', function () { bancoInvia('info'); }));
        if (id) r2.appendChild(bottone('✎ Nome / nota', 'piccolo', function () { var v = prompt('Nome o nota per ' + id + ' (es. ALFA, «antenna da rifare»)', nomeLoc || ''); if (v === null) return; REG[id] = REG[id] || { ruolo: r }; REG[id].nome = v.trim(); salvaReg(); firma = ''; disegna(); }));
        r2.appendChild(bottone('Scollega', 'piccolo', function () { bancoScollega(); firma = ''; disegna(); }));
        conn.appendChild(r2);
      }
      pan.innerHTML = '';
      if (r === '?') { var k0 = el('div', 'carta'); k0.appendChild(el('p', 'hint', 'Non so ancora cos\'è: premi «Chiedi chi è», oppure riavvia la scheda col tasto RST mentre è collegata.')); pan.appendChild(k0); }
      if (r === 'BANDIERA') {
        var j = b.band[id], k = el('div', 'carta'); k.appendChild(el('h3', null, '⚑ Bandiera ' + id));
        if (j) k.appendChild(el('small', 'hint', 'Area: ' + (j.owner ? esNomeFaz(j.owner) : 'neutra') + ' · soglia ' + j.soglia + ' · conquista ' + j.tempo + ' s · batteria ' + (j.batt === 255 ? 'USB' : j.batt + '%') + ' · GPS ' + (j.gpsFisso ? 'ok' : 'senza fix')));
        formBandiera(k, '', j); pan.appendChild(k);
      }
      if (r === 'HQ') {
        var k2 = el('div', 'carta'); k2.appendChild(el('h3', null, '📡 HQ ' + (id || '')));
        k2.appendChild(el('small', 'hint', 'Da qui configuri via radio le bandiere accese. Ogni bandiera si fa sentire ogni 10-20 secondi.'));
        var ids = Object.keys(b.band).sort();
        var s = select([['', ids.length ? 'Scegli la bandiera…' : 'Nessuna bandiera sentita ancora'], ['tutte', 'TUTTE le bandiere']].concat(ids.map(function (q) { var n = REG[q] && REG[q].nome; return [q, q + (n ? ' · ' + n : '') + ' · ' + (b.band[q].owner ? esNomeFaz(b.band[q].owner) : 'neutra')]; })), sel || '');
        s.onchange = function () { sel = s.value || null; firma = ''; disegna(); };
        k2.appendChild(campoForm('Bandiera', s));
        if (sel) { formBandiera(k2, 'cmd ' + sel + ' ', sel === 'tutte' ? null : b.band[sel]); ids.forEach(function (q) { ricorda(q, 'BANDIERA'); }); salvaReg(); }
        var lo = Object.keys(CHAT.lora); if (lo.length) k2.appendChild(el('small', 'hint', 'LoRa in rete: ' + lo.map(function (q) { return CHAT.lora[q].nome || q; }).join(', ')));
        pan.appendChild(k2);
      }
      if (r === 'LORA') {
        var k3 = el('div', 'carta'); k3.appendChild(el('h3', null, '📡 LoRa team leader ' + (id || '')));
        var io = CHAT.io || {};
        var nm = el('input'); nm.value = io.nome || ''; nm.maxLength = 28; nm.placeholder = 'es. TAURI·WHIPLASH';
        var fz2 = select([['-', 'Nessuna'], ['blu', 'BLU'], ['rossa', 'ROSSI']], io.f || '-');
        k3.appendChild(campoForm('Nome', nm)); k3.appendChild(campoForm('Fazione', fz2));
        k3.appendChild(bottone('Salva sul LoRa', 'accent', function () { bancoInvia('chi ' + fz2.value + ' ' + nm.value.trim().toUpperCase()); toast('Salvato sul LoRa'); }));
        var g3 = el('div', 'off-tasti');
        g3.appendChild(bottone('📨 Manda la posizione', 'piccolo', function () { bancoInvia('invia'); }));
        [['🌑 Notte scurissima', 1], ['🌙 Notte media', 2], ['🌘 Notte chiara', 3]].forEach(function (x) { g3.appendChild(bottone(x[0], 'piccolo', function () { bancoInvia('livello ' + x[1]); toast('Guarda lo schermo: se non si legge al buio, prova quella più chiara'); })); });
        g3.appendChild(bottone('☀ Giorno', 'piccolo', function () { bancoInvia('notte 0'); toast('Schermo pieno'); }));
        g3.appendChild(bottone('📡 Apri la chat', 'piccolo', function () { vai('chat'); }));
        g3.appendChild(bottone('⏻ Riavvia', 'piccolo', function () { if (confirm('Riavviare?')) bancoInvia('riavvia'); }));
        k3.appendChild(g3);
        // prova della luminosità: cambia lo schermo subito, poi mi dici i tre numeri migliori
        var pl = el('details', 'off-lum'); pl.appendChild(el('summary', null, '🔅 Prova luminosità (per trovare la notte giusta)'));
        var lv = { c: 0, p: 241, v: 64 }, lt = el('div', 'off-lum-val');
        function manda() { bancoInvia('lum ' + lv.c + ' ' + lv.p + ' ' + lv.v); lt.textContent = 'Valori: ' + lv.c + ' ' + lv.p + ' ' + lv.v + '  (scrivimeli quando trovi quelli giusti)'; }
        [['Contrasto', 'c', 0, 255, 1], ['Precarica', 'p', 1, 255, 1], ['VCOMH', 'v', 0, 64, 16]].forEach(function (x) {
          var r = el('input'); r.type = 'range'; r.min = x[2]; r.max = x[3]; r.step = x[4]; r.value = lv[x[1]];
          var et = el('span', null, x[0] + ': ' + lv[x[1]]);
          r.oninput = function () { lv[x[1]] = +r.value; et.textContent = x[0] + ': ' + r.value; };
          r.onchange = manda;
          var w = el('div', 'off-lum-r'); w.appendChild(et); w.appendChild(r); pl.appendChild(w);
        });
        pl.appendChild(lt);
        pl.appendChild(el('small', 'hint', 'Muovi un cursore e guarda lo schermo del LoRa (cambia quando lasci il cursore). In una stanza buia cerca la luce più bassa che si legge ancora. Il tasto del LoRa rimette tutto normale. Da console: lum 0 241 64'));
        k3.appendChild(pl); pan.appendChild(k3);
      }
      if (r === 'TAG') {
        var k4 = el('div', 'carta'); k4.appendChild(el('h3', null, '◉ Tag finto'));
        var t = b.tag || {};
        k4.appendChild(riga('Fazione (1 blu, 2 rossi)', num(t.f === 'rossa' ? 2 : 1, 1, 2), null, function (v) { bancoInvia('f ' + v); }));
        k4.appendChild(riga('Numero', num(t.tag, 1, 999), null, function (v) { bancoInvia('n ' + v); }));
        k4.appendChild(riga('Potenza (0-7)', num(null, 0, 7), null, function (v) { bancoInvia('pot ' + v); }));
        pan.appendChild(k4);
      }
      if (r === 'INIETTORE') {
        var k5 = el('div', 'carta'); k5.appendChild(el('h3', null, '⬇ Iniettore'));
        k5.appendChild(el('p', 'hint', 'Per programmare i tag usa Beacon prog: il collegamento resta questo.'));
        var g5 = el('div', 'riga2'); g5.appendChild(bottone('Beacon prog', 'accent', function () { vai('beaconProg'); })); g5.appendChild(bottone('Iniettore', '', function () { vai('banco'); })); k5.appendChild(g5);
        pan.appendChild(k5);
      }
      regBox.innerHTML = ''; regBox.appendChild(el('b', null, 'I tuoi dispositivi'));
      var ks = Object.keys(REG).sort(function (x, y) { return (REG[y].visto || 0) - (REG[x].visto || 0); });
      if (!ks.length) regBox.appendChild(el('p', 'hint', 'Qui compare ogni dispositivo che colleghi, con l\'ultima volta che l\'hai visto. Sono salvati su questo telefono.'));
      ks.forEach(function (q) {
        var x = REG[q], d = new Date(x.visto || 0), rr2 = el('div', 'off-reg');
        rr2.appendChild(el('span', null, (NOMI[x.ruolo] || x.ruolo) + ' · ' + q + (x.nome ? ' · «' + x.nome + '»' : '')));
        rr2.appendChild(el('small', 'hint', (x.versione ? 'fw ' + x.versione + ' · ' : '') + 'visto ' + d.toLocaleDateString() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2)));
        rr2.onclick = function () { var v = prompt('Nome o nota per ' + q + ' (vuoto = togli dalla lista)', x.nome || ''); if (v === null) return; if (!v.trim() && confirm('Togliere ' + q + ' dalla lista?')) delete REG[q]; else x.nome = v.trim(); salvaReg(); firma = ''; disegna(); };
        regBox.appendChild(rr2);
      });
    }
    var prima = b.cb, prossimo = null;
    b.cb = function () { if (prima) prima(); if (prossimo) return; prossimo = setTimeout(function () { prossimo = null; if (!pan.contains(document.activeElement) || !document.activeElement.matches('input,select')) disegna(); }, 400); };
    term.ontoggle = function () { if (term.open) tpre.textContent = b.righe.slice(-40).join('\n'); };
    var tk = setInterval(function () { if (!document.activeElement.matches('input,select')) disegna(); }, 3000); disegna();
    if (b.via) bancoInvia('info');
    var ch = chiusura; chiusura = function () { clearInterval(tk); b.cb = prima; if (ch) ch(); };
  }
  function home() {
    if (TOOL) { homeTool(); return; }
    if (apriNascosta) { var v = apriNascosta; apriNascosta = null; history.replaceState(null, '', location.pathname); setTimeout(function () { vai(v); }, 0); }
    if (apriEvento && S.stato().me.callsign) {
      var tipoE = apriEvento[0], idE = apriEvento.slice(2), lst = tipoE === 'a' ? D.allenamenti : D.conflitti;
      if (lst.some(function (x) { return x.id === idE; })) { finitoApriEvento(); setTimeout(function () { vai(tipoE === 'a' ? 'allenamento' : 'conflitto', idE); }, 0); }
      else if (!home.attesaEv) home.attesaEv = setTimeout(function () {   // i dati arrivano un attimo dopo: se dopo 8 s non c'e', non e' per il suo team
        home.attesaEv = null; if (apriEvento) { finitoApriEvento(); toast('Evento non trovato: forse il tuo team non è invitato'); }
      }, 8000);
    }
    var st = S.stato(), me = st.me;
    if (!me.callsign) return sceltaCallsign();
    if (apriEs) {
      var esA = esercizioInCorso();
      if (esA) { var az = apriEs; apriEs = null; try { sessionStorage.removeItem('apriEs'); } catch (e) {} setTimeout(function () { vai('esercizio', esA.id + '~' + az); }, 0); }
      else if (!home.attesaEs) home.attesaEs = setTimeout(function () { home.attesaEs = null; if (apriEs) { apriEs = null; try { sessionStorage.removeItem('apriEs'); } catch (e) {} toast('Nessuna esercitazione in corso'); } }, 8000);
    }
    var lista = attivi(), inviti = [], promemoria = [];
    lista.forEach(function (c) {
      // anche chi organizza risponde, se il suo team è invitato; e vede comunque tutti i conflict
      if (c.prova) { if (P('conflitti') || (c.invitati || []).indexOf(st.user.uid) >= 0) promemoria.push(c); return; }
      var invitato = me.team && (c.team || []).indexOf(me.team) >= 0, a = invitato && miaAdesione(c.id);
      if (invitato && (!a || a.dopo)) inviti.push(c);
      else if (P('conflitti') || (invitato && a.si)) promemoria.push(c);
    });
    var all = allenamentiAttivi().filter(function (a) { var r = miaAdesione('a:' + a.id); return P('allenamenti') || !r || r.si || r.dopo; });
    var dz = D.dmz.filter(function (x) { return x.fine > Date.now() - 6 * 3600000 && (x.giocatori || []).indexOf(st.user.uid) >= 0; });
    if (!inviti.length && !promemoria.length && !all.length && !dz.length) { schermataInvito(); return; }
    var esH = esercizioInCorso();
    if (esH) { var kE = bottone('⚑ ESERCITAZIONE IN CORSO · apri', 'accent big es-home', function () { vai('esercizio', esH.id); }); app.appendChild(kE); }
    inviti.forEach(function (c) { app.appendChild(cartaInvito(c)); });
    // conflict e allenamenti in ordine di data
    promemoria.map(function (c) { return { t: c.inizio, el: cartaPromemoria(c) }; }).concat(all.map(function (a) { return { t: a.inizio || 0, el: cartaAllenamento(a) }; }))
      .concat(dz.map(function (x) { return { t: x.inizio, el: cartaDmz(x) }; }))
      .sort(function (x, y) { var cx = x.el.classList.contains('concluso'), cy = y.el.classList.contains('concluso'); return cx !== cy ? (cx ? 1 : -1) : cx ? y.t - x.t : x.t - y.t; }).forEach(function (x) { app.appendChild(x.el); });   // i conclusi in fondo
  }

  // funzioni in prova, aperte a tutti: per ora il mortaio
  function cartaBeta() {
    var k = el('button', 'carta beta'); k.type = 'button';
    var t = el('div', 'pm-testa'); t.appendChild(el('span', 'pm-eti', 'BETA')); k.appendChild(t);
    var r0 = el('div', 'beta-r'); r0.appendChild(el('span', 'beta-ic', '✹'));
    var tx = el('div'); tx.appendChild(el('h3', null, 'Mortaio')); tx.appendChild(el('small', null, 'Prova a sparare: deriva, alzo, carica e tavola di tiro. Simulazione, niente arriva sul campo.')); r0.appendChild(tx);
    k.appendChild(r0);
    k.onclick = function () { vai('mortaioProva'); };
    return k;
  }
  // al primo accesso: senza callsign non si entra (è l'unico nome che vedono gli altri)
  function sceltaCallsign() {
    var me = S.stato().me, box = el('div', 'invito');
    box.appendChild(el('span', 'invito-stella', '★'));
    box.appendChild(el('h2', null, 'Il tuo callsign'));
    box.appendChild(el('p', null, 'Nell\'app gli altri giocatori vedono solo il tuo callsign. Nome e cognome restano privati: li vedi tu e gli organizzatori.'));
    var form = el('form', 'codice'), inp = el('input'); inp.placeholder = 'es. FALCO'; inp.maxLength = 20; inp.autocomplete = 'off';
    var ok = el('button', 'btn accent big', 'Conferma'); ok.type = 'submit';
    form.appendChild(inp); form.appendChild(ok); box.appendChild(form);
    form.onsubmit = function (e) {
      e.preventDefault(); var v = inp.value.trim(); if (v.length < 2) { toast('Scrivi il tuo callsign'); return; }
      S.aggiornaProfilo({ callsign: v }).then(function () { toast('Benvenuto, ' + v); }, errore);
    };
    app.appendChild(box);
  }
  function schermataInvito() {
    var me = S.stato().me, t = teamDi(me.team);
    var box = el('div', 'invito');
    box.appendChild(el('span', 'invito-stella', '★'));
    if (!t) {
      box.appendChild(el('h2', null, 'Hai un codice?'));
      box.appendChild(el('p', null, 'Il referente del tuo team ti dà un codice di 6 lettere. Inseriscilo qui per entrare.'));
    } else {
      box.appendChild(el('h2', null, 'Nessun invito'));
      box.appendChild(el('p', null, 'Sei nel team ' + t.nome + '. Quando il tuo team viene invitato a un conflict lo trovi qui.'));
    }
    var form = el('form', 'codice');
    var inp = el('input'); inp.placeholder = 'CODICE'; inp.maxLength = 8; inp.autocomplete = 'off'; inp.setAttribute('autocapitalize', 'characters');
    var ok = el('button', 'btn accent big', 'Entra'); ok.type = 'submit';
    form.appendChild(inp); form.appendChild(ok);
    form.onsubmit = function (e) {
      e.preventDefault(); if (!inp.value.trim()) return;
      ok.disabled = true;
      S.entraTeam(inp.value).then(function () { toast('Benvenuto nel team!'); }, function (er) { toast(er.message === 'Codice non valido' ? 'Codice non valido' : 'Errore: ' + er.message); ok.disabled = false; });
    };
    if (t) {
      form.hidden = true;
      var cambia = bottone('Ho un codice di un altro team', 'link', function () { form.hidden = false; cambia.remove(); inp.focus(); });
      box.appendChild(form); box.appendChild(cambia);
    } else box.appendChild(form);
    if (organizza()) box.appendChild(bottone('Organizza conflict e team', '', function () { vai('organizza'); }));
    app.appendChild(box);
  }

  function cartaInvito(c) {
    var k = el('div', 'carta invito-c');
    k.appendChild(el('small', 'eti', 'INVITO'));
    k.appendChild(el('h3', null, c.titolo));
    k.appendChild(el('p', null, dataLunga(c.inizio) + ' · ' + (c.luogo || '')));
    var f = mieFaz(c); if (f) { var ch = el('span', 'faz-chip', 'Con i ' + nomeFaz(c, f).toUpperCase()); ch.style.background = COLORI[f]; k.appendChild(ch); }
    k.appendChild(treRisposte(c.id, 'conflitti'));
    return k;
  }
  // i tre tasti di risposta a un invito
  function treRisposte(id, coll, dopo) {
    var r = el('div', 'tre-risp');
    [['si', 'Partecipo', 'accent'], ['no', 'Non partecipo', ''], ['dopo', 'Ricordamelo più tardi', 'link']].forEach(function (o) {
      r.appendChild(bottone(o[1], o[2], function () {
        S.rispondiInvito(id, o[0], coll).then(function () { toast({ si: 'Ci sei! Promemoria salvato', no: 'Risposta inviata', dopo: 'Te lo richiedo alla prossima apertura' }[o[0]]); if (dopo) dopo(o[0]); }, errore);
      }));
    });
    return r;
  }

  // evento concluso: carta bassa e spenta, data a sinistra, a destra il tipo, la cartina giocata e l'eventuale vincitore
  function cartaConclusa(tipo, x, vincitore, apri) {
    var k = el('button', 'carta concluso'); k.type = 'button';
    var d = x.inizio ? new Date(x.inizio) : null;
    var cal = el('div', 'cc-data');
    cal.appendChild(el('b', null, d ? String(d.getDate()) : '–'));
    cal.appendChild(el('small', null, d ? d.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '').toUpperCase() : ''));
    k.appendChild(cal);
    var tx = el('div', 'cc-tx');
    tx.appendChild(el('span', 'cc-eti', tipo + ' concluso'));
    var cm = x.campo ? campoMeta(x.campo) : null;
    tx.appendChild(el('span', 'cc-nome', cm ? cm.nome : (x.luogo || x.titolo || '')));
    k.appendChild(tx);
    if (vincitore) { var w = el('span', 'cc-vince', '🏆 ' + vincitore); k.appendChild(w); }
    if (apri) k.onclick = apri; else k.disabled = true;
    return k;
  }
  function cartaPromemoria(c) {
    var k = el('button', 'carta promemoria'); k.type = 'button';
    var f = mieFaz(c), fs = fase(c);
    if (f) k.style.setProperty('--faz', COLORI[f]);
    var testa = el('div', 'pm-testa');
    if (c.prova) {
      k.classList.add('prova');
      testa.appendChild(el('span', 'pm-eti', 'PROVA · SEMPRE IN CORSO')); k.appendChild(testa);
      k.appendChild(el('h3', null, c.titolo));
      k.appendChild(el('div', 'pm-luogo', (c.invitati || []).length + ' giocatori invitati · riparte ogni 4 ore'));
      if (f) { var chp = el('span', 'faz-chip', 'SEI CON I ' + nomeFaz(c, f).toUpperCase()); chp.style.background = COLORI[f]; k.appendChild(chp); }
      k.appendChild(el('span', 'pm-apri', 'Tocca per entrare ›'));
      k.onclick = function () { vai('conflitto', c.id); };
      return k;
    }
    if (fs === 'finito') return cartaConclusa('Conflict', c, c.vincitore ? nomeFaz(c, c.vincitore) : '', P('conflitti') ? function () { vai('conflitto', c.id); } : null);
    testa.appendChild(el('span', 'pm-eti', fs === 'live' ? '● IN CORSO' : fs === 'finito' ? 'CONCLUSO' : 'RENDEZVOUS'));
    testa.appendChild(el('span', 'pm-tra', fs === 'live' || fs === 'finito' ? '' : traQuanto(c.inizio)));
    k.appendChild(testa);
    k.appendChild(el('h3', null, c.titolo));
    k.appendChild(el('div', 'pm-data', dataBreve(c.inizio)));
    var orari = el('div', 'pm-orari');
    [['RITROVO', c.ritrovo], ['INIZIO', c.inizio], ['FINE', c.fine]].forEach(function (o) {
      if (!o[1]) return; var d = el('div'); d.appendChild(el('small', null, o[0])); d.appendChild(el('b', null, ora(o[1]))); orari.appendChild(d);
    });
    k.appendChild(orari);
    k.appendChild(el('div', 'pm-luogo', '⌖ ' + (c.luogo || 'Luogo da definire')));
    if (fs !== 'finito' && window.AC_METEO) k.appendChild(AC_METEO.riquadro(c));
    if (f) { var ch = el('span', 'faz-chip', 'SEI CON I ' + nomeFaz(c, f).toUpperCase()); ch.style.background = COLORI[f]; k.appendChild(ch); }
    k.appendChild(el('span', 'pm-apri', 'Tocca per info, fazioni e cartina ›'));
    k.onclick = function () { vai('conflitto', c.id); };
    return k;
  }

  // ================= PAGINA DEL CONFLICT
  function pagConflitto(cid) {
    var c = D.conflitti.filter(function (x) { return x.id === cid; })[0];
    if (!c) { testata('Conflict'); app.appendChild(el('p', 'hint', 'Conflict non trovato.')); return; }
    var fs = fase(c);
    if (fs === 'live') return schermoPartita(c);
    if (fs === 'giorno') return schermoGiorno(c);
    testata(c.titolo);
    var corpo = el('div', 'conf');
    app.appendChild(corpo);
    sezioniConflitto(corpo, c, false);
    // la pagina passa da sola alla fase successiva (giorno, partita)
    var t = setInterval(function () { if (fase(c) !== fs) mostra(); }, 30000);
    var prima = chiusura; chiusura = function () { clearInterval(t); if (prima) prima(); };
  }

  // contenuto comune: intestazione, risposta, fazioni, bacheca, cartina, parcheggio
  function sezioniConflitto(box, c, tutto) {
    var st = S.stato();
    var hero = el('div', 'conf-hero');
    hero.appendChild(el('div', 'pm-data', dataLunga(c.inizio).toUpperCase()));
    var orari = el('div', 'pm-orari');
    [['RITROVO', c.ritrovo], ['INIZIO', c.inizio], ['FINE', c.fine]].forEach(function (o) {
      if (!o[1]) return; var d = el('div'); d.appendChild(el('small', null, o[0])); d.appendChild(el('b', null, ora(o[1]))); orari.appendChild(d);
    });
    hero.appendChild(orari);
    var lg = el('div', 'conf-luogo'); lg.appendChild(el('span', null, '⌖ ' + (c.luogo || 'Luogo da definire')));
    if (c.luogo || c.mapsUrl) lg.appendChild(link('Apri in Maps', mapsLink(c), 'btn piccolo'));
    hero.appendChild(lg);
    if (fase(c) === 'finito') hero.appendChild(el('div', 'conf-fine', 'CONFLICT CONCLUSO'));
    if (addestramento(c)) hero.insertBefore(el('div', 'conf-tipo', 'ADDESTRAMENTO'), hero.firstChild);
    if (c.prova) hero.insertBefore(el('div', 'conf-tipo', 'PROVA · SEMPRE IN CORSO · RIPARTE ALLE ' + ora(inizioProva(c) + GIRO_PROVA)), hero.firstChild);
    box.appendChild(hero);

    if (st.me.team && (c.team || []).indexOf(st.me.team) >= 0) {
      var a = miaAdesione(c.id), r = el('div', 'risposta');
      r.appendChild(el('span', null, a && !a.dopo ? (a.si ? 'Hai confermato la presenza' : 'Hai detto che non vieni') : 'Ci sarai?'));
      r.appendChild(bottone(a && a.si ? 'Non vengo più' : 'Partecipo', a && a.si ? 'piccolo' : 'accent piccolo', function () { S.rispondiInvito(c.id, a && a.si ? 'no' : 'si').then(function () { mostra(); }, errore); }));
      box.appendChild(r);
    }
    if (c.campo && (S.stato().me.posaQrFino || 0) > Date.now() && fase(c) !== 'finito') box.appendChild(bottone('📍 Posa i QR sul campo', 'accent', function () { vai('posa', c.campo); }));
    if (P('conflitti')) {
      var adm = el('div', 'riga2'); adm.hidden = true;
      adm.appendChild(bottone('Modifica conflict', '', function () { vai('conflittoModifica', c.id); }));
      adm.appendChild(bottone('+ Nuovo post', '', function () { editorPost(c, null); }));
      adm.appendChild(bottone('📻 Maglia radio', '', function () { vai('radio', c.id); }));
      if (c.campo) adm.appendChild(bottone('📍 Chi posa i QR', '', function () { abilitaPosa(c); }));
      if (c.campo && (campoMeta(c.campo) || {}).geo) adm.appendChild(bottone('🗺 Cartina PDF', '', function () { pdfCartina(c.campo); }));
      if (c.prova) adm.appendChild(bottone('↺ Ricomincia la partita da zero', '', function () {
        if (!confirm('Far ripartire la partita adesso? Aree, rifornimenti e mortai tornano come all\'inizio.')) return;
        var x = JSON.parse(JSON.stringify(c)); x.provaDa = Date.now(); S.salvaConflitto(x).then(function () { toast('Partita ripartita'); }, errore);
      }));
      if (!c.prova) box.appendChild(bottone('🔗 Condividi il link per le presenze', 'accent', function () { condividiEvento('c', c); }));
      adm.appendChild(bottone('⧉ Duplica', '', function () { vai('conflittoModifica', { copia: c.id }); }));
      box.appendChild(bottone('⚙ Gestisci', 'link', function () { adm.hidden = !adm.hidden; }));
      box.appendChild(adm);
      // solo chi organizza: due schede, la giocata e le presenze (chi ha risposto, team per team)
      var adesC = D.adesioni[c.id] || [];
      var pres = el('div', 'pres'), giocata = el('div');
      schede(box, 'conf:' + c.id, [['giocata', 'Giocata', giocata], ['presenze', 'Presenze · ' + adesC.filter(function (x) { return x.si; }).length + ' sì', pres, function () { vistaPresenze(pres, adesC, c.team || [], function (a) { return S.eliminaAdesione(c.id, a.id); }); }]]);
      box = giocata;
    }

    // fazioni
    box.appendChild(el('h3', 'sez', 'Fazioni'));
    var fz = el('div', 'fazioni');
    var mia = mieFaz(c), ades = D.adesioni[c.id] || [];
    (c.fazioni || []).forEach(function (f) {
      var k = el('div', 'faz' + (f.id === mia ? ' mia' : '')); k.style.setProperty('--faz', COLORI[f.id]);
      var h = el('div', 'faz-testa'); h.appendChild(el('b', null, f.nome.toUpperCase()));
      if (mia) h.appendChild(el('small', null, f.id === mia ? 'CON TE' : 'CONTRO DI TE'));
      k.appendChild(h);
      if (addestramento(c) || c.prova) {
        var nomi = Object.keys(c.nomiGioc || {}).filter(function (u) { return ((c.fazioneUtente || {})[u] || 'blu') === f.id; }).map(function (u) { return c.nomiGioc[u]; }).sort();
        var lst = el('div', 'faz-gioc'); nomi.forEach(function (n) { lst.appendChild(el('span', null, n)); });
        if (!nomi.length) lst.appendChild(el('span', 'hint', 'Nessuno'));
        k.appendChild(lst);
        if (addestramento(c)) k.appendChild(el('small', 'faz-nota', f.id === 'blu' ? 'Comandante automatico · conquista i punti chiave' : 'Ognuno riceve il suo posto dal comandante automatico'));
        fz.appendChild(k); return;
      }
      (f.team || []).forEach(function (tid) {
        var t = teamDi(tid); if (!t) return;
        var row = el('div', 'faz-team');
        row.appendChild(logo(t, 40));
        var info = el('div', 'faz-info');
        info.appendChild(el('b', null, t.nome));
        var n = P('conflitti') ? ades.filter(function (x) { return x.team === tid && x.si; }).length : 0;
        info.appendChild(el('small', null, (t.referente && t.referente.nome ? 'Ref. ' + t.referente.nome : 'Referente da indicare') + (n ? ' · ' + n + ' confermati' : '')));
        row.appendChild(info);
        var tel = D.contatti[tid];
        if (tel) {
          var az = el('div', 'faz-az');
          az.appendChild(link('☎', telLink(tel), 'btn icon'));
          az.appendChild(link('WA', waLink(tel), 'btn icon wa'));
          row.appendChild(az);
        }
        k.appendChild(row);
      });
      if (!(f.team || []).length) k.appendChild(el('p', 'hint', 'Team da assegnare'));
      fz.appendChild(k);
    });
    box.appendChild(fz);

    // bacheca
    var tb = el('h3', 'sez', 'Bacheca'); box.appendChild(tb);
    var bach = el('div', 'bacheca'); bach.appendChild(el('p', 'hint', 'Caricamento…'));
    box.appendChild(bach);
    var stopB = S.ascoltaBacheca(c.id, function (posts) {
      var now = Date.now();
      posts = posts.filter(function (p) { return P('bachecaPrima') || P('conflitti') || !p.pubblica || p.pubblica <= now; }).sort(function (a, b) { return (b.pubblica || 0) - (a.pubblica || 0); });
      bach.innerHTML = '';
      if (!posts.length) bach.appendChild(el('p', 'hint', 'Ancora niente. Durante la settimana qui arrivano storia, prefazioni e indicazioni.'));
      posts.forEach(function (p) { bach.appendChild(cartaPost(c, p)); });
    });
    var prima = chiusura; chiusura = function () { stopB(); if (prima) prima(); };

    // maglia radio: il canale comune e quella della propria fazione (l'organizzatore le vede tutte)
    var rBox = el('div', 'radio-box'); box.appendChild(rBox);
    var piano = {}, docs = P('conflitti') ? ['comune', 'blu', 'rossa'] : ['comune'].concat(mieFaz(c) && P('radio') ? [mieFaz(c)] : []);
    var stopR = docs.map(function (d) { return S.ascoltaRadio(c.id, d, function (x) { piano[d] = x; disegnaRadio(rBox, c, piano); }); });
    var primaR = chiusura; chiusura = function () { stopR.forEach(function (f) { f(); }); if (primaR) primaR(); };

    // cartina del campo
    box.appendChild(el('h3', 'sez', 'Cartina del campo'));
    if (tutto || visibile(c.mappaDa, 'cartinaPrima')) {
      var mp = el('button', 'mini-mappa'); mp.type = 'button';
      var im = new Image(); im.alt = ''; mp.appendChild(im);
      if (S.campoInCache(c.campo)) im.src = S.campoInCache(c.campo).img;
      else if (c.campo) S.caricaCampo(c.campo).then(function (cm) { im.src = cm.img; }, function () {});
      mp.appendChild(el('span', null, 'Apri la cartina'));
      if (c.mappaDa && Date.now() < c.mappaDa) mp.appendChild(el('small', 'prog', 'I giocatori la vedono dal ' + dataBreve(c.mappaDa)));
      mp.onclick = function () { cartinaPiena(c); };
      box.appendChild(mp);
    } else box.appendChild(bloccato('La cartina sarà visibile da ' + dataLunga(c.mappaDa)));

    // parcheggio
    var pk = c.parcheggio || {};
    if (pk.testo || pk.mapsUrl) {
      box.appendChild(el('h3', 'sez', 'Parcheggio'));
      if (tutto || visibile(pk.da, 'parcheggioPrima')) {
        var k = el('div', 'carta');
        if (pk.testo) k.appendChild(el('p', 'testo', pk.testo));
        if (pk.mapsUrl) k.appendChild(link('Portami al parcheggio', pk.mapsUrl, 'btn accent'));
        if (pk.da && Date.now() < pk.da) k.appendChild(el('small', 'prog', 'I giocatori lo vedono dal ' + dataBreve(pk.da)));
        box.appendChild(k);
      } else box.appendChild(bloccato('Le indicazioni arrivano da ' + dataLunga(pk.da)));
    }
  }
  var privacyAperta = false;
  // schede (tab): la scelta resta finché non si cambia pagina
  var schedaScelta = {};
  function schede(box, chiave, voci) {
    var bar = el('div', 'schede'); box.appendChild(bar);
    voci.forEach(function (v) { box.appendChild(v[2]); });
    function apri(id) {
      schedaScelta[chiave] = id;
      voci.forEach(function (v) { v[2].hidden = v[0] !== id; v.b.classList.toggle('on', v[0] === id); if (v[0] === id && v[3] && !v.fatto) { v.fatto = true; v[3](); } });
    }
    voci.forEach(function (v) { v.b = bottone(v[1], 'scheda', function () { apri(v[0]); }); bar.appendChild(v.b); });
    apri(schedaScelta[chiave] || voci[0][0]);
  }
  // presenze per team: chi viene, chi no, chi non ha ancora risposto (solo organizzatori)
  // esporta la cartina così com'è (sola lettura): carica l'immagine e apre le scelte di stampa
  function pdfCartina(id) {
    toast('Carico la cartina…');
    S.caricaCampo(id).then(function (c) { window.AC_MAPPE.stampa(c); }, errore);
  }
  // chi organizza abilita alcuni giocatori del conflict a posare i QR del campo (fino a 6 ore dopo la fine)
  function abilitaPosa(c) {
    var stop = null;
    apriFoglio(function (f) {
      f.appendChild(el('h3', null, 'Chi posa i QR'));
      f.appendChild(el('p', 'hint', 'Tocca un giocatore per abilitarlo o toglierlo. Chi è abilitato vede «Posa i QR sul campo» nella pagina del conflict.'));
      var lista = el('div', 'posa-lista'); f.appendChild(lista);
      lista.appendChild(el('p', 'hint', 'Caricamento…'));
      var fino = Math.max(c.fine || 0, Date.now()) + 6 * 3600000;
      stop = S.ascoltaUtenti(function (ut) {
        var si = {}; (D.adesioni[c.id] || []).forEach(function (a) { if (a.si && !a.dopo) si[a.id] = 1; });
        var gioc = ut.filter(function (u) { return si[u.id] || (u.posaQrFino || 0) > Date.now(); })
          .sort(function (x, y) { return conNome(x).localeCompare(conNome(y)); });
        lista.innerHTML = '';
        if (!gioc.length) { lista.appendChild(el('p', 'hint', 'Nessuno ha ancora confermato la presenza.')); return; }
        gioc.forEach(function (u) {
          var on = (u.posaQrFino || 0) > Date.now();
          var r = el('button', 'posa-riga' + (on ? ' on' : '')); r.type = 'button';
          var tx = el('div'); tx.appendChild(el('b', null, conNome(u)));
          var t = teamDi(u.team); tx.appendChild(el('small', null, (t ? t.nome : '') + (on ? ' · abilitato fino a ' + dataBreve(u.posaQrFino) + ' ' + ora(u.posaQrFino) : '')));
          r.appendChild(tx); r.appendChild(el('span', 'posa-sw'));
          r.onclick = function () {
            r.disabled = true;
            S.salvaUtente(u.id, { posaQrFino: on ? null : fino }).then(function () { toast(on ? 'Tolto' : 'Abilitato'); }, function (e) { r.disabled = false; errore(e); });
          };
          lista.appendChild(r);
        });
      });
    });
    var prima = chiusura; chiusura = function () { if (stop) stop(); if (prima) prima(); };
    var f = $('foglio'), oss = new MutationObserver(function () { if (f.hidden) { if (stop) { stop(); stop = null; } oss.disconnect(); } });
    oss.observe(f, { attributes: true, attributeFilter: ['hidden'] });
  }
  function vistaPresenze(box, ades, teams, togli) {
    box.innerHTML = '';
    var att = el('p', 'hint', 'Caricamento dei giocatori…'); box.appendChild(att);
    var stopU = S.ascoltaUtenti(function (ut) { disegna(ut); });
    var prima = chiusura; chiusura = function () { stopU(); if (prima) prima(); };
    function nomeU(u) { return conNome(u); }
    function disegna(ut) {
      box.innerHTML = '';
      var perId = {}; ades.forEach(function (a) { perId[a.id] = a; });
      // i team invitati, più quelli di chi ha risposto ed è passato a un altro team
      var ids = teams.slice(); ades.forEach(function (a) { if (a.team && ids.indexOf(a.team) < 0) ids.push(a.team); });
      var tot = { si: 0, no: 0, att: 0 }, carte = [];
      ids.forEach(function (tid) {
        var t = teamDi(tid) || { nome: 'Team eliminato' };
        var membri = ut.filter(function (u) { return u.team === tid; });
        var si = [], no = [], at = [];
        membri.forEach(function (u) {
          var a = perId[u.id];
          if (a && !a.dopo) (a.si ? si : no).push({ nome: nomeU(u), a: a }); else at.push({ nome: nomeU(u), dopo: !!(a && a.dopo) });
        });
        // risposte di chi ora non è più nel team
        ades.forEach(function (a) { if (a.team === tid && !membri.some(function (u) { return u.id === a.id; }) && !a.dopo) (a.si ? si : no).push({ nome: a.nome || 'Giocatore', a: a }); });
        [si, no, at].forEach(function (l) { l.sort(function (x, y) { return x.nome.localeCompare(y.nome); }); });
        tot.si += si.length; tot.no += no.length; tot.att += at.length;
        var k = el('div', 'carta pres-team');
        var h = el('div', 'pres-testa'); h.appendChild(logo(t, 36));
        var ti = el('div'); ti.appendChild(el('b', null, (t.nome || '').toUpperCase())); ti.appendChild(el('small', null, membri.length === 1 ? '1 giocatore nel team' : membri.length + ' giocatori nel team')); h.appendChild(ti);
        var cnt = el('div', 'pres-cnt'); cnt.appendChild(el('span', 'si', si.length)); cnt.appendChild(el('span', 'no', no.length)); cnt.appendChild(el('span', 'att', at.length)); h.appendChild(cnt);
        k.appendChild(h);
        [['si', 'Vengono', si], ['no', 'Non vengono', no], ['att', 'Non hanno ancora risposto', at]].forEach(function (g) {
          if (!g[2].length) return;
          var sez = el('div', 'pres-gr ' + g[0]); sez.appendChild(el('h4', null, g[1] + ' · ' + g[2].length));
          var lst = el('div', 'pres-nomi');
          g[2].forEach(function (x) {
            var n = el('span', 'pres-nome', x.nome + (x.dopo ? ' · più tardi' : ''));
            if (x.a && togli) { var b = el('button', 'pres-x', '✕'); b.type = 'button'; b.title = 'Togli la risposta'; b.onclick = function () { if (confirm('Togliere la risposta di ' + x.nome + '?')) togli(x.a).catch(errore); }; n.appendChild(b); }
            lst.appendChild(n);
          });
          sez.appendChild(lst); k.appendChild(sez);
        });
        if (!membri.length && !si.length && !no.length) k.appendChild(el('p', 'hint', 'Nessun giocatore registrato in questo team.'));
        carte.push(k);
      });
      var riep = el('div', 'pres-riep');
      [['si', 'Vengono', tot.si], ['no', 'No', tot.no], ['att', 'In attesa', tot.att]].forEach(function (x) { var d = el('div', x[0]); d.appendChild(el('b', null, String(x[2]))); d.appendChild(el('small', null, x[1])); riep.appendChild(d); });
      box.appendChild(riep);
      carte.forEach(function (k) { box.appendChild(k); });
      if (!ids.length) box.appendChild(el('p', 'hint', 'Nessun team invitato.'));
    }
  }
  function bloccato(t) { var b = el('div', 'bloccato'); b.appendChild(el('span', null, '🔒')); b.appendChild(el('p', null, t)); return b; }
  function logo(t, px) {
    var w = el('span', 'logo'); w.style.width = w.style.height = px + 'px';
    if (t && t.logo) { var i = new Image(); i.src = t.logo; i.alt = ''; w.appendChild(i); }
    else w.textContent = (t && t.nome ? t.nome : '?').slice(0, 1).toUpperCase();
    return w;
  }
  var TIPI = { storia: 'STORIA', prefazione: 'PREFAZIONE', info: 'INFO' };
  function cartaPost(c, p) {
    var k = el('article', 'post');
    var h = el('div', 'post-testa');
    h.appendChild(el('span', 'post-tipo t-' + (p.tipo || 'info'), TIPI[p.tipo] || 'INFO'));
    h.appendChild(el('small', null, p.pubblica ? dataBreve(p.pubblica) : ''));
    if (p.pubblica && p.pubblica > Date.now()) h.appendChild(el('small', 'prog', 'programmato ' + dataBreve(p.pubblica) + ' ' + ora(p.pubblica)));
    k.appendChild(h);
    if (p.titolo) k.appendChild(el('h4', null, p.titolo));
    if (p.img) { var i = new Image(); i.src = p.img; i.alt = ''; i.className = 'post-img'; k.appendChild(i); }
    if (p.testo) k.appendChild(el('p', 'testo', p.testo));
    if (P('conflitti')) k.appendChild(bottone('Modifica', 'link', function () { editorPost(c, p); }));
    return k;
  }

  // cartina a tutto schermo (prima del giorno della partita)
  function cartinaPiena(c) {
    var p = aPieno();
    var bar = el('div', 'pieno-bar'); bar.appendChild(bottone('‹', 'icon indietro', function () { mostra(); }));
    var tt = el('b', null, (campoMeta(c.campo) || {}).nome || 'Cartina'); bar.appendChild(tt);
    p.appendChild(bar);
    var box = el('div', 'pieno-mappa'); p.appendChild(box);
    conCampo(c.campo, box, function (cm) { cm = perCategoria(cm, 'conflict');
      var v = F.vista(box, { g: motore(c), campo: cm, team: mieFaz(c), colori: COLORI, nomi: nomiFaz(c), ora: Date.now, anteprima: true });
      var prima = chiusura; chiusura = function () { v.chiudi(); if (prima) prima(); };
    });
  }
  function nomiFaz(c) { var n = {}; (c.fazioni || []).forEach(function (f) { n[f.id] = f.nome; }); return n; }

  // giorno del conflict: conto alla rovescia e cartina, il resto a tendina
  function schermoGiorno(c) {
    var p = aPieno();
    var bar = el('div', 'giorno-bar');
    var riga = el('div', 'giorno-riga');
    riga.appendChild(bottone('‹', 'icon indietro', function () { if (pila.length > 1) indietro(); else sostituisci('home'); }));
    var cd = el('div', 'countdown'); cd.appendChild(el('small', null, 'INIZIO TRA')); var num = el('b'); cd.appendChild(num);
    riga.appendChild(cd);
    var f = mieFaz(c); if (f) { var ch = el('span', 'faz-chip', nomeFaz(c, f).toUpperCase()); ch.style.background = COLORI[f]; riga.appendChild(ch); }
    bar.appendChild(riga);
    bar.appendChild(el('div', 'giorno-sub', c.titolo + ' · ritrovo ' + (c.ritrovo ? ora(c.ritrovo) : '—') + ' · fine ' + ora(c.fine)));
    var tir = bottone('▾ Info, fazioni, bacheca, parcheggio', 'tendina-btn');
    bar.appendChild(tir);
    p.appendChild(bar);
    var tendina = el('div', 'tendina'); tendina.hidden = true; p.appendChild(tendina);
    var box = el('div', 'pieno-mappa'); p.appendChild(box);
    var aperta = false;
    tir.onclick = function () {
      aperta = !aperta; tendina.hidden = !aperta; box.hidden = aperta; tir.textContent = aperta ? '▴ Torna alla cartina' : '▾ Info, fazioni, bacheca, parcheggio';
      if (!aperta) setTimeout(function () { if (v) v.centra(); }, 30);
      if (aperta && !tendina.firstChild) { var cont = el('div', 'conf'); tendina.appendChild(cont); var a = app; app = cont; try { sezioniConflitto(cont, c, true); } finally { app = a; } }
    };
    var v = null;
    function tic() { var r = c.inizio - Date.now(); num.textContent = F.hms(r); if (r <= 0) mostra(); }
    tic(); var t = setInterval(tic, 1000);
    var prima = chiusura; chiusura = function () { clearInterval(t); if (v) v.chiudi(); if (prima) prima(); };
    conCampo(c.campo, box, function (cm) { cm = perCategoria(cm, 'conflict'); v = F.vista(box, { g: motore(c), campo: cm, team: f, colori: COLORI, nomi: nomiFaz(c), ora: Date.now, anteprima: true }); });
  }

  // partita in corso: mappa a tutto schermo, tempi in alto, punti chiave in basso
  function schermoPartita(c) {
    var p = aPieno(), st = S.stato(), f = mieFaz(c);
    var box = el('div', 'pieno-mappa tutta'); p.appendChild(box);
    var tendina = el('div', 'tendina sopra'); tendina.hidden = true; p.appendChild(tendina);
    var comandante = !!f && ((c.comandanti && c.comandanti[f] === st.user.uid) || P('ordini'));
    var ultimi = [];
    // addestramento: i difensori attivi (che hanno dato segni di vita negli ultimi 10 minuti, più me) si dividono i posti
    var personali = addestramento(c) && f === 'rossa' ? function (st2, now, cl) {
      var assegnati = Object.keys(c.fazioneUtente || {}).filter(function (u) { return c.fazioneUtente[u] === 'rossa'; });
      var attivi = {}; ultimi.forEach(function (e) { if (e.team === 'rossa' && now - e.t < 600000) attivi[e.uid] = 1; });
      attivi[st.user.uid] = 1;
      var dif = assegnati.filter(function (u) { return attivi[u]; }).sort();
      var p = F.postiDifesa(motore(c), cl, st2, 'rossa', dif, now)[st.user.uid];
      return p ? [p] : [];
    } : null;
    conCampo(c.campo, box, function (cm) { cm = perCategoria(cm, 'conflict');
    // mortaio: stato ricalcolato dagli eventi, con chi tiene le aree adesso
    // conflict di prova: chi organizza mette e sposta pallini blu e rossi sulle aree per simulare le situazioni
    var simAttivo = !!(c.prova && P('conflitti'));
    function pallini() {
      var ult = {};
      ultimi.forEach(function (e) { if (e.tipo === 'zona' && e.sim && (!ult[e.uid] || ult[e.uid].t <= e.t)) ult[e.uid] = e; });
      return Object.keys(ult).map(function (k) { return ult[k]; }).filter(function (e) { return !e.via && (!e.pat || P('conflitti') || e.team === f); })
        .map(function (e) { return { id: e.uid, team: e.team, x: e.x, y: e.y, nome: e.nome, pt: e.pt }; });
    }
    function muoviPallino(id, x, y, pt) {
      if (String(id).indexOf('sim-pat-') === 0) { mostra(); return; }   // le pattuglie le muove il GPS
      var b = pallini().filter(function (q) { return q.id === id; })[0]; if (!b) return;
      S.scriviEvento(c.id, { tipo: 'zona', uid: id, team: b.team, pt: pt || null, x: x, y: y, sim: true, nome: b.nome, t: Date.now() });
    }
    function xyDi(p) {
      if (p.x != null) return { x: p.x, y: p.y };
      var g0 = cm.geo; return { x: g0.cx[0] * p.lon + g0.cx[1] * p.lat + g0.cx[2], y: g0.cy[0] * p.lon + g0.cy[1] * p.lat + g0.cy[2] };
    }
    function nuovoPallino(team) {
      var fz = (c.fazioni || []).filter(function (x) { return x.id === team; })[0], mob = fz && (cm.punti || []).filter(function (p) { return p.id === fz.mob; })[0];
      if (!mob) { toast('Manca la base della fazione'); return; }
      var q = xyDi(mob), tutti = {}; ultimi.forEach(function (e) { if (e.sim && e.team === team) tutti[e.uid] = 1; });
      var n = Object.keys(tutti).length + 1, sp = (n % 5) * 14 - 28;
      S.scriviEvento(c.id, { tipo: 'zona', uid: 'sim-' + S.idBreve(), team: team, pt: mob.id, x: q.x + sp, y: q.y + 18, sim: true, nome: (team === 'blu' ? 'B' : 'R') + n, t: Date.now() });
    }
    // il mortaio per ora solo nei conflict di prova
    var mortOn = !!(cm.geo && c.prova);
    var puntiG = puntiGeo(cm), visti = {}, apertoIl = Date.now(), mortPan = null, annullati = {};
    function statoMort() { var now = Date.now(), own = F.stato(motore(c), cm, ultimi, now).owner; return { s: window.AC_MORT.stato(c, puntiG, ultimi, now, own, motore(c).inizio), own: own }; }
    var v = F.vista(box, {
      g: motore(c), campo: cm, team: f, ordiniPersonali: personali, colori: COLORI, nomi: nomiFaz(c), ora: Date.now,
      sim: c.prova ? { attivo: simAttivo, pallini: pallini, muovi: muoviPallino } : null,
      segni: function () { return f && mortOn ? segniMortaio(statoMort().s, f, puntiG, Date.now(), false) : []; },
      gps: !!f, qr: !!f, comandante: comandante, presenze: P('presenze'),
      onZona: function (pt) { S.scriviEvento(c.id, { tipo: 'zona', uid: st.user.uid, team: f, pt: pt || null, t: Date.now() }); },
      onFine: function (v) { if (!c.prova && P('conflitti') && c.vincitore === undefined) { c.vincitore = v || ''; S.vincitoreConflitto(c.id, v || '').catch(function () {}); } },
      onOrdine: function (pt, azione, testo) { S.scriviEvento(c.id, { tipo: 'ordine', uid: st.user.uid, team: f, pt: pt, azione: azione, testo: testo, t: Date.now() }); },
      onMenu: function () {
        if (!tendina.hidden) { tendina.hidden = true; return; }
        tendina.innerHTML = '';
        var bar = el('div', 'riga2');
        bar.appendChild(bottone('Torna alla mappa', 'accent', function () { tendina.hidden = true; }));
        bar.appendChild(bottone('Esci', '', function () { if (pila.length > 1) indietro(); else sostituisci('home'); }));
        tendina.appendChild(bar);
        var cont = el('div', 'conf'); tendina.appendChild(cont);
        var a = app; app = cont; try { sezioniConflitto(cont, c, true); } finally { app = a; }
        tendina.hidden = false;
      }
    });
    if (simAttivo) {
      var simPan = el('div', 'sim-pan'); simPan.hidden = true; box.appendChild(simPan);
      var bs = bottone('Simula', 'fz-simula', function () { simPan.hidden = !simPan.hidden; disegnaSim(); }); box.appendChild(bs);
      var disegnaSim = function () {
        if (simPan.hidden) return;
        simPan.innerHTML = '';
        simPan.appendChild(el('b', null, 'Pallini simulati'));
        simPan.appendChild(el('small', null, 'Trascinali sulle aree: contano come giocatori presenti finché non li sposti.'));
        var r0 = el('div', 'riga2');
        r0.appendChild(bottone('+ ' + nomeFaz(c, 'blu'), 'piccolo s-blu', function () { nuovoPallino('blu'); simPan.hidden = true; toast('Pallino nella base: trascinalo su un\'area'); }));
        r0.appendChild(bottone('+ ' + nomeFaz(c, 'rossa'), 'piccolo s-rossa', function () { nuovoPallino('rossa'); simPan.hidden = true; toast('Pallino nella base: trascinalo su un\'area'); }));
        simPan.appendChild(r0);
        var ch = el('div', 'chips');
        pallini().forEach(function (b) {
          var x = bottone(b.nome + ' ✕', 'chip on s-' + b.team, function () { S.scriviEvento(c.id, { tipo: 'zona', uid: b.id, team: b.team, pt: null, x: null, y: null, sim: true, via: true, nome: b.nome, t: Date.now() }); });
          ch.appendChild(x);
        });
        simPan.appendChild(ch);
        if (pallini().length) simPan.appendChild(bottone('Togli tutti', 'link pericolo', function () {
          pallini().forEach(function (b) { S.scriviEvento(c.id, { tipo: 'zona', uid: b.id, team: b.team, pt: null, x: null, y: null, sim: true, via: true, nome: b.nome, t: Date.now() }); });
        }));
      };
    }
    if (f) {
      var bq = bottone('QR', 'fz-qr'); bq.setAttribute('aria-label', 'Scansiona il QR dell\'area');
      var scQr = function (pre) {
        apriScanner('Scansiona il QR dell\'area', function (t) {
          return S.leggiQr(cm, pre || t).then(function (r) {
            if (!r.punto) return { ok: false, titolo: 'QR non valido', testo: r.errore };
            var nm = (r.punto.nomi && r.punto.nomi[f]) || r.punto.nome;
            v.zonaQr(r.punto.id);
            return { ok: true, titolo: (r.punto.tipo === 'mob' ? 'Sei alla base: ' : 'Sei a ') + nm, testo: 'Conti come presente qui per 6 minuti. Poi torna a valere il GPS, oppure scansiona di nuovo.' };
          });
        });
      };
      bq.onclick = function () { scQr(); };
      box.appendChild(bq);
      if (mortOn) {
        var bm = bottone('✹', 'fz-mort'); bm.setAttribute('aria-label', 'Mortaio');
        bm.onclick = function () {
          tendina.innerHTML = '';
          var bar = el('div', 'riga2'); bar.appendChild(bottone('Torna alla mappa', 'accent', function () { tendina.hidden = true; mortPan = null; })); tendina.appendChild(bar);
          var pb = el('div', 'mort-pan'); tendina.appendChild(pb);
          mortPan = pannelloMortaio(pb, {
            campo: cm, punti: puntiG, team: f, uid: st.user.uid, ora: Date.now, zona: function () { return v.zona(); }, modo: window.AC_MORT.semplice(c) ? 'semplice' : 'realistico',
            owner: function () { return statoMort().own; }, stato: function () { return statoMort().s; },
            puoCostruire: comandante || st.ruolo === 'caposquadra' || st.ruolo === 'comandante' || P('ordini'),
            scrivi: function (e) { e.uid = st.user.uid; e.team = f; e.t = Date.now(); S.scriviEvento(c.id, e); return Promise.resolve(); },
            scegli: function (cb) {
              // mappa a tutto schermo per toccare il bersaglio
              var ov = el('div', 'mort-scegli'); document.body.appendChild(ov);
              var tb = el('div', 'riga2'); tb.appendChild(el('b', null, 'Tocca il bersaglio')); tb.appendChild(bottone('Annulla', '', function () { vv.chiudi(); ov.remove(); })); ov.appendChild(tb);
              var mb = el('div', 'mort-scegli-m'); ov.appendChild(mb);
              var vv = F.vista(mb, { g: motore(c), campo: cm, team: f, colori: COLORI, nomi: nomiFaz(c), ora: Date.now, anteprima: true, mobile: true,
                onTocco: function (lat, lon) { vv.chiudi(); ov.remove(); cb({ lat: lat, lon: lon }); } });
            }
          });
          tendina.hidden = false;
        };
        box.appendChild(bm);
      }
      if (qrInSospeso) { var pre = qrInSospeso; qrInSospeso = null; setTimeout(function () { scQr(pre); }, 400); }
    }
    var stopE = S.ascoltaEventi(c.id, function (ev) { ultimi = ev; v.aggiorna(ev); if (mortPan && !tendina.hidden) mortPan.aggiorna(); if (simAttivo) disegnaSim(); });
    // ogni secondo: impatti arrivati, costruzioni abbandonate, pannello aperto
    var giroM = mortOn ? setInterval(function () {
      var sm = statoMort().s;
      if (Date.now() - apertoIl < 3000) sm.colpi.forEach(function (cp) { if (cp.arrivo < apertoIl) visti[cp.id] = true; });
      sorvegliaImpatti(sm, puntiG, v.miaPos(), st.user.uid, visti, false);
      if (f) Object.keys(sm.cantieri).forEach(function (fz) {
        var k = sm.cantieri[fz]; if (k.uid !== st.user.uid || v.zona() === k.pt || annullati[fz + k.t]) return;
        annullati[fz + k.t] = true; S.scriviEvento(c.id, { tipo: 'mortaio', azione: 'annulla', uid: st.user.uid, team: f, pt: k.pt, t: Date.now() }); toast('Sei uscito dall\'HQ: costruzione del mortaio annullata');
      });
      if (mortPan && !tendina.hidden) mortPan.aggiorna();
      v.ridisegna();
    }, 1000) : null;
    var prima = chiusura; chiusura = function () { stopE(); clearInterval(giroM); v.chiudi(); if (prima) prima(); };
    });
  }

  // ================= MORTAIO (conflict): rifornimenti, costruzione, richieste di fuoco, tiro
  function puntiGeo(cm) {
    return (cm.punti || []).map(function (p) {
      if (p.lat != null || !cm.geo || p.x == null) return p;
      var ll = window.AC_UTM.daPixel(cm.geo, p.x, p.y); return Object.assign({}, p, { lat: ll.lat, lon: ll.lon });
    });
  }
  function utmDi(lat, lon) { var u = window.AC_UTM.daLatLon(lat, lon); return u.zona + (u.nord ? 'T' : 'G') + ' ' + Math.round(u.E) + ' ' + Math.round(u.N); }
  // coordinate scritte: "32T 375310 4983462", "375310 4983462" (zona della cartina) o "44.99, 7.41"
  function leggiCoord(t, cm) {
    var n = String(t || '').replace(/,/g, ' ').match(/-?\d+(\.\d+)?/g) || [], z = String(t || '').match(/^\s*(\d{1,2})\s*[A-Za-z]/);
    if (n.length >= 2 && Math.abs(+n[n.length - 2]) <= 90 && Math.abs(+n[n.length - 1]) <= 180 && String(t).indexOf('.') >= 0 && !z) return { lat: +n[0], lon: +n[1] };
    var E = +n[n.length - 2], N = +n[n.length - 1]; if (!(E > 100000 && N > 1000000)) return null;
    var zona = z ? +z[1] : (cm && cm.punti && cm.punti[0] && cm.punti[0].lat != null ? window.AC_UTM.daLatLon(cm.punti[0].lat, cm.punti[0].lon).zona : 32);
    return window.AC_UTM.aLatLon(zona, true, E, N);
  }
  function suonoImpatto(forte) {
    try {
      var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      var a = new A(), o = a.createOscillator(), gn = a.createGain(), t = a.currentTime;
      o.type = 'sawtooth'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(300, t + 1.2);
      gn.gain.setValueAtTime(.0001, t); gn.gain.exponentialRampToValueAtTime(forte ? .5 : .2, t + .1); gn.gain.exponentialRampToValueAtTime(.0001, t + 1.3);
      o.connect(gn); gn.connect(a.destination); o.start(t); o.stop(t + 1.35);
      var len = a.sampleRate * .7, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      var s = a.createBufferSource(), g2 = a.createGain(); s.buffer = buf; g2.gain.value = forte ? .9 : .4; s.connect(g2); g2.connect(a.destination); s.start(t + 1.25);
    } catch (e) {}
  }
  // schermata rossa di chi è colpito
  function allarmeColpito(dist, prova) {
    var ov = el('div', 'mort-colpito'); document.body.appendChild(ov);
    ov.appendChild(el('div', 'mort-ic', '✹'));
    ov.appendChild(el('h2', null, 'COLPO DI MORTAIO'));
    var p = el('p'); p.appendChild(document.createTextNode('Sei a ' + Math.round(dist) + ' m dall\'impatto.')); p.appendChild(el('br')); p.appendChild(el('b', null, 'Sei colpito: ')); p.appendChild(document.createTextNode('torna al punto di rientro.')); ov.appendChild(p);
    if (prova) ov.appendChild(el('small', null, 'ANTEPRIMA · nessun effetto sul campo'));
    ov.appendChild(bottone('Ho capito', 'big', function () { ov.remove(); }));
    try { if (navigator.vibrate) navigator.vibrate([400, 120, 400, 120, 800]); } catch (e) {}
    suonoImpatto(true);
  }
  // spiegazione illustrata del tiro
  function infoMortaio(modo) {
    if (modo === 'semplice') return infoSemplice();
    apriFoglio(function (f) {
      f.classList.add('foglio-alto');
      var d = el('div', 'mort-info'); f.appendChild(d);
      d.innerHTML = '<h2>Come si spara col mortaio</h2>'
        + '<div class="mi-ciclo"><span>1<b>Rifornimenti</b></span><span>2<b>Costruisci</b></span><span>3<b>Osserva</b></span><span>4<b>Spara</b></span><span>5<b>Correggi</b></span></div>'
        + '<h3>1 · Rifornimenti</h3><p>Come in Arma: la <b>base principale (HQ)</b> di ogni fazione riceve rifornimenti da sola, a scatti: <b>200 ogni 5 minuti</b>, fino a 3000. Non c\'è niente da trasportare.</p>'
        + '<table class="mi-costi"><tr><td>Postazione mortaio</td><td>1500</td></tr><tr><td>Ogni colpo</td><td>50</td></tr><tr><td>Rifornimenti all\'HQ</td><td>+200 / 5 min</td></tr></table>'
        + '<h3>2 · Costruzione</h3><p>Il mortaio si costruisce <b>solo all\'HQ</b>: lì c\'è la carta per calcolare il tiro. Lo avvia un <b>caposquadra</b> o il <b>comandante</b>: servono 3 minuti senza uscire dall\'area. Prima di poterlo costruire passa almeno mezz\'ora di partita.</p>'
        + '<h3>3 · L\'osservatore</h3><p>Chi vede il bersaglio manda al mortaio le <b>coordinate UTM</b> (lette sulla carta o toccando la mappa) e cosa c\'è. Il nemico non vede né le richieste né il mortaio.</p>'
        + '<h3>4 · Misurare sulla carta</h3><p>Sulla griglia UTM ogni quadretto è 100 m. Dal mortaio al bersaglio misuri quanti metri verso <b>est</b> e verso <b>nord</b>: da lì ricavi <b>distanza</b> e <b>direzione</b>.</p>'
        + '<svg viewBox="0 0 320 220" class="mi-svg"><defs><pattern id="mig" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#e8c96a" stroke-opacity=".25"/></pattern></defs><rect width="320" height="220" fill="url(#mig)"/>'
        + '<path d="M60 180 L260 60" stroke="#ffd96a" stroke-width="3" stroke-dasharray="8 6"/><path d="M60 180 H260 V60" stroke="#7fc28a" stroke-width="2" fill="none"/>'
        + '<rect x="50" y="170" width="20" height="20" rx="4" fill="#2f7fd6" stroke="#fff" stroke-width="2"/><g stroke="#ff6b5a" stroke-width="3" fill="none"><circle cx="260" cy="60" r="10"/><path d="M244 60h32M260 44v32"/></g>'
        + '<text x="160" y="200" fill="#7fc28a" font-size="14" text-anchor="middle">+500 m verso est</text><text x="282" y="125" fill="#7fc28a" font-size="14" transform="rotate(90 282 125)" text-anchor="middle">+300 m verso nord</text>'
        + '<text x="140" y="110" fill="#ffd96a" font-size="15" font-weight="700" transform="rotate(-31 140 110)">distanza 583 m</text><text x="60" y="160" fill="#9fd0f5" font-size="12">MORTAIO</text></svg>'
        + '<p class="mi-nota">Distanza = √(est² + nord²). Con 500 e 300: √(250000 + 90000) ≈ 583 m.</p>'
        + '<h3>5 · Deriva: la direzione</h3><p>Si misura in <b>millesimi</b>: il giro completo è <b>6400</b>. Nord 0, est 1600, sud 3200, ovest 4800. Dai gradi: millesimi = gradi × 17,8. Aumentando la deriva il tubo gira <b>verso destra</b>.</p>'
        + '<svg viewBox="0 0 320 200" class="mi-svg"><circle cx="160" cy="100" r="80" fill="none" stroke="#e8c96a" stroke-opacity=".5"/>'
        + '<text x="160" y="14" fill="#e8c96a" font-size="14" text-anchor="middle">N · 0</text><text x="252" y="104" fill="#e8c96a" font-size="14">E · 1600</text><text x="160" y="196" fill="#e8c96a" font-size="14" text-anchor="middle">S · 3200</text><text x="22" y="104" fill="#e8c96a" font-size="14">O · 4800</text>'
        + '<path d="M160 100 L160 26" stroke="#b9b4a2" stroke-width="2"/><path d="M160 100 L229 60" stroke="#ffd96a" stroke-width="4"/><path d="M160 60 A40 40 0 0 1 195 80" stroke="#ff6b5a" stroke-width="3" fill="none"/>'
        + '<text x="186" y="52" fill="#ff6b5a" font-size="15" font-weight="700">1065</text><rect x="152" y="92" width="16" height="16" rx="3" fill="#2f7fd6" stroke="#fff" stroke-width="2"/></svg>'
        + '<p class="mi-nota">Nell\'esempio il bersaglio è verso est-nord-est: deriva circa 1065.</p>'
        + '<h3>6 · Alzo e carica</h3><p>La <b>carica</b> decide quanto lontano può arrivare il colpo, l\'<b>alzo</b> è l\'inclinazione del tubo. Si spara sempre in <b>tiro curvo</b> (tubo molto alto). Nella tavola di tiro cerchi la distanza, scegli una carica che la raggiunge e leggi l\'alzo.</p>'
        + '<svg viewBox="0 0 320 170" class="mi-svg"><path d="M10 150 H310" stroke="#b9b4a2"/>'
        + '<path d="M20 150 Q60 40 100 150" stroke="#7fc28a" stroke-width="2.5" fill="none"/><path d="M20 150 Q110 0 200 150" stroke="#e8c96a" stroke-width="2.5" fill="none"/><path d="M20 150 Q160 -40 300 150" stroke="#ff6b5a" stroke-width="2.5" fill="none"/>'
        + '<text x="100" y="166" fill="#7fc28a" font-size="12" text-anchor="middle">carica 0</text><text x="200" y="166" fill="#e8c96a" font-size="12" text-anchor="middle">carica 1-2</text><text x="296" y="166" fill="#ff6b5a" font-size="12" text-anchor="end">carica 3</text>'
        + '<rect x="12" y="140" width="16" height="12" rx="2" fill="#2f7fd6"/></svg>'
        + '<div class="mi-es"><b>Esempio:</b> bersaglio a 450 m → carica 2 → tavola: <b>alzo 1212</b>, volo 15 s.</div>'
        + '<p><b>Attenzione:</b> nel tiro curvo <b>più alzo = colpo più corto</b>. Se il colpo è lungo, alza; se è corto, abbassa.</p>'
        + '<h3>7 · Correggere</h3><p>Dopo il volo l\'osservatore riceve dove è caduto il colpo, ad esempio <i>«42 m a nord-est del bersaglio»</i>. Correggi deriva (destra/sinistra) e alzo (lungo/corto) e rispara. Ogni tubo ha un po\' di dispersione: due colpi uguali non cadono mai nello stesso punto.</p>'
        + '<h3>8 · Sul campo</h3><p>Dopo il tempo di volo i telefoni entro <b>15 m</b> dall\'impatto suonano e vibrano: <b>sei colpito</b>, torna al punto di rientro (vale per tutti, anche i compagni). Entro <b>40 m</b>: «colpi vicini, al riparo». Le basi principali sono protette: lì i colpi non hanno effetto.</p>';
      f.appendChild(bottone('Ho capito', 'accent big', function () { chiudiFoglio(); }));
    });
  }
  // spiegazione della versione semplificata: pensata per chi non ha mai usato un mortaio
  function infoSemplice() {
    var R = window.AC_MORT.regole({ mortaio: 'semplice' }), pp = window.AC_MORT.portata();
    apriFoglio(function (f) {
      f.classList.add('foglio-alto');
      var d = el('div', 'mort-info'); f.appendChild(d);
      d.innerHTML = '<h2>Mortaio semplificato</h2>'
        + '<p>Basta sapere <b>quanto è lontano</b> il bersaglio e <b>in che direzione</b>. Alzo e carica li calcola l\'app.</p>'
        + '<div class="mi-ciclo"><span>1<b>Costruisci</b></span><span>2<b>Osserva</b></span><span>3<b>Misura</b></span><span>4<b>Spara</b></span><span>5<b>Correggi</b></span></div>'
        + '<h3>1 · Costruzione</h3><p>All\'HQ arrivano rifornimenti da soli: ' + R.reddito + ' ogni ' + Math.round(R.periodo / 60) + ' minuti. Il mortaio costa <b>' + R.costo + '</b> e si costruisce all\'HQ (caposquadra o comandante, ' + Math.round(R.costruzione / 60) + ' minuti senza uscire). Ogni colpo costa <b>' + R.colpo + '</b>.</p>'
        + '<h3>2 · L\'osservatore</h3><p>Chi vede il bersaglio legge le <b>coordinate sulla carta di carta</b> e le manda al mortaio con una breve descrizione. Non si prendono dalla mappa del telefono.</p>'
        + '<h3>3 · Misura: due modi</h3><p><b>Distanza e direzione.</b> Sulla carta misuri quanti metri ci sono dal mortaio al bersaglio (ogni quadretto della griglia = 100 m) e con la bussola la direzione in gradi.</p>'
        + '<svg viewBox="0 0 320 210" class="mi-svg"><circle cx="160" cy="110" r="80" fill="none" stroke="#e8c96a" stroke-opacity=".5"/>'
        + '<text x="160" y="22" fill="#e8c96a" font-size="14" text-anchor="middle">N · 0°</text><text x="250" y="114" fill="#e8c96a" font-size="14">E · 90°</text><text x="160" y="204" fill="#e8c96a" font-size="14" text-anchor="middle">S · 180°</text><text x="16" y="114" fill="#e8c96a" font-size="14">O · 270°</text>'
        + '<path d="M160 110 L160 34" stroke="#b9b4a2" stroke-width="2"/><path d="M160 110 L215 55" stroke="#ffd96a" stroke-width="4"/><path d="M160 70 A40 40 0 0 1 188 82" stroke="#ff6b5a" stroke-width="3" fill="none"/>'
        + '<text x="166" y="62" fill="#ff6b5a" font-size="15" font-weight="700">45°</text><text x="196" y="96" fill="#ffd96a" font-size="14" font-weight="700">350 m</text>'
        + '<g stroke="#ff6b5a" stroke-width="3" fill="none"><circle cx="215" cy="55" r="9"/></g><rect x="152" y="102" width="16" height="16" rx="3" fill="#2f7fd6" stroke="#fff" stroke-width="2"/></svg>'
        + '<div class="mi-es"><b>Esempio:</b> bersaglio a 350 m verso nord-est → scrivi <b>350</b> e <b>45</b>.</div>'
        + '<p><b>Coordinate.</b> In alternativa scrivi le coordinate UTM del bersaglio, lette sulla carta o ricevute dall\'osservatore: distanza e direzione le ricava l\'app.</p>'
        + '<h3>4 · Spara</h3><p>Premi <b>FUOCO</b> stando all\'HQ. Il mortaio arriva da ' + pp.min + ' a ' + pp.max + ' m; il colpo vola 7-19 secondi.</p>'
        + '<h3>5 · Correggi</h3><p>L\'osservatore riceve dove è caduto il colpo, ad esempio <i>«30 m a nord del bersaglio»</i>. Correggi a buon senso: <b>troppo lungo</b> → togli metri; <b>troppo corto</b> → aggiungi metri; <b>troppo a destra o a sinistra</b> → cambia di qualche grado la direzione. Ogni tubo ha un po\' di dispersione: due colpi uguali non cadono mai nello stesso punto.</p>'
        + '<h3>Sul campo</h3><p>Entro <b>' + R.letale + ' m</b> dall\'impatto i telefoni suonano e vibrano: sei colpito, torna al punto di rientro (vale anche per i compagni). Entro <b>' + R.vicino + ' m</b>: «colpi vicini, al riparo». Le basi principali sono protette.</p>';
      f.appendChild(bottone('Ho capito', 'accent big', function () { chiudiFoglio(); }));
    });
  }
  // pannello del mortaio: rifornimenti, chiamata di fuoco, tiro. Uguale per partita e prova (ctx decide cosa succede)
  function durata(sec) { return sec < 60 ? sec + ' secondi' : Math.round(sec / 60) + ' minuti'; }
  function pannelloMortaio(box, ctx) {
    var M = window.AC_MORT, sel = ctx.sel || (ctx.sel = { scheda: 'rif', deriva: 0, alzo: 1200, carica: 1, missione: null, coord: '', testo: '', mortaio: null });
    function nomeP(id) { var p = (ctx.punti || []).filter(function (q) { return q.id === id; })[0]; return p ? ((p.nomi && p.nomi[ctx.team]) || p.nome) : '?'; }
    function disegna() {
      if (box.contains(document.activeElement) && document.activeElement.matches('input,textarea')) return;
      var s = ctx.stato(), R = s.regole, now = ctx.ora(), zona = ctx.zona();
      box.innerHTML = '';
      var testa = el('div', 'mort-testa'); testa.appendChild(el('b', null, (ctx.prova ? 'Mortaio · prova' : 'Mortaio') + (ctx.modo === 'semplice' ? ' · semplificato' : '')));
      var bi = el('button', 'mort-i', 'i'); bi.type = 'button'; bi.title = 'Come funziona'; bi.onclick = function () { infoMortaio(ctx.modo); }; testa.appendChild(bi);
      box.appendChild(testa);
      var tabs = el('div', 'schede');
      [['rif', 'HQ'], ['oss', 'Chiama il fuoco'], ['tiro', 'Mortaio']].forEach(function (x) {
        tabs.appendChild(bottone(x[1], 'scheda' + (sel.scheda === x[0] ? ' on' : ''), function () { sel.scheda = x[0]; disegna(); }));
      });
      box.appendChild(tabs);
      var mio = s.mortai[ctx.team], hq = s.hq[ctx.team], cassa = s.cassa[ctx.team] || { q: 0 }, allHq = ctx.prova || ctx.ovunque || (hq && zona === hq);
      var cont = el('div', 'mort-c'); box.appendChild(cont);
      if (sel.scheda === 'rif') {
        // rifornimenti dell'HQ: arrivano da soli, a scatti, come in Arma
        var k = el('div', 'carta mort-fob');
        var h = el('div', 'mort-fob-h'); h.appendChild(el('b', null, 'Rifornimenti all\'HQ' + (hq ? ' · ' + nomeP(hq) : ''))); h.appendChild(el('span', null, cassa.q + ' / ' + R.max)); k.appendChild(h);
        var bar = el('div', 'mort-bar'), i = el('i'); i.style.width = Math.min(100, cassa.q / R.max * 100) + '%'; bar.appendChild(i); k.appendChild(bar);
        var pr = s.prossimo[ctx.team];
        k.appendChild(el('small', 'hint', pr ? '+' + R.reddito + ' tra ' + F.mmss(Math.max(0, pr - now)) + ' · ne arrivano ' + R.reddito + ' ogni ' + durata(R.periodo) : 'Deposito pieno'));
        cont.appendChild(k);
        var c2 = el('div', 'carta mort-fob'); c2.appendChild(el('b', null, 'Mortaio'));
        var cn = s.cantieri[ctx.team];
        if (mio) c2.appendChild(el('small', 'ok', 'Pronto all\'HQ · ' + Math.floor(cassa.q / R.colpo) + ' colpi con i rifornimenti di adesso'));
        else if (cn) c2.appendChild(el('small', 'avviso', 'In costruzione: ' + F.mmss(Math.max(0, cn.t + R.costruzione * 1000 - now)) + (cn.uid === ctx.uid ? ' · resta all\'HQ' : '')));
        else {
          var pu = ctx.puoCostruire, basta = cassa.q >= R.costo;
          var bc = bottone(basta ? 'Costruisci il mortaio · ' + R.costo : 'Mortaio: mancano ' + (R.costo - cassa.q) + ' rifornimenti', basta && allHq && pu ? 'accent' : '', function () { ctx.scrivi({ tipo: 'mortaio', azione: 'costruisci', pt: hq }); });
          bc.disabled = !(basta && allHq && pu); c2.appendChild(bc);
          if (basta && !pu) c2.appendChild(el('small', 'hint', 'Lo costruisce un caposquadra o il comandante.'));
          else if (basta && !allHq) c2.appendChild(el('small', 'hint', 'Bisogna essere all\'HQ.'));
          else if (!basta) c2.appendChild(el('small', 'hint', 'Costa ' + R.costo + ' rifornimenti, ogni colpo ' + R.colpo + '. Costruzione: ' + durata(R.costruzione) + ' all\'HQ.'));
        }
        cont.appendChild(c2);
      } else if (sel.scheda === 'oss') {
        cont.appendChild(el('p', 'hint', 'Manda al mortaio dove sparare. Il nemico non vede le richieste.'));
        var ci = el('input'); ci.value = sel.coord; ci.placeholder = '32T 375310 4983462'; ci.className = 'mono'; ci.oninput = function () { sel.coord = ci.value; };
        cont.appendChild(campoForm('Coordinate UTM del bersaglio', ci));
        if (ctx.modo !== 'semplice' || ctx.prova) cont.appendChild(bottone('⌖ Scegli sulla mappa' + (ctx.modo === 'semplice' ? ' (solo in prova)' : ''), '', function () { ctx.scegli(function (ll) { sel.coord = utmDi(ll.lat, ll.lon); disegna(); }); }));
        else cont.appendChild(el('small', 'hint', 'Le coordinate si leggono sulla carta di carta: nella versione semplificata non si prendono dalla mappa del telefono.'));
        var ti = el('input'); ti.value = sel.testo; ti.placeholder = 'es. 4 fucilieri dietro il muretto'; ti.oninput = function () { sel.testo = ti.value; };
        cont.appendChild(campoForm('Cosa c\'è', ti));
        cont.appendChild(bottone('Invia al mortaio', 'accent big', function () {
          var ll = leggiCoord(sel.coord, ctx.campo); if (!ll) { toast('Coordinate non valide'); return; }
          ctx.scrivi({ tipo: 'richiesta', id: S.idBreve(), lat: ll.lat, lon: ll.lon, testo: sel.testo.trim() }).then(function () { toast('Richiesta inviata'); sel.testo = ''; });
        }));
        var mie = s.richieste.filter(function (q) { return q.team === ctx.team && q.uid === ctx.uid; }).slice(-4).reverse();
        if (mie.length) cont.appendChild(el('h4', 'sez', 'Le tue richieste'));
        mie.forEach(function (q) {
          var r1 = el('div', 'carta mort-ric'); r1.appendChild(el('b', 'mono', utmDi(q.lat, q.lon))); if (q.testo) r1.appendChild(el('small', null, q.testo));
          s.colpi.filter(function (cp) { return cp.rif === q.id && cp.arrivo <= now; }).forEach(function (cp) { r1.appendChild(el('small', 'avviso', ora(cp.arrivo) + ' · ' + M.scarto(cp, q))); });
          var inVolo = s.colpi.filter(function (cp) { return cp.rif === q.id && cp.arrivo > now; }).length;
          if (inVolo) r1.appendChild(el('small', 'ok', inVolo + ' colpo in volo'));
          cont.appendChild(r1);
        });
      } else {
        if (!mio) { cont.appendChild(el('p', 'hint', 'La tua fazione non ha ancora il mortaio. Si costruisce all\'HQ, dalla scheda HQ.')); return; }
        var mo = mio, scorta = cassa.q, P0 = (ctx.punti || []).filter(function (p) { return p.id === mo.pt; })[0];
        var hm = el('div', 'mort-mh'); hm.appendChild(el('b', null, 'Mortaio · HQ'));
        hm.appendChild(el('span', 'mono', (R.colpo ? Math.floor(scorta / R.colpo) + ' colpi' : 'colpi illimitati'))); cont.appendChild(hm);
        if (P0 && P0.lat != null) cont.appendChild(el('small', 'hint mono', 'Posizione del mortaio: ' + utmDi(P0.lat, P0.lon)));
        // missioni ricevute
        var ric = s.richieste.filter(function (q) { return q.team === ctx.team; }).slice(-5).reverse();
        if (ric.length) {
          if (!sel.missione || !ric.some(function (q) { return q.id === sel.missione; })) sel.missione = ric[0].id;
          var mis = ric.filter(function (q) { return q.id === sel.missione; })[0];
          var km = el('div', 'carta mort-mis');
          var rs = select(ric.map(function (q) { return [q.id, ora(q.t) + ' · ' + (q.testo || 'bersaglio')]; }), sel.missione); rs.onchange = function () { sel.missione = rs.value; disegna(); };
          km.appendChild(el('small', 'eti', 'MISSIONE')); km.appendChild(rs); km.appendChild(el('b', 'mono', utmDi(mis.lat, mis.lon)));
          if (ctx.soluzione && P0) {
            var mm = M.misura(P0, mis), al = [0, 1, 2, 3].map(function (cc) { var a = M.alzoPer(Math.round(mm.dist), cc); return a ? 'C' + cc + ' ' + a : null; }).filter(Boolean);
            km.appendChild(el('small', 'mort-sol', ctx.modo === 'semplice' ? 'Soluzione (solo in prova): ' + Math.round(mm.dist) + ' m · direzione ' + Math.round(mm.mil * 360 / 6400) + '°' : 'Soluzione (solo in prova): ' + Math.round(mm.dist) + ' m · deriva ' + Math.round(mm.mil) + ' · alzo ' + (al.join(' / ') || 'fuori portata')));
          }
          cont.appendChild(km);
        } else cont.appendChild(el('p', 'hint', 'Nessuna richiesta di fuoco: la manda un osservatore dalla scheda «Chiama il fuoco».'));
        var tiroOra = null;
        if (ctx.modo === 'semplice') {
          // versione semplificata: distanza e direzione, oppure le coordinate lette sulla carta. Il resto lo calcola l'app.
          var pp = M.portata(), sm = el('div', 'mort-seg');
          [['dd', 'Distanza e direzione'], ['co', 'Coordinate']].forEach(function (o) { sm.appendChild(bottone(o[1], (sel.sm || 'dd') === o[0] ? 'on' : '', function () { sel.sm = o[0]; disegna(); })); });
          cont.appendChild(sm);
          var esito = el('div', 'carta mort-calc');
          function calcola() {
            var dist, gradi;
            if ((sel.sm || 'dd') === 'dd') { dist = parseFloat(sel.dist); gradi = parseFloat(sel.dir); if (!(dist > 0) || isNaN(gradi)) return { err: 'Scrivi distanza e direzione' }; }
            else {
              var ll = leggiCoord(sel.coordT, ctx.campo); if (!ll) return { err: 'Scrivi le coordinate UTM del bersaglio' };
              if (!P0 || P0.lat == null) return { err: 'Posizione del mortaio sconosciuta' };
              var m0 = M.misura(P0, ll); dist = m0.dist; gradi = m0.mil * 360 / 6400;
            }
            var t = M.tiroPer(dist, gradi);
            return t ? t : { err: 'Fuori portata: il mortaio arriva da ' + pp.min + ' a ' + pp.max + ' m' };
          }
          function aggiornaEsito() {
            var t = calcola(); esito.innerHTML = '';
            if (t.err) { esito.appendChild(el('small', 'hint', t.err)); return; }
            esito.appendChild(el('b', null, Math.round(t.dist) + ' m · direzione ' + Math.round(t.deriva * 360 / 6400) + '°'));
            esito.appendChild(el('small', 'ok', 'Pronto: il colpo arriva in ' + Math.round(t.volo) + ' secondi'));
          }
          if ((sel.sm || 'dd') === 'dd') {
            var di = el('input'); di.type = 'number'; di.inputMode = 'numeric'; di.min = 0; di.placeholder = 'es. 350'; di.value = sel.dist || ''; di.oninput = function () { sel.dist = di.value; aggiornaEsito(); };
            var gi = el('input'); gi.type = 'number'; gi.inputMode = 'numeric'; gi.min = 0; gi.max = 359; gi.placeholder = 'es. 45'; gi.value = sel.dir || ''; gi.oninput = function () { sel.dir = gi.value; aggiornaEsito(); };
            var due = el('div', 'tre'); due.appendChild(campoForm('Distanza (m)', di)); due.appendChild(campoForm('Direzione (gradi)', gi)); cont.appendChild(due);
            cont.appendChild(el('small', 'hint', 'Dal mortaio verso il bersaglio. Direzione con la bussola: nord 0, est 90, sud 180, ovest 270.'));
          } else {
            var ci2 = el('input'); ci2.className = 'mono'; ci2.placeholder = '32T 375310 4983462'; ci2.value = sel.coordT || ''; ci2.oninput = function () { sel.coordT = ci2.value; aggiornaEsito(); };
            cont.appendChild(campoForm('Coordinate UTM del bersaglio', ci2));
            cont.appendChild(el('small', 'hint', 'Leggile sulla carta di carta o dalla richiesta dell\'osservatore: non si prendono dalla mappa del telefono.'));
          }
          cont.appendChild(esito); aggiornaEsito();
          tiroOra = function () { var t = calcola(); return t.err ? null : t; };
        } else {
          function quadrante(nome, chiave, max, nota) {
            var w = el('div', 'mort-dial-w'); var h = el('div', 'mort-dn'); h.appendChild(el('b', null, nome)); h.appendChild(el('span', null, nota)); w.appendChild(h);
            var d = el('div', 'mort-dial'), v = ('0000' + sel[chiave]).slice(-4);
            [1000, 100, 10, 1].forEach(function (pas, i) {
              var c = el('div', 'mort-dig');
              var su = el('button', null, '▲'); su.type = 'button'; su.onclick = function () { sel[chiave] = (sel[chiave] + pas) % (max + 1); disegna(); };
              var giu = el('button', null, '▼'); giu.type = 'button'; giu.onclick = function () { sel[chiave] = (sel[chiave] - pas + max + 1) % (max + 1); disegna(); };
              c.appendChild(su); c.appendChild(el('b', null, v[i])); c.appendChild(giu); d.appendChild(c);
            });
            w.appendChild(d); return w;
          }
          cont.appendChild(quadrante('DERIVA', 'deriva', 6399, 'millesimi · 0-6399'));
          cont.appendChild(quadrante('ALZO', 'alzo', 1600, 'millesimi · ' + M.ALZO_MIN + '-' + M.ALZO_MAX));
          var bl = M.balistica(sel.alzo, sel.carica);
          var hc = el('div', 'mort-dn'); hc.appendChild(el('b', null, 'CARICA')); hc.appendChild(el('span', null, bl ? 'tempo di volo ' + Math.round(bl.volo) + ' s' : 'alzo fuori dai limiti del tubo')); cont.appendChild(hc);
          var sg = el('div', 'mort-seg');
          [0, 1, 2, 3].forEach(function (cc) { sg.appendChild(bottone(String(cc), sel.carica === cc ? 'on' : '', function () { sel.carica = cc; disegna(); })); });
          cont.appendChild(sg);
          var tv = el('details', 'carta mort-tav'); tv.open = !!sel.tavola; tv.ontoggle = function () { sel.tavola = tv.open; };
          tv.appendChild(el('summary', null, 'Tavola di tiro'));
          var tb = el('table'), th = el('tr'); ['m', 'C0', 'C1', 'C2', 'C3'].forEach(function (x) { th.appendChild(el('th', null, x)); }); tb.appendChild(th);
          M.tavola(100, 750, 25).forEach(function (rw) {
            var tr = el('tr'); tr.appendChild(el('td', null, String(rw.m)));
            rw.alzi.forEach(function (a) { var td = el('td'); if (a) { td.appendChild(document.createTextNode(String(a.alzo))); td.appendChild(el('small', null, Math.round(a.volo) + 's')); } else td.textContent = '—'; tr.appendChild(td); });
            tb.appendChild(tr);
          });
          tv.appendChild(tb); cont.appendChild(tv);
          tiroOra = function () { var b0 = M.balistica(sel.alzo, sel.carica); return b0 ? { deriva: sel.deriva, alzo: sel.alzo, carica: sel.carica, volo: b0.volo } : null; };
        }
        var attesa = mo.ultimo ? mo.ultimo + R.cadenza * 1000 - now : 0, qui = allHq;
        var bf = bottone(attesa > 0 ? 'Ricarica il tubo · ' + Math.ceil(attesa / 1000) + ' s' : 'FUOCO', 'mort-fuoco', function () {
          var t = tiroOra();
          if (!t) { toast(ctx.modo === 'semplice' ? 'Controlla distanza e direzione (o le coordinate)' : 'Alzo fuori dai limiti: tra ' + M.ALZO_MIN + ' e ' + M.ALZO_MAX); return; }
          ctx.scrivi({ tipo: 'fuoco', pt: mo.pt, deriva: t.deriva, alzo: t.alzo, carica: t.carica, rif: sel.missione || null }).then(function () { toast('Colpo partito · arrivo tra ' + Math.round(t.volo) + ' s'); });
        });
        bf.disabled = attesa > 0 || scorta < R.colpo || !qui;
        cont.appendChild(bf);
        if (!qui) cont.appendChild(el('small', 'hint', 'Per sparare devi essere all\'HQ, dove c\'è il mortaio e la carta.'));
        else if (scorta < R.colpo) cont.appendChild(el('small', 'hint', 'Rifornimenti finiti: servono ' + R.colpo + ' per colpo.'));
      }
    }
    // si ridisegna solo quando cambia qualcosa (i conti alla rovescia ogni 5 secondi), per non perdere i tocchi
    var ultima = '';
    function firma() {
      var s = ctx.stato(), now = ctx.ora(), corre = Object.keys(s.cantieri).length || Object.keys(s.mortai).some(function (k) { return now - s.mortai[k].ultimo < s.regole.cadenza * 1000; });
      return JSON.stringify([s.cassa[ctx.team] && s.cassa[ctx.team].q, Object.keys(s.mortai), s.cantieri, s.richieste.length, s.colpi.filter(function (c) { return c.arrivo <= now; }).length, s.colpi.length, ctx.zona(), corre ? Math.floor(now / 5000) : 0]);
    }
    var disegna0 = disegna; disegna = function () { ultima = firma(); disegna0(); };
    disegna();
    return { aggiorna: function () { if (firma() !== ultima) disegna(); } };
  }
  // segni sulla mappa: i miei mortai, le richieste della mia fazione e gli impatti recenti
  function segniMortaio(s, team, punti, now, tutto) {
    var out = [];
    Object.keys(s.mortai).forEach(function (f) { var m = s.mortai[f], p = punti.filter(function (q) { return q.id === m.pt; })[0]; if (p && p.lat != null && (tutto || m.team === team)) out.push({ tipo: 'mortaio', lat: p.lat, lon: p.lon, colore: COLORI[m.team] || '#2f7fd6' }); });
    s.richieste.forEach(function (q) { if ((tutto || q.team === team) && now - q.t < 600000) out.push({ tipo: 'bersaglio', lat: q.lat, lon: q.lon, colore: '#ff6b5a', testo: q.testo ? q.testo.slice(0, 18) : '' }); });
    s.colpi.forEach(function (cp) {
      if (cp.arrivo > now || now - cp.arrivo > (tutto ? 600000 : 120000)) return;
      out.push({ tipo: 'impatto', lat: cp.lat, lon: cp.lon, colore: '#ffb347', raggio: s.regole.vicino, opacita: .08, tratteggio: true });
      out.push({ lat: cp.lat, lon: cp.lon, colore: '#ff3b2a', raggio: s.regole.letale, opacita: .25 });
    });
    return out;
  }
  // impatti in partita: chi è vicino viene avvisato (le basi principali sono protette)
  function sorvegliaImpatti(s, punti, mia, uid, visti, prova) {
    var mob = punti.filter(function (p) { return p.tipo === 'mob' && p.lat != null; }), nuovi = [];
    s.colpi.forEach(function (cp) {
      if (visti[cp.id] || cp.arrivo > Date.now()) return; visti[cp.id] = true; nuovi.push(cp);
      var protetto = mob.some(function (p) { return window.AC_MORT.misura(p, cp).dist <= (p.raggio || 30); });
      if (protetto || !mia) return;
      var d = window.AC_MORT.misura(mia, cp).dist;
      if (d <= s.regole.letale) allarmeColpito(d, prova);
      else if (d <= s.regole.vicino) { toast('Colpi di mortaio vicini (' + Math.round(d) + ' m): al riparo!'); suonoImpatto(false); try { if (navigator.vibrate) navigator.vibrate([200, 80, 200]); } catch (e) {} }
    });
    // all'osservatore: dove è caduto il colpo rispetto alla sua richiesta
    nuovi.forEach(function (cp) { var q = s.richieste.filter(function (r) { return r.id === cp.rif && r.uid === uid; })[0]; if (q) toast('Osservatore: ' + window.AC_MORT.scarto(cp, q)); });
  }
  // prova per gli organizzatori: tutto il giro su una cartina vera, senza effetti sul campo
  function escB(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // ================= BANCO BANDIERE (debug dell'hardware): collegamento all'HQ (Bluetooth o USB), righe grezze, comandi,
  // e, se vuoi, i tag visti dalle bandiere mandati come presenze in un conflict di prova
  var NUS = { s: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', rx: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', tx: '6e400003-b5a3-f393-e0a9-e50e24dcca9e' };
  var BANCO = { via: null, porta: null, lettore: null, scrittore: null, dev: null, rx: null, righe: [], band: {}, hq: null, tag: null, cb: null,
    cid: null, cm: null, mappa: {}, attivo: false, ultimoPt: {}, scritti: 0, storia: [], visto: {}, avvio: null,
    inj: { fatti: [], auto: null, vicini: null, info: null }, pat: {}, patCfg: {} };
  try { BANCO.patCfg = JSON.parse(localStorage.getItem('ac-pattuglie') || '{}') || {}; } catch (e) {}
  function bancoRiga(s, da) {
    s = String(s).replace(/\s+$/, ''); if (!s) return;
    var t = new Date(), hh = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) + ':' + ('0' + t.getSeconds()).slice(-2);
    BANCO.righe.push(hh + (da ? ' ' + da + ' ' : ' ') + s); if (BANCO.righe.length > 500) BANCO.righe.splice(0, BANCO.righe.length - 500);
    if (!da && s.charAt(0) === '>' && /mortaio/i.test(s)) { BANCO.visto.colpo = 1; BANCO.storia.push({ t: Date.now(), testo: s.slice(1).trim() }); }   // bandiera collegata direttamente via USB
    if (s.charAt(0) === '{') {
      try {
        var j = JSON.parse(s); j._t = Date.now();
        if (j.bandiera) { bancoStoria(BANCO.band[j.bandiera], j); BANCO.band[j.bandiera] = j; bancoInoltra(j); }
        else if (j.avvio) { BANCO.avvio = j.avvio; BANCO.versione = j.versione; }
        else if (j.iniettore) { BANCO.avvio = 'INIETTORE'; if (j.iniettore === 'ok' || j.iniettore === 'errore') BANCO.inj.fatti.unshift(j); else if (j.iniettore === 'info') BANCO.inj.info = j; }
        else if (j.nuovi) { BANCO.avvio = 'INIETTORE'; BANCO.inj.nuovi = j.nuovi; BANCO.inj.seqN = (BANCO.inj.seqN || 0) + 1; }
        else if (j.batterie) { BANCO.avvio = 'INIETTORE'; BANCO.inj.batt = j.batterie; BANCO.inj.seqB = (BANCO.inj.seqB || 0) + 1; }
        else if (j.lampeggia) { BANCO.inj.lamp = j; BANCO.inj.seqL = (BANCO.inj.seqL || 0) + 1; }
        else if (j.vicino) { BANCO.avvio = 'INIETTORE'; BANCO.inj.vicino = j.vicino; BANCO.inj.seqV = (BANCO.inj.seqV || 0) + 1; }
        else if (j.vicini) { BANCO.avvio = 'INIETTORE'; BANCO.inj.vicini = j.vicini; BANCO.inj.viciniT = Date.now(); }
        else if (j.auto != null) { BANCO.avvio = 'INIETTORE'; BANCO.inj.auto = j.auto ? j : null; }
        else if (j.pattuglia) { BANCO.pat[j.pattuglia] = j; bancoPattuglia(j); }
        else if (j.risposta) { BANCO.visto.risposta = 1; if (/mortaio/i.test(j.testo || '')) BANCO.visto.colpo = 1; BANCO.storia.push({ t: Date.now(), testo: 'Risposta via radio da ' + j.risposta + ': ' + j.testo }); }
        else if (j.chat) chatArriva(j.chat);
        else if (j.inviato) chatInviato(j.inviato);
        else if (j.ok && typeof j.ok === 'object') chatStato(j.ok.seq, j.ok.da, 'ok');
        else if (j.fallito) chatStato(j.fallito.seq, j.fallito.a, 'fallito');
        else if (j.lora && typeof j.lora === 'object') { CHAT.lora[j.lora.id] = Object.assign({}, j.lora, { _t: j._t }); }
        else if (j.pat) { BANCO.avvio = 'LORA'; chatIo(j); }
        else if (j.hqtag) { BANCO.hqtag = BANCO.hqtag || {}; j.hqtag.forEach(function (t) { BANCO.hqtag[t.f + t.n] = { f: t.f, n: t.n, rssi: t.rssi, _t: j._t }; }); }
        else if (j.hq) { BANCO.hq = j; BANCO.avvio = 'HQ'; }
        else if (j.tag != null) { if (!BANCO.avvio) BANCO.avvio = 'TAG'; BANCO.tag = j; }
      } catch (e) { BANCO.righe.push(hh + ' !! JSON non valido: ' + e.message); }
    }
    if (BANCO.cb) BANCO.cb();
  }
  // ================= CHAT LoRa: messaggi tra team leader (e regia) sulla rete LoRa, senza internet
  var CHAT = { msg: [], lora: {}, io: null, chiT: 0, storiaPer: null };
  try { CHAT.msg = JSON.parse(localStorage.getItem('chat-lora') || '[]'); } catch (e) {}
  function chatSalva() { if (CHAT.msg.length > 400) CHAT.msg = CHAT.msg.slice(-400); try { localStorage.setItem('chat-lora', JSON.stringify(CHAT.msg)); } catch (e) {} }
  function chatConf() { var c = {}; try { c = JSON.parse(localStorage.getItem('chat-conf') || '{}'); } catch (e) {} return c; }
  function chatNomeDefault() {
    var me = S.stato().me || {}, t = teamDi(me.team), sq = t && (t.squadre || []).filter(function (q) { return q.id === me.squadra; })[0];
    return ((t ? t.nome.replace(/^ASD\s+/i, '').split(/\s+/)[0] : '') + (sq ? '·' + sq.nome : me.callsign ? '·' + me.callsign : '')).toUpperCase().slice(0, 28) || 'TEAM LEADER';
  }
  function chatVoluto() { var c = chatConf(); return { f: c.f || '', nome: (c.nome || chatNomeDefault()).slice(0, 28) }; }
  // a che evento appartiene un messaggio (per lo storico): esercitazione in corso o allenamento di oggi
  function chatEvento() {
    var now = Date.now(), e = esercizioInCorso(); if (e) return e.id;
    var a = D.allenamenti.filter(function (x) { return (x.inizio || 0) - 3 * 3600000 < now && (x.fine || x.inizio || 0) + 3 * 3600000 > now; })[0];
    return a ? a.id : null;
  }
  function chatArriva(c) {
    var k = c.da + '-' + c.seq + '-' + c.tipo;
    if (CHAT.msg.some(function (m) { return m.k === k; })) return;
    CHAT.msg.push({ k: k, da: c.da, nome: c.nome, f: c.f, tipo: c.tipo, a: c.a, testo: c.testo, t: Date.now(), rssi: c.rssi, hop: c.hop, ev: chatEvento() });
    chatSalva();
    if (corrente().v !== 'chat') { toast('📡 ' + c.nome + ': ' + c.testo); try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) {} }
    suonoImpatto(false);
  }
  function chatInviato(c) {
    var k = c.da + '-' + c.seq + '-' + c.tipo; if (CHAT.msg.some(function (m) { return m.k === k; })) return;
    var io = CHAT.io || {};
    CHAT.msg.push({ k: k, da: c.da, seq: c.seq, nome: io.nome || (BANCO.avvio === 'HQ' ? 'HQ' : ''), f: io.f || '', tipo: c.tipo, a: c.a, testo: c.testo, t: Date.now(), mio: true, stato: c.tipo === 'diretto' ? 'attesa' : 'inviato', ev: chatEvento() });
    chatSalva();
  }
  function chatStato(seq, altro, stato) {
    for (var i = CHAT.msg.length - 1; i >= 0; i--) { var m = CHAT.msg[i]; if (m.mio && m.seq === seq && m.a === altro) { m.stato = stato; break; } }
    chatSalva(); if (stato === 'fallito') toast('📡 Messaggio non consegnato: il destinatario non risponde');
  }
  // il LoRa collegato dice chi è: se non è come lo vuole il telefono, glielo diciamo
  function chatIo(j) {
    CHAT.io = { id: j.pat, nome: j.nome, f: j.f === 'nessuna' ? '' : j.f, batt: j.batt, fix: j.fix, _t: j._t };
    var v = chatVoluto();
    if (v.f && (CHAT.io.nome !== v.nome || CHAT.io.f !== v.f) && Date.now() - CHAT.chiT > 5000) { CHAT.chiT = Date.now(); bancoInvia('chi ' + v.f + ' ' + v.nome); }
    var conn = BANCO.via === 'BT' ? BANCO.dev : BANCO.porta; if (conn && CHAT.storiaPer !== conn) { CHAT.storiaPer = conn; bancoInvia('storia'); }
  }
  // finito l'evento, i messaggi passano nello storico (così nessuno legge la fazione avversaria durante il gioco)
  function chatCaricaStorico() {
    if (!S.stato().user || !navigator.onLine) return;
    var now = Date.now(), fatti = 0;
    CHAT.msg.forEach(function (m) {
      if (!m.ev || m.caricato) return;
      var a = D.allenamenti.filter(function (x) { return x.id === m.ev; })[0];
      var finito = a && ((a.fine || a.inizio || 0) < now || (a.esercizio && a.esercizio.fase === 'fine'));
      if (!finito) return;
      m.caricato = 1; fatti++;
      S.salvaChat(m.ev, m.k, { da: m.da, nome: m.nome || '', f: m.f || '', tipo: m.tipo, a: m.a || '', testo: m.testo, t: m.t, uid: S.stato().user.uid }).catch(function () { m.caricato = 0; });
    });
    if (fatti) chatSalva();
  }
  setInterval(chatCaricaStorico, 60000); setTimeout(chatCaricaStorico, 15000);
  function pagChat(arg) {
    testata('Chat LoRa');
    var b = BANCO, canale = arg || 'g', box = el('div', 'chat'); app.appendChild(box);
    var testa = el('div', 'carta chat-testa'), schede = el('div', 'chat-schede'), lista = el('div', 'chat-lista'), scrivi = el('form', 'chat-scrivi');
    box.appendChild(testa); box.appendChild(schede); box.appendChild(lista); box.appendChild(scrivi);
    var ta = el('textarea'); ta.rows = 2; ta.placeholder = 'Messaggio (anche coordinate: 32T 0356 4983)'; var cont = el('small', 'hint');
    var invia = el('button', 'btn accent', 'Invia'); invia.type = 'submit';
    scrivi.appendChild(ta); var rr = el('div', 'chat-scrivi-r'); rr.appendChild(cont); rr.appendChild(invia); scrivi.appendChild(rr);
    function hq() { return b.via && b.avvio === 'HQ'; }
    function pronto() { return b.via && (hq() || CHAT.io); }
    function maxCar() { var v = chatVoluto(); return 160 - (hq() ? 2 : (v.nome || '').length) - 1; }
    ta.oninput = function () { var n = new TextEncoder().encode(ta.value).length; cont.textContent = n + ' / ' + maxCar(); cont.className = 'hint' + (n > maxCar() ? ' avviso' : ''); };
    scrivi.onsubmit = function (e) {
      e.preventDefault(); var t = ta.value.replace(/\s+/g, ' ').trim(); if (!t) return;
      if (!pronto()) { toast('Collega prima il tuo LoRa'); return; }
      if (new TextEncoder().encode(t).length > maxCar()) { toast('Messaggio troppo lungo per la radio: accorcialo'); return; }
      var tipo = canale === 'g' ? 'g' : canale === 'f' ? 'f' : 'd', dest = canale.indexOf('d:') === 0 ? canale.slice(2) : '-';
      if (tipo === 'f' && !chatVoluto().f) { toast('Scegli prima la tua fazione'); return; }
      bancoInvia('chat ' + tipo + ' ' + dest + ' ' + t); ta.value = ''; ta.oninput();
    };
    function testata2() {
      testa.innerHTML = '';
      if (!b.via) {
        testa.appendChild(el('b', null, 'Collega il tuo LoRa'));
        testa.appendChild(el('p', 'hint', 'Accendi il T-Beam da team leader e collegalo: dal telefono col Bluetooth (si chiama AC-LORA-…), dal PC col cavo. La regia si collega all\'HQ allo stesso modo.'));
        var r = el('div', 'riga2'); r.appendChild(bottone('Bluetooth', 'accent', bancoBle)); r.appendChild(bottone('USB (cavo)', '', bancoUsb)); testa.appendChild(r);
        testa.appendChild(el('small', 'hint', 'Su iPhone il Bluetooth dalle pagine web funziona solo col browser Bluefy.'));
      } else if (hq()) {
        testa.appendChild(el('b', null, '📡 Collegato all\'HQ (regia)'));
        testa.appendChild(el('small', 'hint', 'La regia legge il canale globale e i messaggi diretti all\'HQ.'));
      } else if (CHAT.io) {
        var io = CHAT.io, v = chatVoluto();
        testa.appendChild(el('b', null, '📡 ' + (io.nome || 'LoRa ' + io.id) + ' · ' + (io.f ? esNomeFaz(io.f) : 'fazione?') + ' · batteria ' + (io.batt === 255 ? 'USB' : io.batt + '%')));
        var g = el('div', 'chat-id');
        var fs = select([['', 'Fazione?'], ['blu', 'BLU'], ['rossa', 'ROSSI']], v.f); fs.onchange = function () { var c = chatConf(); c.f = fs.value; localStorage.setItem('chat-conf', JSON.stringify(c)); CHAT.chiT = 0; if (fs.value) bancoInvia('chi ' + fs.value + ' ' + chatVoluto().nome); };
        var ni = el('input'); ni.value = v.nome; ni.maxLength = 28; ni.onchange = function () { var c = chatConf(); c.nome = ni.value.trim().toUpperCase(); localStorage.setItem('chat-conf', JSON.stringify(c)); CHAT.chiT = 0; if (chatVoluto().f) bancoInvia('chi ' + chatVoluto().f + ' ' + chatVoluto().nome); };
        g.appendChild(campoForm('La tua fazione oggi', fs)); g.appendChild(campoForm('Nome sul LoRa', ni)); testa.appendChild(g);
      } else testa.appendChild(el('p', 'hint', 'Collegato: aspetto che il LoRa risponda… (serve il firmware 1.4.0 «Pattuglia»)'));
    }
    function schede2() {
      schede.innerHTML = '';
      var tabs = [['g', '🌐 Globale']]; if (!hq()) tabs.push(['f', '⚑ Fazione']); tabs.push(['d', '✉ Diretti']);
      tabs.forEach(function (x) {
        var on = canale === x[0] || (x[0] === 'd' && canale.indexOf('d:') === 0);
        var t = el('button', 'chat-scheda' + (on ? ' su' : ''), x[1]); t.type = 'button'; t.onclick = function () { sostituisci('chat', x[0]); }; schede.appendChild(t);
      });
    }
    function quando(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
    function lista2() {
      lista.innerHTML = ''; var mioId = hq() ? (b.hq && b.hq.hq) : CHAT.io && CHAT.io.id;
      if (canale === 'd') {
        var ids = Object.keys(CHAT.lora).filter(function (id) { return id !== mioId; }).sort(function (x, y) { return CHAT.lora[y]._t - CHAT.lora[x]._t; });
        if (!ids.length) lista.appendChild(el('p', 'hint', pronto() ? 'Nessun altro LoRa sentito ancora: ognuno si annuncia ogni minuto.' : 'Collega il tuo LoRa per vedere chi c\'è in rete.'));
        ids.forEach(function (id) {
          var l = CHAT.lora[id], sec = Math.round((Date.now() - l._t) / 1000), r = el('button', 'carta chat-dev'); r.type = 'button';
          r.appendChild(el('b', null, (l.nome || id) + (l.f && l.f !== 'nessuna' ? ' · ' + esNomeFaz(l.f) : '')));
          r.appendChild(el('small', 'hint', 'visto ' + (sec < 60 ? sec + ' s' : Math.round(sec / 60) + ' min') + ' fa · ' + (l.hop ? 'tramite ripetitore' : 'diretto ' + l.rssi + ' dBm') + ' · batt ' + (l.batt === 255 ? 'USB' : l.batt + '%')));
          if (sec > 180) r.classList.add('vecchio');
          r.onclick = function () { sostituisci('chat', 'd:' + id); }; lista.appendChild(r);
        });
        scrivi.hidden = true; return;
      }
      scrivi.hidden = false;
      var dest = canale.indexOf('d:') === 0 ? canale.slice(2) : null;
      if (dest) { var l = CHAT.lora[dest] || {}; lista.appendChild(el('div', 'chat-con', '✉ con ' + (l.nome || dest) + (l.f && l.f !== 'nessuna' ? ' · ' + esNomeFaz(l.f) : ''))); }
      var vis = CHAT.msg.filter(function (m) {
        if (canale === 'g') return m.tipo === 'globale';
        if (canale === 'f') return m.tipo === 'fazione';
        return m.tipo === 'diretto' && ((m.mio && m.a === dest) || (!m.mio && m.da === dest));
      }).slice(-80);
      if (!vis.length) lista.appendChild(el('p', 'hint', canale === 'g' ? 'Il canale globale lo leggono tutte e due le fazioni e la regia.' : canale === 'f' ? 'Lo leggono solo i LoRa della tua fazione.' : 'Solo voi due. Quando arriva vedi ✓✓.'));
      vis.forEach(function (m) {
        var r = el('div', 'chat-msg' + (m.mio ? ' mio' : '') + (m.f === 'blu' ? ' blu' : m.f === 'rossa' ? ' rossa' : ''));
        if (!m.mio) r.appendChild(el('b', null, m.nome || m.da));
        r.appendChild(el('div', 'chat-testo', m.testo));
        r.appendChild(el('small', null, quando(m.t) + (m.mio ? (m.stato === 'ok' ? ' ✓✓' : m.stato === 'fallito' ? ' ✗ non consegnato' : m.stato === 'attesa' ? ' ✓ in attesa' : ' ✓') : (m.hop ? ' · via ripetitore' : ''))));
        lista.appendChild(r);
      });
      setTimeout(function () { lista.scrollTop = lista.scrollHeight; }, 0);
    }
    var firma = '';
    function tutto() {
      var f = JSON.stringify([b.via, b.avvio, CHAT.io && [CHAT.io.nome, CHAT.io.f, CHAT.io.batt], CHAT.msg.length, CHAT.msg.length && CHAT.msg[CHAT.msg.length - 1].stato, Object.keys(CHAT.lora).length, Math.floor(Date.now() / 30000)]);
      if (f === firma) return; firma = f;
      if (!(testa.contains(document.activeElement) && document.activeElement.matches('input,select,textarea'))) testata2();
      schede2(); lista2(); ta.oninput();
    }
    var prima = b.cb, prossimo = null;
    b.cb = function () { if (prima) prima(); if (prossimo) return; prossimo = setTimeout(function () { prossimo = null; tutto(); }, 300); };
    var tk = setInterval(tutto, 5000); tutto();
    var ch = chiusura; chiusura = function () { clearInterval(tk); b.cb = prima; if (ch) ch(); };
  }
  // storico della chat di un evento finito (pagina dell'allenamento)
  function cartaChatStorico(a) {
    var k = el('details', 'carta chat-storico'); k.appendChild(el('summary', null, '📡 Chat LoRa della giornata'));
    var dentro = el('div'); k.appendChild(dentro); var caricata = false;
    k.ontoggle = function () {
      if (!k.open || caricata) return; caricata = true; dentro.textContent = 'Carico…';
      S.leggiChat(a.id).then(function (ms) {
        dentro.innerHTML = ''; if (!ms.length) { dentro.appendChild(el('p', 'hint', 'Nessun messaggio salvato per questo evento.')); return; }
        ms.sort(function (x, y) { return x.t - y.t; }).forEach(function (m) {
          var d = new Date(m.t), r = el('div', 'chat-msg ' + (m.f === 'blu' ? 'blu' : m.f === 'rossa' ? 'rossa' : ''));
          r.appendChild(el('b', null, (m.nome || m.da) + ' · ' + (m.tipo === 'globale' ? 'globale' : m.tipo === 'fazione' ? 'fazione ' + esNomeFaz(m.f) : 'diretto')));
          r.appendChild(el('div', 'chat-testo', m.testo)); r.appendChild(el('small', null, ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2)));
          dentro.appendChild(r);
        });
      }, function (e) { dentro.textContent = 'Non riesco a caricarla: ' + (e.message || e); });
    };
    return k;
  }
  function bancoLinee() { var buf = ''; return function (pezzo) { buf += pezzo; var i; while ((i = buf.indexOf('\n')) >= 0) { bancoRiga(buf.slice(0, i)); buf = buf.slice(i + 1); } if (buf.length > 40000) { bancoRiga(buf); buf = ''; } }; }
  function bancoScollega() {
    var b = BANCO;
    try { if (b.lettore) b.lettore.cancel(); } catch (e) {}
    try { if (b.dev && b.dev.gatt.connected) b.dev.gatt.disconnect(); } catch (e) {}
    b.via = null; b.rx = null; b.scrittore = null;
    bancoRiga('-- scollegato', '##');
  }
  function bancoUsb() {
    if (!navigator.serial) { toast('USB non disponibile: serve Chrome o Edge su computer'); return; }
    navigator.serial.requestPort().then(function (porta) {
      return porta.open({ baudRate: 115200 }).then(function () {
        BANCO.porta = porta; BANCO.via = 'USB'; bancoRiga('-- collegato via USB', '##');
        // DTR/RTS a riposo: la scheda non resta in reset
        return porta.setSignals({ dataTerminalReady: false, requestToSend: false }).catch(function () {}).then(function () {
          var dec = new TextDecoder(), linee = bancoLinee();
          BANCO.scrittore = function (txt) { var w = porta.writable.getWriter(); return w.write(new TextEncoder().encode(txt + '\n')).finally(function () { w.releaseLock(); }); };
          (function leggi() {
            var r = porta.readable.getReader(); BANCO.lettore = r;
            (function giro() {
              r.read().then(function (x) {
                if (x.done) { r.releaseLock(); porta.close().catch(function () {}); if (BANCO.via === 'USB') bancoScollega(); return; }
                linee(dec.decode(x.value, { stream: true })); giro();
              }, function (e) { bancoRiga('-- errore USB: ' + e.message, '##'); try { r.releaseLock(); } catch (e2) {} porta.close().catch(function () {}); BANCO.via = null; if (BANCO.cb) BANCO.cb(); });
            })();
          })();
          if (BANCO.cb) BANCO.cb();
        });
      });
    }).catch(function (e) { if (e && e.name !== 'NotFoundError') errore(e); });
  }
  function bancoBle() {
    if (!navigator.bluetooth) { toast('Bluetooth web non disponibile: serve Chrome su Android o su computer (non iPhone)'); return; }
    navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'AC-HQ' }, { namePrefix: 'AC-INJ' }, { namePrefix: 'AC-LORA' }], optionalServices: [NUS.s] }).then(function (dev) {
      BANCO.dev = dev; bancoRiga('-- collego ' + dev.name + '…', '##');
      dev.addEventListener('gattserverdisconnected', function () { if (BANCO.via === 'BT') { BANCO.via = null; bancoRiga('-- Bluetooth perso (scollegato o fuori portata)', '##'); } });
      return dev.gatt.connect().then(function (g) { return g.getPrimaryService(NUS.s); }).then(function (s) {
        return Promise.all([s.getCharacteristic(NUS.tx), s.getCharacteristic(NUS.rx)]);
      }).then(function (cc) {
        var dec = new TextDecoder(), linee = bancoLinee();
        cc[0].addEventListener('characteristicvaluechanged', function (ev) { linee(dec.decode(ev.target.value)); });
        BANCO.rx = cc[1];
        BANCO.scrittore = function (txt) {
          var b = new TextEncoder().encode(txt + '\n'), p = Promise.resolve();
          for (var i = 0; i < b.length; i += 20) (function (pz) { p = p.then(function () { return cc[1].writeValueWithoutResponse ? cc[1].writeValueWithoutResponse(pz) : cc[1].writeValue(pz); }); })(b.slice(i, i + 20));
          return p;
        };
        return cc[0].startNotifications().then(function () { BANCO.via = 'BT'; bancoRiga('-- collegato via Bluetooth a ' + dev.name, '##'); });
      });
    }).catch(function (e) { if (e && e.name !== 'NotFoundError') errore(e); });
  }
  function bancoInvia(txt) {
    txt = String(txt || '').trim(); if (!txt) return;
    if (!BANCO.scrittore) { toast('Prima collega l\'HQ (o una scheda via USB)'); return; }
    bancoRiga(txt, '>>');
    BANCO.scrittore(txt).catch(function (e) { bancoRiga('-- invio non riuscito: ' + e.message, '##'); });
  }
  // presenze nel conflict di prova: ogni tag "dentro" una bandiera diventa un pallino sull'area collegata a quella bandiera
  function bancoInoltra(j) {
    var b = BANCO, pt = b.mappa[j.bandiera]; if (!b.attivo || !b.cid || !pt || !b.cm) return;
    var p = (b.cm.punti || []).filter(function (q) { return q.id === pt; })[0]; if (!p) return;
    var q0 = p.x != null ? { x: p.x, y: p.y } : (b.cm.geo ? { x: b.cm.geo.cx[0] * p.lon + b.cm.geo.cx[1] * p.lat + b.cm.geo.cx[2], y: b.cm.geo.cy[0] * p.lon + b.cm.geo.cy[1] * p.lat + b.cm.geo.cy[2] } : { x: 0, y: 0 });
    var soglia = j.soglia != null ? j.soglia : -80, dentro = {};
    (j.tag || []).forEach(function (t, i) { if (t.rssi >= soglia) dentro['sim-tag-' + t.f + '-' + t.n] = t; });
    Object.keys(dentro).forEach(function (uid, i) {
      if (b.ultimoPt[uid] === pt) return;
      var t = dentro[uid]; b.ultimoPt[uid] = pt; b.scritti++;
      S.scriviEvento(b.cid, { tipo: 'zona', uid: uid, team: t.f, pt: pt, x: q0.x + ((i % 4) - 1.5) * 16, y: q0.y + 22 + Math.floor(i / 4) * 16, sim: true, nome: 'T' + t.n, t: Date.now() })
        .catch(function (e) { bancoRiga('-- scrittura nel conflict rifiutata: ' + e.message, '##'); });
    });
    Object.keys(b.ultimoPt).forEach(function (uid) {
      if (b.ultimoPt[uid] !== pt || dentro[uid]) return;
      delete b.ultimoPt[uid]; b.scritti++;
      var f = uid.split('-')[2];
      S.scriviEvento(b.cid, { tipo: 'zona', uid: uid, team: f, pt: null, sim: true, via: true, t: Date.now() }).catch(function () {});
    });
  }
  // pattuglie (T-Beam dei caposquadra): la posizione GPS diventa un pallino sulla mappa del conflict di prova (pt nullo: non conta per le aree)
  function bancoPattuglia(j) {
    var b = BANCO, cfg = b.patCfg[j.pattuglia]; if (!b.attivo || !b.cid || !b.cm || !b.cm.geo || !j.fix || !cfg || !cfg.f) return;
    var g0 = b.cm.geo, x = g0.cx[0] * j.lon + g0.cx[1] * j.lat + g0.cx[2], y = g0.cy[0] * j.lon + g0.cy[1] * j.lat + g0.cy[2];
    b.scritti++;
    S.scriviEvento(b.cid, { tipo: 'zona', uid: 'sim-pat-' + j.pattuglia, team: cfg.f, pt: null, x: x, y: y, sim: true, pat: true, nome: cfg.nome || 'P', lat: j.lat, lon: j.lon, t: Date.now() });
  }
  // mortaio nel conflict di prova: quando un colpo cade vicino a una bandiera, la bandiera lo sa (luci, cicalino, display).
  // Posizione della bandiera: il suo GPS se fisso, altrimenti l'area collegata. Avvisa solo entro il raggio "vicino".
  function bancoMortaio(c, cm) {
    var b = BANCO; if (b.stopMort) { b.stopMort(); b.stopMort = null; }
    if (!c || !cm || !cm.geo || !window.AC_MORT) return;
    var puntiG = puntiGeo(cm), visti = {}, partito = Date.now(), ultimi = null;
    var stopE = S.ascoltaEventi(c.id, function (ev) { ultimi = ev; controlla(); }), tk = setInterval(controlla, 1000);
    b.stopMort = function () { clearInterval(tk); stopE(); };
    function controlla() {
      if (!ultimi) return;
      var now = Date.now(), g = motore(c), own = F.stato(g, cm, ultimi, now).owner, st0 = window.AC_MORT.stato(c, puntiG, ultimi, now, own, g.inizio);
      st0.colpi.forEach(function (cp) {
        if (visti[cp.id] || cp.arrivo > now) return; visti[cp.id] = true;
        if (cp.arrivo < partito || !b.attivo) return;   // i colpi vecchi non si riavvisano
        Object.keys(b.mappa).forEach(function (id) {
          var j = b.band[id], p = (cm.punti || []).filter(function (q) { return q.id === b.mappa[id]; })[0];
          var pos = j && j.gpsFisso && j.lat ? { lat: j.lat, lon: j.lon } : p && p.lat != null ? p : null; if (!pos) return;
          var d = Math.round(window.AC_MORT.misura(pos, cp).dist);
          if (d > st0.regole.vicino) return;
          bancoInvia('cmd ' + id + ' colpo ' + d + ' ' + st0.regole.letale + ' ' + st0.regole.vicino);
          b.storia.push({ t: now, testo: 'Mortaio: colpo a ' + d + ' m dalla bandiera ' + id });
        });
      });
    }
  }
  function bancoSvuota() {
    var b = BANCO; if (!b.cid) return;
    Object.keys(b.ultimoPt).forEach(function (uid) { S.scriviEvento(b.cid, { tipo: 'zona', uid: uid, team: uid.split('-')[2], pt: null, sim: true, via: true, t: Date.now() }).catch(function () {}); });
    b.ultimoPt = {}; toast('Pallini dei tag tolti');
  }
  function pagBanco() {
    testata('Iniettore');
    if (!P('conflitti')) { app.appendChild(el('p', 'hint', 'Non disponibile.')); return; }
    var b = BANCO, box = el('div', 'banco'); app.appendChild(box);
    var testa = el('div', 'banco-st'); box.appendChild(testa);
    var bt = el('div', 'banco-bt'); box.appendChild(bt);
    bt.appendChild(bottone('Collega HQ · Bluetooth', '', bancoBle));
    bt.appendChild(bottone('Collega · USB', '', bancoUsb));
    bt.appendChild(bottone('Scollega', '', function () { bancoScollega(); disegna(); }));
    var fw = el('a', 'btn', 'Carica firmware ↗'); fw.href = '/firmware/'; fw.target = '_blank'; bt.appendChild(fw);
    var cmdF = el('form', 'banco-cmd'), cmdI = el('input'); cmdI.placeholder = 'comando, es. cmd tutte info'; cmdI.autocomplete = 'off'; cmdI.autocapitalize = 'off';
    var ok = el('button', 'btn', 'Invia'); ok.type = 'submit'; cmdF.appendChild(cmdI); cmdF.appendChild(ok); box.appendChild(cmdF);
    cmdF.onsubmit = function (e) { e.preventDefault(); bancoInvia(cmdI.value); cmdI.value = ''; };
    var rap = el('div', 'banco-bt'); box.appendChild(rap);
    [['info', 'info'], ['tutte info', 'cmd tutte info'], ['tutte test', 'cmd tutte test'], ['tutte reset', 'cmd tutte reset'], ['tutte invia', 'cmd tutte invia'], ['soglia…', null], ['tempo…', null]].forEach(function (x) {
      rap.appendChild(bottone(x[0], 'mini', function () {
        if (x[1]) { bancoInvia(x[1]); return; }
        var k = x[0].replace('…', ''), v = prompt(k === 'soglia' ? 'Soglia in dBm per tutte le bandiere (es. -75; più vicino a 0 = area più piccola)' : 'Secondi per conquistare (es. 60)');
        if (v) bancoInvia('cmd tutte ' + k + ' ' + v.trim());
      }));
    });
    // ---- iniezione dei tag veri (T-Beam col programma INIETTORE, via USB)
    var inj = el('div', 'inj'); box.appendChild(inj);
    inj.appendChild(el('b', null, '💉 Iniezione tag'));
    inj.appendChild(el('p', 'hint', 'Serve un T-Beam col programma Iniettore collegato via USB. Scegli fazione e numero di partenza, premi Avvia e avvicina un tag alla volta (appoggiato all\'antenna): lo programma, controlla che trasmetta giusto e passa al numero dopo.'));
    var injR = el('div', 'inj-r');
    var injF = select([['blu', 'Blu'], ['rossa', 'Rossa']], 'blu'), injN = el('input'); injN.type = 'number'; injN.min = 1; injN.max = 999; injN.value = 1; injN.className = 'inj-n';
    var injP = select([['0', '-19,5 dBm'], ['1', '-13,5 dBm'], ['2', '-7 dBm'], ['3', '-3,5 dBm'], ['4', '-1 dBm'], ['5', '+1 dBm'], ['6', '+1,5 dBm'], ['7', '+2,5 dBm']], '4');
    injR.appendChild(campoForm('Fazione', injF)); injR.appendChild(campoForm('Dal numero', injN)); injR.appendChild(campoForm('Potenza', injP));
    inj.appendChild(injR);
    var injB = el('div', 'banco-bt'); inj.appendChild(injB);
    injB.appendChild(bottone('▶ Avvia', 'accent', function () { bancoInvia('pot ' + injP.value); setTimeout(function () { bancoInvia('auto ' + injF.value + ' ' + (parseInt(injN.value, 10) || 1)); }, 300); }));
    injB.appendChild(bottone('■ Stop', '', function () { bancoInvia('stop'); }));
    injB.appendChild(bottone('Solo il più vicino', '', function () { bancoInvia('pot ' + injP.value); setTimeout(function () { bancoInvia('prog ' + injF.value + ' ' + (parseInt(injN.value, 10) || 1)); }, 300); }));
    injB.appendChild(bottone('Tag in onda', '', function () { bancoInvia('elenco'); }));
    injB.appendChild(bottone('Sonda', 'mini', function () { bancoInvia('sonda'); }));
    injB.appendChild(bottone('Password…', 'mini', function () { var v = prompt('Password dei tag (di fabbrica: dx1234)'); if (v) bancoInvia('pwd ' + v.trim()); }));
    var injSt = el('div', 'inj-st'); inj.appendChild(injSt);
    function disegnaInj() {
      var I = b.inj, h = '';
      injSt.parentNode.style.display = '';
      if (I.auto) h += '<p class="inj-auto">In corso: <b>' + (I.auto.f === 'rossa' ? 'ROSSA' : 'BLU') + ' #' + I.auto.n + '</b> · avvicina il prossimo tag</p>';
      if (I.fatti.length) {
        h += '<table class="inj-t"><tr><th>Tag</th><th>Esito</th><th>Indirizzo</th></tr>';
        I.fatti.slice(0, 30).forEach(function (x) {
          h += '<tr class="' + (x.iniettore === 'ok' ? (x.verificato ? 'ok' : 'forse') : 'ko') + '"><td>' + (x.iniettore === 'ok' ? '<b class="' + x.f + '">' + (x.f === 'rossa' ? 'R' : 'B') + x.n + '</b>' : '—') + '</td><td>' +
            (x.iniettore === 'ok' ? (x.verificato ? '✓ scritto e visto in onda' : 'scritto, non ancora visto') : '✗ ' + (x.testo || 'errore')) + '</td><td class="m">' + (x.mac || '') + '</td></tr>';
        });
        h += '</table>';
      }
      if (I.vicini) {
        var nostri = I.vicini.filter(function (v) { return v.nostro; }).sort(function (a, c) { return (a.f + a.n) > (c.f + c.n) ? 1 : -1; });
        h += '<p class="hint">Tag nostri in onda (' + nostri.length + '): ' + (nostri.map(function (v) { return '<b class="' + v.f + '">' + (v.f === 'rossa' ? 'R' : 'B') + v.n + '</b> ' + v.rssi; }).join(' · ') || 'nessuno') +
          ' · altri dispositivi: ' + (I.vicini.length - nostri.length) + '</p>';
      }
      injSt.innerHTML = h;
      if (I.auto && document.activeElement !== injN) { injN.value = I.auto.n; injF.value = I.auto.f; }
    }
    var tab = el('div', 'banco-tab'); box.appendChild(tab);
    // invio al conflict di prova
    var inol = el('div', 'banco-inol'); box.appendChild(inol);
    inol.appendChild(el('b', null, 'Presenze nel conflict di prova'));
    inol.appendChild(el('p', 'hint', 'I tag dentro una bandiera diventano pallini sull\'area scelta (come i pallini di "Simula"): così si vede la conquista nell\'app. Solo conflict di prova. La conquista dell\'app è calcolata dall\'app, quella della bandiera dalla bandiera: per ora sono separate. I colpi di mortaio che cadono vicino a una bandiera le arrivano subito (luci, cicalino, display): tieni questa pagina aperta.'));
    var prove = D.conflitti.filter(function (c) { return c.prova; });
    var selC = select([['', '— nessuno —']].concat(prove.map(function (c) { return [c.id, c.nome || c.titolo || c.id]; })), b.cid || '');
    inol.appendChild(campoForm('Conflict', selC));
    var mapBox = el('div'); inol.appendChild(mapBox);
    var patBox = el('div', 'banco-pat'); inol.appendChild(patBox);
    function disegnaPat() {
      patBox.innerHTML = '';
      var ids = Object.keys(b.pat); if (!ids.length) { patBox.appendChild(el('p', 'hint', 'Pattuglie: quando l\'HQ sente un T-Beam «Pattuglia», qui scegli fazione e nome.')); return; }
      ids.forEach(function (id, i) {
        var j = b.pat[id], cfg = b.patCfg[id] || (b.patCfg[id] = { f: '', nome: 'P' + (i + 1) });
        var r = el('div', 'banco-patr');
        r.appendChild(el('b', null, '🛰 ' + id));
        var sf = select([['', 'fazione?'], ['blu', 'Blu'], ['rossa', 'Rossa']], cfg.f || ''), nm = el('input'); nm.value = cfg.nome || ''; nm.maxLength = 4; nm.placeholder = 'nome';
        function salvaCfg() { cfg.f = sf.value; cfg.nome = nm.value.trim().toUpperCase().slice(0, 4); try { localStorage.setItem('ac-pattuglie', JSON.stringify(b.patCfg)); } catch (e) {} }
        sf.onchange = salvaCfg; nm.onchange = salvaCfg;
        r.appendChild(sf); r.appendChild(nm);
        r.appendChild(el('small', 'hint', (j.fix ? 'GPS ok · ' + j.sat + ' sat' : 'senza GPS') + ' · ' + Math.round((Date.now() - j._t) / 1000) + ' s fa · ' + j.rssiLora + ' dBm' + (j.batt <= 100 ? ' · batt ' + j.batt + '%' : '')));
        patBox.appendChild(r);
      });
    }
    disegnaPat();
    var att = el('label', 'banco-chk'), chk = el('input'); chk.type = 'checkbox'; chk.checked = b.attivo; att.appendChild(chk); att.appendChild(document.createTextNode(' manda le presenze')); inol.appendChild(att);
    chk.onchange = function () { b.attivo = chk.checked; if (!b.attivo) bancoSvuota(); };
    inol.appendChild(bottone('Togli i pallini dei tag', 'mini', bancoSvuota));
    var info = el('small', 'hint'); inol.appendChild(info);
    function caricaCampo() {
      mapBox.innerHTML = ''; b.cm = null;
      var c = prove.filter(function (x) { return x.id === b.cid; })[0]; if (!c) return;
      conCampo(c.campo, mapBox, function (cm) { b.cm = cm; disegnaMappa(); bancoMortaio(c, cm); });
    }
    function disegnaMappa() {
      mapBox.innerHTML = ''; if (!b.cm) return;
      var opz = [['', '—']].concat((b.cm.punti || []).filter(function (p) { return p.tipo !== 'mob'; }).map(function (p) { return [p.id, p.nome || p.id]; }));
      var ids = Object.keys(b.band); if (!ids.length) mapBox.appendChild(el('p', 'hint', 'Quando arriva una bandiera, qui scegli a quale area corrisponde.'));
      gpsRighe = [];
      ids.forEach(function (id) {
        var s = select(opz, b.mappa[id] || ''); s.onchange = function () { b.mappa[id] = s.value || null; aggiornaGps(); }; mapBox.appendChild(campoForm('Bandiera ' + id, s));
        // posizione dal GPS della bandiera: l'area si sposta dove la bandiera è davvero
        var r = el('div', 'banco-gps'), t = el('small', 'hint'), bt = bottone('📍 Sposta l\'area qui', 'mini', function () { spostaArea(id); });
        r.appendChild(t); r.appendChild(bt); mapBox.appendChild(r); gpsRighe.push({ id: id, t: t, bt: bt });
      });
      mapBox.dataset.n = ids.length;
      aggiornaGps();
    }
    var gpsRighe = [];
    function areaDi(id) { return b.cm && b.mappa[id] ? (b.cm.punti || []).filter(function (p) { return p.id === b.mappa[id]; })[0] : null; }
    function aggiornaGps() {
      gpsRighe.forEach(function (g) {
        var j = b.band[g.id] || {}, p = areaDi(g.id), fisso = !!(j.gpsFisso && j.lat);
        var d = fisso && p && p.lat != null ? Math.round(window.AC_UTM ? distM(p.lat, p.lon, j.lat, j.lon) : 0) : null;
        g.t.textContent = !fisso ? (j.gps ? 'GPS: sto fissando la posizione…' : 'GPS: nessun segnale') :
          'GPS fisso ' + j.lat.toFixed(5) + ', ' + j.lon.toFixed(5) + (d != null ? ' · ' + d + ' m dall\'area' : '') + (j.spostata ? ' · ⚠ SPOSTATA' : '');
        g.t.className = 'hint' + ((j.spostata || (d != null && d > 25)) ? ' ko' : '');
        g.bt.hidden = !(fisso && p && P('mappe') && (d == null || d > 3));
      });
    }
    function distM(a1, o1, a2, o2) { var R = 6371000, r = Math.PI / 180, x = (o2 - o1) * r * Math.cos((a1 + a2) / 2 * r), y = (a2 - a1) * r; return Math.sqrt(x * x + y * y) * R; }
    function spostaArea(id) {
      var j = b.band[id], p = areaDi(id); if (!j || !p || !b.cm) return;
      if (!confirm('Spostare l\'area «' + (p.nome || p.id) + '» dove si trova la bandiera ' + id + '? La cartina viene salvata.')) return;
      p.lat = j.lat; p.lon = j.lon; p.fonte = 'coord';
      if (b.cm.geo && window.AC_UTM) { var q = window.AC_UTM.aPixel(b.cm.geo, p.lat, p.lon); p.x = q.x; p.y = q.y; }
      S.salvaCampo(b.cm, null).then(function () { toast('Area spostata sulla bandiera'); aggiornaGps(); }, errore);
    }
    selC.onchange = function () { bancoSvuota(); b.cid = selC.value || null; if (!b.cid && b.stopMort) { b.stopMort(); b.stopMort = null; } caricaCampo(); };
    if (b.cid) caricaCampo();
    var logT = el('div', 'banco-bt'); box.appendChild(logT);
    logT.appendChild(el('b', null, 'Righe grezze'));
    logT.appendChild(bottone('Copia log', 'mini', function () { navigator.clipboard.writeText(b.righe.join('\n')).then(function () { toast('Log copiato'); }, errore); }));
    logT.appendChild(bottone('Pulisci', 'mini', function () { b.righe = []; disegna(); }));
    var solo = el('label', 'banco-chk'), soloC = el('input'); soloC.type = 'checkbox'; solo.appendChild(soloC); solo.appendChild(document.createTextNode(' nascondi JSON')); logT.appendChild(solo);
    var pre = el('pre', 'banco-log'); box.appendChild(pre);
    soloC.onchange = function () { disegna(); };
    function eta(t) { var s = Math.round((Date.now() - t) / 1000); return s < 120 ? s + ' s' : Math.round(s / 60) + ' min'; }
    function disegna() {
      testa.textContent = (b.via ? 'COLLEGATO via ' + b.via : 'non collegato') + (b.hq ? ' · HQ ' + b.hq.hq + ' pacchetti ' + b.hq.pacchetti + ' scartati ' + b.hq.scartati + ' (' + eta(b.hq._t) + ' fa)' : '') +
        (b.tag ? ' · tag finto #' + b.tag.tag + ' ' + b.tag.f : '') + (b.scritti ? ' · eventi scritti ' + b.scritti : '');
      testa.className = 'banco-st ' + (b.via ? 'on' : 'off');
      var ids = Object.keys(b.band).sort(), h = '';
      if (!ids.length) h = '<p class="hint">Nessuna bandiera ricevuta finora.</p>';
      else {
        h = '<table><tr><th>band.</th><th>da</th><th>B</th><th>R</th><th>area</th><th>conq.</th><th>sogl.</th><th>batt</th><th>LoRa</th><th>GPS</th></tr>';
        ids.forEach(function (id) {
          var j = b.band[id], vecchia = Date.now() - j._t > 60000;
          h += '<tr' + (vecchia ? ' class="vecchia"' : '') + '><td><b>' + escB(id) + '</b> #' + j.seq + '</td><td>' + eta(j._t) + '</td><td>' + j.blu + '</td><td>' + j.rossi + '</td><td>' + (j.owner || '–') + '</td><td>' +
            (j.contesa ? 'CONTESA' : j.conq ? j.conq + ' ' + j.pct + '%' : '–') + '</td><td>' + j.soglia + '</td><td>' + (j.batt === 255 ? 'USB' : j.batt + '%') + '</td><td>' +
            (j.rssiLora != null ? j.rssiLora + ' dBm / ' + j.snr : 'USB') + '</td><td>' + (j.lat ? j.lat.toFixed(5) + ',' + j.lon.toFixed(5) : (j.gps ? 'ok' : 'no')) + '</td></tr>';
          h += '<tr><td colspan="10" class="tags">' + ((j.tag || []).map(function (t) { return '<span class="' + (t.rssi >= j.soglia ? 'in' : 'out') + ' ' + t.f + '">#' + t.n + ' ' + t.f + ' ' + t.rssi + '</span>'; }).join(' ') || 'nessun tag sentito') + '</td></tr>';
        });
        h += '</table>';
      }
      tab.innerHTML = h;
      // pattuglie: si ridisegnano solo se non si sta scrivendo un nome
      if (!patBox.contains(document.activeElement)) disegnaPat();
      disegnaInj();
      if (b.cm && String(mapBox.dataset.n) !== String(ids.length)) disegnaMappa();
      else if (b.cm) aggiornaGps();
      info.textContent = b.attivo ? (b.cid ? 'Attivo: ' + Object.keys(b.ultimoPt).length + ' tag sulle aree' : 'Scegli un conflict') : '';
      var giu = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;
      pre.textContent = (soloC.checked ? b.righe.filter(function (r) { return r.indexOf(' {') < 0; }) : b.righe).slice(-250).join('\n');
      if (giu) pre.scrollTop = pre.scrollHeight;
    }
    var prossimo = null;
    b.cb = function () { if (prossimo) return; prossimo = setTimeout(function () { prossimo = null; disegna(); }, 300); };
    var timer = setInterval(disegna, 2000);
    disegna();
    var prima = chiusura; chiusura = function () { clearInterval(timer); b.cb = null; if (prima) prima(); };
  }
  // ================= PROVA 3 T-BEAM (solo sviluppatore): una mappa con un punto, il tag che si muove secondo il segnale,
  // controlli che si spuntano da soli e tasti grossi per i comandi
  function bancoStoria(prima, j) {
    var b = BANCO, s = b.storia, id = j.bandiera;
    function d(t) { s.push({ t: Date.now(), testo: t }); if (s.length > 60) s.shift(); }
    var dentro = function (x) { var o = {}; ((x && x.tag) || []).forEach(function (t) { if (t.rssi >= x.soglia) o[t.f + ' #' + t.n] = 1; }); return o; };
    if (!prima) d('Bandiera ' + id + ' ricevuta' + (j.rssiLora != null ? ' (radio ' + j.rssiLora + ' dBm)' : ' (via USB)'));
    var a = dentro(prima), n = dentro(j);
    Object.keys(n).forEach(function (k) { if (!a[k]) d('Tag ' + k + ' DENTRO l\'area'); });
    Object.keys(a).forEach(function (k) { if (!n[k]) d('Tag ' + k + ' uscito'); });
    if (j.contesa && !(prima && prima.contesa)) d('Area CONTESA: conquista ferma');
    if (j.conq && (!prima || prima.conq !== j.conq)) d('Conquista iniziata dai ' + j.conq);
    if (j.owner !== (prima ? prima.owner : null) && prima) d(j.owner ? 'AREA CONQUISTATA dai ' + j.owner : 'Area tornata neutra');
    if (prima && prima.soglia !== j.soglia) d('Soglia ora ' + j.soglia + ' dBm');
    if (prima && prima.tempo !== j.tempo) d('Tempo di conquista ora ' + j.tempo + ' s');
    var v = b.visto; v.band = 1;
    (j.tag || []).forEach(function (t) { v.tag = 1; if (t.rssi >= j.soglia) v.dentro = 1; else v.fuori = 1; });
    if (j.conq) v.conq = 1; if (j.owner) v.owner = 1; if (j.contesa) v.contesa = 1;
    if (prima && prima.owner && j.conq && j.conq !== prima.owner) v.riconq = 1;
  }
  // ================= BEACON PROG: programmazione dei tag dei giocatori, a prova di errore.
  // Un tag alla volta: l'app chiede all'iniettore chi è appoggiato, controlla nel registro (Firestore, un documento per indirizzo MAC)
  // che non sia già fatto, lo scrive col numero libero successivo, aspetta la conferma e solo allora lo segna nel registro.
  function pagBeaconProg() {
    testata('Beacon prog');
    if (!P('conflitti') && !S.stato().dev) { app.appendChild(el('p', 'hint', 'Non disponibile.')); return; }
    var b = BANCO, I = b.inj, box = el('div', 'bp'); app.appendChild(box);
    var reg = null, faz = (function () { try { return localStorage.getItem('bp-faz') || 'blu'; } catch (e) { return 'blu'; } })();
    var fase = 'pronto', target = null, tag = null, esito = null, attesa = null, scelto = null, controllo = null, timer = null;
    var modo = 'uno', L = null, Bt = null, utenti = null, report = [], stopU = null, Rp = null;
    var stopRep = S.ascoltaReportBatt(function (r) { report = r; if (modo === 'batterie') disegna(); });
    var piano = null, pianoEdit = false;   // quanti tag per fazione: documento beacon/_piano
    // registro dei tag: nel database; nell'Officina (senza account) su questo telefono
    var LREG = 'bp-registro';
    function regLocale() { try { return JSON.parse(localStorage.getItem(LREG) || '{}'); } catch (e) { return {}; } }
    function regDaLocale() { var o = regLocale(); return Object.keys(o).map(function (k) { return Object.assign({ id: k }, o[k]); }); }
    function regScrivi(mac, dati, unisci) {
      if (!TOOL) return unisci ? S.aggiornaBeacon(mac, dati) : S.salvaBeacon(mac, dati);
      var o = regLocale(); o[mac] = unisci ? Object.assign({}, o[mac] || {}, dati) : dati; try { localStorage.setItem(LREG, JSON.stringify(o)); } catch (e) {}
      riceviReg(regDaLocale()); return Promise.resolve();
    }
    function regTogli(mac) {
      if (!TOOL) return S.eliminaBeacon(mac);
      var o = regLocale(); delete o[mac]; try { localStorage.setItem(LREG, JSON.stringify(o)); } catch (e) {} riceviReg(regDaLocale()); return Promise.resolve();
    }
    var stopReg = TOOL ? (setTimeout(function () { riceviReg(regDaLocale()); }, 0), function () {}) : S.ascoltaBeacon(riceviReg);
    function riceviReg(r) {
      r = r || [];
      var p0 = r.filter(function (x) { return x.id === '_piano'; })[0];
      piano = p0 ? { blu: p0.blu || 0, rossa: p0.rossa || 0 } : null;
      reg = r.filter(function (x) { return x.id.charAt(0) !== '_'; });
      disegna();
    }
    function tot(f) { return piano ? piano[f] : 0; }
    function completa(f) { for (var n = 1; n <= tot(f); n++) if (!perNum(f, n)) return false; return true; }
    function sig(f, n) { return (f === 'rossa' ? 'R' : 'B') + n; }
    function nomeF(f) { return f === 'rossa' ? 'ROSSO' : 'BLU'; }
    function nomeP(f) { return f === 'rossa' ? 'ROSSI' : 'BLU'; }
    function diFaz(f) { return (reg || []).filter(function (x) { return x.f === f; }); }
    function perMac(mac) { return (reg || []).filter(function (x) { return x.id === mac; })[0]; }
    function perNum(f, n) { return (reg || []).filter(function (x) { return x.f === f && x.n === n; })[0]; }
    function prossimo(f) { var n = 1; while (perNum(f, n)) n++; return n; }   // può superare il piano: lo controlla chi chiama
    function numero() { return scelto && !perNum(faz, scelto) ? scelto : prossimo(faz); }
    function vai2(f) { fase = f; disegna(); }
    function aspetta(tipo, ms) {
      attesa = { tipo: tipo, v: I.seqV || 0, f: I.fatti.length, t: Date.now() };
      clearTimeout(timer); timer = setTimeout(function () {
        if (!attesa) return; var rr = attesa.tipo.charAt(0) === 'r' && Rp; attesa = null;
        if (rr) { Rp.fase = 'errore'; Rp.testo = 'La T-Beam non risponde. Controlla il collegamento e riprova.'; disegna(); return; }
        esito = { testo: 'La T-Beam non risponde. Controlla il cavo e riprova.' }; vai2('errore');
      }, ms);
    }
    // risposte dell'iniettore
    function arrivi() {
      if (!attesa) return;
      if (attesa.tipo === 'rleggi' && (I.seqV || 0) > attesa.v) {
        var tr = I.vicino; attesa = null; clearTimeout(timer);
        if (!tr || !tr.mac) { Rp.fase = 'nessuno'; return disegna(); }
        if (tr.altri > 0) { Rp.fase = 'troppi'; return disegna(); }
        var gr = perMac(tr.mac);
        Rp = { fase: 'scegli', tag: tr, f: tr.nostro ? tr.f : gr ? gr.f : faz, n: tr.nostro ? tr.n : gr ? gr.n : prossimo(faz) };
        return disegna();
      }
      if (attesa.tipo === 'rscrivi' && I.fatti.length > attesa.f) {
        var er = I.fatti[0]; attesa = null; clearTimeout(timer);
        if (er.iniettore !== 'ok') { Rp.fase = 'errore'; Rp.testo = er.testo || 'errore'; return disegna(); }
        return rpRegistra();
      }
      if ((attesa.tipo === 'cerca' || attesa.tipo === 'verifica') && (I.seqV || 0) > attesa.v) {
        var t = I.vicino, tipo = attesa.tipo; attesa = null; clearTimeout(timer);
        if (tipo === 'verifica') {
          if (t && t.mac === tag.mac && t.nostro && t.f === faz && t.n === target) registra(); else { esito = { testo: 'Scritto ma non confermato. Rifai.' }; vai2('errore'); }
          return;
        }
        tag = t;
        if (!t || !t.mac) return vai2('nessuno');
        if (t.altri > 0) return vai2('troppi');
        var g = perMac(t.mac);
        if (g || t.nostro) { tag.gia = g ? sig(g.f, g.n) : sig(t.f, t.n); return vai2('gia'); }
        if (!t.cp35) return vai2('strano');
        return scrivi();
      }
      if (attesa.tipo === 'scrivi' && I.fatti.length > attesa.f) {
        var e = I.fatti[0]; attesa = null; clearTimeout(timer);
        if (e.iniettore !== 'ok') { esito = { testo: e.testo || 'errore' }; return vai2('errore'); }
        if (e.verificato) return registra();
        fase = 'scrivo'; disegna(); aspetta('verifica', 15000); bancoInvia('vicino');
      }
    }
    function cerca() {
      if (!b.scrittore) return vai2('pronto');
      target = numero(); tag = null; esito = null;
      vai2('cerca'); aspetta('cerca', 12000); bancoInvia('vicino');
    }
    function scrivi() {
      target = numero();
      vai2('scrivo'); aspetta('scrivi', 60000);
      bancoInvia('progmac ' + tag.mac + ' ' + faz + ' ' + target);
    }
    function registra() {
      var dati = { f: faz, n: target, quando: Date.now(), da: S.stato().me.callsign || '', nome: (tag && tag.nome) || '' };
      regScrivi(tag.mac, dati).then(function () { scelto = null; vai2('fatto'); }, function (e) { esito = { testo: 'Tag scritto ma non salvato nel registro: ' + (e.message || e) }; vai2('errore'); });
      fase = 'fatto'; disegna();
    }
    function riprogramma() { if (confirm('Il tag ' + tag.gia + ' diventerà ' + sig(faz, numero()) + '. Sicuro?')) scrivi(); }
    function finale() {
      controllo = { v: I.vicini, t: Date.now(), attesa: true, giro: 1, somma: {} }; disegna(); bancoInvia('elenco');
    }
    function grosso(cls, titolo, testo) { var c = el('div', 'bp-card ' + cls); c.appendChild(el('div', 'bp-tit', titolo)); if (testo) c.appendChild(el('div', 'bp-txt', testo)); return c; }
    function tasto(t, cls, fn) { var x = bottone(t, 'bp-btn ' + (cls || ''), fn); return x; }
    function disegna() {
      box.innerHTML = '';
      // 1. collegamento
      if (!b.via) {
        if (!navigator.serial && !navigator.bluetooth) { box.appendChild(grosso('ko', 'Telefono non adatto', 'Serve Chrome su Android o su computer. Su iPhone non funziona.')); return; }
        var c = grosso('', 'Collega la T-Beam', navigator.serial ? 'T-Beam con il programma INIETTORE. Cavo USB oppure Bluetooth.' : 'Accendi la T-Beam con il programma INIETTORE e premi COLLEGA.');
        if (navigator.bluetooth) c.appendChild(tasto(navigator.serial ? 'COLLEGA BLUETOOTH' : 'COLLEGA', 'acc', function () { bancoBle(); }));
        if (navigator.serial) c.appendChild(tasto('COLLEGA CON CAVO USB', navigator.bluetooth ? '' : 'acc', function () { bancoUsb(); }));
        if (navigator.bluetooth) c.appendChild(el('div', 'bp-txt bp-pic', 'Nella lista scegli AC-INJ-…'));
        box.appendChild(c); return;
      }
      if (b.avvio && b.avvio !== 'INIETTORE') {
        var c2 = grosso('ko', 'Programma sbagliato', 'Sulla T-Beam c\'è «' + b.avvio + '». Carica INIETTORE.');
        var l = el('a', 'btn bp-btn', 'CARICA FIRMWARE'); l.href = '/firmware/'; l.target = '_blank'; c2.appendChild(l);
        box.appendChild(c2); return;
      }
      if (reg === null) { box.appendChild(grosso('', 'Carico il registro…')); return; }
      // 1b. quanti tag per fazione (una volta sola, si cambia con "Cambia numeri")
      if (!piano || pianoEdit) {
        var pc = grosso('', 'Quanti tag?', 'Scegli quanti tag per ogni fazione.'), val = { blu: piano ? piano.blu : 5, rossa: piano ? piano.rossa : 5 };
        ['blu', 'rossa'].forEach(function (f) {
          var r = el('div', 'bp-cont ' + f); r.appendChild(el('b', null, nomeF(f)));
          var meno = bottone('−', 'bp-pm'), num = el('span', 'bp-val', String(val[f])), piu = bottone('+', 'bp-pm');
          var fatti = diFaz(f).reduce(function (m, x) { return Math.max(m, x.n); }, 0);
          meno.onclick = function () { if (val[f] > Math.max(0, fatti)) { val[f]--; num.textContent = val[f]; } else if (fatti) toast('Ci sono già ' + sig(f, fatti) + ' fatti'); };
          piu.onclick = function () { if (val[f] < 60) { val[f]++; num.textContent = val[f]; } };
          r.appendChild(meno); r.appendChild(num); r.appendChild(piu); pc.appendChild(r);
        });
        pc.appendChild(tasto('INIZIA', 'acc', function () {
          if (!val.blu && !val.rossa) { toast('Almeno un tag'); return; }
          regScrivi('_piano', { blu: val.blu, rossa: val.rossa, quando: Date.now(), da: S.stato().me.callsign || '' }).then(function () { pianoEdit = false; if (!val[faz]) faz = val.blu ? 'blu' : 'rossa'; }, errore);
        }));
        if (pianoEdit) pc.appendChild(tasto('Annulla', 'link', function () { pianoEdit = false; disegna(); }));
        box.appendChild(pc); return;
      }
      if (modo === 'riprog') { box.appendChild(tasto('← Indietro', 'link', indietro2)); disegnaRiprog(); return; }
      if (!tot(faz) && tot(faz === 'blu' ? 'rossa' : 'blu')) faz = faz === 'blu' ? 'rossa' : 'blu';
      // 2. fazione
      var fz = el('div', 'bp-faz');
      ['blu', 'rossa'].forEach(function (f) {
        var x = el('button', 'bp-fz ' + f + (faz === f ? ' on' : '')); x.type = 'button';
        x.appendChild(el('b', null, nomeF(f))); x.appendChild(el('small', null, (completa(f) && tot(f) ? '✓ ' : '') + diFaz(f).filter(function (r) { return r.n <= tot(f); }).length + ' / ' + tot(f)));
        if (!tot(f)) x.disabled = true;
        x.onclick = function () { if (fase === 'scrivo' || fase === 'cerca' || (L && /scrivo|etichette|contando/.test(L.fase))) return; faz = f; scelto = null; try { localStorage.setItem('bp-faz', f); } catch (e) {} vai2('pronto'); };
        fz.appendChild(x);
      });
      box.appendChild(fz);
      // 3. numeri: pieni = fatti, quello col bordo = il prossimo
      var nx = numero(), max = Math.max(tot(faz), diFaz(faz).reduce(function (m, x) { return Math.max(m, x.n); }, 0));
      var gr = el('div', 'bp-num ' + faz);
      for (var n = 1; n <= max; n++) (function (n) {
        var r = perNum(faz, n), x = el('button', 'bp-n' + (r ? ' fatto' : '') + (n === nx && !r ? ' prox' : '')); x.type = 'button';
        x.textContent = sig(faz, n);
        x.onclick = function () {
          if (fase === 'scrivo' || fase === 'cerca') return;
          if (r) { if (confirm(sig(faz, n) + ' fatto il ' + new Date(r.quando).toLocaleString('it-IT') + (r.da ? ' da ' + r.da : '') + '\nIndirizzo ' + r.id + '\n\nToglierlo dal registro? (solo se il tag è perso o sbagliato)')) regTogli(r.id).catch(errore); return; }
          if (n !== prossimo(faz) && !confirm('Saltare i numeri liberi e fare ' + sig(faz, n) + '?')) return;
          if (n > tot(faz)) return;
          scelto = n; vai2('pronto');
        };
        gr.appendChild(x);
      })(n);
      box.appendChild(gr);
      if (modo !== 'uno') { disegnaModo(); return; }
      // 4. il passo da fare adesso
      var T = sig(faz, nx), card;
      var altra = faz === 'blu' ? 'rossa' : 'blu';
      if ((fase === 'pronto' || fase === 'fatto') && completa(faz) && fase !== 'fatto') {
        if (completa(altra) || !tot(altra)) { card = grosso('ok', '✓ Tutti fatti!', 'Ora fai il CONTROLLO FINALE con tutti i tag vicini.'); card.appendChild(tasto('CONTROLLO FINALE', 'acc', finale)); }
        else { card = grosso('ok', '✓ ' + nomeP(faz) + ' completi', 'Ora i ' + nomeP(altra) + '. Metti via i ' + nomeP(faz) + '.'); card.appendChild(tasto('PASSA AI ' + nomeP(altra), 'acc', function () { faz = altra; try { localStorage.setItem('bp-faz', altra); } catch (e) {} vai2('pronto'); })); }
      } else if (fase === 'pronto') {
        card = grosso(faz, 'Tag ' + T, 'Prendi un tag NUOVO, togli la linguetta e appoggialo sulla T-Beam.');
        card.appendChild(tasto('PROGRAMMA ' + T, 'acc', cerca));
      } else if (fase === 'cerca') card = grosso('', 'Cerco il tag…', 'Tienilo fermo sulla T-Beam.');
      else if (fase === 'scrivo') card = grosso('', 'Scrivo ' + sig(faz, target) + '…', 'Non muovere il tag. Ci vogliono circa 15 secondi.');
      else if (fase === 'nessuno') { card = grosso('ko', 'Non vedo il tag', 'Appoggialo sulla T-Beam. Se non va, togli e rimetti la batteria.'); card.appendChild(tasto('RIPROVA', 'acc', cerca)); }
      else if (fase === 'troppi') { card = grosso('ko', 'Troppi tag vicini', 'Accendi un tag nuovo alla volta: togli la linguetta solo a quello da fare.'); card.appendChild(tasto('RIPROVA', 'acc', cerca)); }
      else if (fase === 'gia') {
        card = grosso('warn', 'Questo è già ' + tag.gia, 'Mettilo da parte. Prendi un tag nuovo.');
        card.appendChild(tasto('OK, NE PRENDO UN ALTRO', 'acc', function () { vai2('pronto'); }));
        card.appendChild(tasto('Riprogrammalo come ' + T, 'link', riprogramma));
      } else if (fase === 'strano') {
        card = grosso('warn', 'Non è un tag CP35', (tag.nome || tag.mac) + ': forse è un altro dispositivo vicino.');
        card.appendChild(tasto('RIPROVA', 'acc', cerca));
        card.appendChild(tasto('È un tag, programmalo', 'link', scrivi));
      } else if (fase === 'fatto') {
        card = grosso('ok ' + faz, '✓ ' + sig(faz, target) + ' FATTO', 'Scrivi ' + sig(faz, target) + ' sul tag col pennarello. Mettilo con i ' + nomeF(faz) + '.');
        card.appendChild(tasto(completa(faz) ? 'SCRITTO → AVANTI' : 'SCRITTO → PROSSIMO', 'acc', function () { vai2('pronto'); }));
      } else if (fase === 'errore') {
        card = grosso('ko', 'Non riuscito', (esito && esito.testo) || '');
        card.appendChild(tasto('RIPROVA', 'acc', cerca));
      }
      box.appendChild(card);
      if (fase === 'pronto' || fase === 'fatto') {
        var alt = el('div', 'bp-alt');
        alt.appendChild(tasto('RIPROGRAMMA UN TAG', '', function () { modo = 'riprog'; Rp = { fase: 'leggi' }; disegna(); }));
        alt.appendChild(tasto('TANTI TAG INSIEME', '', function () { modo = 'lotto'; L = { fase: 'conta' }; disegna(); }));
        alt.appendChild(tasto('BATTERIE', '', function () { modo = 'batterie'; Bt = null; disegna(); }));
        alt.appendChild(tasto('ASSEGNA AI GIOCATORI', '', function () { modo = 'assegna'; caricaUtenti(); disegna(); }));
        box.appendChild(alt);
      }
      // 5. controllo finale: quali tag si sentono davvero
      var fin = el('div', 'bp-fin');
      fin.appendChild(tasto('Controllo finale', '', finale));
      fin.appendChild(tasto('Cambia numeri (' + tot('blu') + ' blu, ' + tot('rossa') + ' rossi)', 'link', function () { pianoEdit = true; disegna(); }));
      if (controllo) {
        if (controllo.attesa) fin.appendChild(el('p', 'hint', 'Metti tutti i tag vicino alla T-Beam… (circa 20 secondi, ascolto due volte)'));
        else {
          var vs = (controllo.v || []).filter(function (v) { return v.nostro; }), h = '';
          ['blu', 'rossa'].forEach(function (f) {
            var nums = {}; vs.filter(function (v) { return v.f === f; }).forEach(function (v) { (nums[v.n] = nums[v.n] || []).push(v.mac); });
            var regF = diFaz(f), mx = Math.max(0, regF.reduce(function (m, x) { return Math.max(m, x.n); }, 0), Object.keys(nums).reduce(function (m, k) { return Math.max(m, +k); }, 0));
            h += '<div class="bp-ck ' + f + '"><b>' + nomeF(f) + '</b>';
            for (var k = 1; k <= mx; k++) {
              var stato = nums[k] && nums[k].length > 1 ? 'doppio' : nums[k] ? 'ok' : perNum(f, k) ? 'manca' : 'vuoto';
              h += '<span class="' + stato + '">' + sig(f, k) + (stato === 'doppio' ? ' ×' + nums[k].length : '') + '</span>';
            }
            h += '</div>';
          });
          var dopp = /doppio/.test(h), manc = /manca/.test(h);
          fin.innerHTML += h + '<p class="bp-esito ' + (dopp ? 'ko' : manc ? 'warn' : 'ok') + '">' + (dopp ? 'ATTENZIONE: numeri doppi!' : manc ? 'Alcuni tag non si sentono: avvicinali o controlla la batteria.' : 'Tutto a posto.') + '</p>';
        }
      }
      box.appendChild(fin);
    }
    // ---------- modi: tanti tag insieme, batterie, assegnazione
    // numeri liberi: contano come liberi anche quelli dei tag che sto per riprogrammare
    function liberi(f, k, macs) { var r = [], n = 1; while (r.length < k && n <= tot(f)) { var g = perNum(f, n); if (!g || (macs && macs.indexOf(g.id) >= 0)) r.push(n); n++; } return r; }
    function indietro2() { if (L && (L.fase === 'scrivo')) return; if (Rp && (Rp.fase === 'scrivo' || Rp.fase === 'leggo')) return; Rp = null; if (L && L.fase === 'etichette') bancoInvia('basta'); modo = 'uno'; L = null; fase = 'pronto'; disegna(); }
    function stepper(val, min, max, onch) {
      var r = el('div', 'bp-step'), meno = bottone('−', 'bp-pm'), num = el('span', 'bp-val', String(val)), piu = bottone('+', 'bp-pm');
      meno.onclick = function () { if (val > min) { val--; num.textContent = val; onch(val); } };
      piu.onclick = function () { if (val < max) { val++; num.textContent = val; onch(val); } };
      r.appendChild(meno); r.appendChild(num); r.appendChild(piu); return r;
    }
    function arriviModi() {
      if (L && L.attesa === 'nuovi' && (I.seqN || 0) > L.seqN) { L.attesa = null; L.visti = (I.nuovi || []).slice().sort(function (a, c) { return c.rssi - a.rssi; }); L.messi = 0; L.fase = 'contati'; }
      if (L && L.attesa === 'scrivi' && I.fatti.length > L.nf) {
        var e = I.fatti[0], it = L.lista[L.i]; L.attesa = null; clearTimeout(L.to);
        if (e.iniettore === 'ok' && e.mac === it.mac) {
          it.stato = 'ok';
          regScrivi(it.mac, { f: L.f, n: it.n, quando: Date.now(), da: S.stato().me.callsign || '', nome: it.nome || '' }).catch(function () { it.stato = 'noreg'; });
          L.i++;
        } else if (!it.riprova) { it.riprova = true; }
        else { it.stato = 'errore'; it.testo = e.testo; L.i++; }
        setTimeout(prossimoLotto, 300);
      }
      if (Bt && Bt.attesa && (I.seqB || 0) > Bt.seqB) { Bt.attesa = false; Bt.righe = I.batt || []; }
    }
    function prossimoLotto() {
      if (!L || L.fase !== 'scrivo') return;
      while (L.i < L.lista.length && L.lista[L.i].stato) L.i++;
      if (L.i >= L.lista.length) { L.fase = L.lista.some(function (x) { return x.stato === 'ok'; }) ? 'etichette' : 'fine'; L.e = 0; if (L.fase === 'etichette') lampeggia(); disegna(); return; }
      var it = L.lista[L.i]; L.attesa = 'scrivi'; L.nf = I.fatti.length;
      clearTimeout(L.to); L.to = setTimeout(function () { if (L && L.attesa === 'scrivi' && L.lista[L.i] === it) { L.attesa = null; it.stato = 'errore'; it.testo = 'nessuna risposta'; L.i++; prossimoLotto(); } }, 60000);
      bancoInvia('progmac ' + it.mac + ' ' + L.f + ' ' + it.n); disegna();
    }
    function okLista() { return L.lista.filter(function (x) { return x.stato === 'ok'; }); }
    function lampeggia() { var it = okLista()[L.e]; if (it) bancoInvia('lampeggia ' + it.mac + ' 40'); }
    function caricaUtenti() {
      if (stopU) return;
      stopU = S.ascoltaUtenti(function (u) {
        var me = S.stato().me || {};
        utenti = u.filter(function (x) { return (me.team && x.team === me.team) || x.ruolo === 'organizzatore'; }).sort(function (a, c) { return nomeG(a).localeCompare(nomeG(c)); });
        if (modo === 'assegna' || (L && L.fase === 'etichette')) disegna();
      });
    }
    function sceltaGioc(r, cb) {
      var usati = {}; (reg || []).forEach(function (x) { if (x.uid && x.id !== (r && r.id)) usati[x.uid] = sig(x.f, x.n); });
      var opz = [['', '— nessuno —']].concat((utenti || []).map(function (u) { return [u.id, conNome(u) + (usati[u.id] ? '  (ha già ' + usati[u.id] + ')' : '')]; }));
      var sel = select(opz, (r && r.uid) || ''); sel.className = 'bp-sel';
      sel.onchange = function () {
        var u = (utenti || []).filter(function (x) { return x.id === sel.value; })[0];
        if (u && usati[u.id] && !confirm(nomeG(u) + ' ha già ' + usati[u.id] + '. Spostarlo su ' + sig(r.f, r.n) + '?')) { sel.value = (r && r.uid) || ''; return; }
        var lavori = [S.aggiornaBeacon(r.id, { uid: u ? u.id : null, gioc: u ? nomeG(u) : null })];
        if (u && usati[u.id]) (reg || []).forEach(function (x) { if (x.uid === u.id && x.id !== r.id) lavori.push(S.aggiornaBeacon(x.id, { uid: null, gioc: null })); });
        Promise.all(lavori).then(function () { if (cb) cb(); }, errore);
      };
      return sel;
    }
    function voltaggio(mv) { return mv && mv < 5000 ? (mv / 1000).toFixed(2).replace('.', ',') + ' V' : '—'; }
    // CR2032: tensione quasi piatta fino a fine vita, poi crolla. Curva indicativa (con il tag che trasmette).
    var CURVA = [[3000, 100], [2950, 90], [2900, 75], [2850, 60], [2800, 45], [2700, 25], [2600, 12], [2500, 5], [2300, 0]];
    function percento(mv) {
      if (!mv || mv >= 5000) return null;
      if (mv >= CURVA[0][0]) return 100;
      for (var i = 1; i < CURVA.length; i++) if (mv >= CURVA[i][0]) { var a = CURVA[i - 1], b = CURVA[i]; return Math.round(b[1] + (a[1] - b[1]) * (mv - b[0]) / (a[0] - b[0])); }
      return 0;
    }
    // ok: regge piu' giocate · warn: da cambiare prima della prossima giocata · ko: cambiare subito
    function statoBatt(mv) { return !mv || mv >= 5000 ? 'nd' : mv >= 2850 ? 'ok' : mv >= 2700 ? 'warn' : 'ko'; }
    function testoBatt(mv) { var p = percento(mv); return p == null ? '—' : voltaggio(mv) + ' · ' + p + '%' + (statoBatt(mv) === 'warn' ? ' · CAMBIA PRESTO' : statoBatt(mv) === 'ko' ? ' · CAMBIA ORA' : ''); }
    function tabellaBatt(righe) {
      var t = el('div', 'bp-batt');
      righe.forEach(function (x) {
        var r = el('div', 'bp-br ' + statoBatt(x.mv));
        r.appendChild(el('b', x.f, x.f ? sig(x.f, x.n) : '?'));
        r.appendChild(el('span', 'g', x.gioc || ''));
        r.appendChild(el('span', 'v', x.sentito === false ? 'NON SENTITO' : x.mv ? testoBatt(x.mv) : 'non letta'));
        if (x.grezzo) r.appendChild(el('code', 'bp-grezzo', x.grezzo));
        t.appendChild(r);
      });
      return t;
    }
    // riprogramma un tag qualsiasi (nuovo o già fatto) con la fazione e il numero che vuoi
    function rpLeggi() { Rp = { fase: 'leggo' }; disegna(); aspetta('rleggi', 15000); bancoInvia('vicino'); }
    function rpScrivi() {
      var altro = perNum(Rp.f, Rp.n);
      if (altro && altro.id !== Rp.tag.mac && !confirm(sig(Rp.f, Rp.n) + ' nel registro è un altro tag (' + altro.id + ').\nQuello verrà tolto dal registro: il numero passa a questo tag. Va bene?')) return;
      Rp.fase = 'scrivo'; Rp.altro = altro && altro.id !== Rp.tag.mac ? altro.id : null; disegna();
      aspetta('rscrivi', 60000); bancoInvia('progmac ' + Rp.tag.mac + ' ' + Rp.f + ' ' + Rp.n);
    }
    function rpRegistra() {
      var lav = [regScrivi(Rp.tag.mac, { f: Rp.f, n: Rp.n, quando: Date.now(), da: S.stato().me.callsign || '', nome: Rp.tag.nome || '' })];
      if (Rp.altro) lav.push(regTogli(Rp.altro));
      Promise.all(lav).then(function () { Rp.fase = 'fatto'; disegna(); }, function (e) { Rp.fase = 'fatto'; Rp.nota = 'Scritto sul tag, ma il registro non si è aggiornato: ' + (e.message || e); disegna(); });
    }
    function disegnaRiprog() {
      var card;
      if (Rp.fase === 'leggi') {
        card = grosso('', 'Riprogramma un tag', 'Appoggia sulla T-Beam il tag da cambiare (nuovo o già programmato). Gli altri tag tienili lontani o spenti.');
        card.appendChild(tasto('LEGGI IL TAG', 'acc', rpLeggi));
      } else if (Rp.fase === 'leggo') card = grosso('', 'Leggo il tag…', 'Tienilo fermo sulla T-Beam.');
      else if (Rp.fase === 'nessuno') { card = grosso('ko', 'Non vedo il tag', 'Appoggialo sulla T-Beam. Se non va, togli e rimetti la batteria.'); card.appendChild(tasto('RIPROVA', 'acc', rpLeggi)); }
      else if (Rp.fase === 'troppi') { card = grosso('ko', 'Troppi tag vicini', 'Allontana gli altri tag (almeno 2 metri) o togligli la batteria.'); card.appendChild(tasto('RIPROVA', 'acc', rpLeggi)); }
      else if (Rp.fase === 'scegli') {
        var t = Rp.tag, g = perMac(t.mac), ora = t.nostro ? sig(t.f, t.n) : g ? sig(g.f, g.n) : null;
        card = grosso(Rp.f, ora ? 'Questo è ' + ora : 'Tag nuovo', (t.nome || '') + ' · ' + t.mac + (g && g.gioc ? ' · ce l\'ha ' + g.gioc : ''));
        var fzr = el('div', 'bp-faz');
        ['blu', 'rossa'].forEach(function (f) { var x = el('button', 'bp-fz ' + f + (Rp.f === f ? ' on' : '')); x.type = 'button'; x.appendChild(el('b', null, nomeF(f))); x.onclick = function () { Rp.f = f; disegna(); }; fzr.appendChild(x); });
        card.appendChild(el('div', 'bp-txt bp-pic', 'Diventa:')); card.appendChild(fzr);
        card.appendChild(stepper(Rp.n, 1, 99, function (v) { Rp.n = v; var a2 = perNum(Rp.f, v); avv.textContent = a2 && a2.id !== t.mac ? '⚠ ' + sig(Rp.f, v) + ' nel registro è un altro tag: lo sostituisci' : ''; }));
        var a0 = perNum(Rp.f, Rp.n), avv = el('div', 'bp-txt', a0 && a0.id !== t.mac ? '⚠ ' + sig(Rp.f, Rp.n) + ' nel registro è un altro tag: lo sostituisci' : ''); card.appendChild(avv);
        card.appendChild(tasto('PROGRAMMA', 'acc', rpScrivi));
      } else if (Rp.fase === 'scrivo') card = grosso('', 'Scrivo ' + sig(Rp.f, Rp.n) + '…', 'Non muovere il tag. Circa 15 secondi.');
      else if (Rp.fase === 'fatto') {
        card = grosso('ok ' + Rp.f, '✓ Ora è ' + sig(Rp.f, Rp.n), Rp.nota || 'Correggi la scritta sul tag col pennarello.');
        card.appendChild(tasto('UN ALTRO', 'acc', function () { Rp = { fase: 'leggi' }; disegna(); }));
      } else if (Rp.fase === 'errore') { card = grosso('ko', 'Non riuscito', Rp.testo || ''); card.appendChild(tasto('RIPROVA', 'acc', rpLeggi)); }
      box.appendChild(card);
    }
    function disegnaModo() {
      var card, T;
      box.appendChild(tasto('← Indietro', 'link', indietro2));
      if (modo === 'riprog') { disegnaRiprog(); return; }
      if (modo === 'lotto') {
        if (L.fase === 'conta') {
          card = grosso(faz, 'Tanti tag ' + nomeP(faz), L.anche ? 'Metti TUTTI i tag da programmare intorno alla T-Beam (meno di 1 metro), nuovi e già fatti: diventano ' + nomeP(faz) + ' con numeri nuovi.' : 'Togli la linguetta ai tag nuovi e mettili TUTTI intorno alla T-Beam (meno di 1 metro).');
          var ck = el('label', 'bp-ck-anche'), cb = el('input'); cb.type = 'checkbox'; cb.checked = !!L.anche; cb.onchange = function () { L.anche = cb.checked; disegna(); };
          ck.appendChild(cb); ck.appendChild(document.createTextNode(' Anche i tag già programmati (li riprogrammo)')); card.appendChild(ck);
          card.appendChild(tasto('CONTA I TAG', 'acc', function () { L.attesa = 'nuovi'; L.seqN = I.seqN || 0; L.fase = 'contando'; bancoInvia(L.anche ? 'nuovi -80 tutti' : 'nuovi'); disegna(); }));
        } else if (L.fase === 'contando') card = grosso('', 'Conto i tag…', 'Aspetta 10 secondi.');
        else if (L.fase === 'contati') {
          var giaF = L.visti.filter(function (v) { return v.nostro; });
          card = grosso('', 'Vedo ' + L.visti.length + ' tag', (giaF.length ? giaF.length + ' già programmati (' + giaF.map(function (v) { return sig(v.f, v.n); }).join(', ') + ') li riprogrammo. ' : '') + 'Quanti ne hai messi tu?');
          card.appendChild(stepper(L.messi, 0, 60, function (v) { L.messi = v; }));
          card.appendChild(tasto('CONFERMA', 'acc', function () {
            if (!L.messi) { toast('Conta i tag che hai messo'); return; }
            if (L.messi !== L.visti.length) { L.fase = 'diverso'; disegna(); return; }
            var lib = liberi(faz, L.visti.length, L.visti.map(function (v) { return v.mac; }));
            if (lib.length < L.visti.length) { L.fase = 'troppi'; L.lib = lib.length; disegna(); return; }
            L.f = faz; L.lista = L.visti.map(function (v, k) { return { mac: v.mac, nome: v.nome, n: lib[k], stato: null }; }); L.fase = 'pronto'; disegna();
          }));
          card.appendChild(tasto('Riconta', 'link', function () { L.fase = 'conta'; disegna(); }));
        } else if (L.fase === 'diverso') {
          card = grosso('ko', 'Non corrisponde', 'Io ne vedo ' + L.visti.length + ', tu ne hai messi ' + L.messi + '. Avvicinali tutti e controlla le linguette.');
          card.appendChild(tasto('RICONTA', 'acc', function () { L.fase = 'conta'; disegna(); }));
        } else if (L.fase === 'troppi') {
          card = grosso('ko', 'Troppi tag', 'Ai ' + nomeP(faz) + ' ne mancano solo ' + L.lib + '. Togline ' + (L.visti.length - L.lib) + ' e riconta.');
          card.appendChild(tasto('RICONTA', 'acc', function () { L.fase = 'conta'; disegna(); }));
        } else if (L.fase === 'pronto') {
          T = sig(L.f, L.lista[0].n) + (L.lista.length > 1 ? ' – ' + sig(L.f, L.lista[L.lista.length - 1].n) : '');
          card = grosso(L.f, L.lista.length + ' tag: ' + T, 'Non toccare i tag finché non ho finito (circa ' + Math.ceil(L.lista.length * 20 / 60) + ' min).');
          card.appendChild(tasto('PROGRAMMA TUTTI', 'acc', function () { L.fase = 'scrivo'; L.i = 0; prossimoLotto(); }));
        } else if (L.fase === 'scrivo' || L.fase === 'fine') {
          var fatti = okLista().length;
          card = grosso(L.fase === 'fine' ? (fatti === L.lista.length ? 'ok' : 'warn') : '', L.fase === 'fine' ? 'Finito: ' + fatti + ' su ' + L.lista.length : 'Scrivo ' + (Math.min(L.i + 1, L.lista.length)) + ' di ' + L.lista.length + '…', L.fase === 'fine' ? 'Quelli con ✗ rifalli uno alla volta.' : 'Non toccare i tag.');
          var pr = el('div', 'bp-prog');
          L.lista.forEach(function (x, k) { pr.appendChild(el('span', 'p ' + (x.stato || (k === L.i ? 'ora' : '')), sig(L.f, x.n) + (x.stato === 'ok' ? ' ✓' : x.stato === 'errore' ? ' ✗' : ''))); });
          card.appendChild(pr);
          if (L.fase === 'fine') card.appendChild(tasto('FINE', 'acc', indietro2));
        } else if (L.fase === 'etichette') {
          var oks = okLista(), it = oks[L.e];
          card = grosso(L.f, 'Lampeggia: ' + sig(L.f, it.n), 'Cerca il tag con la LUCE ROSSA che lampeggia. Scrivici ' + sig(L.f, it.n) + ' col pennarello.');
          var r = perMac(it.mac);
          if (r) { if (!utenti) caricaUtenti(); var lab = el('div', 'bp-txt bp-pic', 'A chi lo dai?'); card.appendChild(lab); card.appendChild(sceltaGioc(r)); }
          card.appendChild(tasto(L.e + 1 < oks.length ? 'SCRITTO → PROSSIMO (' + (L.e + 2) + '/' + oks.length + ')' : 'SCRITTO → FINE', 'acc', function () {
            bancoInvia('basta');
            L.e++;
            if (L.e >= oks.length) { L.fase = 'fine'; disegna(); return; }
            setTimeout(lampeggia, 800); disegna();
          }));
          card.appendChild(tasto('Non lo trovo: fallo lampeggiare di nuovo', 'link', function () { bancoInvia('basta'); setTimeout(lampeggia, 800); }));
        }
        box.appendChild(card); return;
      }
      if (modo === 'batterie') {
        card = grosso('', 'Batterie dei tag', 'Metti TUTTI i tag vicino alla T-Beam (per esempio al briefing).');
        card.appendChild(tasto(Bt && Bt.attesa ? 'LEGGO… (12 s)' : 'LEGGI BATTERIE', 'acc', function () { if (Bt && Bt.attesa) return; Bt = { attesa: true, seqB: I.seqB || 0 }; bancoInvia('batterie'); disegna(); }));
        if (Bt && Bt.righe) {
          var sentiti = {}; Bt.righe.forEach(function (x) { sentiti[x.mac] = x; });
          var righe = (reg || []).slice().sort(function (a, c) { return a.f === c.f ? a.n - c.n : a.f === 'blu' ? -1 : 1; }).map(function (r) {
            var x = sentiti[r.id]; return { mac: r.id, f: r.f, n: r.n, mv: x ? x.mv : 0, gioc: r.gioc || '', sentito: !!x, grezzo: x && !x.mv ? (x.tlm ? 'TLM ' + x.tlm : 'no TLM') + (x.altro ? ' · ' + x.altro : '') : '' };
          });
          var basse = righe.filter(function (x) { return x.sentito && statoBatt(x.mv) === 'ko'; }).length, mancano = righe.filter(function (x) { return !x.sentito; }).length;
          var nonLette = righe.filter(function (x) { return x.sentito && !x.mv; }).length;
          var presto = righe.filter(function (x) { return x.sentito && statoBatt(x.mv) === 'warn'; }).length;
          card.appendChild(el('div', 'bp-esito ' + (basse ? 'ko' : mancano || nonLette || presto ? 'warn' : 'ok'), basse ? basse + ' batterie da cambiare ORA' : mancano ? mancano + ' tag non sentiti' : nonLette ? nonLette + ' non lette: rileggi' : presto ? presto + ' da cambiare prima della prossima giocata' : 'Tutte a posto'));
          card.appendChild(tabellaBatt(righe));
          var sv = el('div', 'bp-faz');
          [['inizio', 'SALVA INIZIO'], ['fine', 'SALVA FINE']].forEach(function (t) {
            sv.appendChild(tasto(t[1], '', function () {
              S.salvaReportBatt({ tipo: t[0], quando: Date.now(), da: S.stato().me.callsign || '', righe: righe }).then(function () { toast('Report salvato'); }, errore);
              righe.forEach(function (x) { if (x.sentito && x.mv) S.aggiornaBeacon(x.mac, { mv: x.mv, mvQuando: Date.now() }).catch(function () {}); });
            }));
          });
          card.appendChild(sv);
        }
        box.appendChild(card);
        // report salvati (li vedono tutti gli organizzatori)
        var rp = el('div', 'bp-rep'); rp.appendChild(el('h3', 'sez', 'Report salvati'));
        if (!report.length) rp.appendChild(el('p', 'hint', 'Nessun report ancora.'));
        report.forEach(function (r) {
          var d = el('details', 'bp-repi'), sm = el('summary');
          var presto = (r.righe || []).filter(function (x) { return x.sentito && statoBatt(x.mv) === 'warn'; }).length, basse = (r.righe || []).filter(function (x) { return x.sentito && statoBatt(x.mv) === 'ko'; }).length, manc = (r.righe || []).filter(function (x) { return !x.sentito; }).length;
          sm.textContent = (r.tipo === 'fine' ? 'FINE' : 'INIZIO') + ' · ' + new Date(r.quando).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' · ' + (basse ? basse + ' da cambiare ora' : presto ? presto + ' da cambiare presto' : 'ok') + (manc ? ' · ' + manc + ' non sentiti' : '');
          d.appendChild(sm); d.appendChild(tabellaBatt(r.righe || [])); rp.appendChild(d);
        });
        box.appendChild(rp); return;
      }
      if (modo === 'assegna') {
        card = grosso('', 'Chi ha quale tag', 'Scegli il giocatore per ogni tag.');
        if (!utenti) card.appendChild(el('p', 'hint', 'Carico i giocatori…'));
        else {
          var lst = (reg || []).slice().sort(function (a, c) { return a.f === c.f ? a.n - c.n : a.f === 'blu' ? -1 : 1; });
          var ass = lst.filter(function (x) { return x.uid; }).length;
          card.appendChild(el('div', 'bp-esito ' + (ass === lst.length ? 'ok' : 'warn'), ass + ' su ' + lst.length + ' assegnati'));
          lst.forEach(function (r) { var row = el('div', 'bp-ass ' + r.f); row.appendChild(el('b', null, sig(r.f, r.n))); row.appendChild(sceltaGioc(r)); card.appendChild(row); });
          var conTag = {}; lst.forEach(function (r) { if (r.uid) conTag[r.uid] = 1; });
          var senza = utenti.filter(function (u) { return !conTag[u.id]; });
          if (senza.length) card.appendChild(el('p', 'bp-txt bp-pic', 'Senza tag: ' + senza.map(nomeG).join(', ')));
        }
        box.appendChild(card); return;
      }
    }
    var vecchiVicini = I.viciniT || 0;
    b.cb = function () {
      if (controllo && controllo.attesa && (I.viciniT || 0) > vecchiVicini) {
        // due ascolti di fila e si sommano: un tag che in un giro non si è fatto sentire c'è quasi sempre nell'altro
        vecchiVicini = I.viciniT;
        (I.vicini || []).forEach(function (v) { var x = controllo.somma[v.mac]; if (!x || (v.nostro && !x.nostro) || v.rssi > x.rssi) controllo.somma[v.mac] = Object.assign({}, v, x && x.nostro && !v.nostro ? { nostro: true, f: x.f, n: x.n } : {}); });
        if (controllo.giro < 2) { controllo.giro++; bancoInvia('elenco'); }
        else controllo = { v: Object.keys(controllo.somma).map(function (k) { return controllo.somma[k]; }), attesa: false };
      }
      arrivi(); arriviModi(); disegna();
    };
    // appena collegati chiediamo chi è (l'iniettore risponde con "info")
    var giaChiesto = false;
    var tk = setInterval(function () { if (b.via && !b.avvio && !giaChiesto) { giaChiesto = true; bancoInvia('info'); } }, 1000);
    disegna();
    var prima = chiusura; chiusura = function () { clearInterval(tk); clearTimeout(timer); b.cb = null; if (stopReg) stopReg(); if (stopRep) stopRep(); if (stopU) stopU(); if (prima) prima(); };
  }
  function pagProvaTbeam() {
    testata('Prova bandiera');
    if (!S.stato().dev) { app.appendChild(el('p', 'hint', 'Non disponibile.')); return; }
    var b = BANCO, box = el('div', 'banco p3'); app.appendChild(box);
    var aiuto = el('details', 'p3-aiuto'); aiuto.open = !b.via;
    aiuto.appendChild(el('summary', null, 'Come si fa la prova'));
    aiuto.appendChild(el('pre', null,
      '1. Bandiera: T-Beam col programma BANDIERA, LED e cicalino collegati.\n' +
      '2. HQ: T-Beam col programma HQ. Telefono → "Bluetooth (HQ)" → AC-HQ-…\n' +
      '   (oppure la bandiera col cavo USB al PC → "USB": niente HQ)\n' +
      '3. Premi "Prova in casa": stato ogni 5 s, conquista in 20 s, soglia -60.\n' +
      '4. I tag (programmati con Beacon prog) lontani, in un\'altra stanza.\n' +
      '   Avvicina un BLU: B1 sul display, la barra cresce, dopo 20 s BLU.\n' +
      '   Porta via il blu e avvicina un ROSSO: riconquista.\n' +
      '   Blu e rosso insieme: CONTESA, tutto fermo.\n' +
      '5. Mortaio: "Colpo in pieno" e "Colpo vicino" (luci, cicalino, display).\n\n' +
      'In casa il segnale passa i muri: se un tag non esce, alza la soglia (-55, -50).'));
    box.appendChild(aiuto);
    var testa = el('div', 'banco-st'); box.appendChild(testa);
    var bt = el('div', 'banco-bt'); box.appendChild(bt);
    bt.appendChild(bottone('Bluetooth (HQ)', '', bancoBle));
    bt.appendChild(bottone('USB', '', bancoUsb));
    bt.appendChild(bottone('Scollega', 'mini', function () { bancoScollega(); disegna(); }));
    var mappa = el('div', 'p3-mappa'); box.appendChild(mappa);
    var sotto = el('div', 'p3-sotto'); box.appendChild(sotto);
    // tasti per la bandiera (via HQ con "cmd tutte", o diretti se la bandiera è collegata via USB)
    var tb = el('div', 'p3-tasti'); box.appendChild(tb);
    var tt = el('div', 'p3-tasti'); box.appendChild(tt);
    function aBandiera(c) { bancoInvia(b.hq || b.avvio === 'HQ' ? 'cmd tutte ' + c : c); }
    function sequenza(lista) { lista.forEach(function (c, i) { setTimeout(function () { aBandiera(c); }, i * 2500); }); }
    tb.appendChild(bottone('▶ Prova in casa', 'accent p3-b', function () { sequenza(['ogni 5', 'tempo 20', 'soglia -60', 'reset']); toast('Mando 4 comandi alla bandiera (10 s)'); }));
    tb.appendChild(bottone('💥 Colpo in pieno', 'p3-b p3-mort', function () { aBandiera('colpo 4'); }));
    tb.appendChild(bottone('Colpo vicino (25 m)', 'p3-b p3-mort', function () { aBandiera('colpo 25'); }));
    tb.appendChild(bottone('Colpo lontano (80 m)', 'p3-b', function () { aBandiera('colpo 80'); }));
    var sogl = el('div', 'p3-sogl'); tb.appendChild(sogl);
    sogl.appendChild(bottone('Soglia −5', 'p3-b', function () { var j = ultima(); aBandiera('soglia ' + ((j ? j.soglia : -60) - 5)); }));
    var soglT = el('b', null, '—'); sogl.appendChild(soglT);
    sogl.appendChild(bottone('Soglia +5', 'p3-b', function () { var j = ultima(); aBandiera('soglia ' + ((j ? j.soglia : -60) + 5)); }));
    [['Conquista 20 s', 'tempo 20'], ['Conquista 60 s', 'tempo 60'], ['Area neutra', 'reset'], ['Dai ai blu', 'fazione 1'], ['Dai ai rossi', 'fazione 2'],
     ['Test luce/cicalino', 'test'], ['Muto sì/no', 'muto'], ['Stato subito', 'invia'], ['Stato ogni 20 s (campo)', 'ogni 20'], ['Info', 'info']]
      .forEach(function (x) { tb.appendChild(bottone(x[0], 'p3-b', function () { aBandiera(x[1]); })); });
    function ultima() { var ids = Object.keys(b.band).sort(function (x, y) { return b.band[y]._t - b.band[x]._t; }); return ids.length ? b.band[ids[0]] : null; }
    // nomi dei giocatori dal registro dei tag (Beacon prog)
    var nomiTag = {}, stopReg = S.ascoltaBeacon ? S.ascoltaBeacon(function (r) { nomiTag = {}; (r || []).forEach(function (x) { if (x.f && x.n) nomiTag[x.f + x.n] = x.gioc || ''; }); }) : null;
    [['Tag BLU', 'f 1'], ['Tag ROSSO', 'f 2'], ['Numero +1', null], ['Potenza minima', 'pot 0'], ['Potenza media', 'pot 4'], ['Potenza massima', 'pot 7']]
      .forEach(function (x) { tt.appendChild(bottone(x[0], 'p3-b', function () { bancoInvia(x[1] || 'n ' + (((b.tag && b.tag.tag) || 0) + 1)); })); });
    var lista = el('div', 'p3-lista'); box.appendChild(lista);
    var storia = el('div', 'p3-storia'); box.appendChild(storia);
    var cmdF = el('form', 'banco-cmd'), cmdI = el('input'); cmdI.placeholder = 'comando libero'; cmdI.autocapitalize = 'off'; cmdI.autocomplete = 'off';
    var ok = el('button', 'btn', 'Invia'); ok.type = 'submit'; cmdF.appendChild(cmdI); cmdF.appendChild(ok); box.appendChild(cmdF);
    cmdF.onsubmit = function (e) { e.preventDefault(); bancoInvia(cmdI.value); cmdI.value = ''; };
    var raw = el('details', 'p3-aiuto'); raw.appendChild(el('summary', null, 'Righe grezze'));
    raw.appendChild(bottone('Copia log', 'mini', function () { navigator.clipboard.writeText(b.righe.join('\n')).then(function () { toast('Log copiato: incollalo a Claude'); }, errore); }));
    var pre = el('pre', 'banco-log'); raw.appendChild(pre); box.appendChild(raw);
    function eta(t) { var s = Math.round((Date.now() - t) / 1000); return s < 120 ? s + ' s' : Math.round(s / 60) + ' min'; }
    function hash(n) { var h = (n * 2654435761) >>> 0; return (h % 360) * Math.PI / 180; }
    function disegna() {
      var ids = Object.keys(b.band).sort(function (x, y) { return b.band[y]._t - b.band[x]._t; }), j = ids.length ? b.band[ids[0]] : null;
      var hqOk = b.hq && Date.now() - b.hq._t < 25000;
      testa.textContent = (b.via ? 'COLLEGATO via ' + b.via : 'NON COLLEGATO') + (b.avvio ? ' · scheda: ' + b.avvio : '') + (b.hq ? ' · HQ ' + b.hq.hq + (hqOk ? ' vivo' : ' MUTO da ' + eta(b.hq._t)) + ' · pacchetti ' + b.hq.pacchetti + (b.hq.irq != null ? ' · irq ' + b.hq.irq : '') + (b.hq.radio ? ' · radio ' + b.hq.radio : '') + (b.hq.lora ? ' · LoRa HQ IN ERRORE (' + b.hq.lora + ') diagnosi ' + (b.hq.diag || '') : '') : '') +
        (b.tag ? ' · tag finto: ' + b.tag.f.toUpperCase() + ' #' + b.tag.tag + ' potenza ' + b.tag.pot + ' dBm' : '');
      testa.className = 'banco-st ' + (b.via ? 'on' : 'off');
      tb.hidden = !(b.hq || b.avvio === 'HQ' || b.avvio === 'BANDIERA');
      soglT.textContent = j ? 'soglia ' + j.soglia + ' dBm' : 'soglia —';
      tt.hidden = !(b.tag || b.avvio === 'TAG');
      // mappa: un punto al centro; il bordo del cerchio è la soglia; i tag più vicini al centro quanto più forte è il segnale
      var W = 360, H = 300, cx = 180, cy = 150, R = 95, s = '<svg viewBox="0 0 ' + W + ' ' + H + '"><rect width="' + W + '" height="' + H + '" fill="#2c3a22"/>';
      for (var i = 0; i < 14; i++) s += '<circle cx="' + ((i * 97) % W) + '" cy="' + ((i * 61) % H) + '" r="' + (14 + (i % 4) * 6) + '" fill="#334527"/>';
      if (!j) s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="#777" stroke-width="2" stroke-dasharray="6 6"/><text x="' + cx + '" y="' + cy + '" fill="#ccc" font-size="14" text-anchor="middle">in attesa della bandiera…</text>';
      else {
        var col = { blu: '#2f7fd6', rossa: '#d23a2c' }, oc = j.owner ? col[j.owner] : '#aaa', vecchia = Date.now() - j._t > 45000;
        var lamp = j.contesa && Math.floor(Date.now() / 500) % 2;
        s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + (lamp ? '#d23a2c' : oc) + '" fill-opacity=".25" stroke="' + (j.contesa ? '#ffd23a' : oc) + '" stroke-width="3"/>';
        if (j.conq && j.pct > 0) {
          var a = Math.min(.999, j.pct / 100) * 2 * Math.PI, r2 = R + 8, x2 = cx + r2 * Math.sin(a), y2 = cy - r2 * Math.cos(a);
          s += '<path d="M' + cx + ' ' + (cy - r2) + ' A' + r2 + ' ' + r2 + ' 0 ' + (a > Math.PI ? 1 : 0) + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '" fill="none" stroke="' + col[j.conq] + '" stroke-width="8" stroke-linecap="round"/>';
        }
        s += '<text x="' + cx + '" y="' + (cy - 6) + '" font-size="34" text-anchor="middle" fill="#fff">⚑</text>';
        s += '<text x="' + cx + '" y="' + (cy + 22) + '" font-size="15" text-anchor="middle" fill="#fff" font-weight="700">' + (j.contesa ? 'CONTESA' : j.conq ? j.conq.toUpperCase() + ' ' + j.pct + '%' : j.owner ? 'DEI ' + j.owner.toUpperCase() : 'NEUTRA') + '</text>';
        s += '<text x="' + cx + '" y="' + (cy + 40) + '" font-size="11" text-anchor="middle" fill="#ddd">B' + j.blu + ' R' + j.rossi + ' · soglia ' + j.soglia + '</text>';
        (j.tag || []).forEach(function (t) {
          // -30 dBm = al centro, soglia = sul bordo, -105 = lontano
          var f = t.rssi >= j.soglia ? (-30 - t.rssi) / (-30 - j.soglia) : 1 + (j.soglia - t.rssi) / (j.soglia + 105) * 0.5;
          var d = Math.max(.15, Math.min(1.55, f)) * R, an = hash(t.n + (t.f === 'rossa' ? 500 : 0)), x = cx + d * Math.sin(an), y = cy - d * Math.cos(an);
          x = Math.max(14, Math.min(W - 14, x)); y = Math.max(14, Math.min(H - 14, y));
          s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="13" fill="' + col[t.f] + '" stroke="#fff" stroke-width="2"' + (t.rssi < j.soglia ? ' stroke-dasharray="3 3" fill-opacity=".5"' : '') + '/>';
          s += '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" font-size="11" text-anchor="middle" fill="#fff" font-weight="700">' + (t.f === 'rossa' ? 'R' : 'B') + t.n + '</text>';
          s += '<text x="' + x.toFixed(1) + '" y="' + (y + 25).toFixed(1) + '" font-size="10" text-anchor="middle" fill="#eee">' + escB((nomiTag[t.f + t.n] ? nomiTag[t.f + t.n] + ' ' : '') + t.rssi) + '</text>';
        });
        if (vecchia) s += '<rect width="' + W + '" height="22" fill="#a00"/><text x="8" y="16" fill="#fff" font-size="13">Bandiera muta da ' + eta(j._t) + ': è accesa? è lontana?</text>';
      }
      mappa.innerHTML = s + '</svg>';
      sotto.textContent = j ? 'Bandiera ' + j.bandiera + ' · ultimo stato ' + eta(j._t) + ' fa (#' + j.seq + ') · prossimo tra ~' + Math.max(0, 21 - Math.round((Date.now() - j._t) / 1000)) + ' s · batteria ' + (j.batt === 255 ? 'USB' : j.batt + '%') +
        (j.rssiLora != null ? ' · radio ' + j.rssiLora + ' dBm, SNR ' + j.snr : '') + (j.radio ? ' · chip ' + j.radio : '') + (j.lora ? ' · LoRa IN ERRORE (' + j.lora + ')' : j.tx != null && j.tx !== 0 && j.tx !== 1 ? ' · invio radio fallito (' + j.tx + ')' : '') + ' · conquista in ' + j.tempo + ' s' + (ids.length > 1 ? ' · (altre bandiere: ' + ids.slice(1).join(', ') + ')' : '') : '';
      var v = b.visto, passi = [
        [b.via, 'Telefono o PC collegato a un T-Beam'], [hqOk || b.avvio === 'HQ', 'HQ vivo (battito ogni 10 s)'], [v.band, 'Messaggio della bandiera arrivato via radio'],
        [v.tag, 'La bandiera sente il tag'], [v.dentro, 'Tag DENTRO l\'area'], [v.conq, 'Conquista partita'], [v.owner, 'Area conquistata (luce fissa + bip lungo)'],
        [v.riconq, 'Riconquista: via i blu, dentro un rosso (o il contrario)'], [v.risposta, 'Comando via radio: la bandiera ha risposto'], [v.fuori, 'Tag FUORI dall\'area (soglia o distanza)'], [v.contesa, 'Contesa: un blu e un rosso insieme'], [v.colpo, 'Mortaio: la bandiera ha ricevuto il colpo']];
      lista.innerHTML = '<b>Controlli</b>' + passi.map(function (p) { return '<div class="' + (p[0] ? 'ok' : '') + '">' + (p[0] ? '✔' : '○') + ' ' + p[1] + '</div>'; }).join('');
      storia.innerHTML = '<b>Cosa è successo</b>' + (b.storia.length ? b.storia.slice().reverse().slice(0, 15).map(function (x) { var d = new Date(x.t); return '<div><span>' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2) + '</span> ' + escB(x.testo) + '</div>'; }).join('') : '<div>niente ancora</div>');
      if (raw.open) { pre.textContent = b.righe.slice(-150).join('\n'); pre.scrollTop = pre.scrollHeight; }
    }
    var prossimo = null;
    b.cb = function () { if (prossimo) return; prossimo = setTimeout(function () { prossimo = null; disegna(); }, 250); };
    var timer = setInterval(disegna, 1000);
    disegna();
    var prima = chiusura; chiusura = function () { clearInterval(timer); b.cb = null; if (stopReg) stopReg(); if (prima) prima(); };
  }
  function cartaProvaTbeam() {
    var k = el('button', 'carta beta'); k.type = 'button';
    var t = el('div', 'pm-testa'); t.appendChild(el('span', 'pm-eti', 'SOLO TU')); k.appendChild(t);
    var r0 = el('div', 'beta-r'); r0.appendChild(el('span', 'beta-ic', '⚑'));
    var tx = el('div'); tx.appendChild(el('h3', null, 'Prova 3 T-Beam')); tx.appendChild(el('small', null, 'Mappa con un punto, tag, conquista e controlli che si spuntano da soli.')); r0.appendChild(tx);
    k.appendChild(r0); k.onclick = function () { vai('provaTbeam'); };
    return k;
  }
  function cartaBanco() {
    var k = el('button', 'carta beta'); k.type = 'button';
    var t = el('div', 'pm-testa'); t.appendChild(el('span', 'pm-eti', 'BETA')); k.appendChild(t);
    var r0 = el('div', 'beta-r'); r0.appendChild(el('span', 'beta-ic', '⚑'));
    var tx = el('div'); tx.appendChild(el('h3', null, 'Iniettore')); tx.appendChild(el('small', null, 'Bandiere LoRa e iniezione dei tag: collegamento all\'HQ, conteggi, tag, comandi, firmware.')); r0.appendChild(tx);
    k.appendChild(r0);
    k.onclick = function () { vai('banco'); };
    return k;
  }
  // ================= PROVA E TEST (fuori da ogni evento): bandiere LoRa sulla cartina vera, mortaio simulato, strumenti
  function pagLab(arg) {
    testata('Prova e test');
    var st = S.stato();
    if (!st.dev && !P('conflitti')) { app.appendChild(el('p', 'hint', 'Non disponibile.')); return; }
    var campi = D.campi.filter(function (c) { return c.geo; }), b = BANCO;
    var LS = {}; try { LS = JSON.parse(localStorage.getItem('lab') || '{}'); } catch (e) {}
    function salva() { try { localStorage.setItem('lab', JSON.stringify(LS)); } catch (e) {} }
    var cid = arg || LS.campo || (campi[0] && campi[0].id);
    LS.pos = LS.pos || {};
    // strumenti
    var tiles = el('div', 'tiles lab-tiles');
    [['🔧', 'Officina', 'collega e configura un dispositivo', function () { vai('officina'); }, true],
     ['✹', 'Mortaio', 'simulazione, niente arriva in campo', function () { vai('mortaioProva', cid || ''); }, P('conflitti')],
     ['⚑', 'Prova 3 T-Beam', 'schema con tag, conquista e controlli', function () { vai('provaTbeam'); }, st.dev],
     ['⌁', 'Iniettore', 'bandiere, tag, comandi, firmware', function () { vai('banco'); }, st.dev],
     ['◉', 'Beacon prog', 'programma i tag', function () { vai('beaconProg'); }, true]].forEach(function (x) {
      if (!x[4]) return;
      var t = el('button', 'tile'); t.type = 'button'; t.appendChild(el('span', 'tile-ic', x[0])); t.appendChild(el('b', null, x[1])); t.appendChild(el('small', null, x[2])); t.onclick = x[3]; tiles.appendChild(t);
    });
    app.appendChild(tiles);
    // bandiere sulla cartina
    var k = el('div', 'carta lab-band'); app.appendChild(k);
    k.appendChild(el('h3', null, '⚑ Bandiere sulla cartina'));
    if (!campi.length) { k.appendChild(el('p', 'hint', 'Serve una cartina georeferenziata (Organizza → Cartine).')); return; }
    var cs = select(campi.map(function (c) { return [c.id, c.nome]; }), cid);
    cs.onchange = function () { LS.campo = cs.value; salva(); sostituisci('lab', cs.value); };
    k.appendChild(campoForm('Cartina', cs));
    var bt = el('div', 'riga2'); bt.appendChild(bottone('USB (cavo)', 'accent', bancoUsb)); bt.appendChild(bottone('Bluetooth', '', bancoBle)); k.appendChild(bt);
    var stato = el('div', 'banco-stato'); k.appendChild(stato);
    k.appendChild(el('p', 'hint', 'Collega l\'HQ col cavo USB al PC e premi «USB (cavo)», oppure dal telefono col Bluetooth. Va bene anche una bandiera col cavo, senza HQ. La bandiera compare dove dice il suo GPS; se in casa il GPS non prende, scegli «Mettila qui» e tocca la cartina.'));
    var mapBox = el('div', 'all-mappa lab-mappa'); app.appendChild(mapBox);
    var azioni = el('div', 'riga2'); app.appendChild(azioni);
    var lista = el('div', 'lab-lista'); app.appendChild(lista);
    var v = null, tocca = null, colpi = [];
    function posDi(id) { var j = b.band[id]; if (j && j.gpsFisso && j.lat) return { lat: j.lat, lon: j.lon, gps: true }; var p = LS.pos[cid + '/' + id]; return p ? { lat: p.lat, lon: p.lon, gps: false } : null; }
    function scegli(msg, cb) { tocca = cb; mapBox.classList.add('scegli'); mapBox.scrollIntoView({ behavior: 'smooth' }); toast(msg); }
    azioni.appendChild(bottone('🔇 Silenzia tutte', '', function () { LS.muto = LS.muto || {}; Object.keys(b.band).forEach(function (id) { LS.muto[id] = true; }); salva(); bancoInvia('cmd tutte muto 1'); toast('Cicalini spenti su tutte le bandiere'); disegnaLista(); }));
    azioni.appendChild(bottone('✹ Simula un colpo di mortaio', 'accent', function () {
      scegli('Tocca dove cade il colpo', function (pt) {
        colpi.push({ lat: pt.lat, lon: pt.lon, t: Date.now() }); suonoImpatto(false);
        var detto = [];
        Object.keys(b.band).forEach(function (id) {
          var p = posDi(id); if (!p) return; var d = Math.round(window.AC_MORT.misura(p, pt).dist);
          if (d <= ES_R.vicino && b.via) bancoInvia('cmd ' + id + ' colpo ' + d + ' ' + ES_R.letale + ' ' + ES_R.vicino);
          detto.push(id + ': ' + d + ' m' + (d <= ES_R.letale ? ' COLPITA' : d <= ES_R.vicino ? ' vicino' : ''));
        });
        toast(detto.length ? detto.join(' · ') : 'Nessuna bandiera con posizione');
        if (v) v.ridisegna();
      });
    }));
    function disegnaLista() {
      var ids = Object.keys(b.band).sort(), now = Date.now();
      stato.textContent = b.via ? 'Collegato via ' + b.via + (b.avvio ? ' · ' + b.avvio : '') + ' · bandiere: ' + ids.length + (b.hq && b.hq.lat ? ' · HQ col GPS' : '') : 'Non collegato';
      stato.className = 'banco-stato' + (b.via ? ' ok' : '');
      lista.innerHTML = '';
      ids.forEach(function (id) {
        var j = b.band[id], p = posDi(id), r = el('div', 'carta lab-riga');
        var col = j.owner === 'blu' ? 'BLU' : j.owner === 'rossa' ? 'ROSSI' : 'NEUTRA';
        r.appendChild(el('b', null, '⚑ ' + id + ' · ' + col + (j.contesa ? ' · CONTESA' : j.conq ? ' · ' + (j.conq === 'blu' ? 'blu' : 'rossi') + ' ' + j.pct + '%' : '')));
        r.appendChild(el('small', null, 'B' + (j.blu || 0) + ' R' + (j.rossi || 0) + ' · tag sentiti ' + (j.tag || []).length + ' · soglia ' + j.soglia + ' · conquista ' + j.tempo + ' s · batteria ' + (j.batt === 255 ? 'USB' : j.batt + '%') + ' · ' + Math.round((now - j._t) / 1000) + ' s fa'));
        r.appendChild(el('small', null, p ? (p.gps ? 'GPS: ' : 'Messa a mano: ') + p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) + (p.gps ? '' : ' (il GPS non ha il fix)') : 'Posizione sconosciuta: GPS senza fix'));
        var r2 = el('div', 'riga2');
        r2.appendChild(bottone('📍 Mettila qui', 'piccolo', function () { scegli('Tocca dove si trova la bandiera ' + id, function (pt) { LS.pos[cid + '/' + id] = { lat: pt.lat, lon: pt.lon }; salva(); if (v) v.ridisegna(); disegnaLista(); }); }));
        r2.appendChild(bottone('🔊 Prova', 'piccolo', function () { bancoInvia('cmd ' + id + ' test'); toast('Comando mandato: la bandiera lampeggia e suona'); }));
        r2.appendChild(bottone('Coordinate 20 min', 'piccolo', function () { bancoInvia('cmd ' + id + ' posizione 20'); toast('Sul display della bandiera per 20 minuti'); }));
        LS.muto = LS.muto || {};
        r2.appendChild(bottone(LS.muto[id] ? '🔔 Riattiva suono' : '🔇 Silenzia', 'piccolo' + (LS.muto[id] ? ' accent' : ''), function () {
          var m = !LS.muto[id]; LS.muto[id] = m; salva(); bancoInvia('cmd ' + id + ' muto ' + (m ? 1 : 0));
          toast(m ? 'Cicalino spento (resta spento anche dopo il riavvio; sul display c\'è MUTO)' : 'Cicalino riattivato'); disegnaLista();
        }));
        r.appendChild(r2); lista.appendChild(r);
      });
      if (!ids.length) lista.appendChild(el('p', 'hint', b.via ? 'Ancora nessuna bandiera: arriva entro 20 secondi dall\'accensione.' : ''));
    }
    function segni() {
      var out = [], now = Date.now();
      Object.keys(b.band).sort().forEach(function (id) {
        var j = b.band[id], p = posDi(id); if (!p) return;
        out.push({ tipo: 'area', lat: p.lat, lon: p.lon, r: ES_R.letale, colore: j.owner ? COLORI[j.owner] : '#9a9a8a', pct: j.conq && j.pct ? j.pct : 0, colConq: COLORI[j.conq] || '#fff', contesa: !!j.contesa,
          sim: '⚑', nome: id + (p.gps ? '' : ' (a mano)'), sotto: now - j._t > 60000 ? 'nessun segnale' : 'B' + (j.blu || 0) + ' · R' + (j.rossi || 0) });
      });
      if (b.hq && b.hq.lat) out.push({ tipo: 'area', lat: b.hq.lat, lon: b.hq.lon, r: 12, colore: '#c9a227', sim: 'HQ', nome: 'HQ' });
      Object.keys(b.pat || {}).forEach(function (id, i) { var p = b.pat[id]; if (p.fix && p.lat) out.push({ tipo: 'pallino', lat: p.lat, lon: p.lon, colore: COLORI.blu, nome: 'P' + (i + 1) }); });
      colpi.filter(function (c) { return now - c.t < 120000; }).forEach(function (c) { out.push({ tipo: 'area', lat: c.lat, lon: c.lon, r: ES_R.letale, colore: '#ff5a1f', sim: '✹', nome: 'colpo' }); });
      return out;
    }
    conCampo(cid, mapBox, function (cm0) {
      var cm = Object.assign({}, cm0, { punti: [] });
      var g0 = { inizio: Date.now() + 864e5, durata: 60, fazioni: [{ team: 'blu', mob: null, partenza: [] }, { team: 'rossa', mob: null, partenza: [] }] };
      v = F.vista(mapBox, { g: g0, campo: cm, team: null, colori: COLORI, nomi: {}, ora: Date.now, anteprima: true, mobile: true, allenamento: true, gps: true, segni: segni,
        inquadra: function () { var o = []; Object.keys(b.band).forEach(function (id) { var p = posDi(id); if (p) o.push(p); }); if (b.hq && b.hq.lat) o.push(b.hq); return o; },
        onTocco: function (lat, lon) { if (tocca) { var f0 = tocca; tocca = null; mapBox.classList.remove('scegli'); f0({ lat: lat, lon: lon }); } } });
    });
    var prima = b.cb, prossimo = null;
    b.cb = function () { if (prima) prima(); if (prossimo) return; prossimo = setTimeout(function () { prossimo = null; disegnaLista(); if (v) v.ridisegna(); }, 400); };
    var tk = setInterval(function () { disegnaLista(); if (v) v.ridisegna(); }, 3000);
    disegnaLista();
    var ch = chiusura; chiusura = function () { clearInterval(tk); b.cb = prima; if (ch) ch(); };
  }
  function pagMortaioProva(id) {
    testata('Mortaio · BETA');
    if (!P('conflitti')) { app.appendChild(el('p', 'hint', 'Non disponibile.')); return; }
    var campi = D.campi.filter(function (c) { return c.geo; });
    if (!campi.length) { app.appendChild(el('p', 'hint', 'Serve una cartina con le coordinate (georeferenziata).')); return; }
    var parti = String(id || '').split('~'), cid = parti[0] || campi[0].id, modoP = parti[1] === 'semplice' ? 'semplice' : 'realistico';
    var cs = select(campi.map(function (c) { return [c.id, c.nome]; }), cid); cs.onchange = function () { sostituisci('mortaioProva', cs.value + '~' + modoP); };
    var vs = select([['realistico', 'Realistico'], ['semplice', 'Semplificato']], modoP); vs.onchange = function () { sostituisci('mortaioProva', cid + '~' + vs.value); };
    var due = el('div', 'tre'); due.appendChild(campoForm('Cartina', cs)); due.appendChild(campoForm('Versione', vs)); app.appendChild(due);
    app.appendChild(el('p', 'hint', 'Simulazione: niente arriva ai giocatori. I controlli di posizione sono disattivati e tutto è accelerato: rifornimenti ogni 10 secondi, costruzione in 5. Per provare il colpo: aspetta i rifornimenti, costruisci il mortaio all\'HQ, manda una richiesta toccando la mappa, ' + (modoP === 'semplice' ? 'scrivi distanza e direzione (o le coordinate)' : 'imposta deriva, alzo e carica') + ' e spara.'));
    var mapBox = el('div', 'all-mappa mort-mappa'); app.appendChild(mapBox);
    var panBox = el('div', 'mort-pan'); app.appendChild(panBox);
    conCampo(cid, mapBox, function (cm0) {
      var cm = Object.assign({}, cm0, { punti: puntiGeo(cm0) }), team = 'blu', eventi = [], visti = {}, scegliCb = null, uid = S.stato().user.uid;
      if (!cm.punti.some(function (p) { return p.tipo === 'mob' && p.fazione === team; })) panBox.appendChild(el('p', 'hint avviso', 'In questa cartina manca la base principale blu: segnala nell\'editor per provare il mortaio.'));
      var own = {}; cm.punti.forEach(function (p) { own[p.id] = p.fazione || null; });
      // in prova tutto più veloce: rifornimenti ogni 10 secondi, costruzione in 5
      var cPrv = { mortaio: modoP, regole: { mortaio: { costruzione: 5, periodo: 10, reddito: 300 } } }, t0 = Date.now();
      function st() { return window.AC_MORT.stato(cPrv, cm.punti, eventi, Date.now(), own, t0); }
      var g0 = { inizio: Date.now() + 864e5, durata: 60, fazioni: [{ team: 'blu', mob: null, partenza: [] }, { team: 'rossa', mob: null, partenza: [] }] };
      var v = F.vista(mapBox, { g: g0, campo: cm, team: null, colori: COLORI, nomi: {}, ora: Date.now, anteprima: true, mobile: true,
        segni: function () { return segniMortaio(st(), team, cm.punti, Date.now(), true); },
        onTocco: function (lat, lon) { if (scegliCb) { var f0 = scegliCb; scegliCb = null; mapBox.classList.remove('scegli'); f0({ lat: lat, lon: lon }); } else toast('Per indicare un bersaglio: «Chiama il fuoco» → «Scegli sulla mappa»'); } });
      var pan = pannelloMortaio(panBox, {
        prova: true, soluzione: true, modo: modoP, campo: cm, punti: cm.punti, team: team, uid: uid, ora: Date.now, zona: function () { return null; }, owner: function () { return own; }, puoCostruire: true,
        stato: st,
        scrivi: function (e) { e.uid = uid; e.team = team; e.t = Date.now(); eventi.push(e); pan.aggiorna(); v.ridisegna(); return Promise.resolve(); },
        scegli: function (cb) { scegliCb = cb; mapBox.classList.add('scegli'); mapBox.scrollIntoView({ behavior: 'smooth' }); toast('Tocca il bersaglio sulla mappa'); }
      });
      var ant = el('div', 'riga2'); ant.appendChild(bottone('Anteprima: telefono colpito', '', function () { allarmeColpito(9, true); }));
      ant.appendChild(bottone('Come funziona', '', function () { infoMortaio(cPrv.mortaio); })); app.appendChild(ant);
      var giro = setInterval(function () {
        var s = st();
        s.colpi.forEach(function (cp) { if (!visti[cp.id] && cp.arrivo <= Date.now()) { visti[cp.id] = true; suonoImpatto(false); var q = s.richieste.filter(function (r) { return r.id === cp.rif; })[0]; toast(q ? 'Osservatore: ' + window.AC_MORT.scarto(cp, q) : 'Colpo arrivato'); pan.aggiorna(); } });
        v.ridisegna(); pan.aggiorna();
      }, 1000);
      var prima = chiusura; chiusura = function () { clearInterval(giro); v.chiudi(); if (prima) prima(); };
    });
  }

  // ================= ESERCITAZIONE BANDIERE (in un allenamento)
  // Fase 1: i rossi difendono 2 bandiere, i blu (tag + pattuglie) le attaccano; allo scadere vince chi le tiene tutte e due.
  // Fase 2: dall'HQ si tira col mortaio sulle bandiere; chi è colpito non conta più finché non scansiona il QR di rinascita.
  // Stato: allenamenti/{id}.esercizio (fasi, scritto da chi organizza) · esercizi/{id} (bandiere, HQ, pattuglie: dal telefono collegato all'HQ)
  // · esercizi/{id}/eventi (mortaio, colpiti, rinascite, fazione scelta).
  var ES_SITO = 'https://softair-giocate.web.app/';
  var ES_R = { letale: 15, vicino: 40 };
  // infrastrutture (fase 2): punti a tempo + bandiere, costruzioni via QR all'HQ o sulle bandiere
  var ES_INF = { start: 50, base: 10, band: 10, hqSoglia: -75, hqSec: 5,
    costi: { mortaio: { costo: 100, min: 2 }, ospedale: { costo: 80, min: 2 }, mura: { costo: 60, min: 1 } } };
  var ES_COSE = { mortaio: { nome: 'Mortaio', sim: '✹', dove: 'hq+band', cosa: 'Si spara dall\'HQ: inquadra il QR sul display dell\'HQ.' },
    ospedale: { nome: 'Ospedale da campo', sim: '✚', dove: 'band', cosa: 'I vostri colpiti tornano in gioco avvicinandosi a questa bandiera.' },
    mura: { nome: 'Mura difensive', sim: '▦', dove: 'band', cosa: 'Il nemico ci mette il doppio a conquistarla. Un colpo di mortaio entro ' + 15 + ' m le distrugge.' } };
  function esInf(e0) { var c = (e0 && e0.inf) || {}; return { start: c.start != null ? c.start : ES_INF.start, base: c.base != null ? c.base : ES_INF.base, band: c.band != null ? c.band : ES_INF.band,
    hqSoglia: c.hqSoglia || ES_INF.hqSoglia, hqSec: c.hqSec || ES_INF.hqSec, costi: Object.assign({}, ES_INF.costi, c.costi || {}) }; }
  // punti e infrastrutture dagli eventi della fase 2 (stesso calcolo su ogni telefono)
  function esEconomia(eventi, e0, now) {
    var cfg = esInf(e0), t0 = e0.f2inizio || 0, cassa = { blu: cfg.start, rossa: cfg.start }, inf = [], rifiutati = {};
    (eventi || []).filter(function (e) { return e.t >= t0 && e.t <= now && (e.tipo === 'reddito' || e.tipo === 'costruisci' || e.tipo === 'distrutto'); })
      .sort(function (a, b) { return a.t - b.t; }).forEach(function (e) {
        if (e.tipo === 'reddito') { cassa.blu += +e.blu || 0; cassa.rossa += +e.rossa || 0; return; }
        if (e.tipo === 'distrutto') { inf.forEach(function (x) { if (!x.fine && x.cosa === e.cosa && x.punto === e.punto && (!e.f || x.f === e.f)) { x.fine = e.t; x.perche = e.perche; } }); return; }
        var k = cfg.costi[e.cosa], f = e.f;
        if (!k || !cassa.hasOwnProperty(f)) return;
        var gia = inf.some(function (x) { return !x.fine && x.cosa === e.cosa && x.punto === e.punto && x.f === f; });
        if (gia || cassa[f] < k.costo) { rifiutati[e.id || e.t] = gia ? 'già costruito' : 'punti insufficienti'; return; }
        cassa[f] -= k.costo;
        inf.push({ id: e.id || String(e.t), cosa: e.cosa, punto: e.punto, f: f, uid: e.uid, t: e.t, pronto: e.t + k.min * 60000 });
      });
    var attive = inf.filter(function (x) { return !x.fine; });
    attive.forEach(function (x) { x.ok = now >= x.pronto; });
    return { cfg: cfg, cassa: cassa, inf: attive, tutte: inf, rifiutati: rifiutati };
  }
  function esHa(eco, cosa, punto, f, anchePronta) { return eco.inf.filter(function (x) { return x.cosa === cosa && x.punto === punto && (!f || x.f === f) && (!anchePronta || x.ok); })[0] || null; }
  function esAttivo(a) { var f = a && a.esercizio && a.esercizio.fase; return f === 'f1' || f === 'f1fine' || f === 'f2'; }
  function esercizioInCorso() { return D.allenamenti.filter(esAttivo).sort(function (x, y) { return (y.esercizio.inizio || 0) - (x.esercizio.inizio || 0); })[0] || null; }
  function esNomeFaz(f) { return f === 'blu' ? 'BLU' : f === 'rossa' ? 'ROSSI' : '—'; }
  function esMorti(eventi) {
    // ultimo evento colpito/rinascita per ciascuno: true = fuori gioco
    var u = {};
    eventi.filter(function (e) { return e.tipo === 'colpito' || e.tipo === 'rinascita' || e.tipo === 'rinascitaTutti'; }).sort(function (x, y) { return x.t - y.t; })
      .forEach(function (e) { if (e.tipo === 'rinascitaTutti') u = {}; else u[e.uid] = e.tipo === 'colpito' ? e : null; });
    Object.keys(u).forEach(function (k) { if (!u[k]) delete u[k]; });
    return u;
  }
  function pagEsercizio(arg) {
    var parti = String(arg || '').split('~'), aid = parti[0], azione = parti[1] || '';
    var a0 = D.allenamenti.filter(function (x) { return x.id === aid; })[0];
    testata('Esercitazione');
    if (!a0) { app.appendChild(el('p', 'hint', 'Esercitazione non trovata.')); return; }
    if (!a0.campo) { app.appendChild(el('p', 'hint', 'Serve la cartina nell\'allenamento.')); return; }
    var st = S.stato(), uid = st.user.uid, org = P('allenamenti');
    var live = {}, eventi = [], reg = [], cm = null, v = null, stopL = null, stopE = null, stopR = null, giro = null, visti = {}, aperto = Date.now();
    function es() { var a = D.allenamenti.filter(function (x) { return x.id === aid; })[0] || a0; return a.esercizio || { fase: 'prep' }; }
    function mioTag() { return reg.filter(function (r) { return r.uid === uid; })[0] || null; }
    function miaFaz() {
      var t = mioTag(); if (t && (t.f === 'blu' || t.f === 'rossa')) return t.f;
      var e = eventi.filter(function (x) { return x.tipo === 'fazione' && x.uid === uid; }).sort(function (x, y) { return y.t - x.t; })[0];
      return e ? e.f : null;
    }
    function scrivi(e) { e.t = e.t || Date.now(); if (!e.uid) e.uid = uid; return S.eventoEsercizio(aid, e); }
    // --- motore del mortaio (solo fase 2): mortaio all'HQ per entrambe le fazioni, gratis, colpi senza limite
    var cMort = { mortaio: 'realistico', regole: { mortaio: { iniziali: 1e6, max: 1e6, costo: 0, colpo: 0, costruzione: 0, periodo: 1e6, reddito: 0, cadenza: 10 } } };
    var PM = [];   // sempre lo stesso array: il pannello del mortaio lo tiene e lo vede aggiornato
    function eco() { return esEconomia(eventi, es(), Date.now()); }
    function dovePunto(p) { if (p === 'hq') return live.hq && live.hq.lat != null ? { lat: live.hq.lat, lon: live.hq.lon, nome: 'HQ' } : null; var b = (live.bandiere || {})[p]; return b && b.lat != null ? { lat: b.lat, lon: b.lon, nome: b.nome || p } : null; }
    function nomePunto(p) { if (p === 'hq') return 'HQ'; var b = (live.bandiere || {})[p]; return 'bandiera ' + (b && b.nome || p); }
    // il mortaio di ogni fazione: quello costruito all'HQ, altrimenti quello su una sua bandiera
    function mortaioDi(ec, f) { var m = esHa(ec, 'mortaio', 'hq', f, true); if (m && dovePunto('hq')) return m; return ec.inf.filter(function (x) { return x.cosa === 'mortaio' && x.f === f && x.ok && dovePunto(x.punto); })[0] || null; }
    function puntiM() {
      PM.length = 0; var ec = eco();
      ['blu', 'rossa'].forEach(function (f) { var m = mortaioDi(ec, f); if (!m) return; var d = dovePunto(m.punto); PM.push({ id: 'm-' + f, tipo: 'mob', fazione: f, nome: 'Mortaio ' + d.nome, lat: d.lat, lon: d.lon, raggio: 25 }); });
      return PM;
    }
    function statoM() { var e0 = es(), t0 = e0.f2inizio || Date.now(); return window.AC_MORT.stato(cMort, puntiM(), eventi.filter(function (e) { return e.t >= t0; }), Date.now(), {}, t0); }
    function mioModo() { var e = eventi.filter(function (x) { return x.tipo === 'mortaio' && x.azione === 'costruisci' && x.uid === uid && x.t >= (es().f2inizio || 0); }).sort(function (x, y) { return y.t - x.t; })[0]; return e ? e.modo || 'realistico' : null; }
    // --- pagina
    var testa = el('div', 'es-testa'); app.appendChild(testa);
    var stato = el('div', 'es-stato'); app.appendChild(stato);
    var costrBox = el('div', 'es-costr'); app.appendChild(costrBox);
    var mapBox = el('div', 'all-mappa es-mappa'); app.appendChild(mapBox);
    var mortBox = el('div', 'mort-pan'); app.appendChild(mortBox);
    var spieg = el('div', 'es-spieg'); app.appendChild(spieg);
    var regia = el('div', 'es-regia'); if (org) app.appendChild(regia);
    var pan = null, panModo = null, scegliCb = null;
    stopR = S.ascoltaBeacon(function (r) { reg = r || []; aggiorna(); });
    stopL = S.ascoltaEsercizio(aid, function (d) { live = d || {}; if (v) v.ridisegna(); aggiorna(); });
    stopE = S.ascoltaEventiEsercizio(aid, function (ev) { eventi = ev; if (pan && pan.aggiorna) pan.aggiorna(); aggiorna(); });
    conCampo(a0.campo, mapBox, function (cm0) {
      cm = Object.assign({}, cm0, { punti: [] });
      var g0 = { inizio: Date.now() + 864e5, durata: 60, fazioni: [{ team: 'blu', mob: null, partenza: [] }, { team: 'rossa', mob: null, partenza: [] }] };
      v = F.vista(mapBox, { g: g0, campo: cm, team: null, colori: COLORI, nomi: {}, ora: Date.now, anteprima: true, mobile: true, allenamento: true, gps: true,
        inquadra: function () { var o = []; Object.keys(live.bandiere || {}).forEach(function (k) { var b = live.bandiere[k]; if (b.lat != null) o.push(b); }); if (live.hq && live.hq.lat != null) o.push(live.hq); return o; },
        segni: segni,
        onTocco: function (lat, lon) { if (scegliCb) { var f0 = scegliCb; scegliCb = null; mapBox.classList.remove('scegli'); f0({ lat: lat, lon: lon }); } } });
      setTimeout(function () { if (v) v.centra(); }, 1500);
    });
    function segni() {
      var out = [], fz = miaFaz(), now = Date.now(), e0 = es();
      Object.keys(live.bandiere || {}).sort().forEach(function (k) {
        var b = live.bandiere[k]; if (b.lat == null) return;
        var vecchia = now - (b.t || 0) > 90000;
        out.push({ tipo: 'area', lat: b.lat, lon: b.lon, r: 15, colore: b.owner ? COLORI[b.owner] : '#9a9a8a', pct: b.conq && b.pct ? b.pct : 0, colConq: COLORI[b.conq] || '#fff', contesa: !!b.contesa,
          sim: '⚑', nome: (b.nome || k) + infraSu(k), sotto: vecchia ? 'nessun segnale' : (org && (b.blu || b.rossi) ? 'B' + (b.blu || 0) + ' · R' + (b.rossi || 0) : '') });   // quanti ce ne sono: solo a chi organizza (niente informazioni gratis al nemico)
      });
      if (live.hq && live.hq.lat != null) out.push({ tipo: 'area', lat: live.hq.lat, lon: live.hq.lon, r: 12, colore: '#c9a227', sim: 'HQ', nome: 'HQ' + infraSu('hq') });
      // pattuglie: solo ai blu (e a chi organizza)
      if (fz === 'blu' || org) Object.keys(live.pattuglie || {}).forEach(function (k) { var p = live.pattuglie[k]; if (p.lat != null && now - (p.t || 0) < 300000) out.push({ tipo: 'pallino', lat: p.lat, lon: p.lon, colore: COLORI.blu, nome: p.nome || 'P' }); });
      if (e0.fase === 'f2' || e0.fase === 'fine') { var sm = statoM(); segniMortaio(sm, fz, puntiM(), now, org).forEach(function (q) { out.push(q); }); }
      return out;
    }
    function mmss(ms) { ms = Math.max(0, ms); var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
    // simboli delle costruzioni accanto al nome del punto: le proprie (in costruzione con ⏳), tutte a chi organizza
    function infraSu(p) {
      var e0 = es(); if (e0.fase !== 'f2' && e0.fase !== 'fine') return '';
      var fz = miaFaz(), t = '';
      eco().inf.forEach(function (x) { if (x.punto !== p || (!org && x.f !== fz)) return; t += ' ' + (org ? (x.f === 'blu' ? 'b' : 'r') : '') + ES_COSE[x.cosa].sim + (x.ok ? '' : '⏳'); });
      return t;
    }
    var ultimoUI = '';
    function aggiorna() {
      var e0 = es(), now = Date.now(), fz = miaFaz(), morti = esMorti(eventi), ioMorto = !!morti[uid], ec = eco(), firma = JSON.stringify([e0, fz, ioMorto, !!mioModo(), Math.floor(now / 1000), azione, ec.cassa, ec.inf.length]);
      if (firma === ultimoUI) return; ultimoUI = firma;
      // testata: fase e tempo
      testa.innerHTML = '';
      var fine1 = e0.inizio ? e0.inizio + (e0.durata || 30) * 60000 : 0;
      if (e0.fase === 'f1') { testa.className = 'es-testa f1'; testa.appendChild(el('small', null, 'FASE 1 · CONQUISTA')); testa.appendChild(el('b', null, now < fine1 ? mmss(fine1 - now) : 'TEMPO!')); }
      else if (e0.fase === 'f1fine') { testa.className = 'es-testa fine'; testa.appendChild(el('small', null, 'FASE 1 CONCLUSA')); testa.appendChild(el('b', null, e0.vincitore === 'pari' ? 'PAREGGIO' : 'VINCONO I ' + esNomeFaz(e0.vincitore))); }
      else if (e0.fase === 'f2') { testa.className = 'es-testa f2'; testa.appendChild(el('small', null, 'FASE 2')); testa.appendChild(el('b', null, 'MORTAIO')); if (e0.vincitore) testa.appendChild(el('small', null, 'Fase 1: ' + (e0.vincitore === 'pari' ? 'pareggio' : 'vincono i ' + esNomeFaz(e0.vincitore)))); }
      else if (e0.fase === 'fine') { testa.className = 'es-testa fine'; testa.appendChild(el('small', null, 'ESERCITAZIONE FINITA')); testa.appendChild(el('b', null, e0.vincitore ? (e0.vincitore === 'pari' ? 'Fase 1: pareggio' : 'Fase 1: vincono i ' + esNomeFaz(e0.vincitore)) : 'Grazie a tutti')); }
      else { testa.className = 'es-testa'; testa.appendChild(el('small', null, 'IN PREPARAZIONE')); testa.appendChild(el('b', null, 'Si parte al via')); }
      // chi sono
      stato.innerHTML = '';
      var t = mioTag();
      if (!fz) {
        stato.className = 'es-stato chi';
        stato.appendChild(el('b', null, 'Di che fazione sei?'));
        var r2 = el('div', 'riga2');
        r2.appendChild(bottone('ROSSI · difesa', 'es-rossa big', function () { scrivi({ tipo: 'fazione', f: 'rossa' }); }));
        r2.appendChild(bottone('BLU · attacco', 'es-blu big', function () { scrivi({ tipo: 'fazione', f: 'blu' }); }));
        stato.appendChild(r2);
      } else if (ioMorto && (e0.fase === 'f2')) {
        stato.className = 'es-stato morto';
        stato.appendChild(el('b', null, 'SEI COLPITO'));
        stato.appendChild(el('span', null, t ? 'Non conti più per le bandiere. Torna all\'HQ e resta ' + ec.cfg.hqSec + ' secondi vicino al LoRa dell\'HQ, oppure vai a una vostra bandiera con l\'ospedale ✚: col tag torni in gioco da solo.' : 'Non conti più per le bandiere. Vai all\'HQ e scansiona il QR di rinascita.'));
        stato.appendChild(bottone('📷 Scansiona il QR di rinascita', 'big', function () { apriScanner('QR di rinascita', function (txt) { if (!/#rinascita/.test(txt)) return { ok: false, titolo: 'Non è il QR di rinascita', testo: '' }; rinasci(); return { ok: true, titolo: 'Sei di nuovo in gioco' }; }); }));
      } else {
        stato.className = 'es-stato ' + fz;
        stato.appendChild(el('b', null, 'Sei ' + (fz === 'blu' ? 'BLU · attacco' : 'ROSSO · difesa')));
        stato.appendChild(el('span', null, t ? 'Il tuo tag: ' + (t.f === 'blu' ? 'B' : 'R') + t.n + ' · tienilo in alto, fuori dalla tasca' : 'Senza tag: per le bandiere non conti'));
      }
      if (e0.fase === 'f2' && fz) {
        var nb = Object.keys(live.bandiere || {}).filter(function (k) { return live.bandiere[k].owner === fz; }).length;
        stato.appendChild(el('div', 'es-punti', 'Punti ' + esNomeFaz(fz) + ': ' + ec.cassa[fz] + ' · +' + (ec.cfg.base + ec.cfg.band * nb) + ' al minuto'));
      }
      costruisci(e0, fz, ec, now);
      // spiegazione: la fase 2 si vede solo a fase 1 finita
      spieg.innerHTML = '';
      var k1 = el('div', 'carta es-k'); k1.appendChild(el('h3', null, 'Fase 1 · Conquista delle bandiere'));
      k1.appendChild(el('p', null, 'Due bandiere a circa 100 m l\'una dall\'altra. All\'inizio sono dei ROSSI, che le difendono. I BLU attaccano: per conquistarne una devono restarle vicini col tag, senza rossi intorno, finché la barra non si riempie (sul display della bandiera e qui sulla mappa). Se ci sono blu e rossi insieme è CONTESA: tutto fermo.'));
      k1.appendChild(el('p', null, 'Allo scadere del tempo vince chi tiene TUTTE E DUE le bandiere; una a testa è pareggio. I blu vedono sulla mappa le loro due pattuglie.'));
      if (e0.fase === 'f1fine' || e0.fase === 'f2' || e0.fase === 'fine') {
        var k2 = el('div', 'carta es-k'); k2.appendChild(el('h3', null, 'Fase 2 · Costruzioni e mortaio'));
        var cf = esInf(e0), cs = cf.costi;
        k2.appendChild(el('p', null, 'Ogni fazione guadagna punti: ' + cf.base + ' al minuto, più ' + cf.band + ' al minuto per ogni bandiera che tiene (si parte con ' + cf.start + '). Con i punti chiunque costruisce: inquadra il QR COSTRUISCI attaccato all\'HQ o a una bandiera della tua fazione.'));
        k2.appendChild(el('p', null, '✹ Mortaio (' + cs.mortaio.costo + ' punti, ' + cs.mortaio.min + ' min): all\'HQ o su una vostra bandiera. Si spara dall\'HQ: inquadra il QR sul display dell\'HQ e scegli facile o difficile. In campo chiunque può chiamare il fuoco toccando il bersaglio sulla mappa.'));
        k2.appendChild(el('p', null, '✚ Ospedale da campo (' + cs.ospedale.costo + ' punti, ' + cs.ospedale.min + ' min): su una vostra bandiera. I colpiti col tag tornano in gioco avvicinandosi a quella bandiera.'));
        k2.appendChild(el('p', null, '▦ Mura (' + cs.mura.costo + ' punti, ' + cs.mura.min + ' min): su una vostra bandiera. Il nemico ci mette il doppio a conquistarla; un colpo di mortaio entro ' + ES_R.letale + ' m le distrugge. Se la bandiera viene persa, tutto quello che c\'era sopra va perso.'));
        k2.appendChild(el('p', null, 'Entro ' + ES_R.letale + ' m dall\'impatto sei COLPITO: non conti più per le bandiere. Si torna in gioco all\'HQ (col tag: ' + cf.hqSec + ' s vicino al LoRa; senza tag: QR di rinascita) o a una vostra bandiera con l\'ospedale.'));
        spieg.appendChild(k2);
      }
      spieg.appendChild(k1);
      // mortaio (fase 2)
      if (e0.fase === 'f2') mortaio(); else { mortBox.innerHTML = ''; pan = null; }
      if (org) disegnaRegia();
    }
    function costruisci(e0, fz, ec, now) {
      costrBox.innerHTML = '';
      if (e0.fase !== 'f2' || !fz) return;
      var p = /^c:(\w+)$/.exec(azione); p = p && p[1];
      if (!p) {
        costrBox.appendChild(bottone('📷 Costruisci (QR all\'HQ o sulla bandiera)', '', function () {
          apriScanner('QR COSTRUISCI', function (txt) { var m = /#costruisci-(\w+)/.exec(txt); if (!m) return { ok: false, titolo: 'Non è un QR COSTRUISCI', testo: '' }; azione = 'c:' + m[1]; ultimoUI = ''; aggiorna(); return { ok: true, titolo: 'Costruisci' }; });
        }));
        return;
      }
      var k = el('div', 'carta es-mort'); costrBox.appendChild(k);
      k.appendChild(el('h3', null, '🔨 Costruisci · ' + nomePunto(p)));
      var chiudi = function () { azione = ''; ultimoUI = ''; aggiorna(); };
      var band = p !== 'hq' ? (live.bandiere || {})[p] : null;
      if (p !== 'hq' && !band) { k.appendChild(el('p', 'hint', 'Questo QR non è di una bandiera di questa esercitazione.')); k.appendChild(bottone('Chiudi', 'link', chiudi)); return; }
      if (band && band.owner !== fz) { k.appendChild(el('p', 'hint', 'Questa bandiera non è vostra: si costruisce solo sulle bandiere della tua fazione. Prima conquistala.')); k.appendChild(bottone('Chiudi', 'link', chiudi)); return; }
      k.appendChild(el('p', 'hint', 'Punti ' + esNomeFaz(fz) + ': ' + ec.cassa[fz]));
      ['mortaio', 'ospedale', 'mura'].forEach(function (cosa) {
        var C = ES_COSE[cosa], cs = ec.cfg.costi[cosa];
        if (p === 'hq' && C.dove.indexOf('hq') < 0) return;
        var riga = el('div', 'es-costr-riga'); k.appendChild(riga);
        var gia = esHa(ec, cosa, p, fz);
        riga.appendChild(el('b', null, C.sim + ' ' + C.nome));
        if (gia) { riga.appendChild(el('span', null, gia.ok ? '✓ costruito' : '⏳ pronto tra ' + mmss(gia.pronto - now))); return; }
        var altro = cosa === 'mortaio' ? ec.inf.filter(function (x) { return x.cosa === 'mortaio' && x.f === fz; })[0] : null;
        if (altro) { riga.appendChild(el('span', 'hint', 'avete già un mortaio (' + nomePunto(altro.punto) + ')')); return; }
        riga.appendChild(el('small', 'hint', C.cosa));
        var poco = ec.cassa[fz] < cs.costo;
        var b = bottone(poco ? 'Servono ' + cs.costo + ' punti' : 'Costruisci · ' + cs.costo + ' punti · ' + cs.min + ' min', poco ? '' : 'accent', function () {
          b.disabled = true;
          scrivi({ tipo: 'costruisci', id: S.idBreve(), cosa: cosa, punto: p, f: fz }).then(function () { toast(C.nome + ': pronto tra ' + cs.min + ' min'); }, errore);
        });
        if (poco) b.disabled = true;
        riga.appendChild(b);
      });
      k.appendChild(bottone('Chiudi', 'link', chiudi));
    }
    function mortaio() {
      var modo = mioModo(), fz = miaFaz();
      if (!fz) { mortBox.innerHTML = ''; pan = null; return; }
      var mio = mortaioDi(eco(), fz);
      if (!mio) {
        if (pan === 'nomort') return;
        mortBox.innerHTML = ''; pan = 'nomort';
        var k0 = el('div', 'carta es-mort'); k0.appendChild(el('b', null, '✹ Mortaio'));
        k0.appendChild(el('p', 'hint', 'La tua fazione non ha un mortaio pronto. Si costruisce all\'HQ o su una vostra bandiera (QR COSTRUISCI).'));
        mortBox.appendChild(k0); return;
      }
      if (pan === 'nomort') pan = null;
      if (!modo) {
        if (pan === 'scelta') return;
        mortBox.innerHTML = ''; pan = null;
        var k = el('div', 'carta es-mort');
        if (azione === 'm') {
          k.appendChild(el('h3', null, 'Mortaio: che versione?'));
          var r = el('div', 'riga2');
          r.appendChild(bottone('FACILE · distanza e direzione', 'accent big', function () { compra('semplice'); }));
          r.appendChild(bottone('DIFFICILE · deriva, alzo, carica', 'big', function () { compra('realistico'); }));
          k.appendChild(r); pan = 'scelta';
        } else {
          k.appendChild(el('b', null, '✹ Mortaio pronto · ' + nomePunto(mio.punto)));
          k.appendChild(el('p', 'hint', 'Si spara dall\'HQ: inquadra il QR sul display. Dal campo puoi chiamare il fuoco: tocca il bersaglio sulla mappa.'));
          k.appendChild(bottone('📡 Chiama il fuoco', 'accent', function () {
            scegliCb = function (pt) {
              var nota = prompt('Cosa c\'è sul bersaglio? (facoltativo)', '') || '';
              scrivi({ tipo: 'richiesta', id: S.idBreve(), team: fz, lat: pt.lat, lon: pt.lon, testo: nota.trim() }).then(function () { toast('Richiesta di fuoco mandata all\'HQ'); }, errore);
            };
            mapBox.classList.add('scegli'); mapBox.scrollIntoView({ behavior: 'smooth' }); toast('Tocca il bersaglio sulla mappa');
          }));
          k.appendChild(bottone('📷 Scansiona il QR del mortaio', '', function () { apriScanner('QR del mortaio (display dell\'HQ)', function (txt) { if (!/#mortaio/.test(txt)) return { ok: false, titolo: 'Non è il QR del mortaio', testo: '' }; azione = 'm'; ultimoUI = ''; aggiorna(); return { ok: true, titolo: 'Mortaio' }; }); }));
        }
        mortBox.appendChild(k); return;
      }
      if (pan && pan !== 'scelta' && panModo === modo) return;
      mortBox.innerHTML = ''; panModo = modo;
      pan = pannelloMortaio(mortBox, {
        prova: false, ovunque: true, modo: modo, sel: { scheda: 'tiro', deriva: 0, alzo: 1200, carica: 1, missione: null, coord: '', testo: '', mortaio: null }, campo: cm, punti: puntiM(), team: fz, uid: uid, ora: Date.now, zona: function () { return null; }, owner: function () { return {}; }, puoCostruire: true,
        stato: statoM,
        scrivi: function (e) { e.uid = uid; e.team = fz; e.t = Date.now(); return scrivi(e); },
        scegli: function (cb) { scegliCb = cb; mapBox.classList.add('scegli'); mapBox.scrollIntoView({ behavior: 'smooth' }); toast('Tocca il bersaglio sulla mappa'); }
      });
      var cambia = el('div', 'riga2'); cambia.appendChild(bottone('Passa al mortaio ' + (modo === 'semplice' ? 'difficile' : 'facile'), 'link', function () { compra(modo === 'semplice' ? 'realistico' : 'semplice'); })); mortBox.appendChild(cambia);
    }
    function compra(modo) {
      if (!live.hq || live.hq.lat == null) { toast('Posizione dell\'HQ non ancora nota: aspetta il GPS dell\'HQ'); }
      var fz = miaFaz(); pan = null; scrivi({ tipo: 'mortaio', azione: 'costruisci', team: fz, pt: 'm-' + fz, modo: modo }).then(function () { toast('Mortaio pronto'); });
    }
    function rinasci() {
      if (!esMorti(eventi)[uid]) { toast('Non risulti colpito: sei già in gioco'); return; }
      scrivi({ tipo: 'rinascita' }).then(function () { toast('Sei di nuovo in gioco'); suonoImpatto(false); });
    }
    if (azione === 'r') setTimeout(function () { var giaFatto = false; var w = setInterval(function () { if (giaFatto || !eventi) return; giaFatto = true; clearInterval(w); rinasci(); }, 1500); }, 0);
    // impatti: il mio telefono controlla se mi hanno colpito (GPS)
    function controllaColpi() {
      var e0 = es(); if (e0.fase !== 'f2' || !v) return;
      var sm = statoM(), now = Date.now(), mia = v.miaPos();
      sm.colpi.forEach(function (cp) {
        if (visti[cp.id] || cp.arrivo > now) return; visti[cp.id] = true;
        if (cp.arrivo < aperto - 5000) return;
        if (!mia || esMorti(eventi)[uid]) return;
        var hq = dovePunto('hq'); if (hq && window.AC_MORT.misura(hq, cp).dist <= 25) return;   // HQ protetto
        var d = window.AC_MORT.misura(mia, cp).dist;
        if (d <= ES_R.letale) { allarmeColpito(d, false); scrivi({ tipo: 'colpito', da: 'gps', colpo: cp.id, dist: Math.round(d) }); }
        else if (d <= ES_R.vicino) { toast('Colpi di mortaio vicini (' + Math.round(d) + ' m): al riparo!'); suonoImpatto(false); try { if (navigator.vibrate) navigator.vibrate([200, 80, 200]); } catch (e) {} }
      });
    }
    // --------------- REGIA (chi organizza): fasi, collegamento all'HQ, ponte HQ -> app, mortaio -> bandiere
    var R = { durata: 30, tempo: 60, ultimoScritto: {}, pend: {}, vistiR: {}, inviati: '', ultimoMorti: 0, avviata: Date.now(), inf: esInf(null), distr: {}, tInv: {}, rin: {}, hqVisto: {}, redW: 0 };
    try { var sv = JSON.parse(localStorage.getItem('es-regia') || '{}'); if (sv.durata) R.durata = sv.durata; if (sv.tempo) R.tempo = sv.tempo; if (sv.inf) R.inf = esInf({ inf: sv.inf }); } catch (e) {}
    function salvaR() { try { localStorage.setItem('es-regia', JSON.stringify({ durata: R.durata, tempo: R.tempo, inf: R.inf })); } catch (e) {} }
    function chiaveTag(f, n) { var r = reg.filter(function (q) { return q.f === f && +q.n === +n; })[0]; return r && r.uid ? r.uid : 'tag:' + f + n; }
    function sigla(f, n) { return (f === 'blu' ? 'B' : 'R') + n; }
    // costruzioni, punti e rinascite: li scrive solo la regia collegata all'HQ
    function regiaInfra() {
      var e0 = es(); if (e0.fase !== 'f2' || !BANCO.via) return;
      var now = Date.now(), ec = eco(), cfg = ec.cfg, bands = live.bandiere || {};
      // punti: ogni minuto, base + per ogni bandiera tenuta
      var ultimo = e0.f2inizio || now; eventi.forEach(function (e) { if (e.tipo === 'reddito' && e.t > ultimo) ultimo = e.t; });
      if (now - ultimo >= 60000 && now - R.redW > 20000) {
        R.redW = now; var q = { blu: cfg.base, rossa: cfg.base };
        Object.keys(bands).forEach(function (k) { var o = bands[k].owner; if (q.hasOwnProperty(o)) q[o] += cfg.band; });
        scrivi({ tipo: 'reddito', uid: 'regia', blu: q.blu, rossa: q.rossa });
      }
      // bandiera persa: quello che c'era sopra va perso
      ec.inf.forEach(function (x) {
        if (x.punto === 'hq' || R.distr[x.id]) return; var b = bands[x.punto]; if (!b || b.owner === x.f) return;
        R.distr[x.id] = now; scrivi({ tipo: 'distrutto', uid: 'regia', cosa: x.cosa, punto: x.punto, f: x.f, perche: 'persa' });
      });
      // mura: tempo di conquista doppio sulla bandiera
      var base = e0.tempo || R.tempo;
      Object.keys(BANCO.band).forEach(function (id) {
        var j = BANCO.band[id], b = bands[id] || {}, vuole = esHa(ec, 'mura', id, b.owner, true) ? base * 2 : base;
        if (j.tempo !== vuole && now - (R.tInv[id] || 0) > 25000) { R.tInv[id] = now; bancoInvia('cmd ' + id + ' tempo ' + vuole); }
      });
      var morti = esMorti(eventi);
      function rinasci2(f, n, da, band) {
        var key = chiaveTag(f, n); if (!morti[key] || now - (R.rin[key] || 0) < 20000) return;
        R.rin[key] = now; scrivi({ tipo: 'rinascita', uid: key, da: da, band: band || null, f: f, n: n });
        R.log = (R.log || []).concat(new Date().toTimeString().slice(0, 8) + ' ' + sigla(f, n) + ' torna in gioco (' + (da === 'hq' ? 'HQ' : 'ospedale ' + nomePunto(band)) + ')').slice(-6);
        if (da === 'hq') bancoInvia('msg RIENTRA ' + sigla(f, n));
        suonoImpatto(false);
      }
      // ospedale: i colpiti della stessa fazione vicini alla bandiera
      Object.keys(BANCO.band).forEach(function (id) {
        var j = BANCO.band[id]; if (now - j._t > 30000) return;
        (j.tag || []).forEach(function (t) { if (t.m && t.rssi >= j.soglia && esHa(ec, 'ospedale', id, t.f, true)) rinasci2(t.f, t.n, 'ospedale', id); });
      });
      // HQ: il LoRa dell'HQ sente il tag del colpito per qualche secondo di fila
      Object.keys(BANCO.hqtag || {}).forEach(function (k) {
        var t = BANCO.hqtag[k], h = R.hqVisto[k];
        if (now - t._t > 3000 || t.rssi < cfg.hqSoglia) { delete R.hqVisto[k]; return; }
        if (!h || now - h.ult > 3000) h = R.hqVisto[k] = { da: t._t, ult: t._t }; else h.ult = t._t;
        if (now - h.da >= cfg.hqSec * 1000) rinasci2(t.f, t.n, 'hq');
      });
    }
    function setFase(o) { var e0 = Object.assign({}, es(), o); return S.statoEsercizio(aid, e0); }
    function aBand(lista) { lista.forEach(function (c, i) { setTimeout(function () { bancoInvia(c); }, i * 2500); }); }
    function vincitoreOra() {
      var ow = Object.keys(live.bandiere || {}).map(function (k) { return live.bandiere[k].owner || null; });
      if (ow.length && ow.every(function (o) { return o === 'rossa'; })) return 'rossa';
      if (ow.length && ow.every(function (o) { return o === 'blu'; })) return 'blu';
      return 'pari';
    }
    var regDis = '';
    function disegnaRegia() {
      var b = BANCO, e0 = es(), bands = Object.keys(live.bandiere || {}).sort();
      var ecR = eco(), firma = JSON.stringify([e0, b.via, b.hq && b.hq.lat, bands.map(function (k) { var x = live.bandiere[k]; return [k, x.owner, x.lat != null, Math.floor((Date.now() - x.t) / 30000)]; }), live.hq && live.hq.lat != null, Object.keys(live.pattuglie || {}).length, R.durata, R.tempo,
        e0.fase === 'f2' ? [ecR.cassa, ecR.inf.map(function (x) { return x.id + x.ok; }), R.log, Object.keys(BANCO.hqtag || {}).length, Math.floor(Date.now() / 10000)] : 0]);
      if (firma === regDis) return; regDis = firma;
      regia.innerHTML = '';
      var k = el('div', 'carta'); regia.appendChild(k);
      k.appendChild(el('h3', null, '⚙ Regia'));
      var ok = !!b.via;
      k.appendChild(el('div', 'banco-st ' + (ok ? 'on' : 'off'), ok ? 'HQ collegato via ' + b.via + (b.hq ? ' · ' + b.hq.hq : '') : 'HQ non collegato: tieni questo telefono collegato all\'HQ per tutta l\'esercitazione'));
      var bt = el('div', 'riga2'); bt.appendChild(bottone('Bluetooth (HQ)', ok ? '' : 'accent', bancoBle)); bt.appendChild(bottone('USB', '', bancoUsb)); k.appendChild(bt);
      var righe = [];
      bands.forEach(function (id) { var x = live.bandiere[id]; righe.push('⚑ ' + (x.nome || id) + ' (' + id + '): ' + (x.lat != null ? 'GPS ok' : 'senza posizione') + ' · ' + (x.owner ? esNomeFaz(x.owner) : 'neutra') + ' · ' + Math.round((Date.now() - (x.t || 0)) / 1000) + ' s fa'); });
      righe.push('HQ: ' + (live.hq && live.hq.lat != null ? 'posizione ok' : 'posizione sconosciuta'));
      righe.push('Pattuglie: ' + (Object.keys(live.pattuglie || {}).map(function (p) { return live.pattuglie[p].nome; }).join(', ') || 'nessuna'));
      if (bands.length >= 2) { var x1 = live.bandiere[bands[0]], x2 = live.bandiere[bands[1]]; if (x1.lat != null && x2.lat != null) { var d = Math.round(window.AC_MORT.misura(x1, x2).dist); righe.push('Distanza tra le bandiere: ' + d + ' m' + (d < 100 ? ' ⚠ troppo vicine' : '')); } }
      if (e0.fase === 'f2') {
        righe.push('Punti: BLU ' + ecR.cassa.blu + ' · ROSSI ' + ecR.cassa.rossa);
        ecR.inf.forEach(function (x) { righe.push(ES_COSE[x.cosa].sim + ' ' + ES_COSE[x.cosa].nome + ' ' + esNomeFaz(x.f) + ' · ' + nomePunto(x.punto) + (x.ok ? '' : ' · pronto tra ' + mmss(x.pronto - Date.now()))); });
        var vis = Object.keys(BANCO.hqtag || {}).filter(function (q) { return Date.now() - BANCO.hqtag[q]._t < 5000; }).map(function (q) { var t = BANCO.hqtag[q]; return sigla(t.f, t.n) + ' ' + t.rssi; });
        righe.push('Tag vicini al LoRa HQ: ' + (vis.join(', ') || (BANCO.hqtag ? 'nessuno' : 'nessun dato (firmware HQ 1.3.0?)')));
        (R.log || []).forEach(function (l) { righe.push(l); });
      }
      k.appendChild(el('pre', 'es-righe', righe.join('\n')));
      k.appendChild(bottone('📍 HQ qui (GPS di questo telefono)', 'mini', function () {
        var p = v && v.miaPos(); if (!p) { toast('GPS del telefono non pronto'); return; }
        S.aggiornaEsercizio(aid, { hq: { lat: p.lat, lon: p.lon, t: Date.now(), da: 'telefono' } }).then(function () { toast('HQ posizionato'); }, errore);
      }));
      if (e0.fase === 'prep' || !e0.fase || e0.fase === 'fine') {
        var sd = select([['15', '15 min'], ['20', '20 min'], ['30', '30 min'], ['45', '45 min'], ['60', '60 min']], String(R.durata)); sd.onchange = function () { R.durata = +sd.value; salvaR(); };
        var stp = select([['30', '30 s'], ['60', '60 s'], ['90', '90 s'], ['120', '2 min']], String(R.tempo)); stp.onchange = function () { R.tempo = +stp.value; salvaR(); };
        var due = el('div', 'tre'); due.appendChild(campoForm('Durata fase 1', sd)); due.appendChild(campoForm('Tempo di conquista', stp)); k.appendChild(due);
        k.appendChild(bottone('▶ AVVIA FASE 1', 'accent big', function () {
          if (!confirm('Avviare la fase 1? Le bandiere passano ai ROSSI e parte il tempo per tutti.')) return;
          setFase({ fase: 'f1', inizio: Date.now(), durata: R.durata, tempo: R.tempo, vincitore: null, f2inizio: null }).then(function () { toast('Fase 1 avviata'); }, errore);
          if (BANCO.via) aBand(['qr -', 'cmd tutte posizione 0', 'cmd tutte tempo ' + R.tempo, 'cmd tutte morti -', 'cmd tutte ogni 10', 'cmd tutte fazione 2']);
          else toast('HQ non collegato: i comandi alle bandiere non partono');
        }));
        k.appendChild(bottone('🖨 Stampa il QR di rinascita', '', stampaRinascita));
      }
      if (e0.fase !== 'f2' && e0.fase !== 'fine') regoleInfra(k);
      if (e0.fase !== 'fine') k.appendChild(bottone('🖨 Stampa i QR COSTRUISCI (HQ e bandiere)', '', stampaCostruisci));
      if (e0.fase === 'f1') k.appendChild(bottone('■ Termina la fase 1 adesso', 'pericolo', function () { if (confirm('Chiudere la fase 1 adesso?')) chiudiF1(); }));
      if (e0.fase === 'f1fine') k.appendChild(bottone('▶ AVVIA FASE 2 · MORTAIO', 'accent big', function () {
        setFase({ fase: 'f2', f2inizio: Date.now(), inf: R.inf }).then(function () { toast('Fase 2 avviata'); }, errore);
        if (BANCO.via) aBand(['qr ' + ES_SITO + '#mortaio', 'cmd tutte morti -', 'cmd tutte ogni 10']); else toast('HQ non collegato: il QR non compare sul display');
      }));
      if (e0.fase === 'f2') {
        k.appendChild(bottone('Fai rinascere tutti', '', function () { scrivi({ tipo: 'rinascitaTutti', uid: 'tutti' }); }));
        k.appendChild(bottone('Rimetti il QR sul display dell\'HQ', 'mini', function () { bancoInvia('qr ' + ES_SITO + '#mortaio'); }));
        k.appendChild(bottone('■ Termina l\'esercitazione', 'pericolo', function () { if (!confirm('Finire l\'esercitazione?')) return; setFase({ fase: 'fine' }); if (BANCO.via) aBand(['qr -', 'cmd tutte morti -', 'cmd tutte tempo ' + (e0.tempo || R.tempo), 'cmd tutte ogni 20']); }));
      }
      if (e0.fase && e0.fase !== 'prep') k.appendChild(bottone('Azzera (torna in preparazione)', 'link', function () { if (confirm('Azzerare l\'esercitazione? Le fasi ricominciano da capo.')) setFase({ fase: 'prep', inizio: null, vincitore: null, f2inizio: null }); }));
    }
    function regoleInfra(k) {
      var d = el('details', 'es-regole'); d.appendChild(el('summary', null, 'Fase 2 · punti e costruzioni')); d.open = !!R.regoleAperte; d.ontoggle = function () { R.regoleAperte = d.open; };
      function num(et, val, set) { var i = el('input'); i.type = 'number'; i.inputMode = 'numeric'; i.value = val; i.onchange = function () { var v = Math.max(0, Math.round(+i.value || 0)); set(v); salvaR(); }; return campoForm(et, i); }
      var g = el('div', 'tre');
      g.appendChild(num('Punti iniziali', R.inf.start, function (v) { R.inf.start = v; }));
      g.appendChild(num('Punti al minuto', R.inf.base, function (v) { R.inf.base = v; }));
      g.appendChild(num('+ per bandiera/min', R.inf.band, function (v) { R.inf.band = v; }));
      d.appendChild(g);
      ['mortaio', 'ospedale', 'mura'].forEach(function (c) {
        var g2 = el('div', 'tre'); g2.appendChild(el('b', null, ES_COSE[c].sim + ' ' + ES_COSE[c].nome));
        g2.appendChild(num('Punti', R.inf.costi[c].costo, function (v) { R.inf.costi[c] = Object.assign({}, R.inf.costi[c], { costo: v }); }));
        g2.appendChild(num('Minuti', R.inf.costi[c].min, function (v) { R.inf.costi[c] = Object.assign({}, R.inf.costi[c], { min: v }); }));
        d.appendChild(g2);
      });
      var g3 = el('div', 'tre');
      g3.appendChild(num('Rientro HQ: secondi', R.inf.hqSec, function (v) { R.inf.hqSec = Math.max(1, v); }));
      g3.appendChild(num('Rientro HQ: segnale (dBm)', R.inf.hqSoglia, function (v) { R.inf.hqSoglia = -Math.abs(v || 75); }));
      d.appendChild(g3);
      d.appendChild(el('small', 'hint', 'Valgono dall\'avvio della fase 2. Segnale: più vicino a 0 = bisogna stare più vicini al LoRa dell\'HQ (-75 ≈ 3-5 m).'));
      k.appendChild(d);
    }
    function qrSvg(testo) {
      var m = window.QR.encode(testo, 'M'), n = m.size, s = '';
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m.get(x, y)) s += 'M' + x + ' ' + y + 'h1v1h-1z';
      return '<svg viewBox="-4 -4 ' + (n + 8) + ' ' + (n + 8) + '"><rect x="-4" y="-4" width="' + (n + 8) + '" height="' + (n + 8) + '" fill="#fff"/><path d="' + s + '" fill="#000"/></svg>';
    }
    function stampaCostruisci() {
      var ids = Object.keys(live.bandiere || {}).sort();
      if (!ids.length && !confirm('Nessuna bandiera collegata: stampo solo il QR dell\'HQ? (I QR delle bandiere servono le bandiere accese e collegate.)')) return;
      var w = window.open('', '_blank'); if (!w) { toast('Consenti le finestre per stampare'); return; }
      var pag = [['hq', 'HQ', 'Mortaio']].concat(ids.map(function (id) { return [id, 'BANDIERA ' + escB((live.bandiere[id] || {}).nome || id), 'Mortaio · Ospedale da campo · Mura']; }));
      w.document.write('<!doctype html><meta charset="utf-8"><title>QR costruisci</title><style>body{font-family:sans-serif;text-align:center;margin:0}section{page-break-after:always;padding:30px}svg{width:11cm;height:11cm}h1{font-size:44px;margin:6px}h2{font-size:30px;margin:4px}p{font-size:20px;margin:6px}</style>' +
        pag.map(function (p) { return '<section><h1>COSTRUISCI</h1><h2>' + p[1] + '</h2><p>' + p[2] + '</p>' + qrSvg(ES_SITO + '#costruisci-' + p[0]) + '<p>Inquadra col telefono: costruisci per la tua fazione' + (p[0] === 'hq' ? '' : ' (solo se la bandiera è vostra)') + '.</p><p style="font-size:14px">Airsoft Conflict · ' + escB(a0.titolo || 'Allenamento') + ' · ' + p[0] + '</p></section>'; }).join('') +
        '<script>setTimeout(function(){print()},400)<\/script>');
      w.document.close();
    }
    function chiudiF1() { return setFase({ fase: 'f1fine', vincitore: vincitoreOra(), chiusa: Date.now() }); }
    function stampaRinascita() {
      var m = window.QR.encode(ES_SITO + '#rinascita', 'M'), n = m.size, s = '';
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m.get(x, y)) s += 'M' + x + ' ' + y + 'h1v1h-1z';
      var w = window.open('', '_blank'); if (!w) { toast('Consenti le finestre per stampare'); return; }
      w.document.write('<!doctype html><meta charset="utf-8"><title>QR rinascita</title><style>body{font-family:sans-serif;text-align:center;margin:30px}svg{width:12cm;height:12cm}h1{font-size:40px;margin:10px}p{font-size:20px}</style>' +
        '<h1>RINASCITA</h1><p>Colpito dal mortaio? Inquadra questo QR col telefono e torni in gioco.</p><svg viewBox="-4 -4 ' + (n + 8) + ' ' + (n + 8) + '"><rect x="-4" y="-4" width="' + (n + 8) + '" height="' + (n + 8) + '" fill="#fff"/><path d="' + s + '" fill="#000"/></svg><p>Airsoft Conflict · ' + escB(a0.titolo || 'Allenamento') + '</p><script>setTimeout(function(){print()},400)<\/script>');
      w.document.close();
    }
    // ponte: dati dall'HQ -> esercizi/{id} (solo chi organizza, solo col collegamento attivo)
    function ponte() {
      var b = BANCO, now = Date.now(), su = {};
      if (!b.via) return;
      var nomi = ['ALFA', 'BRAVO', 'CHARLIE', 'DELTA'];
      Object.keys(b.band).sort().forEach(function (id, i) {
        var j = b.band[id], vec = (live.bandiere || {})[id] || {}, u = R.ultimoScritto[id] || {};
        var dentro = (j.tag || []).filter(function (t) { return t.rssi >= j.soglia; }).map(function (t) { return { f: t.f, n: t.n, m: t.m ? 1 : 0 }; });
        var x = { owner: j.owner || null, conq: j.conq || null, pct: j.pct || 0, contesa: !!j.contesa, blu: j.blu || 0, rossi: j.rossi || 0, t: j._t, nome: vec.nome || nomi[i] || id, tag: dentro, batt: j.batt };
        if (j.gpsFisso && j.lat) { x.lat = j.lat; x.lon = j.lon; } else if (vec.lat != null) { x.lat = vec.lat; x.lon = vec.lon; }
        if (u.t === j._t && now - (u.w || 0) < 60000) return;
        R.ultimoScritto[id] = { t: j._t, w: now }; su[id] = x;
      });
      var out = {};
      if (Object.keys(su).length) out.bandiere = su;
      if (b.hq && b.hq.lat && (!live.hq || live.hq.da !== 'telefono') && now - (R.hqW || 0) > 30000) { out.hq = { lat: b.hq.lat, lon: b.hq.lon, t: now }; R.hqW = now; }
      var pt = {};
      Object.keys(b.pat || {}).forEach(function (id, i) { var p = b.pat[id]; if (!p.fix || (R.ultimoScritto['p' + id] || 0) === p._t) return; R.ultimoScritto['p' + id] = p._t; pt[id] = { lat: p.lat, lon: p.lon, nome: 'P' + (i + 1), t: p._t }; });
      if (Object.keys(pt).length) out.pattuglie = pt;
      if (Object.keys(out).length) S.aggiornaEsercizio(aid, out).catch(function () {});
    }
    // mortaio -> bandiere: avvisa le bandiere vicine all'impatto; chi era dentro una bandiera colpita è colpito
    function regiaMortaio() {
      var e0 = es(); if (e0.fase !== 'f2' || !BANCO.via) return;
      var sm = statoM(), now = Date.now();
      sm.colpi.forEach(function (cp) {
        if (R.vistiR[cp.id] || cp.arrivo > now) return; R.vistiR[cp.id] = true;
        if (cp.arrivo < R.avviata - 5000) return;
        Object.keys(live.bandiere || {}).forEach(function (id) {
          var x = live.bandiere[id]; if (x.lat == null) return;
          var d = Math.round(window.AC_MORT.misura(x, cp).dist); if (d > ES_R.vicino) return;
          bancoInvia('cmd ' + id + ' colpo ' + d + ' ' + ES_R.letale + ' ' + ES_R.vicino);
          if (d <= ES_R.letale) {
            R.pend[id] = { t: now, colpo: cp.id };
            eco().inf.forEach(function (q) { if (q.cosa === 'mura' && q.punto === id && !R.distr[q.id]) { R.distr[q.id] = now; scrivi({ tipo: 'distrutto', uid: 'regia', cosa: 'mura', punto: id, f: q.f, perche: 'mortaio' }); } });
          }
        });
      });
      // colpita: chi risulta dentro nel primo stato dopo il colpo (la bandiera lo manda subito) o, dopo 12 s, nell'ultimo
      Object.keys(R.pend).forEach(function (id) {
        var p = R.pend[id], j = BANCO.band[id]; if (!j) { delete R.pend[id]; return; }
        if (!(j._t > p.t + 300 || now - p.t > 12000)) return;
        delete R.pend[id];
        (j.tag || []).filter(function (t) { return t.rssi >= j.soglia && !t.m; }).forEach(function (t) {
          var r = reg.filter(function (q) { return q.f === t.f && +q.n === +t.n; })[0];
          scrivi({ tipo: 'colpito', uid: r && r.uid ? r.uid : 'tag:' + t.f + t.n, da: 'bandiera', band: id, colpo: p.colpo, f: t.f, n: t.n });
        });
      });
      // lista dei colpiti alle bandiere (completa: chi rinasce sparisce dalla lista)
      var m = esMorti(eventi), tags = [];
      Object.keys(m).forEach(function (u) {
        if (u.indexOf('tag:') === 0) { var q = /^tag:(blu|rossa)(\d+)$/.exec(u); if (q) tags.push((q[1] === 'blu' ? 'b' : 'r') + q[2]); return; }
        reg.filter(function (r) { return r.uid === u; }).forEach(function (r) { tags.push((r.f === 'blu' ? 'b' : 'r') + r.n); });
      });
      var lista = tags.sort().join(',') || '-';
      if (lista !== R.inviati || (lista !== '-' && now - R.ultimoMorti > 45000)) { R.inviati = lista; R.ultimoMorti = now; bancoInvia('cmd tutte morti ' + lista); }
    }
    giro = setInterval(function () {
      aggiorna(); controllaColpi();
      if (v) v.ridisegna();
      if (org) {
        ponte(); regiaMortaio(); regiaInfra();
        var e0 = es(); if (e0.fase === 'f1' && e0.inizio && Date.now() > e0.inizio + (e0.durata || 30) * 60000 && !R.chiudendo) { R.chiudendo = true; chiudiF1().then(function () { R.chiudendo = false; }, function () { R.chiudendo = false; }); }
      }
    }, 1000);
    aggiorna();
    var prima = chiusura; chiusura = function () { clearInterval(giro); if (stopL) stopL(); if (stopE) stopE(); if (stopR) stopR(); if (v) v.chiudi(); if (prima) prima(); };
  }

  // ================= POST DELLA BACHECA (organizzatore)
  function editorPost(c, p) {
    p = p || { tipo: 'storia', titolo: '', testo: '', img: '', pubblica: null };
    apriFoglio(function (f) {
      f.appendChild(el('h3', null, p.id ? 'Modifica post' : 'Nuovo post'));
      var tipo = select([['storia', 'Storia'], ['prefazione', 'Prefazione'], ['info', 'Info utili']], p.tipo);
      f.appendChild(campoForm('Tipo', tipo));
      var tit = el('input'); tit.value = p.titolo || ''; f.appendChild(campoForm('Titolo', tit));
      var txt = el('textarea'); txt.rows = 7; txt.value = p.testo || ''; f.appendChild(campoForm('Testo', txt));
      var img = p.img || '', anteprima = el('div', 'img-ant');
      function mostraImg() { anteprima.innerHTML = ''; if (img) { var i = new Image(); i.src = img; anteprima.appendChild(i); anteprima.appendChild(bottone('Togli foto', 'link', function () { img = ''; mostraImg(); })); } }
      mostraImg();
      var file = el('input'); file.type = 'file'; file.accept = 'image/*';
      file.onchange = function () { if (file.files[0]) comprimi(file.files[0], 1400, 700000).then(function (d) { img = d; mostraImg(); }, errore); };
      f.appendChild(campoForm('Foto (facoltativa)', file)); f.appendChild(anteprima);
      var quando = el('input'); quando.type = 'datetime-local'; if (p.pubblica && p.pubblica > Date.now()) quando.value = locale(p.pubblica);
      f.appendChild(campoForm('Pubblica il (vuoto = subito)', quando));
      var r = el('div', 'riga2');
      r.appendChild(bottone('Salva', 'accent', function () {
        var pub = quando.value ? new Date(quando.value).getTime() : (p.pubblica && p.pubblica <= Date.now() ? p.pubblica : Date.now());
        S.salvaPost(c.id, { id: p.id, tipo: tipo.value, titolo: tit.value.trim(), testo: txt.value.trim(), img: img, pubblica: pub })
          .then(function () { toast('Post salvato'); chiudiFoglio(); }, errore);
      }));
      if (p.id) r.appendChild(bottone('Elimina', 'pericolo', function () { if (confirm('Eliminare il post?')) S.eliminaPost(c.id, p.id).then(function () { chiudiFoglio(); }, errore); }));
      f.appendChild(r);
    });
  }
  function locale(ms) { var d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); }
  function select(opz, val) { var s = el('select'); opz.forEach(function (o) { var x = el('option', null, o[1]); x.value = o[0]; s.appendChild(x); }); if (val != null) s.value = val; return s; }
  function campoForm(etichetta, input) { var l = el('label', 'campo'); l.appendChild(el('span', null, etichetta)); l.appendChild(input); return l; }
  // immagini ridotte prima di salvarle nel database
  function comprimi(file, lato, maxB, png) {
    return new Promise(function (ok, ko) {
      var r = new FileReader();
      r.onerror = ko;
      r.onload = function () {
        var i = new Image(); i.onerror = function () { ko(new Error('Immagine non leggibile')); };
        i.onload = function () {
          var s = Math.min(1, lato / Math.max(i.width, i.height)), cv = document.createElement('canvas');
          cv.width = Math.round(i.width * s); cv.height = Math.round(i.height * s);
          cv.getContext('2d').drawImage(i, 0, 0, cv.width, cv.height);
          if (png) { ok(cv.toDataURL('image/png')); return; }
          var q = .85, d = cv.toDataURL('image/jpeg', q);
          while (d.length > maxB && q > .35) { q -= .1; d = cv.toDataURL('image/jpeg', q); }
          ok(d);
        };
        i.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  // ================= TEAM
  function puoGestire(t) { var st = S.stato(); return P('team') || !!(t && t.referenteUid === st.user.uid); }
  function pagTeam(tid) {
    var t = teamDi(tid);
    testata('Team');
    if (!t) { app.appendChild(el('p', 'hint', 'Team non trovato.')); return; }
    var h = el('div', 'team-hero');
    h.appendChild(logo(t, 96));
    h.appendChild(el('h2', null, t.nome));
    var ref = t.referente || {};
    var rr = el('div', 'team-ref');
    rr.appendChild(el('small', null, 'REFERENTE'));
    rr.appendChild(el('b', null, ref.nome || 'Da indicare'));
    function mostraTel(tel) {
      if (!tel) return;
      var az = el('div', 'riga2');
      az.appendChild(link('☎ ' + tel, telLink(tel), 'btn'));
      az.appendChild(link('WhatsApp', waLink(tel), 'btn wa'));
      rr.appendChild(az);
    }
    if (D.contatti[tid]) mostraTel(D.contatti[tid]);
    else if (t.referenteUid === S.stato().user.uid) S.leggiContatto(tid).then(mostraTel);
    h.appendChild(rr);
    app.appendChild(h);
    if (puoGestire(t)) {
      var gb = el('div', 'riga2');
      gb.appendChild(bottone('Modifica team', 'accent', function () { vai('teamModifica', tid); }));
      app.appendChild(gb);
      var cod = el('div', 'codice-team'); app.appendChild(cod);
      S.codiceTeam(tid).then(function (k) {
        if (!k) return;
        cod.appendChild(el('small', null, 'CODICE PER ENTRARE NEL TEAM'));
        cod.appendChild(el('b', null, k));
        cod.appendChild(bottone('Condividi', 'piccolo', function () {
          var msg = 'Entra nel team ' + t.nome + ' su Airsoft Conflict: ' + location.origin + location.pathname + ' — codice ' + k;
          if (navigator.share) navigator.share({ text: msg }).catch(function () {}); else { navigator.clipboard && navigator.clipboard.writeText(msg); toast('Copiato'); }
        }));
        if (P('team')) cod.appendChild(bottone('Nuovo codice', 'piccolo', function () {
          if (confirm('Creare un nuovo codice? Quello vecchio smette di funzionare (chi è già nel team resta dentro).')) S.nuovoCodice(tid).then(function () { mostra(); }, errore);
        }));
      });
    }
    if (!P('rosa') && !puoGestire(t)) return;
    var el_ = el('div', 'giocatori'); app.appendChild(el_);
    var stop = S.ascoltaMembri(tid, function (m) { elencoGiocatori(el_, t, m); });
    chiusura = stop;
  }
  // per la privacy gli altri vedono solo il callsign; nome e cognome li vedono il giocatore stesso e chi organizza
  function nomeG(u) { return (u && u.callsign) || 'Senza callsign'; }
  function vedeNomi() { return P('giocatori') || P('conflitti'); }
  function nomeVero(u) { var x = vedeNomi() && u && D.privati[u.id]; return x && x.nome ? x.nome : ''; }
  function conNome(u) { var n = nomeVero(u); return nomeG(u) + (n ? ' (' + n + ')' : ''); }
  function elencoGiocatori(box, t, membri) {
    box.innerHTML = '';
    box.appendChild(el('h3', 'sez', 'Giocatori (' + membri.length + ')'));
    var sq = (t.squadre || []).concat([{ id: null, nome: (t.squadre || []).length ? 'Senza squadra' : 'Tutti' }]);
    sq.forEach(function (s) {
      var dentro = membri.filter(function (u) { return (u.squadra || null) === s.id || (s.id === null && !(t.squadre || []).some(function (x) { return x.id === u.squadra; })); });
      if (s.id === null && !dentro.length && (t.squadre || []).length) return;
      var g = el('div', 'squadra');
      g.appendChild(el('h4', null, s.nome + ' · ' + dentro.length));
      dentro.sort(function (a, b) { return nomeG(a).localeCompare(nomeG(b)); }).forEach(function (u) {
        var r = el('div', 'gioc');
        r.appendChild(el('span', null, conNome(u)));
        if (u.id === t.referenteUid) r.appendChild(el('small', 'tag', 'REFERENTE'));
        else if (u.ruolo && u.ruolo !== 'truppa') r.appendChild(el('small', 'tag', S.nomeRuolo(u.ruolo).toUpperCase()));
        if (P('giocatori')) { r.classList.add('apribile'); r.onclick = function () { editorGiocatore(u); }; }
        g.appendChild(r);
      });
      if (!dentro.length) g.appendChild(el('p', 'hint', 'Nessuno'));
      box.appendChild(g);
    });
  }

  function pagTeamModifica(tid) {
    var t = teamDi(tid);
    testata('Modifica team');
    if (!t || !puoGestire(t)) { app.appendChild(el('p', 'hint', 'Non puoi modificare questo team.')); return; }
    var dati = { nome: t.nome, logo: t.logo || '', referente: Object.assign({ nome: '', tel: '' }, t.referente), referenteUid: t.referenteUid || null, squadre: (t.squadre || []).map(function (s) { return Object.assign({}, s); }) };
    var form = el('div', 'modulo'); app.appendChild(form);
    // logo
    var lr = el('div', 'logo-riga'), lw = el('span');
    function mostraLogo() { lw.innerHTML = ''; lw.appendChild(logo({ nome: dati.nome, logo: dati.logo }, 84)); }
    mostraLogo(); lr.appendChild(lw);
    var file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    file.onchange = function () { if (file.files[0]) comprimi(file.files[0], 240, 0, true).then(function (d) { if (d.length > 250000) return comprimi(file.files[0], 240, 200000); return d; }).then(function (d) { dati.logo = d; mostraLogo(); }, errore); };
    lr.appendChild(file);
    lr.appendChild(bottone('Cambia logo', '', function () { file.click(); }));
    lr.appendChild(bottone('Togli', 'link pericolo', function () { dati.logo = ''; mostraLogo(); }));
    form.appendChild(lr);
    var nome = el('input'); nome.value = dati.nome; form.appendChild(campoForm('Nome del team', nome));
    // referente
    var refSel = el('select'), refNome = el('input'), refTel = el('input');
    refNome.value = dati.referente.nome; refTel.value = D.contatti[tid] || dati.referente.tel || '';
    if (!refTel.value) S.leggiContatto(tid).then(function (x) { if (x && !refTel.value) refTel.value = x; }); refTel.type = 'tel'; refTel.placeholder = '333 1234567';
    form.appendChild(el('h3', 'sez', 'Referente'));
    form.appendChild(campoForm('Chi è (tra i giocatori del team)', refSel));
    form.appendChild(campoForm('Callsign da mostrare', refNome));
    form.appendChild(campoForm('Numero di cellulare', refTel));
    form.appendChild(el('p', 'hint', 'Si mostra solo il callsign, mai nome e cognome. Chi vede il numero lo decide il developer.'));
    // squadre
    form.appendChild(el('h3', 'sez', 'Squadre'));
    var sqBox = el('div', 'sq-lista'); form.appendChild(sqBox);
    var membri = [];
    function disegnaSquadre() {
      sqBox.innerHTML = '';
      dati.squadre.forEach(function (s, i) {
        var r = el('div', 'sq-riga'), inp = el('input'); inp.value = s.nome; inp.oninput = function () { s.nome = inp.value; };
        r.appendChild(inp); r.appendChild(bottone('✕', 'icon', function () { dati.squadre.splice(i, 1); disegnaSquadre(); disegnaMembri(); }));
        sqBox.appendChild(r);
      });
      sqBox.appendChild(bottone('+ Aggiungi squadra', 'link', function () { dati.squadre.push({ id: S.idBreve(), nome: 'Squadra ' + (dati.squadre.length + 1) }); disegnaSquadre(); disegnaMembri(); }));
    }
    disegnaSquadre();
    // giocatori: squadra e rimozione (salvati subito)
    form.appendChild(el('h3', 'sez', 'Giocatori'));
    var mBox = el('div', 'm-lista'); form.appendChild(mBox);
    function disegnaMembri() {
      mBox.innerHTML = '';
      if (!membri.length) mBox.appendChild(el('p', 'hint', 'Nessun giocatore ancora. Condividi il codice del team.'));
      membri.forEach(function (u) {
        var r = el('div', 'm-riga'); r.appendChild(el('span', null, conNome(u)));
        if (dati.squadre.length) {
          var s = select([['', '—']].concat(dati.squadre.map(function (q) { return [q.id, q.nome]; })), u.squadra || '');
          s.onchange = function () { S.impostaSquadra(u.id, s.value).catch(errore); };
          r.appendChild(s);
        }
        if (P('giocatori')) r.appendChild(bottone('✎', 'icon', function () { editorGiocatore(u); }));
        else r.appendChild(bottone('Togli', 'link pericolo', function () { if (confirm('Togliere ' + nomeG(u) + ' dal team?')) S.togliMembro(u.id).catch(errore); }));
        mBox.appendChild(r);
      });
      refSel.innerHTML = '';
      [['', '—']].concat(membri.map(function (u) { return [u.id, nomeG(u)]; })).forEach(function (o) { var x = el('option', null, o[1]); x.value = o[0]; refSel.appendChild(x); });
      refSel.value = dati.referenteUid || '';
    }
    refSel.onchange = function () {
      dati.referenteUid = refSel.value || null;
      var u = membri.filter(function (x) { return x.id === refSel.value; })[0];
      if (u && u.callsign) refNome.value = u.callsign;
    };
    chiusura = S.ascoltaMembri(tid, function (m) { membri = m; disegnaMembri(); });
    var salva = el('div', 'riga2 fisso');
    salva.appendChild(bottone('Salva', 'accent big', function () {
      if (!nome.value.trim()) { toast('Serve il nome del team'); return; }
      var out = { nome: nome.value.trim(), logo: dati.logo, referente: { nome: refNome.value.trim(), tel: '' }, squadre: dati.squadre.filter(function (s) { return s.nome.trim(); }) };
      if (P('team')) out.referenteUid = dati.referenteUid;
      Promise.all([S.salvaTeam(tid, out), S.salvaContatto(tid, refTel.value.trim())]).then(function () { toast('Team salvato'); indietro(); }, errore);
    }));
    if (!P('team')) refSel.disabled = true;
    else salva.appendChild(bottone('Elimina team', 'pericolo', function () {
      if (!confirm('Eliminare il team "' + t.nome + '"? I giocatori restano iscritti ma senza team, e il team esce dai conflict.')) return;
      S.eliminaTeam(tid).then(function () { toast('Team eliminato'); tornaIndietro(2); }, errore);
    }));
    app.appendChild(salva);
  }

  // ================= PROFILO
  function pagProfilo() {
    var st = S.stato(), me = st.me;
    testata('Profilo');
    var f = el('div', 'modulo'); app.appendChild(f);
    var cs = el('input'); cs.value = me.callsign || ''; cs.placeholder = 'es. Falco'; f.appendChild(campoForm('Callsign', cs));
    var n = el('input'); n.value = me.nome || ''; f.appendChild(campoForm('Nome e cognome', n));
    f.appendChild(el('p', 'hint', 'Gli altri giocatori vedono solo il tuo callsign. Nome e cognome li vedi tu e gli organizzatori.'));
    f.appendChild(el('p', 'hint', 'Accesso: ' + (st.user.email || '')));
    f.appendChild(bottone('Salva', 'accent big', function () { if (!cs.value.trim()) { toast('Serve il callsign'); return; } S.aggiornaProfilo({ nome: n.value.trim(), callsign: cs.value.trim() }).then(function () { toast('Salvato'); indietro(); }, errore); }));
    if (me.team) f.appendChild(bottone('Lascia il team', 'link pericolo', function () { if (confirm('Vuoi uscire dal team?')) S.togliMembro(st.user.uid).then(function () { sostituisci('home'); }, errore); }));
  }

  // ================= GIOCATORI (solo organizzatore)
  function editorGiocatore(u) {
    apriFoglio(function (f) {
      var pv = D.privati[u.id] || {};
      f.appendChild(el('h3', null, nomeG(u)));
      if (pv.email) f.appendChild(el('p', 'hint', pv.email));
      var n = el('input'); n.value = pv.nome || ''; f.appendChild(campoForm('Nome e cognome (lo vedono solo gli organizzatori)', n));
      var cs = el('input'); cs.value = u.callsign || ''; f.appendChild(campoForm('Callsign', cs));
      var rSel = null;
      var attivo = (u.posaQrFino || 0) > Date.now();
      var pSel = select([['', 'No']].concat(attivo ? [['tieni', 'Sì, fino a ' + dataBreve(u.posaQrFino)]] : []).concat([['1', 'Per 1 giorno'], ['3', 'Per 3 giorni'], ['7', 'Per 7 giorni']]), attivo ? 'tieni' : '');
      if (S.stato().dev) { rSel = select(S.RUOLI, u.ruolo || 'truppa'); f.appendChild(campoForm('Ruolo', rSel)); }
      var tSel = select([['', 'Nessun team']].concat(D.team.map(function (t) { return [t.id, t.nome]; })), u.team || '');
      f.appendChild(campoForm('Team', tSel));
      f.appendChild(campoForm('Può posare i QR sul campo', pSel));
      var sSel = el('select'), sLab = campoForm('Squadra', sSel); f.appendChild(sLab);
      function squadre() {
        var t = teamDi(tSel.value), sq = (t && t.squadre) || [];
        sSel.innerHTML = ''; [['', '—']].concat(sq.map(function (q) { return [q.id, q.nome]; })).forEach(function (o) { var x = el('option', null, o[1]); x.value = o[0]; sSel.appendChild(x); });
        sSel.value = tSel.value === (u.team || '') ? (u.squadra || '') : '';
        sLab.hidden = !sq.length;
      }
      tSel.onchange = squadre; squadre();
      var r = el('div', 'riga2');
      r.appendChild(bottone('Salva', 'accent', function () {
        var dati = { nome: n.value.trim(), callsign: cs.value.trim(), team: tSel.value || null, squadra: sSel.value || null };
        if (rSel) dati.ruolo = rSel.value === 'truppa' ? null : rSel.value;
        if (pSel.value !== 'tieni') dati.posaQrFino = pSel.value ? Date.now() + Number(pSel.value) * GIORNO : null;
        S.salvaUtente(u.id, dati)
          .then(function () { toast('Giocatore salvato'); chiudiFoglio(); }, errore);
      }));
      r.appendChild(bottone('Elimina giocatore', 'pericolo', function () {
        if (!confirm('Eliminare ' + nomeG(u) + '? Sparisce dagli elenchi; se rientra con Google riparte da zero, senza team.')) return;
        S.eliminaUtente(u.id).then(function () { toast('Giocatore eliminato'); chiudiFoglio(); }, errore);
      }));
      f.appendChild(r);
    });
  }
  function pagGiocatori() {
    testata('Giocatori');
    var box = el('div'); app.appendChild(box);
    chiusura = S.ascoltaUtenti(function (us) {
      box.innerHTML = '';
      box.appendChild(el('p', 'hint', us.length + ' iscritti. Tocca un giocatore per modificarlo, spostarlo o eliminarlo.'));
      var gruppi = D.team.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); }).map(function (t) { return { id: t.id, nome: t.nome }; });
      gruppi.push({ id: null, nome: 'Senza team' });
      gruppi.forEach(function (g) {
        var dentro = us.filter(function (u) { return g.id ? u.team === g.id : !u.team || !teamDi(u.team); });
        if (!dentro.length) return;
        var k = el('div', 'squadra'); k.appendChild(el('h4', null, g.nome + ' · ' + dentro.length));
        dentro.sort(function (a, b) { return nomeG(a).localeCompare(nomeG(b)); }).forEach(function (u) {
          var r = el('div', 'gioc apribile'); r.appendChild(el('span', null, conNome(u)));
          if (u.ruolo && u.ruolo !== 'truppa') r.appendChild(el('small', 'tag', S.nomeRuolo(u.ruolo).toUpperCase()));
          r.appendChild(el('small', 'hint', (D.privati[u.id] || {}).email || ''));
          r.onclick = function () { editorGiocatore(u); };
          k.appendChild(r);
        });
        box.appendChild(k);
      });
    });
  }

  // ================= ORGANIZZA (solo organizzatore)
  // Organizza: pochi tasti grandi, ogni sezione ha la sua pagina
  function pagOrganizza(sez) {
    var dev = S.stato().dev;
    var SEZ = [
      ['conflitti', '⚔', 'Conflict', P('conflitti')],
      ['allenamenti', '◎', 'Allenamenti', P('allenamenti')],
      ['team', '⚑', 'Team', P('team')],
      ['giocatori', '☺', 'Giocatori', P('giocatori')],
      ['cartine', '⌖', 'Cartine', P('mappe') || P('conflitti')],
      ['pcs', '★', 'Scenari PCS', dev],
      ['dmz', '⇪', 'DMZ', dev],
      ['ruoli', '⚙', 'Ruoli e permessi', dev]
    ].filter(function (x) { return x[3]; });
    if (!sez) {
      testata('Organizza');
      var g = el('div', 'tiles');
      SEZ.forEach(function (x) {
        var b = el('button', 'tile'); b.type = 'button';
        b.appendChild(el('span', 'tile-ic', x[1])); b.appendChild(el('b', null, x[2]));
        b.onclick = function () { if (x[0] === 'mortaio') vai('mortaioProva'); else if (x[0] === 'giocatori') vai('giocatori'); else if (x[0] === 'ruoli') vai('permessi'); else vai('organizza', x[0]); };
        g.appendChild(b);
      });
      app.appendChild(g);
      return;
    }
    function riga(titolo, sotto, fn, logoT) {
      var r = el('button', 'riga-lista' + (logoT ? ' con-logo' : '')); r.type = 'button';
      if (logoT) { r.appendChild(logo(logoT, 36)); var i = el('div'); i.appendChild(el('b', null, titolo)); i.appendChild(el('small', null, sotto)); r.appendChild(i); }
      else { r.appendChild(el('b', null, titolo)); r.appendChild(el('small', null, sotto)); }
      r.onclick = fn; app.appendChild(r); return r;
    }
    if (sez === 'conflitti') {
      testata('Conflict');
      app.appendChild(bottone('+ Nuovo conflict', 'accent big', function () { vai('conflittoModifica', null); }));
      D.conflitti.slice().sort(function (a, b) { return b.inizio - a.inizio; }).forEach(function (c) {
        riga(c.titolo, c.prova ? 'PROVA sempre in corso · ' + (c.invitati || []).length + ' invitati' : dataBreve(c.inizio) + ' · ' + (addestramento(c) ? 'addestramento' : (c.team || []).length + ' team'), function () { vai('conflitto', c.id); });
      });
    } else if (sez === 'allenamenti') {
      testata('Allenamenti a porte chiuse');
      app.appendChild(bottone('+ Nuovo allenamento', 'accent big', function () { vai('allenamentoModifica', null); }));
      D.allenamenti.slice().sort(function (a, b) { return (b.inizio || 0) - (a.inizio || 0); }).forEach(function (x) {
        riga(x.titolo || 'Allenamento', (x.inizio ? dataBreve(x.inizio) : '') + ' · ' + (x.argomenti || []).length + ' argomenti · ' + (x.team || []).map(function (t) { return (teamDi(t) || {}).nome; }).filter(Boolean).join(', '), function () { vai('allenamento', x.id); });
      });
    } else if (sez === 'pcs') {
      testata('Scenari PCS');
      app.appendChild(bottone('+ Nuovo scenario', 'accent big', function () { vai('scenario', null); }));
      D.scenari.slice().sort(function (a, b) { return (b.data || '').localeCompare(a.data || ''); }).forEach(function (sc) {
        riga((sc.gen && sc.gen.operazione) || 'Scenario senza nome', (sc.squadra || 'Squadra') + ' · ' + (sc.tappe || []).length + ' tappe' + (sc.data ? ' · ' + sc.data.split('-').reverse().join('/') : ''), function () { vai('scenario', sc.id); });
      });
    } else if (sez === 'dmz') {
      testata('DMZ');
      app.appendChild(bottone('+ Nuova DMZ', 'accent big', function () { vai('dmzModifica', null); }));
      app.appendChild(el('p', 'hint', 'Squadre contro squadre, contratti ed estrazioni. Per ora la vedi solo tu e i giocatori che metti nelle squadre.'));
      D.dmz.slice().sort(function (a, b) { return b.inizio - a.inizio; }).forEach(function (x) {
        riga(x.titolo || 'DMZ', dataBreve(x.inizio) + ' · ' + (x.squadre || []).length + ' squadre · ' + (x.contratti || []).length + ' contratti', function () { vai('dmz', x.id); });
      });
    } else if (sez === 'cartine') {
      testata('Cartine');
      // da telefono (o senza il permesso di disegnarle) le cartine si possono solo esportare in PDF, così come sono
      if (!P('mappe') || window.innerWidth < 900) {
        app.appendChild(el('p', 'hint', 'Tocca una cartina per esportarla in PDF. Per modificarle serve il computer.'));
        D.campi.filter(function (cm) { return cm.geo; }).sort(function (a, b) { return a.nome.localeCompare(b.nome); }).forEach(function (cm) {
          riga('📄 ' + cm.nome, (cm.punti || []).length + ' aree · PDF da navigazione', function () { pdfCartina(cm.id); });
        });
        if (!D.campi.filter(function (cm) { return cm.geo; }).length) app.appendChild(el('p', 'hint', 'Nessuna cartina con le coordinate.'));
        return;
      }
      app.appendChild(bottone('+ Nuova cartina', 'accent big', function () { vai('mappa', null); }));
      D.campi.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); }).forEach(function (cm) {
        var r = riga(cm.nome, (cm.punti || []).length + ' aree' + (cm.geo ? '' : ' · senza coordinate'), function () { vai('mappa', cm.id); });
        // QR: dietro un tasto discreto
        var piu = bottone('QR / PDF ▾', 'link', function () { az.hidden = !az.hidden; });
        app.appendChild(piu);
        var az = el('div', 'riga-az'); az.hidden = true;
        az.appendChild(bottone('Stampa i QR', 'piccolo', function () { vai('stampaQr', cm.id); }));
        if (cm.geo) az.appendChild(bottone('PDF cartina', 'piccolo', function () { pdfCartina(cm.id); }));
        az.appendChild(bottone('Posa i QR', 'piccolo', function () { vai('posa', cm.id); }));
        app.appendChild(az);
      });
    } else if (sez === 'team') {
      testata('Team');
      if (S.stato().dev) {
        // privacy: chi vede il cellulare dei referenti (gli organizzatori e il referente stesso lo vedono sempre)
        var tel = Object.assign({}, S.privacyTelefoni()), kt = el('details', 'carta privacy-tel');
        kt.appendChild(el('summary', null, '☎ Chi vede i telefoni dei referenti')); kt.open = privacyAperta; kt.ontoggle = function () { privacyAperta = kt.open; };
        [['tutti', 'Tutti i giocatori'], ['referenti', 'I referenti degli altri team'], ['comandante', 'I comandanti di fazione'], ['caposquadra', 'I caposquadra']].forEach(function (o) {
          var l = el('label', 'spunta'), cb = el('input'); cb.type = 'checkbox'; cb.checked = !!tel[o[0]];
          cb.onchange = function () {
            tel[o[0]] = cb.checked;
            kt.querySelectorAll('input').forEach(function (x, i) { if (i > 0) x.disabled = tel.tutti; });
            S.salvaPrivacyTelefoni(tel).then(function () { toast('Salvato'); }, errore);
          };
          l.appendChild(cb); l.appendChild(el('span', null, o[1])); kt.appendChild(l);
        });
        kt.querySelectorAll('input').forEach(function (x, i) { if (i > 0) x.disabled = !!tel.tutti; });
        kt.appendChild(el('small', 'hint', 'Gli organizzatori e il referente del team lo vedono sempre. Con «Tutti» le altre spunte non servono.'));
        app.appendChild(kt);
      }
      app.appendChild(bottone('+ Nuovo team', 'accent big', function () {
        var n = prompt('Nome del nuovo team'); if (!n || !n.trim()) return;
        S.creaTeam(n.trim()).then(function (tid) { vai('team', tid); }, errore);
      }));
      D.team.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); }).forEach(function (t) {
        riga(t.nome, t.referente && t.referente.nome ? 'Ref. ' + t.referente.nome : 'Referente da indicare', function () { vai('team', t.id); }, t);
      });
    }
  }

  // ================= DMZ (stile Warzone): squadre contro squadre, contratti, zaino ed estrazioni. Per ora la prepara solo il developer.
  function mmss(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function hmmss(ms) { var m = Math.max(0, Math.round(ms / 1000)); return m >= 3600 ? Math.floor(m / 3600) + ':' + ('0' + Math.floor(m % 3600 / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2) : mmss(ms); }
  function dmzDi(id) { return D.dmz.filter(function (x) { return x.id === id; })[0]; }
  function nomeGioc(u) { return nomeG(u); }
  function pagDmzModifica(id) {
    var vecchio = dmzDi(id), Z = window.AC_DMZ;
    testata(vecchio ? 'Modifica DMZ' : 'Nuova DMZ');
    if (!S.stato().dev) { app.appendChild(el('p', 'hint', 'Non disponibile.')); return; }
    var g7 = mezzanotte(Date.now() + 7 * GIORNO);
    var x = vecchio ? JSON.parse(JSON.stringify(vecchio)) : { titolo: 'DMZ', luogo: '', inizio: g7 + 9.5 * 3600000, fine: g7 + 11.5 * 3600000, campo: D.campi.length === 1 ? D.campi[0].id : '', estrazioni: [], regole: {}, squadre: [], contratti: [], formato: 4, perTeam: true, scelti: [] };
    x.scelti = x.scelti || x.giocatori || [];
    var utenti = [], R = Z.regole(x);
    var f = el('div', 'modulo'); app.appendChild(f);
    var tit = el('input'); tit.value = x.titolo || ''; f.appendChild(campoForm('Nome', tit));
    var dt = el('input'); dt.type = 'date'; dt.value = locale(x.inizio).slice(0, 10);
    var hI = el('input'); hI.type = 'time'; hI.value = ora(x.inizio);
    var dur = select([[60, '1 ora'], [90, '1 ora e mezza'], [120, '2 ore'], [180, '3 ore'], [240, '4 ore']], String(Math.round((x.fine - x.inizio) / 60000)));
    var tre = el('div', 'tre'); tre.appendChild(campoForm('Data', dt)); tre.appendChild(campoForm('Inizio', hI)); tre.appendChild(campoForm('Durata', dur)); f.appendChild(tre);
    var lg = el('input'); lg.value = x.luogo || ''; lg.placeholder = 'es. Campo Tauri, Giaveno'; f.appendChild(campoForm('Luogo', lg));

    f.appendChild(el('h3', 'sez', 'Cartina ed estrazioni'));
    var cSel = select([['', '— scegli —']].concat(D.campi.map(function (c) { return [c.id, c.nome]; })), x.campo || '');
    f.appendChild(campoForm('Cartina', cSel));
    var eBox = el('div', 'chips'); f.appendChild(eBox);
    var ogni = select([[10, 'ogni 10 min'], [15, 'ogni 15 min'], [20, 'ogni 20 min'], [30, 'ogni 30 min']], String(R.ogni));
    var aperta = select([[3, 'per 3 min'], [4, 'per 4 min'], [5, 'per 5 min'], [8, 'per 8 min']], String(R.aperta));
    var due = el('div', 'tre'); due.appendChild(campoForm('Ogni estrazione si apre', ogni)); due.appendChild(campoForm('Resta aperta', aperta)); f.appendChild(due);
    function aree() { var cm = campoMeta(cSel.value); return cm ? perCategoria(cm, 'dmz').punti : []; }
    function disegnaEstr() {
      eBox.innerHTML = '';
      var pp = aree();
      x.estrazioni = x.estrazioni.filter(function (e) { return pp.some(function (p) { return p.id === e; }); });
      if (!cSel.value) { eBox.appendChild(el('small', 'hint', 'Scegli la cartina, poi tocca le aree che fanno da estrazione.')); return; }
      eBox.appendChild(el('span', 'chips-tit', 'Tocca le aree di estrazione (le altre diventano contratti)'));
      pp.forEach(function (p) {
        var on = x.estrazioni.indexOf(p.id) >= 0;
        eBox.appendChild(bottone((on ? '⇪ ' : '') + p.nome, 'chip' + (on ? ' on arancio' : ''), function () {
          var i = x.estrazioni.indexOf(p.id); if (i >= 0) x.estrazioni.splice(i, 1); else x.estrazioni.push(p.id); disegnaEstr();
        }));
      });
      if (!pp.length) eBox.appendChild(el('small', 'hint avviso', 'Nessuna area di questa cartina è segnata per la DMZ (editor → area → «Usata in»).'));
    }
    cSel.onchange = function () { disegnaEstr(); disegnaCon(); };

    // giocatori e squadre
    f.appendChild(el('h3', 'sez', 'Giocatori e squadre'));
    var gBox = el('div', 'modulo'); f.appendChild(gBox);
    var fmt = select(Z.FORMATI.map(function (o) { return [o[0], o[1]]; }), String(x.formato || 4));
    var pt = el('label', 'spunta'), ptI = el('input'); ptI.type = 'checkbox'; ptI.checked = x.perTeam !== false; pt.appendChild(ptI); pt.appendChild(el('span', null, 'Tieni insieme i compagni dello stesso team'));
    var sBox = el('div', 'dmz-sq-ed');
    function nomeU(uid) { var u = utenti.filter(function (y) { return y.id === uid; })[0]; return u ? nomeGioc(u) : (x.nomi || {})[uid] || '?'; }
    function disegnaGioc() {
      gBox.innerHTML = '';
      var perT = {};
      utenti.forEach(function (u) { var k = u.team || ''; (perT[k] = perT[k] || []).push(u); });
      Object.keys(perT).sort(function (a, b) { return ((teamDi(a) || {}).nome || 'zz').localeCompare((teamDi(b) || {}).nome || 'zz'); }).forEach(function (tid) {
        var c = el('div', 'chips'), lista = perT[tid].sort(function (a, b) { return nomeGioc(a).localeCompare(nomeGioc(b)); });
        var tutti = lista.every(function (u) { return x.scelti.indexOf(u.id) >= 0; });
        c.appendChild(bottone((teamDi(tid) || {}).nome || 'Senza team', 'link chips-tit', function () {
          lista.forEach(function (u) { var i = x.scelti.indexOf(u.id); if (tutti && i >= 0) x.scelti.splice(i, 1); else if (!tutti && i < 0) x.scelti.push(u.id); }); disegnaGioc();
        }));
        lista.forEach(function (u) {
          var on = x.scelti.indexOf(u.id) >= 0;
          c.appendChild(bottone(conNome(u), 'chip' + (on ? ' on arancio' : ''), function () { var i = x.scelti.indexOf(u.id); if (i >= 0) x.scelti.splice(i, 1); else x.scelti.push(u.id); disegnaGioc(); }));
        });
        gBox.appendChild(c);
      });
      if (!utenti.length) gBox.appendChild(el('p', 'hint', 'Caricamento dei giocatori…'));
      gBox.appendChild(el('small', 'hint', x.scelti.length + ' giocatori scelti'));
      var r = el('div', 'tre'); r.appendChild(campoForm('Squadre da', fmt)); gBox.appendChild(r); gBox.appendChild(pt);
      gBox.appendChild(bottone(x.squadre.length ? 'Rifai le squadre' : 'Forma le squadre', 'accent', forma));
      gBox.appendChild(sBox); disegnaSq();
    }
    function forma() {
      var n = +fmt.value, sc = x.scelti.slice();
      if (sc.length < 2) { toast('Scegli almeno 2 giocatori'); return; }
      var sq = [];
      if (ptI.checked) {
        var perT = {}; sc.forEach(function (uid) { var u = utenti.filter(function (y) { return y.id === uid; })[0]; var k = (u && u.team) || '-'; (perT[k] = perT[k] || []).push(uid); });
        Object.keys(perT).forEach(function (k) {
          var g = perT[k], parti = Math.ceil(g.length / n);
          for (var i = 0; i < parti; i++) sq.push(g.filter(function (_, j) { return j % parti === i; }));
        });
      } else sq = Z.componi(sc, n).map(function (s) { return s.membri; });
      x.squadre = sq.map(function (m, i) { return { id: 's' + (i + 1), nome: Z.NOMI[i % Z.NOMI.length], membri: m }; });
      x.contratti = x.contratti.filter(function (c) { return c.tipo !== 'caccia'; });
      disegnaSq(); disegnaCon();
    }
    function disegnaSq() {
      sBox.innerHTML = '';
      x.squadre.forEach(function (s, i) {
        var k = el('div', 'dmz-sq-card');
        var h = el('div', 'ed-riga'), nm = el('input'); nm.value = s.nome; nm.oninput = function () { s.nome = nm.value; };
        h.appendChild(nm); h.appendChild(el('small', s.membri.length > 6 || s.membri.length < 1 ? 'avviso' : 'hint', s.membri.length + ' gioc.')); k.appendChild(h);
        var c = el('div', 'chips');
        s.membri.forEach(function (uid) {
          // tocca un giocatore per spostarlo nella squadra dopo
          c.appendChild(bottone(nomeU(uid) + ' ›', 'chip', function () {
            if (x.squadre.length < 2) return;
            s.membri.splice(s.membri.indexOf(uid), 1); x.squadre[(i + 1) % x.squadre.length].membri.push(uid);
            x.squadre = x.squadre.filter(function (q) { return q.membri.length; }); disegnaSq();
          }));
        });
        k.appendChild(c); sBox.appendChild(k);
      });
      if (x.squadre.length) sBox.appendChild(el('small', 'hint', 'Tocca un giocatore per spostarlo nella squadra dopo. Massimo 6 per squadra.'));
    }
    // contratti
    f.appendChild(el('h3', 'sez', 'Contratti'));
    var kBox = el('div', 'modulo'); f.appendChild(kBox);
    function disegnaCon() {
      kBox.innerHTML = '';
      x.contratti.forEach(function (c, i) {
        var r = el('div', 'dmz-con-ed t-' + c.tipo);
        r.appendChild(el('span', 'dmz-tipo', Z.TIPI[c.tipo].nome.toUpperCase()));
        var t = el('input'); t.value = c.titolo; t.oninput = function () { c.titolo = t.value; }; r.appendChild(t);
        var v = el('input'); v.type = 'number'; v.step = 50; v.min = 0; v.value = c.valore; v.className = 'dmz-val'; v.oninput = function () { c.valore = +v.value || 0; }; r.appendChild(v);
        r.appendChild(bottone('✕', 'icon', function () { x.contratti.splice(i, 1); disegnaCon(); }));
        kBox.appendChild(r);
      });
      kBox.appendChild(bottone(x.contratti.length ? 'Rigenera i contratti' : 'Genera i contratti', '', function () {
        if (!cSel.value) { toast('Prima scegli la cartina'); return; }
        x.contratti = Z.generaContratti(x, aree()); disegnaCon();
      }));
      kBox.appendChild(el('small', 'hint', 'Uno per area (estrazioni escluse) più qualche «caccia» a una squadra. Il valore è quanto finisce nello zaino.'));
    }
    disegnaEstr(); disegnaGioc(); disegnaCon();
    var stopU = S.ascoltaUtenti(function (u) { utenti = u; if (!document.activeElement.matches('input')) disegnaGioc(); });
    var prima = chiusura; chiusura = function () { stopU(); if (prima) prima(); };

    var az = el('div', 'riga2 fisso');
    az.appendChild(bottone('Salva', 'accent big', function () {
      if (!dt.value || !hI.value) { toast('Servono data e ora'); return; }
      if (!cSel.value) { toast('Scegli la cartina'); return; }
      if (!x.estrazioni.length) { toast('Scegli almeno un\'estrazione'); return; }
      if (x.squadre.length < 2) { toast('Servono almeno 2 squadre'); return; }
      if (x.squadre.some(function (s) { return s.membri.length > 6; })) { toast('Massimo 6 giocatori per squadra'); return; }
      var ini = new Date(dt.value + 'T' + hI.value).getTime(), sqDi = {}, nomi = {}, gioc = [];
      x.squadre.forEach(function (s) { s.membri.forEach(function (u) { sqDi[u] = s.id; nomi[u] = nomeU(u); gioc.push(u); }); });
      var out = { id: x.id, titolo: tit.value.trim() || 'DMZ', luogo: lg.value.trim(), inizio: ini, fine: ini + (+dur.value) * 60000, campo: cSel.value,
        estrazioni: x.estrazioni, regole: { ogni: +ogni.value, aperta: +aperta.value, taglia: R.taglia }, formato: +fmt.value, perTeam: ptI.checked,
        squadre: x.squadre.map(function (s) { return { id: s.id, nome: (s.nome || '').trim() || 'Squadra', membri: s.membri }; }), giocatori: gioc, squadraDi: sqDi, nomi: nomi,
        contratti: x.contratti.filter(function (c) { return c.tipo !== 'caccia' || x.squadre.some(function (s) { return s.id === c.bersaglio; }); }) };
      S.salvaDmz(out).then(function (nid) { toast('DMZ salvata'); if (vecchio) indietro(); else sostituisci('dmz', nid); }, errore);
    }));
    if (vecchio) az.appendChild(bottone('Elimina', 'pericolo', function () { if (confirm('Eliminare la DMZ?')) S.eliminaDmz(vecchio.id).then(function () { tornaIndietro(2); }, errore); }));
    app.appendChild(az);
  }

  function pagDmz(id) {
    var x = dmzDi(id), Z = window.AC_DMZ, st = S.stato();
    if (!x) { testata('DMZ'); app.appendChild(el('p', 'hint', 'DMZ non trovata.')); return; }
    var mia = (x.squadraDi || {})[st.user.uid] || null;
    if (Date.now() >= x.inizio - 10 * 60000 && Date.now() < x.fine && mia) return schermoDmz(x, mia);
    testata(x.titolo || 'DMZ');
    if (st.dev) {
      var adm = el('div', 'riga2');
      adm.appendChild(bottone('⚙ Modifica', '', function () { vai('dmzModifica', x.id); }));
      adm.appendChild(bottone('Segui la partita', '', function () { vai('dmzLive', x.id); }));
      app.appendChild(adm);
    }
    var hero = el('div', 'conf-hero');
    hero.appendChild(el('div', 'conf-tipo dmz', 'DMZ · CONTRATTI'));
    hero.appendChild(el('div', 'pm-data', dataLunga(x.inizio).toUpperCase()));
    var orari = el('div', 'pm-orari');
    [['INIZIO', x.inizio], ['FINE', x.fine]].forEach(function (o) { var d = el('div'); d.appendChild(el('small', null, o[0])); d.appendChild(el('b', null, ora(o[1]))); orari.appendChild(d); });
    hero.appendChild(orari);
    if (x.luogo) hero.appendChild(el('div', 'conf-luogo', '⌖ ' + x.luogo));
    if (Date.now() >= x.fine) hero.appendChild(el('div', 'conf-fine', 'DMZ CONCLUSA'));
    app.appendChild(hero);
    if (mia) {
      var s = (x.squadre || []).filter(function (q) { return q.id === mia; })[0];
      var k = el('div', 'carta'); k.appendChild(el('small', 'hint', 'LA TUA SQUADRA'));
      k.appendChild(el('h3', null, s.nome));
      k.appendChild(el('p', 'testo', s.membri.map(function (u) { return (x.nomi || {})[u] || '?'; }).join(' · ')));
      app.appendChild(k);
    }
    var r = el('div', 'carta dmz-regole');
    r.appendChild(el('b', null, 'Come si gioca'));
    var R = Z.regole(x), ul = el('ol');
    ['Ogni squadra prende un contratto alla volta e lo completa scansionando i QR delle aree.',
      'Ricognizione: più punti da scansionare nell\'ordine giusto. Recupero: la cassa va esfiltrata entro ' + R.cassa + ' minuti o si perde. Intel: i documenti indicano un\'area con un bonus. Sabotaggio: piazzate la carica, tenete la posizione ' + R.tieni + ' minuti e riscansionate. Caccia: eliminate la squadra bersaglio.',
      'Il valore del contratto va nello zaino. Conta solo quando lo esfiltrate.',
      'Per esfiltrare scansionate il QR di un\'estrazione mentre è aperta: si aprono a turno ogni ' + R.ogni + ' minuti e restano aperte ' + R.aperta + ' minuti.',
      'Se la squadra viene eliminata premete «Siamo stati eliminati»: perdete lo zaino non esfiltrato, tornate all\'ingresso e ripartite.',
      'Chi elimina una squadra guadagna ' + R.taglia + '. Alla fine vince chi ha esfiltrato di più: lo zaino non esfiltrato si perde.'
    ].forEach(function (t) { ul.appendChild(el('li', null, t)); });
    r.appendChild(ul); app.appendChild(r);
    if (Date.now() >= x.inizio) {
      var cl = el('div', 'carta'); app.appendChild(cl);
      var stopE = S.ascoltaEventiDmz(x.id, function (ev) { cl.innerHTML = ''; cl.appendChild(el('b', null, 'Classifica')); cl.appendChild(tabClassifica(Z.stato(x, ev, Date.now()), mia)); });
      var prima = chiusura; chiusura = function () { stopE(); if (prima) prima(); };
    }
  }
  function tabClassifica(s, mia) {
    var t = el('table', 'dmz-class'), h = el('tr');
    ['', 'Squadra', 'Esfiltrato', 'Zaino', 'Elim.'].forEach(function (c) { h.appendChild(el('th', null, c)); }); t.appendChild(h);
    s.classifica.forEach(function (q, i) {
      var r = el('tr', q.id === mia ? 'mia' : '');
      [String(i + 1), q.nome, String(q.salvato), s.finita ? '—' : String(q.zaino), String(q.uccisioni)].forEach(function (c) { r.appendChild(el('td', null, c)); });
      t.appendChild(r);
    });
    return t;
  }

  // schermo di gioco: mappa, contratto, zaino, estrazioni; due tasti grandi (QR ed eliminati)
  function schermoDmz(x, mia) {
    var Z = window.AC_DMZ, st = S.stato(), pieno = aPieno();
    var box = el('div', 'dmz-gioco'); pieno.appendChild(box);
    var testa = el('div', 'dmz-testa'); box.appendChild(testa);
    var mapBox = el('div', 'dmz-mappa'); box.appendChild(mapBox);
    var pan = el('div', 'dmz-pan'); box.appendChild(pan);
    var ultimi = [], cm = null, v = null, sq = mia && (x.squadre || []).filter(function (q) { return q.id === mia; })[0];
    function esci() { if (pila.length > 1) indietro(); else sostituisci('home'); }
    function nomeArea(id) { var p = cm && (cm.punti || []).filter(function (q) { return q.id === id; })[0]; return p ? p.nome : '…'; }
    function con(id) { return (x.contratti || []).filter(function (c) { return c.id === id; })[0]; }
    function scrivi(e) { e.squadra = mia; e.uid = st.user.uid; e.t = Date.now(); return S.scriviEventoDmz(x.id, e); }
    var tick = [];
    function disegna() {
      var s = Z.stato(x, ultimi, Date.now()), me = mia && s.squadre[mia];
      tick = [];
      testa.innerHTML = '';
      testa.appendChild(bottone('‹', 'icon', esci));
      var tm = el('div', 'dmz-tempo'); testa.appendChild(tm);
      tick.push(function () { var r = x.fine - Date.now(); tm.textContent = Date.now() < x.inizio ? 'INIZIA TRA ' + hmmss(x.inizio - Date.now()) : r > 0 ? hmmss(r) : 'FINITA'; tm.classList.toggle('ultimi', r > 0 && r < 5 * 60000); });
      if (me) {
        var z = el('div', 'dmz-zaino'); z.appendChild(el('small', null, 'ZAINO')); z.appendChild(el('b', null, String(me.zaino))); testa.appendChild(z);
        var sv = el('div', 'dmz-zaino salvo'); sv.appendChild(el('small', null, 'ESFILTRATO')); sv.appendChild(el('b', null, String(me.salvato))); testa.appendChild(sv);
      }
      pan.innerHTML = '';
      if (s.finita) {
        pan.appendChild(el('h2', 'dmz-fine', 'DMZ CONCLUSA'));
        pan.appendChild(tabClassifica(s, mia));
        pan.appendChild(bottone('Esci', 'big', esci));
      } else if (me) {
        // contratto in corso o scelta di un contratto
        var c = me.contratto && con(me.contratto);
        if (c) {
          var k = el('div', 'dmz-con mio t-' + c.tipo);
          k.appendChild(el('span', 'dmz-tipo', Z.TIPI[c.tipo].nome.toUpperCase() + ' · ' + c.valore));
          k.appendChild(el('b', null, c.titolo));
          var ist = el('small'); k.appendChild(ist);
          if (c.tipo === 'caccia') ist.textContent = Z.TIPI.caccia.testo;
          else if (c.tipo === 'ricognizione') { var tp = Z.tappe(c); ist.textContent = 'Punto ' + (me.prog + 1) + ' di ' + tp.length + ': andate a ' + nomeArea(tp[me.prog]) + ' e scansionate il QR.'; }
          else if (c.tipo === 'sabotaggio' && me.innesco != null) {
            var inn = me.innesco; k.classList.add('caldo');
            tick.push(function () { var rr = inn + Z.regole(x).tieni * 60000 - Date.now(); ist.textContent = rr > 0 ? 'Carica piazzata a ' + nomeArea(c.area) + ': tenete la posizione. Riscansionate tra ' + mmss(rr) + '.' : 'Pronta: riscansionate il QR di ' + nomeArea(c.area) + ' per farla saltare!'; });
          }
          else ist.textContent = (c.tipo === 'sabotaggio' ? 'Andate a ' + nomeArea(c.area) + ' e scansionate il QR per piazzare la carica.' : 'Andate a ' + nomeArea(c.area) + ' e scansionate il QR.');
          k.appendChild(bottone('Lascia il contratto', 'link', function () { if (confirm('Lasciare il contratto? Torna libero per tutti.')) scrivi({ tipo: 'lascia', contratto: c.id }).catch(errore); }));
          pan.appendChild(k);
        } else {
          var liberi = (x.contratti || []).filter(function (q) { return s.contratti[q.id].stato === 'libero' && !(q.tipo === 'caccia' && q.bersaglio === mia); });
          var bS = bottone(liberi.length ? 'Scegli un contratto (' + liberi.length + ')' : 'Nessun contratto libero', 'big' + (liberi.length ? ' accent' : ''), function () {
            apriFoglio(function (f) {
              f.appendChild(el('h3', null, 'Contratti liberi'));
              liberi.forEach(function (q) {
                var r = el('button', 'dmz-con t-' + q.tipo); r.type = 'button';
                r.appendChild(el('span', 'dmz-tipo', Z.TIPI[q.tipo].nome.toUpperCase() + ' · ' + q.valore));
                r.appendChild(el('b', null, q.titolo));
                r.appendChild(el('small', null, Z.TIPI[q.tipo].testo));
                r.onclick = function () { chiudiFoglio(); scrivi({ tipo: 'prendi', contratto: q.id }).then(function () { if (q.area && v) v.evidenzia(q.area); toast('Contratto preso'); }, errore); };
                f.appendChild(r);
              });
            });
          });
          bS.disabled = !liberi.length; pan.appendChild(bS);
        }
        // casse del recupero da esfiltrare in tempo e bonus dell'intel
        me.casse.forEach(function (cs) {
          var a = el('div', 'dmz-avviso'); pan.appendChild(a);
          tick.push(function () { var rr = cs.scade - Date.now(); a.textContent = 'Cassa da ' + cs.valore + ': esfiltratela entro ' + mmss(rr); a.classList.toggle('urgente', rr < 5 * 60000); });
        });
        if (me.bonus) pan.appendChild(el('div', 'dmz-avviso bonus', 'Intel: bonus di ' + me.bonus.valore + ' a ' + nomeArea(me.bonus.area) + '. Scansionate il QR.'));
        var due = el('div', 'riga2 dmz-tasti');
        due.appendChild(bottone('SCANSIONA QR', 'accent big', scansiona));
        due.appendChild(bottone('SIAMO STATI ELIMINATI', 'pericolo big', eliminati));
        pan.appendChild(due);
      }
      // estrazioni con il conto alla rovescia
      var eb = el('div', 'dmz-estr'); pan.appendChild(eb);
      (x.estrazioni || []).forEach(function (e, i) {
        var r = el('div', 'dmz-e'); r.appendChild(el('b', null, '⇪ ' + nomeArea(e)));
        var t = el('span'); r.appendChild(t); eb.appendChild(r);
        tick.push(function () { var w = Z.finestra(x, i, Date.now()); r.classList.toggle('aperta', w.aperta); t.textContent = w.aperta ? 'APERTA · chiude tra ' + mmss(w.chiude) : 'apre tra ' + mmss(w.tra); });
      });
      if (!s.finita) {
        var piu = bottone('Classifica ▾', 'link', function () { cl.hidden = !cl.hidden; }); pan.appendChild(piu);
        var cl = el('div', 'dmz-cl'); cl.hidden = !!me; cl.appendChild(tabClassifica(s, mia));
        if (s.log.length) { var lg = el('ul', 'dmz-log'); s.log.slice(0, 8).forEach(function (l) { lg.appendChild(el('li', null, ora(l.t) + ' ' + l.testo)); }); cl.appendChild(lg); }
        pan.appendChild(cl);
      }
      tick.forEach(function (fn) { fn(); });
      if (v && me) v.evidenzia(Z.obiettivo(x, me));
    }
    function scansiona() {
      if (!cm) { toast('Cartina in caricamento'); return; }
      apriScanner('Scansiona il QR', function (t) {
        return S.leggiQr(cm, t).then(function (r) {
          if (!r.punto) return { ok: false, titolo: 'QR non valido', testo: r.errore };
          // si registra la scansione; cosa vale lo decide il motore (stesso calcolo per tutti)
          var e = { tipo: 'qr', punto: r.punto.id, squadra: mia, uid: st.user.uid, t: Date.now() };
          var es = Z.stato(x, ultimi.concat([e]), e.t).squadre[mia].esito || { k: 'nessuno' }, P = r.punto.nome;
          var M = {
            esfil: { ok: true, titolo: 'Esfiltrati ' + es.valore, testo: 'Al sicuro. Potete tornare in gioco.' },
            chiusa: { avviso: true, titolo: 'Estrazione chiusa', testo: 'Si apre tra ' + mmss(es.tra) + '. Restate nei paraggi.' },
            vuoto: { avviso: true, titolo: 'Zaino vuoto', testo: 'Non avete niente da esfiltrare.' },
            bonus: { ok: true, titolo: 'Bonus trovato', testo: '+' + es.valore + ' nello zaino.' },
            nessuno: { avviso: true, titolo: P, testo: 'Qui non c\'è niente per voi: prendete un contratto.' },
            altrove: { avviso: true, titolo: P, testo: 'Non è l\'area giusta: andate a ' + nomeArea(es.area) + '.' },
            ordine: { avviso: true, titolo: P, testo: 'Ordine sbagliato: prima andate a ' + nomeArea(es.area) + '.' },
            tappa: { ok: true, titolo: 'Punto ' + es.n + ' di ' + es.tot, testo: 'Ora andate a ' + nomeArea(es.prossima) + '.' },
            fatto: { ok: true, titolo: 'Contratto completato', testo: '+' + es.valore + ' nello zaino. Portatelo a un\'estrazione aperta.' },
            innesco: { ok: true, titolo: 'Carica piazzata', testo: 'Tenete la posizione: riscansionate questo QR tra ' + mmss(es.resta) + '.' },
            attendi: { avviso: true, titolo: 'Non ancora', testo: 'Tenete la posizione ancora ' + mmss(es.resta) + ', poi riscansionate.' },
            cassa: { ok: true, titolo: 'Cassa recuperata', testo: '+' + es.valore + ' nello zaino. Esfiltratela entro ' + Math.round(es.scade / 60000) + ' minuti o va persa.' },
            intel: { ok: true, titolo: 'Documenti recuperati', testo: '+' + es.valore + ' nello zaino. Indicano un bonus di ' + es.bonus + ' a ' + nomeArea(es.area) + '.' }
          }[es.k] || { titolo: P };
          var ok = Object.assign({ ok: false }, M);
          // le scansioni che non cambiano nulla non si registrano
          if (['nessuno', 'altrove', 'ordine', 'vuoto', 'chiusa', 'attendi'].indexOf(es.k) >= 0) return ok;
          return scrivi({ tipo: 'qr', punto: r.punto.id }).then(function () { return ok; });
        });
      });
    }
    function eliminati() {
      apriFoglio(function (f) {
        f.appendChild(el('h3', null, 'Squadra eliminata'));
        f.appendChild(el('p', 'hint', 'Perdete lo zaino non esfiltrato. Chi vi ha eliminato?'));
        (x.squadre || []).filter(function (q) { return q.id !== mia; }).forEach(function (q) {
          f.appendChild(bottone(q.nome, 'big', function () { conferma(q.id); }));
        });
        f.appendChild(bottone('Non lo sappiamo', 'big', function () { conferma(null); }));
        function conferma(da) { chiudiFoglio(); scrivi({ tipo: 'eliminata', da: da }).then(function () { toast('Zaino perso. Tornate all\'ingresso e ripartite.'); }, errore); }
      });
    }
    conCampo(x.campo, mapBox, function (c0) {
      cm = c0;
      var g0 = { inizio: Date.now() + 864e5, durata: 60, fazioni: [{ team: 'blu', mob: null, partenza: [] }, { team: 'rossa', mob: null, partenza: [] }] };
      v = F.vista(mapBox, { g: g0, campo: cm, team: null, colori: COLORI, nomi: {}, ora: Date.now, anteprima: true, allenamento: true });
      disegna();
    }, 'dmz');
    disegna();
    var stopE = S.ascoltaEventiDmz(x.id, function (ev) { ultimi = ev; if ($('foglio').hidden) disegna(); });
    var giro = setInterval(function () { tick.forEach(function (fn) { fn(); }); if (Date.now() >= x.fine && !pan.querySelector('.dmz-fine')) disegna(); }, 1000);
    var prima = chiusura; chiusura = function () { stopE(); clearInterval(giro); if (v) v.chiudi(); if (prima) prima(); };
  }
  function pagDmzLive(id) { var x = dmzDi(id); if (!x) return pagDmz(id); schermoDmz(x, (x.squadraDi || {})[S.stato().user.uid] || null); }
  function cartaDmz(x) {
    if (Date.now() >= x.fine) return cartaConclusa('DMZ', x, '', P('conflitti') || S.stato().dev ? function () { vai('dmz', x.id); } : null);
    var k = el('button', 'carta promemoria dmz'); k.type = 'button';
    var testa = el('div', 'pm-testa'); testa.appendChild(el('span', 'pm-eti', 'DMZ')); testa.appendChild(el('span', 'pm-tra', Date.now() >= x.inizio ? 'IN CORSO' : traQuanto(x.inizio))); k.appendChild(testa);
    k.appendChild(el('h3', null, x.titolo || 'DMZ'));
    k.appendChild(el('div', 'pm-data', dataBreve(x.inizio) + ' · ' + ora(x.inizio) + '–' + ora(x.fine)));
    if (x.luogo) k.appendChild(el('div', 'pm-luogo', '⌖ ' + x.luogo));
    k.appendChild(el('span', 'pm-apri', 'Tocca per squadra e regole ›'));
    k.onclick = function () { vai('dmz', x.id); };
    return k;
  }

  // ================= ALLENAMENTI A PORTE CHIUSE
  // aree della cartina per un tipo di giocata (conflict, allenamento, pcs): senza "usi" valgono per tutti
  function perCategoria(cm, cat) {
    var punti = (cm.punti || []).filter(function (p) { return !p.usi || p.usi[cat] !== false; }), ids = {};
    punti.forEach(function (p) { ids[p.id] = 1; });
    return Object.assign({}, cm, { punti: punti, link: (cm.link || []).filter(function (l) { return ids[l[0]] && ids[l[1]]; }), segni: (cm.segni || []).filter(function (g) { return !g.usi || g.usi[cat] !== false; }) });
  }
  function pagAllenamento(id) {
    var a = D.allenamenti.filter(function (x) { return x.id === id; })[0]; var dove = app;
    testata(a ? a.titolo || 'Allenamento' : 'Allenamento');
    if (!a) { app.appendChild(el('p', 'hint', 'Allenamento non trovato.')); return; }
    if (P('allenamenti')) {
      var adA = el('div', 'riga2');
      adA.appendChild(bottone('🔗 Condividi link presenze', 'accent', function () { condividiEvento('a', a); }));
      adA.appendChild(bottone('⧉ Duplica', '', function () { vai('allenamentoModifica', { copia: a.id }); }));
      app.appendChild(adA);
      app.appendChild(a.annullato ? bottone('↺ Ripristina l\'evento (non più annullato)', '', function () {
        var d = Object.assign({}, a); delete d.annullato; delete d.motivo; S.salvaAllenamento(d).then(function () { toast('Evento ripristinato'); mostra(); }, errore);
      }) : bottone('✖ Annulla l\'evento', 'pericolo', function () {
        var m = prompt('Motivo (si legge sotto il timbro, es. "Pioggia"). Lascia vuoto per nessun motivo.', 'Maltempo'); if (m === null) return;
        S.salvaAllenamento(Object.assign({}, a, { annullato: true, motivo: m.trim().slice(0, 60) })).then(function () { toast('Evento annullato'); mostra(); }, errore);
      }));
      app.appendChild(bottone('⚙ Modifica', 'link', function () { vai('allenamentoModifica', a.id); }));
    }
    var hero = el('div', 'conf-hero all-hero');
    hero.appendChild(el('div', 'conf-tipo verde', 'ALLENAMENTO · PORTE CHIUSE'));
    if (a.inizio) hero.appendChild(el('div', 'pm-data', dataLunga(a.inizio).toUpperCase()));
    var orari = el('div', 'pm-orari');
    [['RITROVO', a.ritrovo], ['INIZIO', a.inizio], ['FINE', a.fine]].forEach(function (o) { if (!o[1]) return; var d = el('div'); d.appendChild(el('small', null, o[0])); d.appendChild(el('b', null, ora(o[1]))); orari.appendChild(d); });
    hero.appendChild(orari);
    var lg = el('div', 'conf-luogo'); lg.appendChild(el('span', null, '⌖ ' + (a.luogo || 'Luogo da definire')));
    if (a.luogo || a.mapsUrl) lg.appendChild(link('Apri in Maps', mapsLink(a), 'btn piccolo'));
    hero.appendChild(lg);
    if (faseAll(a) === 'finito') hero.appendChild(el('div', 'conf-fine', 'ALLENAMENTO CONCLUSO'));
    if (a.annullato) { hero.classList.add('annullato'); hero.appendChild(timbroAnnullato(a)); }
    app.appendChild(hero);
    if (faseAll(a) === 'finito' || (a.esercizio && a.esercizio.fase === 'fine')) app.appendChild(cartaChatStorico(a));
    if (esAttivo(a)) app.appendChild(bottone('⚑ ESERCITAZIONE IN CORSO · apri', 'accent big es-home', function () { vai('esercizio', a.id); }));
    else if (P('allenamenti') && a.campo) app.appendChild(bottone('⚑ Esercitazione bandiere (regia)', '', function () { vai('esercizio', a.id); }));
    if (S.stato().me.team && (a.team || []).indexOf(S.stato().me.team) >= 0 && faseAll(a) !== 'finito' && !a.annullato) {
      var mia = miaAdesione('a:' + a.id);
      if (!mia || mia.dopo) { var rk = el('div', 'carta'); rk.appendChild(el('b', null, 'Ci sarai?')); rk.appendChild(treRisposte(a.id, 'allenamenti', function () { mostra(); })); app.appendChild(rk); }
      else {
        var rr = el('div', 'risposta'); rr.appendChild(el('span', null, mia.si ? 'Hai confermato la presenza' : 'Hai detto che non vieni'));
        rr.appendChild(bottone(mia.si ? 'Non vengo più' : 'Partecipo', 'piccolo', function () { S.rispondiInvito(a.id, mia.si ? 'no' : 'si', 'allenamenti').then(function () { mostra(); }, errore); }));
        app.appendChild(rr);
      }
    }
    if (P('allenamenti')) {
      var ad = D.adesioni['a:' + a.id] || [], presA = el('div', 'pres'), restoA = el('div');
      schede(app, 'all:' + a.id, [['allenamento', 'Allenamento', restoA], ['presenze', 'Presenze · ' + ad.filter(function (x) { return x.si; }).length + ' sì', presA, function () { vistaPresenze(presA, ad, a.team || [], function (x) { return S.eliminaAdesione(a.id, x.id, 'allenamenti'); }); }]]);
      dove = restoA;
    }
    var pk = a.parcheggio || {};
    if (pk.testo || pk.mapsUrl) {
      var k = el('div', 'carta all-park'); k.appendChild(el('b', null, '🅿 Parcheggio'));
      if (pk.testo) k.appendChild(el('p', 'testo', pk.testo));
      if (pk.mapsUrl) k.appendChild(link('Portami al parcheggio', pk.mapsUrl, 'btn'));
      dove.appendChild(k);
    }
    // mappa con le zone di allenamento e argomenti: toccando un argomento lampeggia la sua zona
    var mapBox = el('div', 'all-mappa'); dove.appendChild(mapBox);
    var lista = el('div', 'all-arg'); dove.appendChild(el('h3', 'sez', 'Argomenti')); dove.appendChild(lista);
    var v = null, scelto = null;
    function disegnaArg(cm) {
      lista.innerHTML = '';
      (a.argomenti || []).forEach(function (g, i) {
        var p = cm && (cm.punti || []).filter(function (x) { return x.id === g.area; })[0];
        var r = el('button', 'all-riga' + (scelto === i ? ' on' : '')); r.type = 'button';
        r.appendChild(el('span', 'all-n', String(i + 1)));
        var t = el('div'); t.appendChild(el('b', null, g.titolo || 'Argomento')); if (g.descrizione) t.appendChild(el('small', null, g.descrizione));
        if (p) t.appendChild(el('small', 'all-zona', '◎ ' + p.nome));
        r.appendChild(t);
        r.onclick = function () { scelto = scelto === i ? null : i; if (v) v.evidenzia(scelto == null ? null : g.area); disegnaArg(cm); mapBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
        lista.appendChild(r);
      });
      if (!(a.argomenti || []).length) lista.appendChild(el('p', 'hint', 'Argomenti in arrivo.'));
    }
    disegnaArg(null);
    if (a.campo) conCampo(a.campo, mapBox, function (cm0) {
      var cm = perCategoria(cm0, 'allenamento');
      var g0 = { inizio: Date.now() + 864e5, durata: 60, fazioni: [{ team: 'blu', mob: null, partenza: [] }, { team: 'rossa', mob: null, partenza: [] }] };
      v = F.vista(mapBox, { g: g0, campo: cm, team: null, colori: COLORI, nomi: {}, ora: Date.now, anteprima: true, allenamento: true });
      disegnaArg(cm);
      var prima = chiusura; chiusura = function () { v.chiudi(); if (prima) prima(); };
    });
    else mapBox.appendChild(el('p', 'hint centro', 'Cartina non ancora scelta.'));
  }
  // copia di un evento passato: stesse ore, data spostata al prossimo giorno della stessa settimana (da domani in poi)
  function copiaEvento(src) {
    var x = JSON.parse(JSON.stringify(src)); delete x.id; delete x.vincitore; delete x.provaDa;
    if (src.inizio && !src.prova) {
      var d = new Date(src.inizio), o = new Date(), g = new Date(o.getFullYear(), o.getMonth(), o.getDate() + 1);
      while (g.getDay() !== d.getDay()) g.setDate(g.getDate() + 1);
      var ini = new Date(g.getFullYear(), g.getMonth(), g.getDate(), d.getHours(), d.getMinutes()).getTime(), sp = ini - src.inizio;
      x.inizio = ini; if (src.ritrovo) x.ritrovo = src.ritrovo + sp; if (src.fine) x.fine = src.fine + sp;
    }
    return x;
  }
  // tendina in cima a un evento nuovo: "parti da uno gia' fatto"
  function sceltaCopia(lista, pag) {
    var el0 = lista.filter(function (x) { return !x.prova; }).sort(function (a, b) { return (b.inizio || 0) - (a.inizio || 0); }).slice(0, 25);
    if (!el0.length) return null;
    var s0 = select([['', '— parti da zero —']].concat(el0.map(function (x) { return [x.id, (x.inizio ? dataBreve(x.inizio) + ' · ' : '') + (x.titolo || 'Evento')]; })), '');
    s0.onchange = function () { if (s0.value) sostituisci(pag, { copia: s0.value }); };
    var k = el('div', 'carta copia-da'); k.appendChild(campoForm('⧉ Copia da un evento passato', s0));
    k.appendChild(el('small', 'hint', 'Ricopia tutto (luogo, cartina, team, argomenti…): poi cambi solo la data.'));
    return k;
  }
  function pagAllenamentoModifica(id) {
    var daCopiare = id && id.copia ? D.allenamenti.filter(function (x) { return x.id === id.copia; })[0] : null; if (id && id.copia) id = null;
    var vecchio = D.allenamenti.filter(function (x) { return x.id === id; })[0];
    testata(vecchio ? 'Modifica allenamento' : daCopiare ? 'Nuovo allenamento (copia)' : 'Nuovo allenamento');
    if (!P('allenamenti')) { app.appendChild(el('p', 'hint', 'Non disponibile.')); return; }
    if (!vecchio && !daCopiare) { var sc0 = sceltaCopia(D.allenamenti, 'allenamentoModifica'); if (sc0) app.appendChild(sc0); }
    if (daCopiare) app.appendChild(el('p', 'hint avviso', 'Copia di «' + (daCopiare.titolo || 'Allenamento') + '» del ' + dataBreve(daCopiare.inizio) + '. Controlla la data e salva.'));
    var g7 = mezzanotte(Date.now() + 7 * GIORNO);
    var a = vecchio ? JSON.parse(JSON.stringify(vecchio)) : daCopiare ? copiaEvento(daCopiare) : { titolo: 'Allenamento', luogo: '', mapsUrl: '', ritrovo: g7 + 8.5 * 3600000, inizio: g7 + 9 * 3600000, fine: g7 + 12.5 * 3600000, parcheggio: { testo: '', mapsUrl: '' }, campo: D.campi.length === 1 ? D.campi[0].id : '', team: [], argomenti: [] };
    var f = el('div', 'modulo'); app.appendChild(f);
    var tit = el('input'); tit.value = a.titolo || ''; f.appendChild(campoForm('Titolo', tit));
    var dt = el('input'); dt.type = 'date'; dt.value = locale(a.inizio || Date.now()).slice(0, 10); f.appendChild(campoForm('Data', dt));
    function oraI(ms) { var i = el('input'); i.type = 'time'; i.value = ms ? ora(ms) : ''; return i; }
    var hR = oraI(a.ritrovo), hI = oraI(a.inizio), hF = oraI(a.fine), tre = el('div', 'tre');
    tre.appendChild(campoForm('Ritrovo', hR)); tre.appendChild(campoForm('Inizio', hI)); tre.appendChild(campoForm('Fine', hF)); f.appendChild(tre);
    var lg = el('input'); lg.value = a.luogo || ''; f.appendChild(campoForm('Luogo', lg));
    var mu = el('input'); mu.value = a.mapsUrl || ''; mu.placeholder = 'Link Google Maps (facoltativo)'; f.appendChild(campoForm('Link del luogo', mu));
    var pT = el('textarea'); pT.rows = 2; pT.value = (a.parcheggio || {}).testo || ''; f.appendChild(campoForm('Parcheggio', pT));
    var pU = el('input'); pU.value = (a.parcheggio || {}).mapsUrl || ''; pU.placeholder = 'Link Google Maps del parcheggio'; f.appendChild(campoForm('Link del parcheggio', pU));
    f.appendChild(el('h3', 'sez', 'Chi lo vede'));
    var tl = el('div', 'chips');
    D.team.forEach(function (t) {
      var b = bottone(t.nome, 'chip' + (a.team.indexOf(t.id) >= 0 ? ' on verde' : ''), function () {
        var i = a.team.indexOf(t.id); if (i >= 0) a.team.splice(i, 1); else a.team.push(t.id);
        b.className = 'btn chip' + (a.team.indexOf(t.id) >= 0 ? ' on verde' : '');
      });
      tl.appendChild(b);
    });
    f.appendChild(tl);
    f.appendChild(el('h3', 'sez', 'Cartina e argomenti'));
    var cSel = select([['', '— nessuna —']].concat(D.campi.map(function (x) { return [x.id, x.nome]; })), a.campo || '');
    f.appendChild(campoForm('Cartina', cSel));
    var aBox = el('div', 'modulo'); f.appendChild(aBox);
    function disegnaArg() {
      aBox.innerHTML = '';
      var cm = campoMeta(cSel.value), zone = cm ? perCategoria(cm, 'allenamento').punti : [];
      if (cm && !zone.length) aBox.appendChild(el('p', 'hint avviso', 'Nella cartina nessuna area è segnata per l\'allenamento (editor → area → «Usata in»).'));
      a.argomenti.forEach(function (g, i) {
        var k = el('div', 'all-ed');
        var t = el('input'); t.value = g.titolo || ''; t.placeholder = 'es. Bonifica di un edificio'; t.oninput = function () { g.titolo = t.value; };
        var z = select([['', 'Zona: —']].concat(zone.map(function (p) { return [p.id, p.nome]; })), g.area || ''); z.onchange = function () { g.area = z.value || null; };
        var d = el('input'); d.value = g.descrizione || ''; d.placeholder = 'Nota (facoltativa)'; d.oninput = function () { g.descrizione = d.value; };
        var h = el('div', 'ed-riga'); h.appendChild(el('b', 'all-n', String(i + 1))); h.appendChild(t);
        h.appendChild(bottone('✕', 'icon', function () { a.argomenti.splice(i, 1); disegnaArg(); }));
        k.appendChild(h); k.appendChild(z); k.appendChild(d); aBox.appendChild(k);
      });
      aBox.appendChild(bottone('+ Aggiungi argomento', 'link', function () { a.argomenti.push({ titolo: '', area: null, descrizione: '' }); disegnaArg(); }));
    }
    cSel.onchange = disegnaArg; disegnaArg();
    var az = el('div', 'riga2 fisso');
    az.appendChild(bottone('Salva', 'accent big', function () {
      if (!dt.value || !hI.value) { toast('Servono data e ora di inizio'); return; }
      if (!a.team.length) { toast('Scegli almeno un team'); return; }
      function ms(h) { return h ? new Date(dt.value + 'T' + h).getTime() : null; }
      var out = { id: a.id, titolo: tit.value.trim() || 'Allenamento', luogo: lg.value.trim(), mapsUrl: mu.value.trim(),
        ritrovo: ms(hR.value), inizio: ms(hI.value), fine: ms(hF.value) || ms(hI.value) + 3 * 3600000,
        parcheggio: { testo: pT.value.trim(), mapsUrl: pU.value.trim() }, campo: cSel.value, team: a.team,
        argomenti: a.argomenti.filter(function (g) { return (g.titolo || '').trim(); }).map(function (g) { return { titolo: g.titolo.trim(), area: g.area || null, descrizione: (g.descrizione || '').trim() }; }) };
      S.salvaAllenamento(out).then(function (nid) { toast('Allenamento salvato'); if (vecchio) indietro(); else sostituisci('allenamento', nid); }, errore);
    }));
    if (vecchio) az.appendChild(bottone('Elimina', 'pericolo', function () { if (confirm('Eliminare l\'allenamento?')) S.eliminaAllenamento(vecchio.id).then(function () { tornaIndietro(2); }, errore); }));
    app.appendChild(az);
  }
  // prima / in corso / concluso; senza orario di fine vale fino a fine giornata
  function faseAll(a, now) {
    now = now || Date.now();
    var fine = a.fine || (a.inizio ? new Date(a.inizio).setHours(23, 59, 59, 999) : 0);
    if (fine && now >= fine) return 'finito';
    if (a.inizio && now >= a.inizio) return 'live';
    return 'prima';
  }
  function cartaAllenamento(a) {
    var k = el('button', 'carta promemoria verde'); k.type = 'button';
    var fa = faseAll(a), testa = el('div', 'pm-testa');
    if (fa === 'finito') return cartaConclusa('Allenamento', a, '', P('allenamenti') ? function () { vai('allenamento', a.id); } : null);
    testa.appendChild(el('span', 'pm-eti', fa === 'finito' ? 'ALLENAMENTO CONCLUSO' : fa === 'live' ? '● ALLENAMENTO IN CORSO' : 'ALLENAMENTO'));
    if (a.inizio && fa === 'prima') testa.appendChild(el('span', 'pm-tra', traQuanto(a.inizio))); k.appendChild(testa);
    k.appendChild(el('h3', null, a.titolo || 'Allenamento'));
    if (a.inizio) k.appendChild(el('div', 'pm-data', dataBreve(a.inizio)));
    var orari = el('div', 'pm-orari');
    [['RITROVO', a.ritrovo], ['INIZIO', a.inizio], ['FINE', a.fine]].forEach(function (o) { if (!o[1]) return; var d = el('div'); d.appendChild(el('small', null, o[0])); d.appendChild(el('b', null, ora(o[1]))); orari.appendChild(d); });
    k.appendChild(orari);
    k.appendChild(el('div', 'pm-luogo', '⌖ ' + (a.luogo || 'Luogo da definire')));
    if (window.AC_METEO && fa !== 'finito') k.appendChild(AC_METEO.riquadro(a));
    k.appendChild(el('span', 'pm-apri', 'Tocca per mappa e argomenti ›'));
    if (a.annullato) { k.classList.add('annullato'); k.appendChild(timbroAnnullato(a)); }
    k.onclick = function () { vai('allenamento', a.id); };
    return k;
  }
  // timbro rosso "EVENTO ANNULLATO" sopra la carta (con il motivo, se c'è)
  function timbroAnnullato(a) {
    var t = el('div', 'timbro'); t.appendChild(el('span', null, 'EVENTO')); t.appendChild(el('span', null, 'ANNULLATO'));
    if (a.motivo) t.appendChild(el('small', null, a.motivo));
    return t;
  }


  // ================= RUOLI E PERMESSI (solo developer)
  function pagPermessi() {
    testata('Ruoli e permessi');
    if (!S.stato().dev) { app.appendChild(el('p', 'hint', 'Solo il developer può modificare i permessi.')); return; }
    var tab = S.permessi();
    S.RUOLI.forEach(function (r) { tab[r[0]] = tab[r[0]] || {}; });
    app.appendChild(el('p', 'hint', 'Tu, come developer, puoi sempre tutto. Spunta cosa può vedere e fare ogni ruolo; il ruolo di ogni giocatore lo scegli da Organizza → Giocatori.'));
    var corte = { organizzatore: 'ORG', comandante: 'COM', caposquadra: 'CAPO', truppa: 'TRUP' };
    var tb = el('div', 'perm');
    var th = el('div', 'perm-riga perm-testa'); th.appendChild(el('span'));
    S.RUOLI.forEach(function (r) { th.appendChild(el('b', null, corte[r[0]])); });
    tb.appendChild(th);
    S.PERMESSI.forEach(function (gr) {
      tb.appendChild(el('h4', 'perm-gruppo', gr[0]));
      gr[1].forEach(function (p) {
        var riga = el('div', 'perm-riga'); riga.appendChild(el('span', null, p[1]));
        S.RUOLI.forEach(function (r) {
          var cb = el('input'); cb.type = 'checkbox'; cb.checked = tab[r[0]][p[0]] === true;
          cb.setAttribute('aria-label', p[1] + ' — ' + r[1]);
          cb.onchange = function () { tab[r[0]][p[0]] = cb.checked; };
          var cell = el('label', 'perm-c'); cell.appendChild(cb); riga.appendChild(cell);
        });
        tb.appendChild(riga);
      });
    });
    app.appendChild(tb);
    var leg = el('p', 'hint', S.RUOLI.map(function (r) { return corte[r[0]] + ' = ' + r[1]; }).join(' · '));
    app.appendChild(leg);
    var az = el('div', 'riga2 fisso');
    az.appendChild(bottone('Salva permessi', 'accent big', function () { S.salvaPermessi(tab).then(function () { toast('Permessi salvati'); indietro(); }, errore); }));
    az.appendChild(bottone('Ripristina predefiniti', '', function () { if (confirm('Tornare ai permessi predefiniti?')) S.salvaPermessi(JSON.parse(JSON.stringify(S.DEFAULT))).then(function () { toast('Ripristinati'); indietro(); }, errore); }));
    app.appendChild(az);
  }


  var PRIMA = [[null, 'Subito'], [1, '1 giorno prima'], [2, '2 giorni prima'], [3, '3 giorni prima'], [5, '5 giorni prima'], [7, '7 giorni prima'], [0, 'Solo il giorno del conflict']];
  function pagConflittoModifica(cid) {
    var daCopiare = cid && cid.copia ? D.conflitti.filter(function (x) { return x.id === cid.copia; })[0] : null; if (cid && cid.copia) cid = null;
    var vecchio = D.conflitti.filter(function (x) { return x.id === cid; })[0];
    testata(vecchio ? 'Modifica conflict' : daCopiare ? 'Nuovo conflict (copia)' : 'Nuovo conflict');
    if (!vecchio && !daCopiare) { var sc0 = sceltaCopia(D.conflitti, 'conflittoModifica'); if (sc0) app.appendChild(sc0); }
    if (daCopiare) app.appendChild(el('p', 'hint avviso', 'Copia di «' + (daCopiare.titolo || 'Conflict') + '» del ' + dataBreve(daCopiare.inizio) + '. Controlla la data e salva.'));
    var c = vecchio ? JSON.parse(JSON.stringify(vecchio)) : daCopiare ? Object.assign(copiaEvento(daCopiare), { id: S.nuovoId() }) : {
      id: S.nuovoId(), titolo: '', luogo: '', mapsUrl: '', campo: D.campi.length === 1 ? D.campi[0].id : '',
      inizio: mezzanotte(Date.now() + 7 * GIORNO) + 9.5 * 3600000, fine: mezzanotte(Date.now() + 7 * GIORNO) + 13 * 3600000, ritrovo: mezzanotte(Date.now() + 7 * GIORNO) + 8.5 * 3600000,
      fazioni: [{ id: 'blu', nome: 'Blu', team: [] }, { id: 'rossa', nome: 'Rossa', team: [] }], comandanti: { blu: 'ia', rossa: 'ia' },
      mappaDa: null, parcheggio: { testo: '', mapsUrl: '', da: null }
    };
    var form = el('div', 'modulo'); app.appendChild(form);
    var tit = el('input'); tit.value = c.titolo; tit.placeholder = 'es. Operazione Valle Nera'; form.appendChild(campoForm('Titolo', tit));
    var lg = el('input'); lg.value = c.luogo || ''; lg.placeholder = 'es. Campo Tauri, Giaveno'; form.appendChild(campoForm('Luogo', lg));
    var mu = el('input'); mu.value = c.mapsUrl || ''; mu.placeholder = 'Link Google Maps (facoltativo)'; form.appendChild(campoForm('Link del luogo', mu));
    // prova: sempre in corso, con i giocatori scelti uno per uno
    var provaL = el('label', 'spunta prova-flag'), provaI = el('input'); provaI.type = 'checkbox'; provaI.checked = !!c.prova;
    provaL.appendChild(provaI); provaL.appendChild(el('span', null, 'Prova: sempre in corso, invito io i giocatori'));
    form.appendChild(provaL);
    var provaNota = el('p', 'hint', 'Per provare le dinamiche: la partita è sempre attiva (riparte da sola ogni 4 ore, o quando la fai ripartire tu). La vedono solo gli organizzatori e i giocatori che scegli qui sotto.'); form.appendChild(provaNota);
    var dataBox = el('div'); form.appendChild(dataBox);
    var dt = el('input'); dt.type = 'date'; dt.value = locale(c.inizio).slice(0, 10); dataBox.appendChild(campoForm('Data', dt));
    var tre = el('div', 'tre');
    function oraInput(ms) { var i = el('input'); i.type = 'time'; i.value = ms ? ora(ms) : ''; return i; }
    var hR = oraInput(c.ritrovo), hI = oraInput(c.inizio), hF = oraInput(c.fine);
    tre.appendChild(campoForm('Ritrovo', hR)); tre.appendChild(campoForm('Inizio', hI)); tre.appendChild(campoForm('Fine', hF));
    dataBox.appendChild(tre);
    // tipo: conflict tra fazioni (più team) o addestramento (un team diviso in attacco e difesa)
    var modo = c.modo || 'fazioni';
    var segM = el('div', 'seg seg-largo');
    [['fazioni', 'Conflict tra fazioni'], ['addestramento', 'Addestramento']].forEach(function (o) {
      var b = bottone(o[1], 'seg-b' + (modo === o[0] ? ' on' : ''));
      b.onclick = function () {
        modo = o[0]; Array.prototype.forEach.call(segM.children, function (x) { x.classList.remove('on'); }); b.classList.add('on');
        if (modo === 'addestramento') {
          if (nB.value === 'Blu') nB.value = 'Attacco'; if (nR.value === 'Rossa') nR.value = 'Difesa';
          if (!partenza.rossa.length) { partenza.rossa = difesaTutto(); partenza.blu = []; }
        } else { if (nB.value === 'Attacco') nB.value = 'Blu'; if (nR.value === 'Difesa') nR.value = 'Rossa'; }
        mostraModo(); disegnaBasi(); aggiornaComandanti();
      };
      segM.appendChild(b);
    });
    form.appendChild(campoForm('Tipo di giocata', segM));
    var notaM = el('p', 'hint'); form.appendChild(notaM);
    // campo: cartina, basi di partenza, punti già tenuti all'inizio
    form.appendChild(el('h3', 'sez', 'Campo'));
    var cSel = select([['', '— scegli la cartina —']].concat(D.campi.map(function (x) { return [x.id, x.nome]; })), campoMeta(c.campo) ? c.campo : '');
    form.appendChild(campoForm('Cartina', cSel));
    var mobBox = el('div', 'modulo'); form.appendChild(mobBox);
    var base = { blu: c.fazioni[0].mob, rossa: c.fazioni[1].mob }, partenza = { blu: (c.fazioni[0].partenza || []).slice(), rossa: (c.fazioni[1].partenza || []).slice() };
    function disegnaBasi() {
      mobBox.innerHTML = '';
      var cm = campoMeta(cSel.value, 'conflict');
      if (!cm) { mobBox.appendChild(el('p', 'hint', D.campi.length ? 'Scegli la cartina del campo.' : 'Nessuna cartina: creala da Organizza → Cartine (da computer).')); return; }
      if (!cm.geo) mobBox.appendChild(el('p', 'hint avviso', 'Questa cartina non è georeferenziata: il GPS non potrà riconoscere le aree.'));
      var mobs = (cm.punti || []).filter(function (p) { return p.tipo === 'mob'; }), altri = (cm.punti || []).filter(function (p) { return p.tipo !== 'mob'; });
      var mB = mobs.filter(function (p) { return p.fazione === 'blu'; })[0], mR = mobs.filter(function (p) { return p.fazione === 'rossa'; })[0];
      if (mB && mR) {
        // le basi principali sono già assegnate alle fazioni nella cartina
        base.blu = mB.id; base.rossa = mR.id;
        var info = el('div', 'basi-info');
        [['blu', mB], ['rossa', mR]].forEach(function (x) {
          var r = el('div', 'basi-r s-' + x[0]); r.appendChild(el('b', null, '⚑ ' + nomeArea(x[1], x[0])));
          info.appendChild(r);
        });
        mobBox.appendChild(campoForm('Basi dalla cartina', info));
      } else {
        // cartina vecchia, senza fazione sulle basi: si sceglie qui
        if (mobs.length < 2) { mobBox.appendChild(el('p', 'hint avviso', 'Nella cartina serve una base principale (MOB) per ogni fazione.')); return; }
        if (!mobs.some(function (p) { return p.id === base.blu; })) base.blu = mobs[0].id;
        if (!mobs.some(function (p) { return p.id === base.rossa; }) || base.rossa === base.blu) base.rossa = (mobs.filter(function (p) { return p.id !== base.blu; })[0] || mobs[1]).id;
        var due = el('div', 'due');
        [['blu', 'Base blu'], ['rossa', 'Base rossa']].forEach(function (x) {
          var s2 = select(mobs.map(function (p) { return [p.id, p.nome]; }), base[x[0]]);
          s2.onchange = function () { base[x[0]] = s2.value; };
          due.appendChild(campoForm(x[1], s2));
        });
        mobBox.appendChild(due);
      }
      [['blu', 'La fazione blu parte già con'], ['rossa', 'La fazione rossa parte già con']].forEach(function (x) {
        var w = el('div', 'chips'); w.appendChild(el('span', 'chips-tit', x[1]));
        altri.forEach(function (p) {
          var on = partenza[x[0]].indexOf(p.id) >= 0, b = bottone((p.tipo === 'chiave' ? '★ ' : '') + nomeArea(p, x[0]), 'chip' + (on ? ' on s-' + x[0] : ''));
          b.onclick = function () {
            var i = partenza[x[0]].indexOf(p.id); if (i >= 0) partenza[x[0]].splice(i, 1); else { partenza[x[0]].push(p.id); var alt = x[0] === 'blu' ? 'rossa' : 'blu', j = partenza[alt].indexOf(p.id); if (j >= 0) partenza[alt].splice(j, 1); }
            disegnaBasi();
          };
          w.appendChild(b);
        });
        mobBox.appendChild(w);
      });
    }
    function nomeArea(p, f) { return (p.nomi && p.nomi[f]) || p.nome; }
    function difesaTutto() { var cm0 = campoMeta(cSel.value, 'conflict'); return ((cm0 && cm0.punti) || []).filter(function (p) { return p.tipo !== 'mob'; }).map(function (p) { return p.id; }); }
    cSel.onchange = function () { partenza = { blu: [], rossa: modo === 'addestramento' ? difesaTutto() : [] }; disegnaBasi(); };
    disegnaBasi();
    // fazioni e team
    form.appendChild(el('h3', 'sez', 'Fazioni'));
    var nomi = el('div', 'due');
    var nB = el('input'); nB.value = c.fazioni[0].nome; var nR = el('input'); nR.value = c.fazioni[1].nome;
    nomi.appendChild(campoForm('Fazione blu', nB)); nomi.appendChild(campoForm('Fazione rossa', nR));
    form.appendChild(nomi);
    var hintF = el('p', 'hint', 'Scegli per ogni team da che parte gioca. I team senza fazione non sono invitati.'); form.appendChild(hintF);
    var scelta = {};
    c.fazioni.forEach(function (f) { (f.team || []).forEach(function (t) { scelta[t] = f.id; }); });
    var tBox = el('div', 't-lista'); form.appendChild(tBox);
    D.team.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); }).forEach(function (t) {
      var r = el('div', 't-riga'); r.appendChild(logo(t, 30)); r.appendChild(el('span', null, t.nome));
      var seg = el('div', 'seg');
      [['blu', 'Blu'], ['rossa', 'Rossa'], ['', '—']].forEach(function (o) {
        var b = bottone(o[1], 'seg-b' + ((scelta[t.id] || '') === o[0] ? ' on' : '') + (o[0] ? ' s-' + o[0] : ''));
        b.onclick = function () { scelta[t.id] = o[0] || undefined; Array.prototype.forEach.call(seg.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); aggiornaComandanti(); };
        seg.appendChild(b);
      });
      r.appendChild(seg); tBox.appendChild(r);
    });
    if (!D.team.length) tBox.appendChild(el('p', 'hint', 'Crea prima i team da Organizza.'));
    // prova: giocatori scelti uno per uno, ognuno con la sua fazione
    var pvBox = el('div', 'modulo'); form.appendChild(pvBox);
    var pvFaz = c.prova ? JSON.parse(JSON.stringify(c.fazioneUtente || {})) : {}, tutti = [];
    function disegnaInvitati() {
      pvBox.innerHTML = '';
      pvBox.appendChild(el('p', 'hint', Object.keys(pvFaz).length + ' invitati. Tocca la fazione accanto a ogni giocatore.'));
      if (!tutti.length) { pvBox.appendChild(el('p', 'hint', 'Caricamento dei giocatori…')); return; }
      var gruppi = D.team.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); }).map(function (t) { return { id: t.id, nome: t.nome }; }).concat([{ id: null, nome: 'Senza team' }]);
      gruppi.forEach(function (g) {
        var dentro = tutti.filter(function (u) { return g.id ? u.team === g.id : !u.team || !teamDi(u.team); });
        if (!dentro.length) return;
        pvBox.appendChild(el('h4', 'sez', g.nome));
        dentro.sort(function (a, b) { return nomeG(a).localeCompare(nomeG(b)); }).forEach(function (u) {
          var r = el('div', 'm-riga'); r.appendChild(el('span', null, conNome(u)));
          var sg = el('div', 'seg');
          [['blu', modo === 'addestramento' ? 'Attacco' : 'Blu'], ['rossa', modo === 'addestramento' ? 'Difesa' : 'Rossa'], ['', '—']].forEach(function (o) {
            var b = bottone(o[1], 'seg-b' + (o[0] ? ' s-' + o[0] : '') + ((pvFaz[u.id] || '') === o[0] ? ' on' : ''));
            b.onclick = function () { if (o[0]) pvFaz[u.id] = o[0]; else delete pvFaz[u.id]; disegnaInvitati(); aggiornaComandanti(); };
            sg.appendChild(b);
          });
          r.appendChild(sg); pvBox.appendChild(r);
        });
      });
    }
    var stopTutti = S.ascoltaUtenti(function (u) { tutti = u; if (provaI.checked) disegnaInvitati(); aggiornaComandanti(); });
    var primaT = chiusura; chiusura = function () { stopTutti(); if (primaT) primaT(); };
    provaI.onchange = function () { mostraModo(); aggiornaComandanti(); };
    // addestramento: un team, ogni giocatore in attacco o in difesa
    var adBox = el('div', 'modulo'); form.appendChild(adBox);
    var tAd = (c.team || [])[0] || (D.team[0] && D.team[0].id) || '';
    var ruolo = {}; Object.keys(c.fazioneUtente || {}).forEach(function (u) { ruolo[u] = c.fazioneUtente[u]; });
    var tSelA = select(D.team.map(function (t) { return [t.id, t.nome]; }), tAd);
    var gBox = el('div', 'm-lista');
    var nDif = el('input'); nDif.type = 'number'; nDif.min = 1; nDif.value = Object.keys(ruolo).length || 3; nDif.style.width = '80px';
    tSelA.onchange = function () { tAd = tSelA.value; ruolo = {}; disegnaRuoli(); aggiornaComandanti(); };
    adBox.appendChild(campoForm('Team che si allena', tSelA));
    var rnd = el('div', 'ed-riga');
    rnd.appendChild(el('span', 'hint', 'Difensori estratti a caso:')); rnd.appendChild(nDif);
    rnd.appendChild(bottone('Estrai', '', function () {
      var m = (membriDi[tAd] || []).map(function (u) { return u.id; }), n = Math.max(1, Math.min(m.length - 1, +nDif.value || 1));
      for (var i = m.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = m[i]; m[i] = m[j]; m[j] = t; }
      ruolo = {}; m.slice(0, n).forEach(function (u) { ruolo[u] = 'rossa'; });
      disegnaRuoli(); aggiornaComandanti();
    }));
    adBox.appendChild(rnd); adBox.appendChild(gBox);
    function disegnaRuoli() {
      gBox.innerHTML = '';
      var m = membriDi[tAd];
      if (!m) { gBox.appendChild(el('p', 'hint', 'Caricamento dei giocatori…')); return; }
      if (!m.length) { gBox.appendChild(el('p', 'hint', 'Il team non ha ancora giocatori.')); return; }
      var nd = m.filter(function (u) { return ruolo[u.id] === 'rossa'; }).length;
      gBox.appendChild(el('p', 'hint', (m.length - nd) + ' in attacco · ' + nd + ' in difesa'));
      m.slice().sort(function (a, b) { return nomeG(a).localeCompare(nomeG(b)); }).forEach(function (u) {
        var r = el('div', 'm-riga'); r.appendChild(el('span', null, nomeG(u)));
        var sg = el('div', 'seg');
        [['blu', 'Attacco'], ['rossa', 'Difesa']].forEach(function (o) {
          var b = bottone(o[1], 'seg-b s-' + o[0] + ((ruolo[u.id] || 'blu') === o[0] ? ' on' : ''));
          b.onclick = function () { if (o[0] === 'rossa') ruolo[u.id] = 'rossa'; else delete ruolo[u.id]; disegnaRuoli(); aggiornaComandanti(); };
          sg.appendChild(b);
        });
        r.appendChild(sg); gBox.appendChild(r);
      });
    }
    function mostraModo() {
      var ad = modo === 'addestramento', pv = provaI.checked;
      tBox.hidden = hintF.hidden = ad || pv; adBox.hidden = !ad || pv;
      dataBox.hidden = pv; provaNota.hidden = !pv; pvBox.hidden = !pv; if (pv) disegnaInvitati();
      if (cmR && cmR.parentNode) cmR.parentNode.hidden = ad && !pv;
      notaM.textContent = ad
        ? 'Un solo team: chi è in attacco gioca con il comandante automatico, i difensori ricevono dal comandante automatico il loro posto sul telefono. La difesa vince se allo scadere l\'attacco non ha preso i punti chiave.'
        : 'Due fazioni, uno o più team per parte.';
    }
    // mortaio: versione scelta da chi organizza (per ora vale nelle prove)
    var morSel = select([['realistico', 'Realistico: deriva, alzo, carica e tavola di tiro'], ['semplice', 'Semplificato: distanza e direzione (costa di più)']], c.mortaio === 'semplice' ? 'semplice' : 'realistico');
    form.appendChild(campoForm('Mortaio', morSel));
    // comandanti
    form.appendChild(el('h3', 'sez', 'Comandanti'));
    var cmB = el('select'), cmR = el('select');
    form.appendChild(campoForm('Comandante blu', cmB)); form.appendChild(campoForm('Comandante rosso', cmR));
    var membriDi = {};
    function aggiornaComandanti() {
      [['blu', cmB], ['rossa', cmR]].forEach(function (x) {
        var id = x[0], s = x[1], val = s.value || (c.comandanti || {})[id] || 'ia';
        s.innerHTML = '';
        var o = el('option', null, 'Automatico (IA)'); o.value = 'ia'; s.appendChild(o);
        if (provaI.checked) {
          tutti.filter(function (u) { return pvFaz[u.id] === id; }).forEach(function (u) { var q = el('option', null, conNome(u)); q.value = u.id; s.appendChild(q); });
          s.value = val; if (!s.value) s.value = 'ia'; return;
        }
        var tt = modo === 'addestramento' ? (id === 'blu' ? [tAd] : []) : Object.keys(scelta).filter(function (t) { return scelta[t] === id; });
        tt.forEach(function (t) {
          (membriDi[t] || []).filter(function (u) { return modo !== 'addestramento' || !ruolo[u.id]; }).slice().sort(function (a, b) { return (b.ruolo === 'comandante') - (a.ruolo === 'comandante'); }).forEach(function (u) {
            var q = el('option', null, (u.ruolo === 'comandante' ? '★ ' : '') + conNome(u) + ' (' + (teamDi(t) || {}).nome + ')'); q.value = u.id; s.appendChild(q);
          });
        });
        s.value = val; if (!s.value) s.value = 'ia';
      });
    }
    aggiornaComandanti(); mostraModo(); disegnaRuoli();
    Promise.all(D.team.map(function (t) { return S.leggiMembri(t.id).then(function (m) { membriDi[t.id] = m; }); })).then(function () { aggiornaComandanti(); disegnaRuoli(); });
    // cartina e parcheggio
    form.appendChild(el('h3', 'sez', 'Cartina e parcheggio'));
    function giorniPrima(da) { if (da == null) return ''; var g = Math.round((mezzanotte(c.inizio) - mezzanotte(da)) / GIORNO); return String(g); }
    var mSel = select(PRIMA.map(function (p) { return [p[0] == null ? '' : String(p[0]), p[1]]; }), giorniPrima(c.mappaDa));
    form.appendChild(campoForm('La cartina del campo si vede', mSel));
    var pk = c.parcheggio || {};
    var pT = el('textarea'); pT.rows = 3; pT.value = pk.testo || ''; pT.placeholder = 'es. Parcheggio sterrato dopo la sbarra, lasciare libero il passo carraio';
    form.appendChild(campoForm('Indicazioni per il parcheggio', pT));
    var pU = el('input'); pU.value = pk.mapsUrl || ''; pU.placeholder = 'Link Google Maps del parcheggio'; form.appendChild(campoForm('Link del parcheggio', pU));
    var pSel = select(PRIMA.map(function (p) { return [p[0] == null ? '' : String(p[0]), p[1]]; }), giorniPrima(pk.da));
    form.appendChild(campoForm('Le indicazioni si vedono', pSel));

    var az = el('div', 'riga2 fisso');
    az.appendChild(bottone('Salva', 'accent big', function () {
      if (!tit.value.trim()) { toast('Serve un titolo'); return; }
      var pv = provaI.checked;
      if (!pv && (!dt.value || !hI.value || !hF.value)) { toast('Servono data, inizio e fine'); return; }
      function ms(h) { return h ? new Date(dt.value + 'T' + h).getTime() : null; }
      var ini = ms(hI.value), fin = ms(hF.value); if (fin <= ini) fin += GIORNO;
      // prova: sempre in corso (per le regole del database vale un anno da quando è creata)
      if (pv) { ini = vecchio && vecchio.prova ? vecchio.inizio : Date.now(); fin = ini + 365 * GIORNO; }
      var team = [], fazioneDi = {}, fazioneUtente = {}, nomiGioc = {}, invitati = [];
      if (pv) {
        invitati = Object.keys(pvFaz);
        if (!invitati.length) { toast('Invita almeno un giocatore'); return; }
        if (modo === 'addestramento' && !invitati.some(function (u) { return pvFaz[u] === 'rossa'; })) { toast('Serve almeno un difensore'); return; }
        fazioneUtente = pvFaz;
        invitati.forEach(function (u) { var x = tutti.filter(function (y) { return y.id === u; })[0]; nomiGioc[u] = nomeG(x); });
      } else if (modo === 'addestramento') {
        var mm = membriDi[tAd] || [], dif = mm.filter(function (u) { return ruolo[u.id] === 'rossa'; });
        if (!tAd) { toast('Scegli il team'); return; }
        if (!dif.length || dif.length === mm.length) { toast('Servono giocatori sia in attacco sia in difesa'); return; }
        team = [tAd]; fazioneDi[tAd] = 'blu'; fazioneUtente = {}; nomiGioc = {};
        dif.forEach(function (u) { fazioneUtente[u.id] = 'rossa'; });
        mm.forEach(function (u) { nomiGioc[u.id] = nomeG(u); });
      } else Object.keys(scelta).forEach(function (t) { if (scelta[t]) { team.push(t); fazioneDi[t] = scelta[t]; } });
      var cmS = campoMeta(cSel.value, 'conflict');
      if (!cmS) { toast('Scegli la cartina del campo'); return; }
      if ((cmS.punti || []).filter(function (p) { return p.tipo === 'mob'; }).length < 2 || base.blu === base.rossa) { toast('Servono due basi di partenza diverse'); return; }
      var out = {
        id: c.id, titolo: tit.value.trim(), luogo: lg.value.trim(), mapsUrl: mu.value.trim(), campo: cSel.value,
        ritrovo: pv ? null : ms(hR.value), inizio: ini, fine: fin, prova: pv, provaDa: pv ? (vecchio && vecchio.prova && vecchio.provaDa) || ini : null, invitati: invitati,
        fazioni: [
          { id: 'blu', nome: nB.value.trim() || 'Blu', team: modo === 'addestramento' ? team : team.filter(function (t) { return fazioneDi[t] === 'blu'; }), mob: base.blu, partenza: partenza.blu },
          { id: 'rossa', nome: nR.value.trim() || 'Rossa', team: modo === 'addestramento' ? team : team.filter(function (t) { return fazioneDi[t] === 'rossa'; }), mob: base.rossa, partenza: partenza.rossa }
        ],
        team: team, fazioneDi: fazioneDi, comandanti: { blu: cmB.value || 'ia', rossa: modo === 'addestramento' && !pv ? 'ia' : (cmR.value || 'ia') },
        modo: modo, mortaio: morSel.value, fazioneUtente: fazioneUtente, nomiGioc: nomiGioc,
        mappaDa: pv || mSel.value === '' ? null : mezzanotte(ini) - Number(mSel.value) * GIORNO,
        parcheggio: { testo: pT.value.trim(), mapsUrl: pU.value.trim(), da: pv || pSel.value === '' ? null : mezzanotte(ini) - Number(pSel.value) * GIORNO },
        regole: c.regole || null
      };
      S.salvaConflitto(out).then(function () { toast('Conflict salvato'); if (vecchio) indietro(); else sostituisci('conflitto', out.id); }, errore);
    }));
    if (vecchio) az.appendChild(bottone('Elimina', 'pericolo', function () {
      if (confirm('Eliminare il conflict "' + vecchio.titolo + '"?')) S.eliminaConflitto(vecchio.id).then(function () { tornaIndietro(2); }, errore);
    }));
    app.appendChild(az);
  }

  // ================= PROVA (partita simulata)
  function pagProva(id) {
    var buone = D.campi.filter(function (cm) { return cm.geo && (cm.punti || []).filter(function (p) { return p.tipo === 'mob'; }).length >= 2; });
    if (!id && buone.length !== 1) {
      testata('Prova la mappa di gioco');
      if (!buone.length) { app.appendChild(el('p', 'hint', 'Serve una cartina georeferenziata con due basi di partenza. Si crea da Organizza → Cartine.')); return; }
      app.appendChild(el('p', 'hint', 'Su quale campo vuoi provare?'));
      buone.forEach(function (cm) { var r = el('button', 'riga-lista'); r.type = 'button'; r.appendChild(el('b', null, cm.nome)); r.onclick = function () { sostituisci('prova', cm.id); }; app.appendChild(r); });
      return;
    }
    id = id || buone[0].id;
    var tipoProva = corrente().p2;
    if (!tipoProva) {
      testata('Prova la mappa di gioco');
      app.appendChild(el('p', 'hint', 'Che partita vuoi simulare? Tocca la mappa per spostarti, il tempo va veloce.'));
      [['conflict', 'Conflict tra fazioni', 'Sei nella fazione blu, contro la rossa.'], ['attacco', 'Addestramento: in attacco', 'Attacchi le aree tenute dai difensori.'], ['difesa', 'Addestramento: in difesa', 'Ricevi il tuo posto dal comandante automatico.']].forEach(function (o) {
        var r = el('button', 'riga-lista'); r.type = 'button'; r.appendChild(el('b', null, o[1])); r.appendChild(el('small', null, o[2]));
        r.onclick = function () { pila[pila.length - 1] = { v: 'prova', p: id, p2: o[0] }; mostra(); };
        app.appendChild(r);
      });
      return;
    }
    var p = aPieno();
    var box = el('div', 'pieno-mappa tutta'); p.appendChild(box);
    conCampo(id, box, function (cm) {
      cm = perCategoria(cm, 'conflict');
      var vel = el('div', 'prova-vel'); vel.appendChild(el('b', null, 'PROVA'));
      var pr = F.prova(box, function () { indietro(); }, { presenze: P('presenze'), comandante: P('ordini'), addestramento: tipoProva !== 'conflict', lato: tipoProva === 'difesa' ? 'difesa' : 'attacco' }, cm);
      [1, 10, 30].forEach(function (x) {
        var b = bottone('×' + x, 'piccolo' + (x === 10 ? ' on' : '')); b.onclick = function () { pr.velocita(x); Array.prototype.forEach.call(vel.querySelectorAll('.btn'), function (y) { y.classList.remove('on'); }); b.classList.add('on'); };
        vel.appendChild(b);
      });
      p.appendChild(vel);
      var prima = chiusura; chiusura = function () { pr.chiudi(); if (prima) prima(); };
    });
  }

  // ================= QR: scanner, fogli da stampare, posa sul campo
  var SIMB = { mob: '⚑', chiave: '★', base: '●', torre: '📡' };
  var DESCR = { mob: 'Base principale', chiave: 'Punto chiave', base: 'Punto base', torre: 'Torre radio' };
  function posaConsentita() { var me = S.stato().me || {}; return P('mappe') || (me.posaQrFino || 0) > Date.now(); }
  function urlQr(cm, p, tok) { return location.origin + location.pathname.replace(/index\.html$/, '') + '?qr=' + cm.id + '.' + p.id + '.' + tok; }

  var scan = null;
  function apriScanner(titolo, onCodice) {
    chiudiScanner();
    var ov = el('div', 'scanner'); document.body.appendChild(ov);
    var bar = el('div', 'scan-bar'); bar.appendChild(el('b', null, titolo)); bar.appendChild(bottone('Chiudi', '', chiudiScanner)); ov.appendChild(bar);
    var vb = el('div', 'scan-video'), video = el('video'); video.muted = true; video.setAttribute('playsinline', ''); video.setAttribute('autoplay', '');
    vb.appendChild(video); vb.appendChild(el('span', 'mirino')); ov.appendChild(vb);
    var msg = el('p', 'scan-msg', 'Inquadra il QR del foglio'); ov.appendChild(msg);
    var man = el('form', 'scan-man'), inp = el('input'); inp.placeholder = 'oppure il codice sotto il QR'; inp.maxLength = 8; inp.setAttribute('autocapitalize', 'characters'); inp.autocomplete = 'off';
    var ok = el('button', 'btn accent', 'Invia'); ok.type = 'submit'; man.appendChild(inp); man.appendChild(ok); ov.appendChild(man);
    var sc = scan = { ov: ov, attivo: true, stream: null, occupato: false };
    man.onsubmit = function (e) { e.preventDefault(); if (inp.value.trim()) gestisci(inp.value); };
    function ferma() { sc.attivo = false; if (sc.stream) sc.stream.getTracks().forEach(function (t) { t.stop(); }); }
    function gestisci(t) {
      if (sc.occupato) return; sc.occupato = true; msg.textContent = 'Controllo…';
      Promise.resolve(onCodice(t)).then(esito, function (e) { esito({ ok: false, titolo: 'Errore', testo: e.message || String(e) }); });
    }
    function esito(r) {
      ferma(); if (scan !== sc) return;
      ov.innerHTML = '';
      var e = el('div', 'esito ' + (r.ok ? 'ok' : r.avviso ? 'avviso' : 'ko'));
      e.appendChild(el('span', 'esito-icona', r.ok ? (r.avviso ? '!' : '✓') : '✕'));
      e.appendChild(el('h2', null, r.titolo)); if (r.testo) e.appendChild(el('p', null, r.testo));
      e.appendChild(bottone('OK', 'accent big', chiudiScanner));
      e.appendChild(bottone('Scansiona un altro QR', '', function () { apriScanner(titolo, onCodice); }));
      ov.appendChild(e);
      try { if (navigator.vibrate) navigator.vibrate(r.ok ? 120 : [200, 80, 200]); } catch (x) {}
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = 'Fotocamera non disponibile: scrivi il codice qui sotto.'; return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (st) {
      if (!sc.attivo) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      sc.stream = st; video.srcObject = st; video.play().catch(function () {});
      var cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
      (function giro() {
        if (!sc.attivo || sc.occupato) return;
        if (video.readyState >= 2 && video.videoWidth) {
          var k = Math.min(1, 640 / video.videoWidth);
          cv.width = Math.round(video.videoWidth * k); cv.height = Math.round(video.videoHeight * k);
          cx.drawImage(video, 0, 0, cv.width, cv.height);
          var r = window.jsQR && window.jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
          if (r && r.data) { gestisci(r.data); return; }
        }
        setTimeout(giro, 200);
      })();
    }, function () { msg.textContent = 'Permesso fotocamera negato: scrivi il codice qui sotto.'; });
  }
  function chiudiScanner() {
    if (!scan) return;
    scan.attivo = false; if (scan.stream) scan.stream.getTracks().forEach(function (t) { t.stop(); });
    scan.ov.remove(); scan = null;
  }

  // disegno del QR in SVG (nitido in stampa)
  function svgQr(testo) {
    var m = window.QR.encode(testo, 'M'), q = 4, n = m.size + q * 2, d = '';
    for (var y = 0; y < m.size; y++) for (var x = 0; x < m.size; x++) if (m.get(x, y)) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges"><rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  // ritaglio della cartina attorno all'area, con il cerchio dell'area e il nord in alto
  function ritaglio(cm, p) {
    return new Promise(function (ok) {
      var im = new Image();
      im.onload = function () {
        var mpp = cm.mPerPx || 1, lato = Math.min(Math.max(320 / mpp, 260), Math.max(im.naturalWidth, im.naturalHeight));
        var W = 640, H = 400, sx = lato, sy = lato * H / W;
        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        var x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
        x.drawImage(im, p.x - sx / 2, p.y - sy / 2, sx, sy, 0, 0, W, H);
        var k = W / sx, r = Math.max(12, (p.raggio || 30) / mpp * k);
        x.lineWidth = 5; x.strokeStyle = '#d0021b'; x.beginPath(); x.arc(W / 2, H / 2, r, 0, Math.PI * 2); x.stroke();
        x.lineWidth = 2; x.beginPath(); x.moveTo(W / 2 - 10, H / 2); x.lineTo(W / 2 + 10, H / 2); x.moveTo(W / 2, H / 2 - 10); x.lineTo(W / 2, H / 2 + 10); x.stroke();
        x.fillStyle = '#000'; x.font = 'bold 20px sans-serif'; x.textAlign = 'center'; x.fillText('N ↑', W - 30, 28);
        ok(cv.toDataURL('image/jpeg', 0.85));
      };
      im.onerror = function () { ok(''); };
      im.src = cm.img;
    });
  }
  // numero neutro del QR: non dice il nome dell'area né di che tipo è
  function numeroQr(cm, p) { var i = cm.punti.indexOf(p); if (i < 0) i = cm.punti.map(function (q) { return q.id; }).indexOf(p.id); return 'QR ' + ('0' + (i + 1)).slice(-2); }
  // foglio da consegnare a chi posa: solo QR, numero e dove metterlo
  function foglioQr(cm, p, tok) {
    var f = el('section', 'qr-foglio');
    f.appendChild(el('div', 'qr-testa', 'AIRSOFT CONFLICT · PUNTO DI CONTROLLO'));
    var corpo = el('div', 'qr-corpo'); f.appendChild(corpo);
    var sx = el('div', 'qr-sx'); corpo.appendChild(sx);
    sx.appendChild(el('div', 'qr-nome', numeroQr(cm, p)));
    var q = el('div', 'qr-codice'); q.innerHTML = svgQr(urlQr(cm, p, tok)); sx.appendChild(q);
    sx.appendChild(el('div', 'qr-tok', 'Codice: ' + tok));
    var dx = el('div', 'qr-dx'); corpo.appendChild(dx);
    dx.appendChild(el('h4', null, 'Cos\'è'));
    dx.appendChild(el('p', null, 'Un punto di controllo del gioco. Durante la partita si scansiona con l\'app Airsoft Conflict (tasto «QR»), oppure inquadrandolo con la fotocamera del telefono.'));
    dx.appendChild(el('h4', null, 'Dove va messo'));
    if (p.notaQr) dx.appendChild(el('p', 'qr-nota', p.notaQr));
    if (p.lat != null) dx.appendChild(el('p', 'qr-coo', 'UTM ' + window.AC_MAPPE.utmTesto(p.lat, p.lon) + '\nLat/Lon ' + p.lat.toFixed(5) + ', ' + p.lon.toFixed(5)));
    var im = new Image(); im.className = 'qr-mappa'; im.alt = ''; dx.appendChild(im);
    ritaglio(cm, p).then(function (d) { if (d) im.src = d; else im.remove(); });
    f.appendChild(el('div', 'qr-piede', 'Ben visibile, all\'altezza degli occhi · non spostare e non coprire · cerchio rosso = zona del punto'));
    return f;
  }
  // ultimo foglio, solo per l'organizzatore: cosa c'è dietro ogni numero
  function riepilogoQr(cm, punti, cod) {
    var f = el('section', 'qr-foglio qr-riep');
    f.appendChild(el('div', 'qr-testa', 'RIEPILOGO PER L\'ORGANIZZATORE · ' + cm.nome.toUpperCase() + ' · DA NON CONSEGNARE'));
    var t = el('table', 'qr-tab'), h = el('tr');
    ['QR', 'Area', 'Tipo', 'Nome blu', 'Nome rossi', 'Codice', 'Dove'].forEach(function (x) { h.appendChild(el('th', null, x)); });
    t.appendChild(h);
    punti.forEach(function (p) {
      var r = el('tr');
      [numeroQr(cm, p).replace('QR ', ''), p.nome, DESCR[p.tipo] + (p.fazione ? ' (' + p.fazione + ')' : ''), (p.nomi && p.nomi.blu) || '—', (p.nomi && p.nomi.rossa) || '—', cod[p.id], p.notaQr || (p.lat != null ? window.AC_MAPPE.utmTesto(p.lat, p.lon) : '')]
        .forEach(function (x) { r.appendChild(el('td', null, x)); });
      t.appendChild(r);
    });
    f.appendChild(t);
    return f;
  }
  function pagStampaQr(id) {
    testata('QR da stampare');
    if (!P('mappe')) { app.appendChild(el('p', 'hint', 'Non hai il permesso per le cartine.')); return; }
    conCampo(id, app, function (cm) {
      var box = el('div', 'qr-pagina'); app.appendChild(box);
      box.appendChild(el('p', 'hint', 'Preparo i codici…'));
      var formato = 'a4', conRiep = true;
      function disegna(cod) {
        box.innerHTML = '';
        var ctr = el('div', 'qr-ctr');
        ctr.appendChild(el('p', 'hint', cm.nome + ': ' + cm.punti.length + ' fogli, uno per area, con un numero neutro (QR 01, QR 02…): chi li posa non vede nomi, tipi né fazioni. Stampali, mettili in una bustina trasparente o plastificali e affidali a chi li posa (☰ → «Posa i QR»).'));
        var seg = el('div', 'seg seg-largo');
        [['a4', 'Un foglio A4 per area'], ['a5', 'Due per foglio (A5)']].forEach(function (o) {
          var b = bottone(o[1], 'seg-b' + (formato === o[0] ? ' on' : ''), function () { formato = o[0]; fogli.className = 'qr-fogli ' + formato; Array.prototype.forEach.call(seg.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); });
          seg.appendChild(b);
        });
        ctr.appendChild(seg);
        var lr = el('label', 'ed-chk'), cr = el('input'); cr.type = 'checkbox'; cr.checked = conRiep;
        cr.onchange = function () { conRiep = cr.checked; riep.hidden = !conRiep; };
        lr.appendChild(cr); lr.appendChild(el('span', null, 'Aggiungi in fondo il riepilogo per me (cosa c\'è dietro ogni numero)')); ctr.appendChild(lr);
        var r = el('div', 'riga2');
        r.appendChild(bottone('Stampa', 'accent', function () { document.body.classList.add('stampa-qr'); window.print(); setTimeout(function () { document.body.classList.remove('stampa-qr'); }, 500); }));
        r.appendChild(bottone('Nuovi codici', '', function () {
          if (!confirm('Creare codici nuovi? I fogli già stampati smettono di funzionare e vanno ristampati tutti.')) return;
          S.preparaQr(cm, true).then(disegna, errore);
        }));
        ctr.appendChild(r);
        box.appendChild(ctr);
        var fogli = el('div', 'qr-fogli ' + formato); box.appendChild(fogli);
        cm.punti.forEach(function (p) { fogli.appendChild(foglioQr(cm, p, cod[p.id])); });
        var riep = riepilogoQr(cm, cm.punti, cod); riep.hidden = !conRiep; fogli.appendChild(riep);
      }
      S.preparaQr(cm, false).then(disegna, function (e) {
        box.innerHTML = '';
        if (e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''))) {
          box.appendChild(el('p', 'hint avviso', 'Il database non permette ancora di salvare i codici QR: vanno pubblicate in Firebase le regole aggiornate (Firestore Database → Regole → incolla tutto il file → Pubblica). Poi riapri questa pagina.'));
        } else errore(e);
      });
    });
  }

  // posa dei QR: mappa con la propria posizione, lista delle aree per distanza, scansione di conferma
  function bussola(da, a) {
    var R = 6371000, la = (da.lat + a.lat) / 2 * Math.PI / 180;
    var dx = (a.lon - da.lon) * Math.PI / 180 * Math.cos(la) * R, dy = (a.lat - da.lat) * Math.PI / 180 * R;
    var ang = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360, dir = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(ang / 45) % 8];
    return { m: Math.round(Math.hypot(dx, dy)), dir: dir, ang: ang };
  }
  function pagPosa(id) {
    if (!posaConsentita()) { testata('Posa i QR'); app.appendChild(el('p', 'hint', 'Non sei abilitato a posare i QR.')); return; }
    var conQr = D.campi.filter(function (cm) { return cm.qrHash; });
    if (!id && conQr.length !== 1) {
      testata('Posa i QR');
      if (!conQr.length) { app.appendChild(el('p', 'hint', 'Nessun campo ha ancora i QR: si preparano da Organizza → Cartine → QR.')); return; }
      app.appendChild(el('p', 'hint', 'In quale campo devi posare i QR?'));
      conQr.forEach(function (cm) { var r = el('button', 'riga-lista'); r.type = 'button'; r.appendChild(el('b', null, cm.nome)); r.appendChild(el('small', null, (cm.punti || []).length + ' aree')); r.onclick = function () { sostituisci('posa', cm.id); }; app.appendChild(r); });
      return;
    }
    id = id || conQr[0].id;
    var pg = aPieno(); pg.classList.add('posa');
    var bar = el('div', 'pieno-bar'); bar.appendChild(bottone('‹', 'icon indietro', function () { if (pila.length > 1) indietro(); else sostituisci('home'); }));
    var tit = el('b', null, 'Posa i QR'); bar.appendChild(tit); var cont = el('span', 'posa-cont'); bar.appendChild(cont);
    pg.appendChild(bar);
    var box = el('div', 'pieno-mappa posa-mappa'); pg.appendChild(box);
    var pann = el('div', 'posa-pann'); pg.appendChild(pann);
    conCampo(id, box, function (cm) {
      tit.textContent = 'Posa i QR · ' + cm.nome;
      var g0 = { inizio: Date.now() + 864e5, durata: 60, fazioni: [{ team: 'blu', mob: null, partenza: [] }, { team: 'rossa', mob: null, partenza: [] }] };
      var riservato = !P('mappe');
      function etichetta(p) { return riservato ? numeroQr(cm, p) : (SIMB[p.tipo] || '') + ' ' + p.nome; }
      // chi posa e basta vede solo i numeri: niente nomi, tipi, fazioni né collegamenti
      var cmVista = !riservato ? cm : Object.assign({}, cm, { link: [], punti: cm.punti.map(function (p) { return Object.assign({}, p, { nome: numeroQr(cm, p), tipo: 'base', fazione: null, nomi: null }); }) });
      var v = F.vista(box, { g: g0, campo: cmVista, team: null, colori: COLORI, nomi: {}, ora: Date.now, anteprima: true, mobile: true });
      var mia = null, posati = {}, soloDaPosare = false;
      var watch = navigator.geolocation ? navigator.geolocation.watchPosition(function (p) {
        mia = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }; v.posizione(mia.lat, mia.lon, mia.acc); lista();
      }, function () {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }) : null;
      var stopP = S.ascoltaPosa(cm.id, function (m) { posati = m; lista(); });
      function scansiona() {
        apriScanner('Scansiona il QR appena messo', function (t) {
          return S.leggiQr(cm, t).then(function (r) {
            if (!r.punto) return { ok: false, titolo: 'QR non valido', testo: r.errore };
            var p = r.punto, b = mia && p.lat != null ? bussola(mia, p) : null, me = S.stato().me;
            var dati = { nome: me.callsign || '', uid: S.stato().user.uid, t: Date.now(), lat: mia ? mia.lat : null, lon: mia ? mia.lon : null, dist: b ? b.m : null };
            return S.segnaPosa(cm.id, p.id, dati).then(function () {
              var lontano = b && b.m > Math.max(40, (p.raggio || 30) * 1.5);
              return { ok: true, avviso: lontano, titolo: etichetta(p) + ' posato',
                testo: lontano ? 'Attenzione: secondo il GPS sei a ' + b.m + ' m dal punto previsto (verso ' + b.dir + '). Se il foglio è nel posto giusto va bene così.' : 'Segnato come posato. ' + (b ? 'Sei a ' + b.m + ' m dal centro dell\'area.' : '') };
            });
          });
        });
      }
      function lista() {
        pann.innerHTML = '';
        var n = cm.punti.filter(function (p) { return posati[p.id]; }).length;
        cont.textContent = n + '/' + cm.punti.length;
        var top = el('div', 'posa-top');
        top.appendChild(bottone('📷 Scansiona il QR appena messo', 'accent big', scansiona));
        var chk = el('label', 'ed-chk'), cb = el('input'); cb.type = 'checkbox'; cb.checked = soloDaPosare; cb.onchange = function () { soloDaPosare = cb.checked; lista(); };
        chk.appendChild(cb); chk.appendChild(el('span', null, 'Solo quelli da posare')); top.appendChild(chk);
        pann.appendChild(top);
        if (!mia) pann.appendChild(el('p', 'hint', 'In attesa del GPS per le distanze…'));
        var aree = cm.punti.map(function (p) { return { p: p, b: mia && p.lat != null ? bussola(mia, p) : null }; })
          .filter(function (x) { return !soloDaPosare || !posati[x.p.id]; })
          .sort(function (a, b) { return (posati[a.p.id] ? 1 : 0) - (posati[b.p.id] ? 1 : 0) || (a.b ? a.b.m : 1e9) - (b.b ? b.b.m : 1e9); });
        aree.forEach(function (x) {
          var p = x.p, ps = posati[p.id], r = el('div', 'posa-riga' + (ps ? ' fatto' : ''));
          r.appendChild(el('span', 'posa-stato', ps ? '✓' : riservato ? '●' : (SIMB[p.tipo] || '●')));
          var info = el('div', 'posa-info');
          info.appendChild(el('b', null, riservato ? numeroQr(cm, p) : p.nome));
          info.appendChild(el('small', null, p.notaQr || (riservato ? 'Guarda la mappa e le coordinate sul foglio' : DESCR[p.tipo])));
          if (ps) info.appendChild(el('small', 'ok', 'Posato da ' + (ps.nome || '—') + ' alle ' + ora(ps.t)));
          r.appendChild(info);
          if (x.b) { var d = el('span', 'posa-dist'); var fr = el('i', null, '↑'); fr.style.transform = 'rotate(' + x.b.ang + 'deg)'; d.appendChild(fr); d.appendChild(el('span', null, x.b.m + ' m ' + x.b.dir)); r.appendChild(d); }
          if (ps && P('mappe')) r.appendChild(bottone('✕', 'icon', function () { if (confirm('Segnare ' + etichetta(p) + ' come da posare?')) S.togliPosa(cm.id, p.id).catch(errore); }));
          pann.appendChild(r);
        });
      }
      lista();
      var prima = chiusura; chiusura = function () { stopP(); if (watch != null) navigator.geolocation.clearWatch(watch); v.chiudi(); pg.classList.remove('posa'); if (prima) prima(); };
      if (qrInSospeso) { var t0 = qrInSospeso; qrInSospeso = null; setTimeout(function () { scansionaTesto(t0); }, 300); }
      function scansionaTesto(t) { apriScanner('QR', function () { return S.leggiQr(cm, t).then(function (r) { if (!r.punto) return { ok: false, titolo: 'QR non valido', testo: r.errore }; return S.segnaPosa(cm.id, r.punto.id, { nome: (S.stato().me.callsign || ''), uid: S.stato().user.uid, t: Date.now(), lat: mia ? mia.lat : null, lon: mia ? mia.lon : null, dist: null }).then(function () { return { ok: true, titolo: etichetta(r.punto) + ' posato' }; }); }); }); }
    });
  }
  var qrInSospeso = null;

  // ================= COMBAT A SCENARI (PCS)
  function pagScenario(id) {
    var PC = window.AC_PCS, vecchio = D.scenari.filter(function (x) { return x.id === id; })[0];
    testata(vecchio ? 'Scenario PCS' : 'Nuovo scenario PCS');
    if (!S.stato().dev) { app.appendChild(el('p', 'hint', 'Non disponibile.')); return; }
    var nuovaSk = function () { var o = {}; PC.SKILL.forEach(function (k) { o[k[0]] = 30; }); return o; };
    var sc = vecchio ? JSON.parse(JSON.stringify(vecchio)) : { squadra: '', data: locale(Date.now() + 7 * GIORNO).slice(0, 10), tema: 'auto', campo: '', tappe: [{ settore: 'Settore 1', durata: 45, skill: nuovaSk() }], seme: Math.floor(Math.random() * 1e9) };
    var form = el('div', 'modulo'); app.appendChild(form);
    form.appendChild(el('p', 'hint', 'Indica i settori in ordine e, per ogni tappa, quanto deve pesare ogni abilità. Il resto (storia, obiettivi, punteggi, difensori, materiale) lo genera l\'app. Si stampa e si usa anche senza app.'));
    var sq = el('input'); sq.value = sc.squadra || ''; sq.placeholder = 'es. ASD Tauri – squadra Alfa'; sq.setAttribute('list', 'pcsTeam');
    var dl = el('datalist'); dl.id = 'pcsTeam'; D.team.forEach(function (t) { var o = el('option'); o.value = t.nome; dl.appendChild(o); }); form.appendChild(dl);
    var dt = el('input'); dt.type = 'date'; dt.value = sc.data || '';
    var due = el('div', 'due'); due.appendChild(campoForm('Squadra', sq)); due.appendChild(campoForm('Data', dt)); form.appendChild(due);
    var tema = select(PC.TEMI, sc.tema || 'auto');
    var campoS = select([['', 'Nessuna (settori solo a nome)']].concat(D.campi.map(function (x) { return [x.id, x.nome]; })), sc.campo || '');
    var due2 = el('div', 'due'); due2.appendChild(campoForm('Tema', tema)); due2.appendChild(campoForm('Cartina (facoltativa)', campoS)); form.appendChild(due2);
    form.appendChild(el('h3', 'sez', 'Tappe'));
    var tBox = el('div', 'pcs-tappe'); form.appendChild(tBox);
    function disegnaTappe() {
      tBox.innerHTML = '';
      var cm = campoMeta(campoS.value, 'pcs');
      sc.tappe.forEach(function (t, i) {
        var k = el('div', 'pcs-tappa');
        var h = el('div', 'pcs-th'); h.appendChild(el('b', null, 'Tappa ' + (i + 1)));
        if (i > 0) h.appendChild(bottone('↑', 'icon', function () { var x = sc.tappe.splice(i, 1)[0]; sc.tappe.splice(i - 1, 0, x); disegnaTappe(); }));
        if (sc.tappe.length > 1) h.appendChild(bottone('✕', 'icon', function () { sc.tappe.splice(i, 1); disegnaTappe(); }));
        k.appendChild(h);
        var nome = el('input'); nome.value = t.settore || ''; nome.placeholder = 'es. Settore Baracche'; nome.oninput = function () { t.settore = nome.value; };
        var dur = select([['30', '30 min'], ['45', '45 min'], ['60', '60 min'], ['90', '90 min']], String(t.durata || 45)); dur.onchange = function () { t.durata = +dur.value; };
        var r1 = el('div', 'due'); r1.appendChild(campoForm('Settore', nome)); r1.appendChild(campoForm('Durata', dur)); k.appendChild(r1);
        if (cm) {
          var ar = select([['', '—']].concat((cm.punti || []).map(function (p) { return [p.id, p.nome]; })), t.area || '');
          ar.onchange = function () { t.area = ar.value || null; };
          k.appendChild(campoForm('Area del settore sulla cartina (per le coordinate)', ar));
        }
        var bars = el('div', 'pcs-bars');
        PC.SKILL.forEach(function (s0) {
          var row = el('label', 'pcs-bar'), v = (t.skill || {})[s0[0]] || 0;
          var rg = el('input'); rg.type = 'range'; rg.min = 0; rg.max = 100; rg.step = 5; rg.value = v;
          var val = el('b', null, String(v));
          rg.oninput = function () { t.skill[s0[0]] = +rg.value; val.textContent = rg.value; row.classList.toggle('zero', +rg.value === 0); };
          row.appendChild(el('span', null, s0[1])); row.appendChild(rg); row.appendChild(val);
          if (!v) row.classList.add('zero');
          bars.appendChild(row);
        });
        k.appendChild(bars);
        tBox.appendChild(k);
      });
      tBox.appendChild(bottone('+ Aggiungi tappa', 'link', function () { sc.tappe.push({ settore: 'Settore ' + (sc.tappe.length + 1), durata: 45, skill: nuovaSk() }); disegnaTappe(); }));
    }
    campoS.onchange = function () { sc.campo = campoS.value; disegnaTappe(); };
    disegnaTappe();
    var out = el('div', 'pcs-out'); app.appendChild(out);
    function leggi() {
      sc.squadra = sq.value.trim(); sc.data = dt.value; sc.tema = tema.value; sc.campo = campoS.value;
      sc.tappe.forEach(function (t, i) { if (!t.settore) t.settore = 'Settore ' + (i + 1); });
    }
    function genera(nuovo) { leggi(); if (nuovo) sc.seme = Math.floor(Math.random() * 1e9); sc.gen = PC.genera(sc); mostraDoc(); }
    function mostraDoc() {
      out.innerHTML = '';
      if (!sc.gen) return;
      var cm = campoMeta(sc.campo);
      out.appendChild(el('h3', 'sez', sc.gen.operazione));
      var az = el('div', 'riga2');
      az.appendChild(bottone('Altra versione', '', function () { genera(true); }));
      az.appendChild(bottone('Stampa il book della squadra', 'accent', function () { stampa('book'); }));
      az.appendChild(bottone('Stampa il dossier organizzazione', '', function () { stampa('dossier'); }));
      out.appendChild(az);
      out.appendChild(docBook(sc, cm)); out.appendChild(docDossier(sc, cm));
    }
    function stampa(q) { document.body.classList.add('stampa-pcs'); document.body.setAttribute('data-stampa', q); window.print(); setTimeout(function () { document.body.classList.remove('stampa-pcs'); document.body.removeAttribute('data-stampa'); }, 500); }
    var barra = el('div', 'riga2 fisso');
    var bGen = bottone(sc.gen ? 'Rigenera con queste barre' : 'Genera lo scenario', 'accent big', function () { genera(false); bGen.textContent = 'Rigenera con queste barre'; });
    barra.appendChild(bGen);
    barra.appendChild(bottone('Salva', '', function () {
      leggi(); if (!sc.gen) sc.gen = PC.genera(sc);
      S.salvaScenario(sc).then(function (nid) { sc.id = nid; toast('Scenario salvato'); if (!vecchio) sostituisci('scenario', nid); }, errore);
    }));
    if (vecchio) barra.appendChild(bottone('Elimina', 'pericolo', function () { if (confirm('Eliminare lo scenario?')) S.eliminaScenario(vecchio.id).then(function () { indietro(); }, errore); }));
    app.appendChild(barra);
    if (sc.gen) mostraDoc();
  }
  function coordArea(cm, id) { var p = cm && (cm.punti || []).filter(function (x) { return x.id === id; })[0]; return p && p.lat != null ? window.AC_MAPPE.utmTesto(p.lat, p.lon) : ''; }
  function docBook(sc, cm) {
    var g = sc.gen, d = el('article', 'pcs-doc book');
    var cop = el('header', 'pcs-cop');
    cop.appendChild(el('small', null, 'COMBAT A SCENARI · BOOK DELLA SQUADRA'));
    cop.appendChild(el('h1', null, g.operazione.toUpperCase()));
    cop.appendChild(el('p', null, (sc.squadra || 'Squadra') + (sc.data ? ' · ' + sc.data.split('-').reverse().join('/') : '') + ' · ' + g.tappe.length + ' tappe · ' + g.totale + ' punti in palio'));
    d.appendChild(cop);
    d.appendChild(el('h2', null, 'Prefazione'));
    d.appendChild(el('p', 'pcs-pref', g.prefazione));
    d.appendChild(el('h2', null, 'Regole'));
    var ul = el('ul'); window.AC_PCS.REGOLE.forEach(function (x) { ul.appendChild(el('li', null, x)); }); d.appendChild(ul);
    g.tappe.forEach(function (t) {
      var s = el('section', 'pcs-tap');
      s.appendChild(el('h2', null, 'Tappa ' + t.n + ' · ' + t.settore));
      var info = t.durata + ' minuti · ' + t.punti + ' punti'; var co = coordArea(cm, t.area); if (co) info += ' · UTM ' + co;
      s.appendChild(el('p', 'pcs-meta', info));
      s.appendChild(el('p', null, t.briefing));
      t.obiettivi.forEach(function (o) {
        var b = el('div', 'pcs-obj t-' + o.tipo);
        var h = el('div', 'pcs-obj-h'); h.appendChild(el('span', 'pcs-tipo', o.tipo.toUpperCase())); h.appendChild(el('b', null, o.titolo)); h.appendChild(el('span', 'pcs-pt', o.punti + ' pt'));
        b.appendChild(h); b.appendChild(el('p', null, o.testo)); s.appendChild(b);
      });
      d.appendChild(s);
    });
    return d;
  }
  function docDossier(sc, cm) {
    var g = sc.gen, d = el('article', 'pcs-doc dossier');
    var cop = el('header', 'pcs-cop');
    cop.appendChild(el('small', null, 'DOSSIER ORGANIZZAZIONE · NON CONSEGNARE ALLA SQUADRA'));
    cop.appendChild(el('h1', null, g.operazione.toUpperCase()));
    cop.appendChild(el('p', null, (sc.squadra || 'Squadra') + ' · nemico: ' + g.nemico));
    d.appendChild(cop);
    g.tappe.forEach(function (t) {
      var s = el('section', 'pcs-tap');
      var co = coordArea(cm, t.area);
      s.appendChild(el('h2', null, 'Tappa ' + t.n + ' · ' + t.settore + (co ? ' · UTM ' + co : '')));
      s.appendChild(el('h3', null, 'Difensori (' + t.difensori.length + ')'));
      var tb = el('table', 'pcs-tab'), h = el('tr'); ['Ruolo', 'Dove', 'Compito'].forEach(function (x) { h.appendChild(el('th', null, x)); }); tb.appendChild(h);
      t.difensori.forEach(function (x) { var r = el('tr'); [x.ruolo, x.posizione, x.compito].forEach(function (y) { r.appendChild(el('td', null, y)); }); tb.appendChild(r); });
      s.appendChild(tb);
      s.appendChild(el('h3', null, 'Obiettivi: come si verificano'));
      var to = el('table', 'pcs-tab'), h2 = el('tr'); ['Obiettivo', 'Verifica', 'Soluzione', 'Punti', 'Fatto'].forEach(function (x) { h2.appendChild(el('th', null, x)); }); to.appendChild(h2);
      t.obiettivi.forEach(function (o) {
        var r = el('tr'); [o.tipo.toUpperCase() + ' · ' + o.titolo + ' (' + o.skillNome + ', liv. ' + o.livello + ')', o.verifica, o.soluzione || '—', String(o.punti), ''].forEach(function (y) { r.appendChild(el('td', null, y)); });
        to.appendChild(r);
      });
      var rt = el('tr', 'pcs-tot'); ['Totale tappa', '', '', String(t.punti), ''].forEach(function (y) { rt.appendChild(el('td', null, y)); }); to.appendChild(rt);
      s.appendChild(to);
      if (t.materiale.length) {
        s.appendChild(el('h3', null, 'Materiale da preparare'));
        var ul = el('ul', 'pcs-check'); t.materiale.forEach(function (m) { ul.appendChild(el('li', null, '☐ ' + m)); }); s.appendChild(ul);
      }
      d.appendChild(s);
    });
    d.appendChild(el('p', 'pcs-meta', 'Totale scenario: ' + g.totale + ' punti · tempo previsto: ' + g.tappe.reduce(function (a, t) { return a + t.durata; }, 0) + ' minuti più gli spostamenti.'));
    return d;
  }

  // ================= MAGLIA RADIO
  var VIETATE = [[433.05, 434.79, 'LPD'], [446.0, 446.2, 'PMR446']];
  var TONI = { ctcss: { blu: '88.5', rossa: '110.9' }, dcs: { blu: 'D125N', rossa: 'D243N' } };
  function testoTono(r) { return !r || !r.tono ? '' : (r.tipoTono === 'dcs' ? 'DCS ' + r.tono : 'CTCSS ' + r.tono + ' Hz'); }
  function fmtF(f) { return f == null || isNaN(f) ? '—' : f.toFixed(4); }
  function vietata(f) { var v = VIETATE.filter(function (r) { return f >= r[0] - 1e-6 && f <= r[1] + 1e-6; })[0]; return v ? v[2] : null; }
  // reti di una fazione: comando + una rete per squadra (o per team se non ha squadre)
  function retiFazione(c, faz, membriDi) {
    var reti = [{ id: 'cmd', nome: 'Comando', tipo: 'comando', team: null, squadra: null }];
    var teams = addestramento(c) ? c.team || [] : ((c.fazioni || []).filter(function (f) { return f.id === faz; })[0] || {}).team || [];
    teams.forEach(function (tid) {
      var t = teamDi(tid) || { nome: 'Team', squadre: [] }, sq = t.squadre || [];
      var membri = (membriDi[tid] || []).filter(function (u) { return !addestramento(c) || (((c.fazioneUtente || {})[u.id]) || 'blu') === faz; });
      if (!sq.length) reti.push({ id: tid, nome: t.nome, tipo: 'squadra', team: tid, squadra: null, candidati: membri });
      else sq.forEach(function (q) {
        var m = membri.filter(function (u) { return u.squadra === q.id; });
        if (addestramento(c) && !m.length) return;
        reti.push({ id: tid + '_' + q.id, nome: t.nome + ' · ' + q.nome, tipo: 'squadra', team: tid, squadra: q.id, candidati: m.length ? m : membri });
      });
    });
    return reti;
  }
  function pagRadio(cid) {
    var c = D.conflitti.filter(function (x) { return x.id === cid; })[0];
    testata('Maglia radio');
    if (!c || !P('conflitti')) { app.appendChild(el('p', 'hint', 'Non disponibile.')); return; }
    var f0 = el('div', 'modulo'); app.appendChild(f0);
    f0.appendChild(el('p', 'hint', c.titolo + ' · ogni fazione vede solo la sua maglia; il canale di sicurezza lo vedono tutti.'));
    var base = el('input'); base.value = '432.5375'; base.inputMode = 'decimal';
    var passo = select([['12.5', '12,5 kHz'], ['25', '25 kHz']], '12.5');
    var dist = select([['1', 'Un passo'], ['2', 'Due passi (consigliato)'], ['4', 'Quattro passi']], '2');
    var toni = select([['no', 'Nessuno'], ['ctcss', 'CTCSS, uno per fazione'], ['dcs', 'DCS, uno per fazione']], 'no');
    var comune = select([['si', 'Sì'], ['no', 'No']], 'si');
    var due = el('div', 'due'); due.appendChild(campoForm('Frequenza di partenza (MHz)', base)); due.appendChild(campoForm('Passo di canalizzazione', passo)); f0.appendChild(due);
    var due2 = el('div', 'due'); due2.appendChild(campoForm('Distanza tra una rete e l\'altra', dist)); due2.appendChild(campoForm('Toni (facoltativi)', toni)); f0.appendChild(due2);
    var tB = el('input'), tR = el('input'), dueT = el('div', 'due'), tLab = campoForm('Codice ' + nomeFaz(c, 'blu'), tB), tLab2 = campoForm('Codice ' + nomeFaz(c, 'rossa'), tR);
    dueT.appendChild(tLab); dueT.appendChild(tLab2); f0.appendChild(dueT);
    function mostraToni() { dueT.hidden = toni.value === 'no'; if (toni.value !== 'no') { tB.value = TONI[toni.value].blu; tR.value = TONI[toni.value].rossa; } }
    toni.onchange = mostraToni; mostraToni();
    f0.appendChild(campoForm('Canale comune di sicurezza (emergenze, feriti, stop gioco)', comune));
    var nomB = el('input'), nomR = el('input'); nomB.value = addestramento(c) ? 'Lupo' : 'Aquila'; nomR.value = addestramento(c) ? 'Orso' : 'Volpe';
    var due3 = el('div', 'due'); due3.appendChild(campoForm('Nominativo ' + nomeFaz(c, 'blu'), nomB)); due3.appendChild(campoForm('Nominativo ' + nomeFaz(c, 'rossa'), nomR)); f0.appendChild(due3);
    f0.appendChild(el('p', 'hint', 'Le frequenze restano fuori da LPD (433,050–434,790) e PMR446. Nota: 430–440 MHz è banda radioamatoriale, in Italia serve la patente con nominativo.'));
    var avvisi = el('div', 'radio-avvisi'), tab = el('div', 'radio-ed'); 
    f0.appendChild(bottone('Genera la maglia', 'accent', function () { genera(); }));
    f0.appendChild(avvisi); f0.appendChild(tab);
    var membriDi = {}, piano = null;
    function genera() {
      var f = parseFloat(String(base.value).replace(',', '.')), st = parseFloat(passo.value) / 1000, sep = +dist.value, k = 0;
      if (!(f > 30 && f < 3000)) { toast('Frequenza di partenza non valida'); return; }
      function fr(i) { return Math.round((f + i * st) * 10000) / 10000; }
      function prossima() { while (vietata(fr(k))) k++; var x = fr(k); k += sep; return x; }
      var vecchio = piano;
      piano = { comune: comune.value === 'si' ? { nome: 'Sicurezza / organizzazione', f: prossima(), nota: 'Solo emergenze, feriti e stop gioco. Lo ascoltano tutti.' } : null };
      k += 8 * sep;
      ['blu', 'rossa'].forEach(function (faz, iF) {
        var nom = (iF ? nomR : nomB).value.trim() || nomeFaz(c, faz), reti = retiFazione(c, faz, membriDi);
        reti.forEach(function (r, i) { r.nominativo = r.tipo === 'comando' ? nom + ' 6' : nom + ' ' + i; r.p = prossima(); });
        reti.forEach(function (r) { r.a = prossima(); });
        reti.forEach(function (r) {
          r.tipoTono = toni.value === 'no' ? null : toni.value;
          r.tono = toni.value === 'no' ? null : ((faz === 'blu' ? tB : tR).value.trim() || TONI[toni.value][faz]);
          var cand = r.candidati || [], vr = vecchio && vecchio[faz] && vecchio[faz].reti.filter(function (x) { return x.id === r.id; })[0], vecchi = (vr && vr.marconisti) || [];
          r.marconisti = [vecchi[0] || (cand[0] && cand[0].id) || null, vecchi[1] || (cand[1] && cand[1].id) || null];
        });
        piano[faz] = { fazione: faz, nome: nomeFaz(c, faz), nominativo: nom, reti: reti };
        k += 12 * sep;
      });
      disegna();
    }
    function nomeU(uid) { var u = null; Object.keys(membriDi).forEach(function (t) { (membriDi[t] || []).forEach(function (x) { if (x.id === uid) u = x; }); }); return u ? nomeG(u) : ''; }
    function controlla() {
      var tutte = [], out = [];
      if (piano.comune) tutte.push([piano.comune.f, 'Sicurezza']);
      ['blu', 'rossa'].forEach(function (faz) { (piano[faz] ? piano[faz].reti : []).forEach(function (r) { tutte.push([r.p, piano[faz].nome + ' ' + r.nome + ' (P)']); tutte.push([r.a, piano[faz].nome + ' ' + r.nome + ' (A)']); }); });
      tutte.forEach(function (x, i) {
        var v = vietata(x[0]); if (v) out.push(x[1] + ': ' + fmtF(x[0]) + ' è nella banda ' + v);
        tutte.slice(i + 1).forEach(function (y) { if (Math.abs(x[0] - y[0]) < 1e-6) out.push('Stessa frequenza per ' + x[1] + ' e ' + y[1]); });
      });
      ['blu', 'rossa'].forEach(function (faz) { (piano[faz] ? piano[faz].reti : []).forEach(function (r) { if (r.tipo === 'squadra' && (!r.marconisti[0] || !r.marconisti[1])) out.push(piano[faz].nome + ' · ' + r.nome + ': mancano i due marconisti'); }); });
      return out;
    }
    function disegna() {
      tab.innerHTML = '';
      if (!piano) return;
      if (piano.comune) {
        var k0 = el('div', 'radio-faz comune'); k0.appendChild(el('h4', null, '⚠ ' + piano.comune.nome));
        var r0 = el('div', 'radio-riga'); var i0 = el('input'); i0.value = fmtF(piano.comune.f); i0.onchange = function () { piano.comune.f = parseFloat(i0.value.replace(',', '.')); aggiornaAvvisi(); };
        r0.appendChild(el('span', null, 'Frequenza')); r0.appendChild(i0); k0.appendChild(r0); tab.appendChild(k0);
      }
      ['blu', 'rossa'].forEach(function (faz) {
        var P0 = piano[faz]; if (!P0) return;
        var k = el('div', 'radio-faz s-' + faz); k.appendChild(el('h4', null, P0.nome + ' · nominativo «' + P0.nominativo + '»' + (P0.reti[0].tono ? ' · ' + testoTono(P0.reti[0]) : '')));
        P0.reti.forEach(function (r) {
          var b = el('div', 'radio-rete');
          b.appendChild(el('b', null, r.nome + ' — «' + r.nominativo + '»'));
          var fr = el('div', 'radio-riga');
          ['p', 'a'].forEach(function (x) {
            var i = el('input'); i.value = fmtF(r[x]); i.onchange = function () { r[x] = parseFloat(i.value.replace(',', '.')); aggiornaAvvisi(); };
            fr.appendChild(el('span', null, x === 'p' ? 'Primaria' : 'Alternativa')); fr.appendChild(i);
          });
          b.appendChild(fr);
          if (r.tipo === 'squadra') {
            var mr = el('div', 'radio-riga');
            [0, 1].forEach(function (j) {
              var sel = select([['', '—']].concat((r.candidati || []).map(function (u) { return [u.id, nomeG(u)]; })), r.marconisti[j] || '');
              sel.onchange = function () { r.marconisti[j] = sel.value || null; aggiornaAvvisi(); };
              mr.appendChild(el('span', null, 'Marconista ' + (j + 1))); mr.appendChild(sel);
            });
            b.appendChild(mr);
          } else b.appendChild(el('small', 'hint', 'HQ e tutti i marconisti delle squadre. Qui passa solo ciò che deve sapere tutta la fazione.'));
          k.appendChild(b);
        });
        tab.appendChild(k);
      });
      aggiornaAvvisi();
      var sv = el('div', 'riga2 fisso');
      sv.appendChild(bottone('Salva la maglia radio', 'accent big', function () {
        var out = { comune: piano.comune };
        ['blu', 'rossa'].forEach(function (faz) {
          var P0 = piano[faz]; if (!P0) return;
          out[faz] = { fazione: faz, nome: P0.nome, nominativo: P0.nominativo, reti: P0.reti.map(function (r) {
            return { id: r.id, nome: r.nome, tipo: r.tipo, team: r.team, squadra: r.squadra, nominativo: r.nominativo, p: r.p, a: r.a, tono: r.tono || null, tipoTono: r.tipoTono || null, marconisti: r.marconisti, nomiMarconisti: r.marconisti.map(nomeU) };
          }) };
        });
        S.salvaRadio(c.id, out).then(function () { toast('Maglia radio salvata'); indietro(); }, errore);
      }));
      tab.appendChild(sv);
    }
    function aggiornaAvvisi() {
      avvisi.innerHTML = '';
      controlla().forEach(function (t) { avvisi.appendChild(el('p', 'hint avviso', '! ' + t)); });
    }
    // dati: membri dei team e maglia già salvata
    Promise.all((c.team || []).map(function (t) { return S.leggiMembri(t).then(function (m) { membriDi[t] = m; }); })).then(function () { return S.leggiRadio(c.id); }).then(function (r) {
      if (r.blu || r.rossa || r.comune) {
        piano = { comune: r.comune };
        ['blu', 'rossa'].forEach(function (faz) {
          if (!r[faz]) return;
          var nuove = retiFazione(c, faz, membriDi);
          piano[faz] = Object.assign({}, r[faz], { reti: r[faz].reti.map(function (x) { var n = nuove.filter(function (y) { return y.id === x.id; })[0]; return Object.assign({}, x, { candidati: n ? n.candidati : [] }); }) });
        });
        if (r.blu) nomB.value = r.blu.nominativo; if (r.rossa) nomR.value = r.rossa.nominativo;
        var r0 = (r.blu || r.rossa || { reti: [] }).reti[0];
        if (r0 && r0.tono) { toni.value = r0.tipoTono || 'ctcss'; mostraToni(); if (r.blu && r.blu.reti[0]) tB.value = r.blu.reti[0].tono; if (r.rossa && r.rossa.reti[0]) tR.value = r.rossa.reti[0].tono; }
        if (r.comune) comune.value = 'si';
        disegna();
      } else genera();
    });
  }
  // maglia radio vista dai giocatori, nella pagina del conflict
  function disegnaRadio(box, c, piano) {
    box.innerHTML = '';
    var me = S.stato().me || {}, uid = S.stato().user.uid;
    var fazioni = ['blu', 'rossa'].filter(function (f) { return piano[f]; });
    if (!piano.comune && !fazioni.length) return;
    box.appendChild(el('h3', 'sez', 'Radio'));
    var card = el('div', 'radio-stampa');
    card.appendChild(el('div', 'radio-tit', 'MAGLIA RADIO · ' + c.titolo.toUpperCase()));
    if (piano.comune) {
      var k = el('div', 'radio-comune');
      k.appendChild(el('b', null, '⚠ ' + piano.comune.nome + ': ' + fmtF(piano.comune.f) + ' MHz'));
      k.appendChild(el('small', null, piano.comune.nota));
      card.appendChild(k);
    }
    fazioni.forEach(function (faz) {
      var P0 = piano[faz], t = el('table', 'radio-tab s-' + faz);
      var cap = el('caption', null, P0.nome + ' · «' + P0.nominativo + '»' + (P0.reti[0] && P0.reti[0].tono ? ' · ' + testoTono(P0.reti[0]) : '')); t.appendChild(cap);
      var h = el('tr'); ['Rete', 'Nominativo', 'Primaria', 'Alternativa', 'Marconisti'].forEach(function (x) { h.appendChild(el('th', null, x)); }); t.appendChild(h);
      P0.reti.forEach(function (r) {
        var mia = r.tipo === 'squadra' && r.team === me.team && (!r.squadra || r.squadra === me.squadra);
        var marc = (r.marconisti || []).indexOf(uid);
        var tr = el('tr', mia || marc >= 0 ? 'mia' : '');
        [(r.tipo === 'comando' ? 'HQ' : r.nome) + (mia ? ' ← la tua' : ''), r.nominativo, fmtF(r.p), fmtF(r.a), r.tipo === 'comando' ? 'HQ + tutti i marconisti' : (r.nomiMarconisti || []).filter(Boolean).join(', ') || '—']
          .forEach(function (x) { tr.appendChild(el('td', null, x)); });
        t.appendChild(tr);
        if (marc >= 0) card.appendChild(el('div', 'radio-tu', 'Sei il marconista n.' + (marc + 1) + ' di ' + r.nome + (marc === 0
          ? ': fisso, sempre in ascolto su rete HQ e canale della squadra. Non ti sposti mai.'
          : ': mobile, stai vicino al team leader e sei tu che vai sul canale di un\'altra squadra quando serve. Se il n.1 cade prendi il suo posto sulla rete HQ.')));
      });
      card.appendChild(t);
    });
    card.appendChild(el('small', 'radio-nota', 'Dentro la squadra: canale della squadra. Per tutta la fazione o per l\'HQ: il marconista sulla rete HQ. Per una sola altra squadra: il marconista n.2 va sul loro canale, chiama con il nominativo, passa il messaggio e torna subito sul suo. Sulla rete HQ parlano solo HQ e marconisti. Se la primaria è disturbata, tutta la rete passa all\'alternativa, su ordine del marconista n.1.'));
    box.appendChild(card);
    box.appendChild(bottone('Stampa la scheda radio', 'piccolo', function () { document.body.classList.add('stampa-radio'); window.print(); setTimeout(function () { document.body.classList.remove('stampa-radio'); }, 500); }));
  }

  // ================= EDITOR DELLE CARTINE (da computer)
  function pagMappa(id) {
    var p = aPieno(); p.classList.add('con-editor');
    var ed = null;
    function apri(cm) {
      ed = window.AC_MAPPE.apri(p, {
        campo: cm,
        onSalva: function (out, img) {
          if (!out.id) out.id = S.nuovoCampoId();
          return S.salvaCampo(out, img).then(function (sv) { toast('Cartina salvata'); return sv; });
        },
        onElimina: function (c2) { return S.eliminaCampo(c2.id, c2.parti).then(function () { toast('Cartina eliminata'); }); },
        onChiudi: function () { indietro(); }
      });
    }
    var prima = chiusura; chiusura = function () { p.classList.remove('con-editor'); if (ed) ed.chiudi(); if (prima) prima(); };
    if (id) conCampo(id, p, apri); else apri(null);
  }


  // ================= AVVIO
  var avviato = false, aperturaFatta = false, stopDmz = null, stopAll = null, stopScen = null, stopCampi = null, stopContatti = null, stopTeam = null, stopConf = null, uidPrima = null;
  // risposte: conflict attivi (chiave = id) e allenamenti in arrivo (chiave = 'a:' + id)
  function allenamentiAttivi() { return D.allenamenti.filter(function (a) { return (a.fine || a.inizio || 0) > Date.now() - 12 * 3600000; }).sort(function (a, b) { return (a.inizio || 0) - (b.inizio || 0); }); }
  function ascoltaAdesioniDi() {
    var voci = attivi().map(function (c) { return [c.id, c.id, 'conflitti']; }).concat(allenamentiAttivi().map(function (a) { return ['a:' + a.id, a.id, 'allenamenti']; }));
    var chiavi = voci.map(function (v) { return v[0]; });
    Object.keys(stopAdesioni).forEach(function (k) { if (chiavi.indexOf(k) < 0) { stopAdesioni[k](); delete stopAdesioni[k]; delete D.adesioni[k]; } });
    voci.forEach(function (v) {
      if (stopAdesioni[v[0]]) return;
      stopAdesioni[v[0]] = S.ascoltaAdesioni(v[1], function (a) { D.adesioni[v[0]] = a; ridisegna(); }, v[2]);
    });
  }
  // ridisegna solo le schermate "statiche" (non la mappa né i moduli in compilazione)
  function ridisegna() {
    var v = corrente().v;
    if (v === 'home' || v === 'organizza' || (v === 'team' && !document.activeElement.matches('input,textarea,select'))) mostra();
    else if (v === 'allenamento' && !app.querySelector('.all-mappa')) mostra();   // appena creato: arriva un attimo dopo
    else if (v === 'conflitto') {
      var c = D.conflitti.filter(function (x) { return x.id === corrente().p; })[0];
      if (!c || (fase(c) !== 'live' && fase(c) !== 'giorno' && !$('pieno').querySelector('.fz'))) mostra();
    }
    aperturaAutomatica();
    setTimeout(chiediRisposte, 600);
  }
  // a ogni apertura: riepilogo degli inviti senza risposta (o con «ricordamelo più tardi») e i tre tasti
  var richiestaFatta = false;
  function chiediRisposte() {
    if (richiestaFatta || corrente().v !== 'home' || !$('foglio').hidden) return;
    var st = S.stato(); if (!st.me || !st.me.team) return;
    var voci = attivi().filter(function (c) { return (c.team || []).indexOf(st.me.team) >= 0 && fase(c) !== 'finito'; }).map(function (c) { return { k: c.id, id: c.id, coll: 'conflitti', x: c }; })
      .concat(allenamentiAttivi().filter(function (a) { return (a.inizio || 0) > Date.now() && !a.annullato && (a.team || []).indexOf(st.me.team) >= 0; }).map(function (a) { return { k: 'a:' + a.id, id: a.id, coll: 'allenamenti', x: a }; }));
    if (voci.some(function (v) { return !D.adesioni[v.k]; })) return;   // aspetta che arrivino tutte le risposte
    var da = voci.filter(function (v) { var r = miaAdesione(v.k); return !r || r.dopo; });
    richiestaFatta = true;
    if (da.length) mostraInvito(da, 0);
  }
  function mostraInvito(lista, i) {
    var v = lista[i], x = v.x, all = v.coll === 'allenamenti';
    apriFoglio(function (f) {
      f.appendChild(el('small', 'eti', all ? 'INVITO · ALLENAMENTO A PORTE CHIUSE' : addestramento(x) ? 'INVITO · ADDESTRAMENTO' : 'INVITO · CONFLICT'));
      f.appendChild(el('h3', null, x.titolo || 'Allenamento'));
      if (x.inizio) f.appendChild(el('p', 'inv-data', dataLunga(x.inizio)));
      var o = el('div', 'pm-orari');
      [['RITROVO', x.ritrovo], ['INIZIO', x.inizio], ['FINE', x.fine]].forEach(function (q) { if (!q[1]) return; var d = el('div'); d.appendChild(el('small', null, q[0])); d.appendChild(el('b', null, ora(q[1]))); o.appendChild(d); });
      f.appendChild(o);
      f.appendChild(el('p', null, '⌖ ' + (x.luogo || 'Luogo da definire')));
      var cosa = all ? ((x.argomenti || []).length ? 'Argomenti: ' + x.argomenti.map(function (g) { return g.titolo; }).join(', ') + '.' : 'Allenamento a porte chiuse.')
        : addestramento(x) ? 'Addestramento: il team si divide in attacco e difesa.' : 'Conflict a fazioni' + (mieFaz(x) ? ': sei con i ' + nomeFaz(x, mieFaz(x)) : '') + '.';
      f.appendChild(el('p', 'inv-cosa', cosa));
      f.appendChild(treRisposte(v.id, v.coll, function () {
        chiudiFoglio();
        if (i + 1 < lista.length) setTimeout(function () { mostraInvito(lista, i + 1); }, 350); else setTimeout(mostra, 250);
      }));
    });
  }
  // il giorno del conflict (o durante la partita) l'app si apre direttamente lì
  function aperturaAutomatica() {
    if (aperturaFatta || pila.length > 1) return;
    var st = S.stato();
    // aperta da un QR: in partita conta come scansione, altrimenti (a chi posa) segna il foglio come posato
    if (qrInSospeso && D.campi.length) {
      var cid = decodeURIComponent(qrInSospeso.match(/[?&]qr=([^&#]+)/)[1]).split('.')[0];
      var live = attivi().filter(function (x) { return !x.prova && fase(x) === 'live' && x.campo === cid && mieFaz(x); })[0];
      if (live) { aperturaFatta = true; vai('conflitto', live.id); return; }
      if (posaConsentita()) { aperturaFatta = true; vai('posa', cid); return; }
      qrInSospeso = null; toast('QR di un\'area: si usa durante la partita');
    }
    var c = attivi().filter(function (x) {
      if (x.prova) return false;
      var f = fase(x); if (f !== 'giorno' && f !== 'live') return false;
      if (P('conflitti')) return true;
      var a = miaAdesione(x.id); return a && a.si;
    })[0];
    if (c) { aperturaFatta = true; vai('conflitto', c.id); }
  }

  S.onStato(function (st) {
    var gate = $('gate');
    $('gate-carico').hidden = st.fase !== 'carico';
    $('gate-login').hidden = st.fase !== 'login';
    $('gate-errore').hidden = st.fase !== 'errore';
    $('gateErrore').textContent = st.errore || '';
    gate.hidden = st.fase === 'pronto';
    $('btnMenu').hidden = st.fase !== 'pronto';
    if (st.fase !== 'pronto') return;
    var uid = st.user.uid, teamOra = (st.me.team || '') + '|' + st.ruolo + '|' + JSON.stringify((S.permessi() || {})[st.ruolo] || {});
    if (uid !== uidPrima || teamOra !== avviato) {
      // nuovo utente o cambio di team: si riparte
      if (uid !== uidPrima) { pila = [{ v: 'home' }]; aperturaFatta = false; }
      uidPrima = uid; avviato = teamOra;
      if (stopTeam) stopTeam(); if (stopConf) stopConf();
      Object.keys(stopAdesioni).forEach(function (id) { stopAdesioni[id](); }); stopAdesioni = {}; D.adesioni = {};
      chiaveTel = null; D.contatti = {}; riascoltaContatti();
      if (stopPriv) stopPriv(); stopPriv = null; D.privati = {};
      if (P('giocatori') || P('conflitti')) stopPriv = S.ascoltaPrivati(function (m) { D.privati = m; nomiCambiati(); });
      if (S.stato().dev && !privacySistemata) { privacySistemata = true; S.sistemaPrivacy().then(function (n) { if (n) toast('Privacy: sistemati ' + n + ' profili'); }, function (e) { console.warn(e); }); }
      if (stopAll) stopAll();
      stopAll = S.ascoltaAllenamenti(function (x) { D.allenamenti = x; ascoltaAdesioniDi(); ridisegna(); });
      if (stopDmz) stopDmz();
      stopDmz = S.ascoltaDmz(function (x) { D.dmz = x; var v = corrente().v; if (v === 'home' || v === 'organizza' || (v === 'dmz' && !app.querySelector('.conf-hero'))) ridisegna(); });
      if (stopScen) stopScen(); stopScen = null;
      if (S.stato().dev) stopScen = S.ascoltaScenari(function (x) { D.scenari = x; if (corrente().v === 'organizza') ridisegna(); });
      if (stopCampi) stopCampi();
      stopCampi = S.ascoltaCampi(function (cm) { D.campi = cm; var v = corrente().v; if (v === 'organizza' || v === 'home') ridisegna(); });
      stopTeam = S.ascoltaTeam(function (t) { D.team = t; riascoltaContatti(); ridisegna(); });
      stopConf = S.ascoltaConflitti(function (c) { D.conflitti = c; ascoltaAdesioniDi(); ridisegna(); });
    }
    riascoltaContatti();
    ridisegna();
  });
  // telefoni dei referenti: secondo la regola scelta dal developer
  var chiaveTel = null, stopPriv = null, privacySistemata = false;
  // dopo una modifica a nome e cognome si ridisegnano le pagine che li mostrano (se non si sta scrivendo)
  function nomiCambiati() {
    var v = corrente().v;
    if (['giocatori', 'team', 'conflitto', 'allenamento'].indexOf(v) < 0) return;
    if (!$('foglio').hidden) { clearTimeout(nomiCambiati.t); nomiCambiati.t = setTimeout(nomiCambiati, 400); return; }
    if (document.activeElement.matches('input,textarea,select')) return;
    if ((v === 'conflitto') && $('pieno').querySelector('.fz')) return;
    mostra();
  }
  function sonoReferente() { var st = S.stato(); return D.team.some(function (t) { return t.referenteUid === st.user.uid; }); }
  function riascoltaContatti() {
    var k = S.vedeTelefoni(sonoReferente()) ? 'si' : 'no';
    if (k === chiaveTel) return; chiaveTel = k;
    if (stopContatti) stopContatti(); stopContatti = null; D.contatti = {};
    if (k === 'si') stopContatti = S.ascoltaContatti(function (m) { D.contatti = m; ridisegna(); }, true);
  }
  $('btnLogin').onclick = function () { S.login().catch(function (e) { if (e && e.code !== 'auth/popup-closed-by-user') toast('Accesso non riuscito: ' + (e.message || e)); }); };
  $('btnRiprova').onclick = function () { location.reload(); };
  $('versione').textContent = 'Airsoft Conflict v' + VERSIONE;
  (function () {
    var m = location.search.match(/[?&]qr=([^&#]+)/);
    if (!m) return;
    qrInSospeso = location.href;
    history.replaceState({ n: 1 }, '', location.pathname);
  })();
  history.replaceState({ n: 1 }, '');
  S.avvia();
  if (!TOOL && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
