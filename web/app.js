/* Softair 4.0 — giocate con obiettivi a finestra e QR sul campo. */
(function () {
  'use strict';

  var VERSIONE = '0.1'; // aggiornare insieme a CACHE in sw.js
  var S = window.S40;
  var $ = function (id) { return document.getElementById(id); };
  var root = $('app');

  var dati = { team: [], giocate: [], catture: [], inviti: {}, membri: [] };
  var schermo = { nome: 'home' };
  var stop = { team: null, giocate: null, catture: null, inviti: null, membri: null };
  var tabAdmin = 'giocate';
  var COLORI = ['#c8b68a', '#b3261e', '#1f6fb2', '#2d8a4e', '#d9822b', '#7b4fb0', '#18a1a1', '#d14d8a'];

  // ---------- utilità
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function btn(label, fn, cls, extra) { return el('button', Object.assign({ type: 'button', class: 'btn ' + (cls || ''), onclick: fn, text: label }, extra || {})); }
  var toastT = null;
  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function errMsg(e) {
    var m = (e && (e.message || e.code)) || String(e);
    if (/permission|insufficient/i.test(m)) return 'permesso negato dal database';
    return m;
  }
  function due(n) { return ('0' + n).slice(-2); }
  function ora(ms) { var d = new Date(ms); return due(d.getHours()) + ':' + due(d.getMinutes()); }
  function giorno(ms) { return new Date(ms).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function conto(ms) {
    ms = Math.max(0, ms); var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return (h ? h + ':' + due(m) : m) + ':' + due(s % 60);
  }
  function team(tid) { return dati.team.filter(function (t) { return t.id === tid; })[0] || { id: tid, nome: 'Team sconosciuto', colore: '#777' }; }
  function me() { return S.stato().me || {}; }
  function admin() { return S.stato().admin; }
  function vai(s) { schermo = s; render(); window.scrollTo(0, 0); }

  // ---------- regole di gioco
  function apre(g, o) { return g.inizio + o.da * 60000; }
  function chiude(g, o) { return g.inizio + o.a * 60000; }
  var TOLLERANZA = 30000; // 30 s di margine per orologi un po' sfasati
  function fase(g, t) { t = t || Date.now(); return t < g.inizio ? 'prima' : t > g.inizio + g.durata * 60000 ? 'finita' : 'corso'; }
  function faseObiettivo(g, o, t) { t = t || Date.now(); return t < apre(g, o) ? 'prossimo' : t > chiude(g, o) ? 'chiuso' : 'attivo'; }
  // chi ha preso cosa: conta l'ora della cattura sul telefono, così valgono anche le catture fatte senza rete
  function calcola(g, catture) {
    var ris = { obiettivi: {}, punti: {} };
    (g.team || []).forEach(function (tid) { ris.punti[tid] = 0; });
    (g.obiettivi || []).forEach(function (o) {
      var valide = catture.filter(function (c) { return c.obiettivo === o.id && c.ora >= apre(g, o) && c.ora <= chiude(g, o) + TOLLERANZA; })
        .sort(function (a, b) { return a.ora - b.ora; });
      var vincitori = [], visti = {};
      valide.forEach(function (c) {
        if (visti[c.team]) return; visti[c.team] = 1;
        if (o.modo === 'ognuno' || !vincitori.length) { vincitori.push(c); ris.punti[c.team] = (ris.punti[c.team] || 0) + (o.punti || 0); }
      });
      ris.obiettivi[o.id] = { vincitori: vincitori, catture: valide };
    });
    return ris;
  }

  // ---------- avvio e dati in tempo reale
  S.onStato(function (st) {
    var g = $('gate');
    ['carico', 'login', 'errore'].forEach(function (f) { $('gate-' + f).hidden = st.fase !== f; });
    if (st.fase === 'errore') $('gateErrore').textContent = st.errore;
    g.hidden = st.fase === 'pronto';
    $('account').hidden = st.fase !== 'pronto';
    if (st.fase !== 'pronto') { ferma(); return; }
    // cambiando account si riparte dalla schermata iniziale, senza i dati del precedente
    var uid = st.user && st.user.uid;
    if (uid !== utenteAttuale) {
      utenteAttuale = uid; ferma();
      dati = { team: [], giocate: [], catture: [], inviti: {}, membri: [] };
      schermo = { nome: 'home' }; tabAdmin = 'giocate';
      if (scan) chiudiScanner();
    }
    avviaAscolti();
    render();
  });
  var teamAscoltato = undefined, utenteAttuale = null;
  function avviaAscolti() {
    if (!stop.team) stop.team = S.ascoltaTeam(function (l) { dati.team = l; render(); });
    if (admin() && !stop.inviti) stop.inviti = S.ascoltaInviti(function (m) { dati.inviti = m; render(); });
    // le giocate visibili dipendono dal team: se cambia, si riascolta
    if (teamAscoltato !== me().team || !stop.giocate) {
      if (stop.giocate) stop.giocate();
      teamAscoltato = me().team;
      stop.giocate = S.ascoltaGiocate(function (l) { dati.giocate = l; render(); });
    }
  }
  function ferma() { Object.keys(stop).forEach(function (k) { if (stop[k]) { stop[k](); stop[k] = null; } }); teamAscoltato = undefined; }
  function ascoltaCatture(gid) {
    if (stop.catture && stop.catture.gid === gid) return;
    if (stop.catture) stop.catture();
    dati.catture = [];
    stop.catture = S.ascoltaCatture(gid, function (l) { dati.catture = l; if (schermo.gid === gid) render(); });
    stop.catture.gid = gid;
  }
  function ascoltaMembri(tid) {
    if (stop.membri && stop.membri.tid === tid) return;
    if (stop.membri) stop.membri();
    dati.membri = [];
    stop.membri = S.ascoltaMembri(tid, function (l) { dati.membri = l; if (schermo.tid === tid) render(); });
    stop.membri.tid = tid;
  }

  // ---------- disegno
  var firma = '';
  function render() {
    if (S.stato().fase !== 'pronto') return;
    root.innerHTML = '';
    var f = { home: vHome, giocata: vGiocata, editor: vEditor, team: vTeam, profilo: vProfilo }[schermo.nome] || vHome;
    f(schermo);
    firma = firmaTempo();
    aggiornaConti();
  }
  // ogni secondo aggiorna i conti alla rovescia; ridisegna tutto solo quando una finestra si apre o si chiude
  function firmaTempo() {
    var g = schermo.gid && giocata(schermo.gid); if (!g) return '';
    return fase(g) + (g.obiettivi || []).map(function (o) { return faseObiettivo(g, o)[0]; }).join('');
  }
  function aggiornaConti() {
    var t = Date.now();
    Array.prototype.forEach.call(document.querySelectorAll('[data-conto]'), function (e) { e.textContent = conto(+e.getAttribute('data-conto') - t); });
  }
  setInterval(function () {
    if (schermo.nome === 'giocata' && firmaTempo() !== firma) render(); else aggiornaConti();
  }, 1000);
  function giocata(gid) { return dati.giocate.filter(function (g) { return g.id === gid; })[0]; }
  function indietro(label, fn) { return el('button', { type: 'button', class: 'back', onclick: fn }, [el('span', { 'aria-hidden': 'true', text: '‹ ' }), label]); }

  // ---------- home
  function vHome() {
    var m = me();
    if (admin()) {
      root.appendChild(el('nav', { class: 'tabs' }, [
        el('button', { type: 'button', class: 'tab', 'aria-pressed': String(tabAdmin === 'giocate'), text: 'Giocate', onclick: function () { tabAdmin = 'giocate'; render(); } }),
        el('button', { type: 'button', class: 'tab', 'aria-pressed': String(tabAdmin === 'team'), text: 'Team', onclick: function () { tabAdmin = 'team'; render(); } })
      ]));
      if (tabAdmin === 'team') return vElencoTeam();
    }
    if (!m.team && !admin()) return vEntra();
    if (m.team) {
      var t = team(m.team);
      root.appendChild(el('div', { class: 'chi' }, [
        el('span', { class: 'pallino', style: 'background:' + t.colore }),
        el('span', null, [el('small', { text: 'Il tuo team' }), el('b', { text: t.nome })]),
        el('button', { type: 'button', class: 'link', text: 'Profilo', onclick: function () { vai({ nome: 'profilo' }); } })
      ]));
    }
    var head = el('div', { class: 'head' }, [el('h2', { text: 'Giocate' })]);
    if (admin()) head.appendChild(btn('+ Nuova giocata', function () { vai({ nome: 'editor' }); }, 'accent'));
    root.appendChild(head);
    var l = dati.giocate.slice().sort(function (a, b) {
      var o = { corso: 0, prima: 1, finita: 2 }; var fa = fase(a), fb = fase(b);
      return o[fa] - o[fb] || (fa === 'finita' ? b.inizio - a.inizio : a.inizio - b.inizio);
    });
    if (!l.length) root.appendChild(el('p', { class: 'vuoto', text: admin() ? 'Nessuna giocata. Tocca "Nuova giocata" per crearne una.' : 'Nessuna giocata in programma per il tuo team.' }));
    l.forEach(function (g) {
      var f = fase(g);
      var stato = f === 'corso' ? el('span', { class: 'stato corso' }, ['● IN CORSO · fine tra ', el('b', { 'data-conto': g.inizio + g.durata * 60000 })])
        : f === 'prima' ? el('span', { class: 'stato' }, [giorno(g.inizio) + ' · ' + ora(g.inizio)])
        : el('span', { class: 'stato finita', text: 'Finita · ' + giorno(g.inizio) });
      root.appendChild(el('button', { type: 'button', class: 'riga', onclick: function () { vai({ nome: 'giocata', gid: g.id, tab: 'obiettivi' }); } }, [
        el('span', { class: 'riga-t' }, [el('b', { text: g.titolo || 'Giocata' }), el('small', { text: (g.luogo ? g.luogo + ' · ' : '') + (g.obiettivi || []).length + ' obiettivi · ' + (g.team || []).length + ' team' }), stato]),
        el('span', { class: 'freccia', 'aria-hidden': 'true', text: '›' })
      ]));
    });
  }
  function vEntra() {
    var inp = el('input', { type: 'text', placeholder: 'Es. K7M2QX', maxlength: 8, autocapitalize: 'characters', autocomplete: 'off', class: 'codice-in', 'aria-label': 'Codice d\'invito' });
    var ok = btn('Entra nel team', function () {
      ok.disabled = true;
      S.entraTeam(inp.value).then(function () { toast('Sei nel team!'); }, function (e) { ok.disabled = false; toast(errMsg(e)); });
    }, 'accent big');
    root.appendChild(el('section', { class: 'card centro' }, [
      el('h2', { text: 'Entra nel tuo team' }),
      el('p', { class: 'hint', text: 'Chiedi all\'organizzatore il codice d\'invito del tuo team e scrivilo qui.' }),
      inp, ok
    ]));
  }
  function vProfilo() {
    var m = me();
    root.appendChild(indietro('Giocate', function () { vai({ nome: 'home' }); }));
    var nome = el('input', { type: 'text' }); nome.value = m.nome || '';
    var cs = el('input', { type: 'text', placeholder: 'Es. Viper' }); cs.value = m.callsign || '';
    root.appendChild(el('section', { class: 'card' }, [
      el('h2', { text: 'Il tuo profilo' }),
      el('label', null, ['Nome', nome]), el('label', null, ['Callsign', cs]),
      el('p', { class: 'hint', text: 'Il callsign compare nella classifica quando prendi un obiettivo.' }),
      btn('Salva', function () { S.aggiornaProfilo({ nome: nome.value.trim(), callsign: cs.value.trim() }).then(function () { toast('Profilo salvato'); vai({ nome: 'home' }); }, function (e) { toast(errMsg(e)); }); }, 'accent')
    ]));
    if (m.team && !admin()) root.appendChild(btn('Esci dal team', function () {
      if (confirm('Uscire dal team ' + team(m.team).nome + '? Per rientrare servirà di nuovo il codice.')) S.togliMembro(m.uid).then(function () { vai({ nome: 'home' }); });
    }, 'link danger'));
  }

  // ---------- team (organizzatore)
  function vElencoTeam() {
    var head = el('div', { class: 'head' }, [el('h2', { text: 'Team' })]);
    root.appendChild(head);
    var nome = el('input', { type: 'text', placeholder: 'Nome del team, es. Tauri Alfa' });
    var colore = COLORI[dati.team.length % COLORI.length];
    var pal = el('div', { class: 'palette' });
    function disegnaPal() {
      pal.innerHTML = '';
      COLORI.forEach(function (c) { pal.appendChild(el('button', { type: 'button', class: 'col' + (c === colore ? ' sel' : ''), style: 'background:' + c, 'aria-label': 'Colore ' + c, onclick: function () { colore = c; disegnaPal(); } })); });
    }
    disegnaPal();
    root.appendChild(el('section', { class: 'card' }, [el('h3', { text: 'Nuovo team' }), nome, pal,
      btn('Crea team', function () {
        if (!nome.value.trim()) { toast('Scrivi il nome del team'); return; }
        S.creaTeam(nome.value.trim(), colore).then(function () { toast('Team creato'); }, function (e) { toast(errMsg(e)); });
      }, 'accent')]));
    if (!dati.team.length) root.appendChild(el('p', { class: 'vuoto', text: 'Nessun team ancora.' }));
    dati.team.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'it'); }).forEach(function (t) {
      root.appendChild(el('button', { type: 'button', class: 'riga', onclick: function () { vai({ nome: 'team', tid: t.id }); } }, [
        el('span', { class: 'pallino grande', style: 'background:' + t.colore }),
        el('span', { class: 'riga-t' }, [el('b', { text: t.nome }), el('small', { text: 'Codice d\'invito: ' + (dati.inviti[t.id] || '…') })]),
        el('span', { class: 'freccia', 'aria-hidden': 'true', text: '›' })
      ]));
    });
    var m = me();
    var mio = el('select', { 'aria-label': 'Il tuo team' }, [el('option', { value: '', text: 'Nessuno (solo organizzatore)' })].concat(dati.team.map(function (t) { return el('option', { value: t.id, text: t.nome }); })));
    mio.value = m.team || '';
    mio.addEventListener('change', function () { S.aggiornaProfilo({ team: mio.value || null, codice: mio.value ? dati.inviti[mio.value] || null : null }).then(function () { toast('Fatto'); }, function (e) { toast(errMsg(e)); }); });
    root.appendChild(el('section', { class: 'card' }, [el('h3', { text: 'Tu giochi con' }), mio,
      el('p', { class: 'hint', text: 'Come organizzatore puoi anche giocare: scegli il tuo team per poter scansionare i QR.' })]));
  }
  function vTeam(s) {
    var t = team(s.tid); ascoltaMembri(s.tid);
    root.appendChild(indietro('Team', function () { vai({ nome: 'home' }); }));
    root.appendChild(el('div', { class: 'titolo' }, [el('span', { class: 'pallino grande', style: 'background:' + t.colore }), el('h2', { text: t.nome })]));
    var cod = dati.inviti[t.id] || '';
    root.appendChild(el('section', { class: 'card centro' }, [
      el('small', { class: 'hint', text: 'CODICE D\'INVITO' }), el('p', { class: 'codice', text: cod || '…' }),
      el('p', { class: 'hint', text: 'Mandalo ai giocatori di questo team: lo scrivono nell\'app al primo accesso.' }),
      navigator.share ? btn('Condividi il codice', function () { navigator.share({ text: 'Entra nel team ' + t.nome + ' su Softair 4.0 con il codice ' + cod }).catch(function () {}); }) : null
    ]));
    var c = el('section', { class: 'card' }, [el('h3', { text: 'Giocatori (' + dati.membri.length + ')' })]);
    if (!dati.membri.length) c.appendChild(el('p', { class: 'hint', text: 'Ancora nessuno.' }));
    dati.membri.forEach(function (u) {
      c.appendChild(el('div', { class: 'membro' }, [
        el('span', null, [el('b', { text: u.callsign ? '“' + u.callsign + '”' : (u.nome || u.email) }), el('small', { text: u.callsign ? (u.nome || u.email) : u.email })]),
        u.uid === me().uid || u.id === me().uid ? null : btn('Togli', function () { if (confirm('Togliere ' + (u.nome || u.email) + ' dal team?')) S.togliMembro(u.id).catch(function (e) { toast(errMsg(e)); }); }, 'link danger')
      ]));
    });
    root.appendChild(c);
  }

  // ---------- giocata
  function vGiocata(s) {
    var g = giocata(s.gid);
    root.appendChild(indietro('Giocate', function () { vai({ nome: 'home' }); }));
    if (!g) { root.appendChild(el('p', { class: 'vuoto', text: 'Giocata non trovata.' })); return; }
    ascoltaCatture(g.id);
    var f = fase(g), ris = calcola(g, dati.catture), m = me();
    var fine = g.inizio + g.durata * 60000;
    root.appendChild(el('div', { class: 'g-head' }, [
      el('h2', { text: g.titolo || 'Giocata' }),
      el('small', { text: giorno(g.inizio) + ' · ' + ora(g.inizio) + '–' + ora(fine) + (g.luogo ? ' · ' + g.luogo : '') })
    ]));
    root.appendChild(el('div', { class: 'orologio ' + f }, f === 'prima' ? [el('small', { text: 'INIZIA TRA' }), el('b', { 'data-conto': g.inizio })]
      : f === 'corso' ? [el('small', { text: 'FINE TRA' }), el('b', { 'data-conto': fine })]
      : [el('b', { text: 'GIOCATA FINITA' })]));
    if (admin()) root.appendChild(el('div', { class: 'riga2' }, [
      btn('Modifica', function () { vai({ nome: 'editor', gid: g.id }); }),
      btn('Stampa QR', function () { stampaQR(g); })
    ]));
    root.appendChild(el('nav', { class: 'tabs' }, [['obiettivi', 'Obiettivi'], ['classifica', 'Classifica']].map(function (x) {
      return el('button', { type: 'button', class: 'tab', 'aria-pressed': String(s.tab === x[0]), text: x[1], onclick: function () { s.tab = x[0]; render(); } });
    })));
    if (s.tab === 'classifica') vClassifica(g, ris); else vObiettivi(g, ris);
    // scanner: solo durante la giocata e per chi è in uno dei team in gioco
    var inGioco = m.team && (g.team || []).indexOf(m.team) >= 0;
    if (f === 'corso' && inGioco) root.appendChild(el('div', { class: 'fab-spazio' }));
    if (f === 'corso' && inGioco) document.body.appendChild(fab(g));
  }
  function fab(g) {
    var vecchio = $('fab'); if (vecchio) vecchio.remove();
    return el('button', { type: 'button', id: 'fab', class: 'fab', onclick: function () { apriScanner(g); } }, [
      '📷  SCANSIONA QR'
    ]);
  }
  function statoPresa(g, o, ris) {
    var r = ris.obiettivi[o.id], m = me();
    if (!r || !r.vincitori.length) return null;
    var mia = r.vincitori.filter(function (c) { return c.team === m.team; })[0];
    if (o.modo === 'ognuno') return el('span', { class: 'presa' + (mia ? ' mia' : '') }, [mia ? '✓ Preso dal tuo team' : 'Preso da ' + r.vincitori.length + ' team']);
    var c = r.vincitori[0], t = team(c.team);
    return el('span', { class: 'presa' + (c.team === m.team ? ' mia' : '') }, [el('i', { class: 'pallino', style: 'background:' + t.colore }), (c.team === m.team ? '✓ Preso dal tuo team' : 'Preso da ' + t.nome) + (c.nome ? ' · ' + c.nome : '') + (c.inAttesa ? ' · in attesa di rete' : '')]);
  }
  function vObiettivi(g, ris) {
    var gruppi = { attivo: [], prossimo: [], chiuso: [] };
    (g.obiettivi || []).forEach(function (o) { gruppi[faseObiettivo(g, o)].push(o); });
    gruppi.attivo.sort(function (a, b) { return a.a - b.a; });
    gruppi.prossimo.sort(function (a, b) { return a.da - b.da; });
    gruppi.chiuso.sort(function (a, b) { return b.a - a.a; });
    [['attivo', 'Adesso'], ['prossimo', 'Prossimi'], ['chiuso', 'Chiusi']].forEach(function (x) {
      var l = gruppi[x[0]]; if (!l.length) return;
      root.appendChild(el('h3', { class: 'sez ' + x[0], text: x[1] + ' (' + l.length + ')' }));
      l.forEach(function (o) {
        var quando = x[0] === 'attivo' ? el('span', { class: 'quando attivo' }, ['chiude tra ', el('b', { 'data-conto': chiude(g, o) })])
          : x[0] === 'prossimo' ? el('span', { class: 'quando' }, ['apre alle ' + ora(apre(g, o)) + ' · tra ', el('b', { 'data-conto': apre(g, o) })])
          : el('span', { class: 'quando', text: 'chiuso alle ' + ora(chiude(g, o)) });
        root.appendChild(el('article', { class: 'obiettivo ' + x[0] }, [
          el('div', { class: 'ob-top' }, [el('b', { text: o.nome }), el('span', { class: 'punti', text: o.punti + ' pt' })]),
          o.dove ? el('p', { text: o.dove }) : null,
          el('div', { class: 'ob-info' }, [quando, el('span', { class: 'modo', text: o.modo === 'ognuno' ? 'ogni team' : 'solo il primo team' })]),
          statoPresa(g, o, ris)
        ]));
      });
    });
    if (!(g.obiettivi || []).length) root.appendChild(el('p', { class: 'vuoto', text: 'Nessun obiettivo.' }));
  }
  function vClassifica(g, ris) {
    var righe = (g.team || []).map(function (tid) { return { t: team(tid), p: ris.punti[tid] || 0 }; }).sort(function (a, b) { return b.p - a.p; });
    var c = el('section', { class: 'card classifica' });
    righe.forEach(function (r, i) {
      c.appendChild(el('div', { class: 'cl-riga' + (r.t.id === me().team ? ' mia' : '') }, [
        el('span', { class: 'pos', text: String(i + 1) }), el('span', { class: 'pallino grande', style: 'background:' + r.t.colore }),
        el('b', { text: r.t.nome }), el('span', { class: 'cl-punti', text: r.p + ' pt' })
      ]));
    });
    root.appendChild(c);
    // registro delle catture valide (all'organizzatore anche quelle fuori tempo, con la possibilità di annullarle)
    var tutte = dati.catture.slice().sort(function (a, b) { return b.ora - a.ora; });
    var valide = {}; Object.keys(ris.obiettivi).forEach(function (k) { ris.obiettivi[k].vincitori.forEach(function (c) { valide[c.id] = 1; }); });
    var lista = el('section', { class: 'card' }, [el('h3', { text: 'Registro' })]);
    var mostrate = tutte.filter(function (c) { return admin() || valide[c.id]; });
    if (!mostrate.length) lista.appendChild(el('p', { class: 'hint', text: 'Ancora nessun obiettivo preso.' }));
    mostrate.forEach(function (c) {
      var o = (g.obiettivi || []).filter(function (x) { return x.id === c.obiettivo; })[0] || { nome: '?' }, t = team(c.team);
      lista.appendChild(el('div', { class: 'reg' + (valide[c.id] ? '' : ' nonvalida') }, [
        el('span', { class: 'reg-ora', text: ora(c.ora) }), el('i', { class: 'pallino', style: 'background:' + t.colore }),
        el('span', { class: 'reg-t' }, [el('b', { text: o.nome }), el('small', { text: t.nome + (c.nome ? ' · ' + c.nome : '') + (valide[c.id] ? '' : ' · non valida') + (c.inAttesa ? ' · in attesa di rete' : '') })]),
        admin() ? btn('Annulla', function () { if (confirm('Annullare questa cattura?')) S.annullaCattura(g.id, c.id).catch(function (e) { toast(errMsg(e)); }); }, 'link danger') : null
      ]));
    });
    root.appendChild(lista);
  }

  // ---------- scanner QR
  var scan = null;
  function apriScanner(g) {
    var ov = $('scanner'); ov.hidden = false;
    $('scanEsito').hidden = true; $('scanVista').hidden = false; $('scanManuale').value = '';
    $('scanMsg').textContent = 'Inquadra il QR dell\'obiettivo';
    scan = { g: g, attivo: true, stream: null };
    var video = $('scanVideo');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('scanMsg').textContent = 'Fotocamera non disponibile: scrivi il codice qui sotto.'; return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (st) {
      if (!scan || !scan.attivo) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      scan.stream = st; video.srcObject = st; video.setAttribute('playsinline', ''); video.play().catch(function () {});
      leggiFotogrammi();
    }, function () { $('scanMsg').textContent = 'Permesso fotocamera negato: scrivi il codice qui sotto.'; });
  }
  function leggiFotogrammi() {
    var video = $('scanVideo'), cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
    (function giro() {
      if (!scan || !scan.attivo) return;
      if (video.readyState >= 2 && video.videoWidth) {
        var k = Math.min(1, 640 / video.videoWidth);
        cv.width = Math.round(video.videoWidth * k); cv.height = Math.round(video.videoHeight * k);
        ctx.drawImage(video, 0, 0, cv.width, cv.height);
        var img = ctx.getImageData(0, 0, cv.width, cv.height);
        var r = window.jsQR && window.jsQR(img.data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
        if (r && r.data) { verifica(r.data); return; }
      }
      setTimeout(giro, 200);
    })();
  }
  function chiudiScanner() {
    if (scan && scan.stream) scan.stream.getTracks().forEach(function (t) { t.stop(); });
    scan = null; $('scanner').hidden = true; $('scanVideo').srcObject = null;
  }
  function mostraEsito(ok, titolo, testo) {
    if (scan) { scan.attivo = false; if (scan.stream) scan.stream.getTracks().forEach(function (t) { t.stop(); }); }
    $('scanVista').hidden = true; $('scanEsito').hidden = false;
    $('scanEsito').className = 'esito ' + (ok ? 'ok' : 'ko');
    $('esitoIcona').textContent = ok ? '✓' : '✕';
    $('esitoTitolo').textContent = titolo; $('esitoTesto').textContent = testo || '';
    if (navigator.vibrate) navigator.vibrate(ok ? [80, 60, 80] : 300);
  }
  // il QR contiene "S40:<giocata>:<codice>"; a mano si può scrivere solo il codice
  function verifica(testo) {
    if (!scan) return;
    var g = scan.g, m = me(), cod = (testo || '').trim();
    var p = cod.split(':');
    if (p[0] === 'S40') { if (p[1] !== g.id) return mostraEsito(false, 'QR di un\'altra giocata', 'Questo codice non appartiene a "' + (g.titolo || 'questa giocata') + '".'); cod = p[2] || ''; }
    S.impronta(g.id, cod).then(function (h) {
      var o = (g.obiettivi || []).filter(function (x) { return x.hash === h; })[0];
      if (!o) return mostraEsito(false, 'Codice non valido', 'Controlla di aver inquadrato il QR giusto o di aver scritto bene il codice.');
      var t = Date.now(), fz = faseObiettivo(g, o, t);
      if (fz === 'prossimo') return mostraEsito(false, o.nome + ': non ancora attivo', 'Apre alle ' + ora(apre(g, o)) + '. Torna più tardi!');
      if (fz === 'chiuso' && t > chiude(g, o) + TOLLERANZA) return mostraEsito(false, o.nome + ': finestra chiusa', 'Era attivo fino alle ' + ora(chiude(g, o)) + '.');
      var r = calcola(g, dati.catture).obiettivi[o.id];
      if (r.catture.some(function (c) { return c.team === m.team; })) return mostraEsito(false, o.nome + ': già preso', 'Il tuo team ha già preso questo obiettivo.');
      if (o.modo !== 'ognuno' && r.vincitori.length) return mostraEsito(false, o.nome + ': già preso', 'Ci è arrivato prima ' + team(r.vincitori[0].team).nome + '.');
      S.registraCattura(g.id, { obiettivo: o.id, team: m.team, uid: m.uid, nome: m.callsign || m.nome || '', ora: t });
      mostraEsito(true, o.nome + ' preso!', '+' + o.punti + ' punti per ' + team(m.team).nome + (navigator.onLine === false ? '. Sei senza rete: la cattura verrà inviata appena torna il segnale.' : '.'));
    });
  }
  $('scanChiudi').onclick = chiudiScanner;
  $('esitoOk').onclick = chiudiScanner;
  $('esitoAncora').onclick = function () { var g = scan ? scan.g : null; chiudiScanner(); if (g) apriScanner(g); };
  $('scanInvia').onclick = function () { var v = $('scanManuale').value; if (v.trim()) verifica(v); };

  // ---------- editor della giocata (organizzatore)
  function vEditor(s) {
    var esist = s.gid && giocata(s.gid);
    if (!s.bozza) {
      if (esist) s.bozza = JSON.parse(JSON.stringify(esist));
      else {
        var d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); d.setHours(9, 30, 0, 0); // prossima domenica alle 9:30
        s.bozza = { id: S.nuovoId(), titolo: '', luogo: '', inizio: d.getTime(), durata: 180, team: dati.team.map(function (t) { return t.id; }), obiettivi: [] };
      }
      s.segreti = null; s.nuovi = {};
      if (esist) S.leggiSegreti(esist.id).then(function (x) { s.segreti = x; }, function () { s.segreti = {}; });
      else s.segreti = {};
    }
    var g = s.bozza;
    root.appendChild(indietro(esist ? 'Giocata' : 'Giocate', function () {
      if (confirm('Uscire senza salvare?')) vai(esist ? { nome: 'giocata', gid: g.id, tab: 'obiettivi' } : { nome: 'home' });
    }));
    root.appendChild(el('h2', { class: 'ed-titolo', text: esist ? 'Modifica giocata' : 'Nuova giocata' }));
    function campo(label, input, cls) { return el('label', { class: cls || '' }, [label, input]); }
    function testo(v, fn, ph) { var i = el('input', { type: 'text', placeholder: ph || '' }); i.value = v || ''; i.addEventListener('input', function () { fn(i.value); }); return i; }
    function numero(v, fn, min) { var i = el('input', { type: 'number', inputmode: 'numeric', min: min == null ? 0 : min }); i.value = v; i.addEventListener('input', function () { fn(parseInt(i.value, 10) || 0); }); return i; }
    var dIn = el('input', { type: 'date' }), oIn = el('input', { type: 'time' });
    var di = new Date(g.inizio); dIn.value = di.getFullYear() + '-' + due(di.getMonth() + 1) + '-' + due(di.getDate()); oIn.value = due(di.getHours()) + ':' + due(di.getMinutes());
    function aggInizio() { if (dIn.value && oIn.value) { var p = dIn.value.split('-'), q = oIn.value.split(':'); g.inizio = new Date(+p[0], +p[1] - 1, +p[2], +q[0], +q[1]).getTime(); } }
    dIn.addEventListener('input', aggInizio); oIn.addEventListener('input', aggInizio);
    root.appendChild(el('section', { class: 'card' }, [
      campo('Titolo', testo(g.titolo, function (v) { g.titolo = v; }, 'Es. Domenica al campo')),
      campo('Campo / luogo', testo(g.luogo, function (v) { g.luogo = v; }, 'Es. Campo Tauri')),
      campo('Giorno', dIn),
      el('div', { class: 'riga2' }, [campo('Inizio', oIn), campo('Durata (min)', numero(g.durata, function (v) { g.durata = v; }, 10))])
    ]));
    var tc = el('section', { class: 'card' }, [el('h3', { text: 'Team in gioco' })]);
    if (!dati.team.length) tc.appendChild(el('p', { class: 'hint', text: 'Crea prima i team nella scheda "Team".' }));
    dati.team.forEach(function (t) {
      var cb = el('input', { type: 'checkbox' }); cb.checked = g.team.indexOf(t.id) >= 0;
      cb.addEventListener('change', function () { g.team = g.team.filter(function (x) { return x !== t.id; }); if (cb.checked) g.team.push(t.id); });
      tc.appendChild(el('label', { class: 'check' }, [cb, el('i', { class: 'pallino', style: 'background:' + t.colore }), t.nome]));
    });
    root.appendChild(tc);

    var oc = el('section', { class: 'card' }, [el('h3', { text: 'Obiettivi (' + g.obiettivi.length + ')' }),
      el('p', { class: 'hint', text: 'Ogni obiettivo è un punto sul campo con il suo QR, attivo solo nella sua finestra di tempo (minuti dall\'inizio).' })]);
    g.obiettivi.forEach(function (o, i) {
      var modo = el('select', null, [el('option', { value: 'primo', text: 'Solo il primo team' }), el('option', { value: 'ognuno', text: 'Ogni team (una volta)' })]);
      modo.value = o.modo || 'primo'; modo.addEventListener('change', function () { o.modo = modo.value; });
      oc.appendChild(el('div', { class: 'ed-ob' }, [
        el('div', { class: 'ed-ob-h' }, [el('b', { text: 'Obiettivo ' + (i + 1) }),
          btn('✕', function () { if (confirm('Eliminare "' + (o.nome || 'obiettivo') + '"?')) { g.obiettivi.splice(i, 1); render(); } }, 'ico danger', { 'aria-label': 'Elimina obiettivo' })]),
        campo('Nome', testo(o.nome, function (v) { o.nome = v; }, 'Es. Bunker Alfa')),
        campo('Dove si trova / cosa fare', testo(o.dove, function (v) { o.dove = v; }, 'Es. Vicino al casolare, lato nord')),
        el('div', { class: 'grid3' }, [
          campo('Punti', numero(o.punti, function (v) { o.punti = v; }, 0)),
          campo('Apre al min.', numero(o.da, function (v) { o.da = v; }, 0)),
          campo('Chiude al min.', numero(o.a, function (v) { o.a = v; }, 1))
        ]),
        campo('Chi prende i punti', modo)
      ]));
    });
    oc.appendChild(btn('+ Aggiungi obiettivo', function () {
      var ultimo = g.obiettivi[g.obiettivi.length - 1];
      var da = ultimo ? Math.min(g.durata - 15, ultimo.da + 20) : 15;
      g.obiettivi.push({ id: 'o' + S.codice(5).toLowerCase(), nome: '', dove: '', punti: 3, da: Math.max(0, da), a: Math.max(0, da) + 15, modo: 'primo' });
      render();
    }));
    root.appendChild(oc);
    if (g.obiettivi.length > 1) {
      var lung = el('input', { type: 'number', min: 5, value: 15, inputmode: 'numeric' });
      root.appendChild(el('section', { class: 'card' }, [el('h3', { text: 'Distribuisci in automatico' }),
        el('p', { class: 'hint', text: 'Spalma le finestre degli obiettivi su tutta la durata della giocata, una dopo l\'altra.' }),
        el('div', { class: 'riga2' }, [el('label', null, ['Minuti di finestra', lung]),
          btn('Distribuisci le finestre', function () {
            var L = Math.max(5, parseInt(lung.value, 10) || 15), n = g.obiettivi.length, spazio = Math.max(0, g.durata - L);
            g.obiettivi.forEach(function (o, k) { o.da = Math.round(n > 1 ? k * spazio / (n - 1) : 0); o.a = o.da + L; });
            render(); toast('Finestre distribuite');
          })])]));
    }
    root.appendChild(el('div', { class: 'riga2 salva' }, [
      esist ? btn('Elimina giocata', function () {
        if (confirm('Eliminare la giocata "' + (g.titolo || '') + '"?')) S.eliminaGiocata(g.id).then(function () { toast('Giocata eliminata'); vai({ nome: 'home' }); }, function (e) { toast(errMsg(e)); });
      }, 'danger') : el('span'),
      btn('Salva giocata', function () { salvaGiocata(s); }, 'accent')
    ]));
  }
  function salvaGiocata(s) {
    var g = s.bozza;
    if (!g.titolo.trim()) { toast('Dai un titolo alla giocata'); return; }
    if (!g.team.length) { toast('Scegli almeno un team'); return; }
    if (s.segreti === null) { toast('Un attimo, sto leggendo i codici…'); return; }
    for (var i = 0; i < g.obiettivi.length; i++) {
      var o = g.obiettivi[i];
      if (!o.nome.trim()) { toast('L\'obiettivo ' + (i + 1) + ' non ha un nome'); return; }
      if (o.a <= o.da) { toast(o.nome + ': la finestra deve chiudere dopo che si apre'); return; }
      if (o.a > g.durata) { toast(o.nome + ': chiude dopo la fine della giocata'); return; }
    }
    // ogni obiettivo ha un codice segreto (stampato nel QR); nel piano della giocata va solo la sua impronta
    var segreti = {};
    g.obiettivi.forEach(function (o) { segreti[o.id] = s.segreti[o.id] || S.codice(6); });
    Promise.all(g.obiettivi.map(function (o) { return S.impronta(g.id, segreti[o.id]).then(function (h) { o.hash = h; }); })).then(function () {
      return S.salvaGiocata(g, segreti);
    }).then(function () { toast('Giocata salvata'); vai({ nome: 'giocata', gid: g.id, tab: 'obiettivi' }); }, function (e) { toast('Errore: ' + errMsg(e)); });
  }

  // ---------- stampa dei QR (A4, 4 per pagina)
  function qrCanvas(text, px) {
    var m = QR.encode(text, 'M'), q = 4, n = m.size + q * 2, cv = document.createElement('canvas');
    var s = Math.ceil(px / n); cv.width = cv.height = n * s;
    var c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = '#000';
    for (var y = 0; y < m.size; y++) for (var x = 0; x < m.size; x++) if (m.get(x, y)) c.fillRect((x + q) * s, (y + q) * s, s, s);
    return cv;
  }
  function stampaQR(g) {
    S.leggiSegreti(g.id).then(function (seg) {
      var box = $('stampa'); box.innerHTML = '';
      box.appendChild(el('div', { class: 'stampa-bar' }, [
        btn('‹ Chiudi', function () { box.hidden = true; document.body.classList.remove('in-stampa'); }),
        btn('Stampa / salva PDF', function () { window.print(); }, 'accent')
      ]));
      var foglio = null;
      (g.obiettivi || []).forEach(function (o, i) {
        if (i % 4 === 0) { foglio = el('div', { class: 'foglio' }); box.appendChild(foglio); }
        var cod = seg[o.id] || '??????';
        var img = el('img', { alt: 'QR ' + o.nome, src: qrCanvas('S40:' + g.id + ':' + cod, 600).toDataURL('image/png') });
        foglio.appendChild(el('div', { class: 'etichetta' }, [
          el('div', { class: 'et-top' }, [el('b', { text: 'SOFTAIR 4.0' }), el('span', { text: g.titolo || '' })]),
          img,
          el('div', { class: 'et-nome', text: o.nome }),
          el('div', { class: 'et-cod', text: 'Codice: ' + cod }),
          el('div', { class: 'et-info', text: 'Attivo ' + ora(apre(g, o)) + '–' + ora(chiude(g, o)) + ' · ' + o.punti + ' pt' })
        ]));
      });
      box.hidden = false; document.body.classList.add('in-stampa'); window.scrollTo(0, 0);
    }, function (e) { toast(errMsg(e)); });
  }

  // ---------- account
  $('btnLogin').onclick = function () { S.login().catch(function (e) { if (e && e.code !== 'auth/popup-closed-by-user') toast(errMsg(e)); }); };
  $('account').onclick = function () {
    var st = S.stato();
    if (confirm('Connesso come ' + ((st.user && st.user.email) || '') + '.\n\nVuoi uscire?')) S.logout();
  };
  $('btnRiprova').onclick = function () { location.reload(); };
  $('versione').textContent = 'versione ' + VERSIONE;

  // il fab dello scanner esiste solo nella schermata della giocata
  var renderBase = render;
  render = function () { var f = $('fab'); if (f) f.remove(); renderBase(); };

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  S.avvia();
})();
