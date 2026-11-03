/* Airsoft Conflict — interfaccia.
   Schermate: codice invito · promemoria · pagina del conflict (settimana / giorno / partita) · team · organizzazione. */
(function () {
  'use strict';

  var VERSIONE = '0.24';
  var S = window.S40, F = window.S40F;
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
    var r = { home: home, conflitto: pagConflitto, team: pagTeam, teamModifica: pagTeamModifica, profilo: pagProfilo, organizza: pagOrganizza, allenamento: pagAllenamento, allenamentoModifica: pagAllenamentoModifica, radio: pagRadio, scenario: pagScenario, stampaQr: pagStampaQr, posa: pagPosa, giocatori: pagGiocatori, permessi: pagPermessi, mappa: pagMappa, conflittoModifica: pagConflittoModifica, prova: pagProva, dmz: pagDmz, dmzModifica: pagDmzModifica, dmzLive: pagDmzLive, mortaioProva: pagMortaioProva }[c.v];
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

  function menu() {
    var st = S.stato(), me = st.me || {};
    apriFoglio(function (f) {
      var chi = el('div', 'menu-chi');
      chi.appendChild(el('b', null, me.callsign || me.nome || (st.user && st.user.email) || ''));
      var t = teamDi(me.team); chi.appendChild(el('small', null, (t ? t.nome : 'Nessun team') + ' · ' + S.nomeRuolo(st.ruolo)));
      f.appendChild(chi);
      var voci = [];
      if (me.team) voci.push(['Il mio team', function () { vai('team', me.team); }]);
      voci.push(['Profilo', function () { vai('profilo'); }]);
      if (posaConsentita()) voci.push(['Posa i QR sul campo', function () { vai('posa'); }]);
      if (P('prova')) voci.push(['Prova la mappa di gioco', function () { vai('prova'); }]);
      if (organizza()) voci.push(['Organizza', function () { vai('organizza'); }]);
      voci.push(['Esci', function () { S.logout(); }]);
      voci.forEach(function (v) {
        var b = bottone(v[0], 'voce'); b.onclick = function () { chiudiFoglio(); setTimeout(v[1], 30); }; f.appendChild(b);
      });
    });
  }
  $('btnMenu').onclick = menu;

  // ================= HOME
  function home() {
    var st = S.stato(), me = st.me;
    if (!me.callsign) return sceltaCallsign();
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
    if (!inviti.length && !promemoria.length && !all.length && !dz.length) { schermataInvito(); if (P('conflitti')) app.appendChild(cartaBeta()); return; }
    inviti.forEach(function (c) { app.appendChild(cartaInvito(c)); });
    // conflict e allenamenti in ordine di data
    promemoria.map(function (c) { return { t: c.inizio, el: cartaPromemoria(c) }; }).concat(all.map(function (a) { return { t: a.inizio || 0, el: cartaAllenamento(a) }; }))
      .concat(dz.map(function (x) { return { t: x.inizio, el: cartaDmz(x) }; }))
      .sort(function (x, y) { return x.t - y.t; }).forEach(function (x) { app.appendChild(x.el); });
    if (P('conflitti')) app.appendChild(cartaBeta());
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
    if (P('conflitti')) {
      var adm = el('div', 'riga2'); adm.hidden = true;
      adm.appendChild(bottone('Modifica conflict', '', function () { vai('conflittoModifica', c.id); }));
      adm.appendChild(bottone('+ Nuovo post', '', function () { editorPost(c, null); }));
      adm.appendChild(bottone('📻 Maglia radio', '', function () { vai('radio', c.id); }));
      if (c.prova) adm.appendChild(bottone('↺ Ricomincia la partita da zero', '', function () {
        if (!confirm('Far ripartire la partita adesso? Aree, rifornimenti e mortai tornano come all\'inizio.')) return;
        var x = JSON.parse(JSON.stringify(c)); x.provaDa = Date.now(); S.salvaConflitto(x).then(function () { toast('Partita ripartita'); }, errore);
      }));
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
    var puntiG = puntiGeo(cm), visti = {}, apertoIl = Date.now(), mortPan = null, annullati = {};
    function statoMort() { var now = Date.now(), own = F.stato(motore(c), cm, ultimi, now).owner; return { s: window.AC_MORT.stato(c, puntiG, ultimi, now, own), own: own }; }
    var v = F.vista(box, {
      g: motore(c), campo: cm, team: f, ordiniPersonali: personali, colori: COLORI, nomi: nomiFaz(c), ora: Date.now,
      segni: function () { return f && cm.geo ? segniMortaio(statoMort().s, f, puntiG, Date.now(), false) : []; },
      gps: !!f, qr: !!f, comandante: comandante, presenze: P('presenze'),
      onZona: function (pt) { S.scriviEvento(c.id, { tipo: 'zona', uid: st.user.uid, team: f, pt: pt || null, t: Date.now() }); },
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
      if (cm.geo) {
        var bm = bottone('✹', 'fz-mort'); bm.setAttribute('aria-label', 'Mortaio');
        bm.onclick = function () {
          tendina.innerHTML = '';
          var bar = el('div', 'riga2'); bar.appendChild(bottone('Torna alla mappa', 'accent', function () { tendina.hidden = true; mortPan = null; })); tendina.appendChild(bar);
          var pb = el('div', 'mort-pan'); tendina.appendChild(pb);
          mortPan = pannelloMortaio(pb, {
            campo: cm, punti: puntiG, team: f, uid: st.user.uid, ora: Date.now, zona: function () { return v.zona(); },
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
    var stopE = S.ascoltaEventi(c.id, function (ev) { ultimi = ev; v.aggiorna(ev); if (mortPan && !tendina.hidden) mortPan.aggiorna(); });
    // ogni secondo: impatti arrivati, costruzioni abbandonate, pannello aperto
    var giroM = cm.geo ? setInterval(function () {
      var sm = statoMort().s;
      if (Date.now() - apertoIl < 3000) sm.colpi.forEach(function (cp) { if (cp.arrivo < apertoIl) visti[cp.id] = true; });
      sorvegliaImpatti(sm, puntiG, v.miaPos(), st.user.uid, visti, false);
      if (f) Object.keys(sm.cantieri).forEach(function (pt) {
        var k = sm.cantieri[pt]; if (k.uid !== st.user.uid || v.zona() === pt || annullati[pt + k.t]) return;
        annullati[pt + k.t] = true; S.scriviEvento(c.id, { tipo: 'mortaio', azione: 'annulla', uid: st.user.uid, team: f, pt: pt, t: Date.now() }); toast('Sei uscito dalla FOB: costruzione del mortaio annullata');
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
  function infoMortaio() {
    apriFoglio(function (f) {
      f.classList.add('foglio-alto');
      var d = el('div', 'mort-info'); f.appendChild(d);
      d.innerHTML = '<h2>Come si spara col mortaio</h2>'
        + '<div class="mi-ciclo"><span>1<b>Rifornisci</b></span><span>2<b>Costruisci</b></span><span>3<b>Osserva</b></span><span>4<b>Spara</b></span><span>5<b>Correggi</b></span></div>'
        + '<h3>1 · Rifornimenti</h3><p>Alla tua <b>base principale</b> carichi 100 rifornimenti (bottone nella scheda o QR del deposito). Li porti a piedi fino a una <b>FOB</b> della tua fazione e li scarichi lì. Se ti eliminano per strada, il carico è perso: le colonne di rifornimento vanno scortate.</p>'
        + '<table class="mi-costi"><tr><td>Postazione mortaio</td><td>600</td></tr><tr><td>Ogni colpo</td><td>40</td></tr><tr><td>Capienza di una FOB</td><td>1000</td></tr></table>'
        + '<h3>2 · Costruzione</h3><p>Un <b>caposquadra</b> o il <b>comandante</b>, dentro la FOB, avvia la costruzione: servono 3 minuti senza uscire dall\'area. Se il nemico conquista la FOB, mortaio e rifornimenti sono persi.</p>'
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
  // pannello del mortaio: rifornimenti, chiamata di fuoco, tiro. Uguale per partita e prova (ctx decide cosa succede)
  function pannelloMortaio(box, ctx) {
    var M = window.AC_MORT, sel = ctx.sel || (ctx.sel = { scheda: 'rif', deriva: 0, alzo: 1200, carica: 1, missione: null, coord: '', testo: '', mortaio: null });
    function nomeP(id) { var p = (ctx.punti || []).filter(function (q) { return q.id === id; })[0]; return p ? ((p.nomi && p.nomi[ctx.team]) || p.nome) : '?'; }
    function disegna() {
      if (box.contains(document.activeElement) && document.activeElement.matches('input,textarea')) return;
      var s = ctx.stato(), R = s.regole, now = ctx.ora(), zona = ctx.zona();
      box.innerHTML = '';
      var testa = el('div', 'mort-testa'); testa.appendChild(el('b', null, ctx.prova ? 'Mortaio · prova' : 'Mortaio'));
      var bi = el('button', 'mort-i', 'i'); bi.type = 'button'; bi.title = 'Come funziona'; bi.onclick = infoMortaio; testa.appendChild(bi);
      box.appendChild(testa);
      var tabs = el('div', 'schede');
      [['rif', 'Rifornimenti'], ['oss', 'Chiama il fuoco'], ['tiro', 'Mortaio']].forEach(function (x) {
        tabs.appendChild(bottone(x[1], 'scheda' + (sel.scheda === x[0] ? ' on' : ''), function () { sel.scheda = x[0]; disegna(); }));
      });
      box.appendChild(tabs);
      var miei = Object.keys(s.mortai).filter(function (pt) { return s.mortai[pt].team === ctx.team; });
      var fobMie = (ctx.punti || []).filter(function (p) { return p.tipo === 'fob' && (ctx.owner()[p.id] === ctx.team || (ctx.owner()[p.id] == null && p.fazione === ctx.team)); });
      var cont = el('div', 'mort-c'); box.appendChild(cont);
      if (sel.scheda === 'rif') {
        var z = s.zaini[ctx.uid], zp = (ctx.punti || []).filter(function (p) { return p.id === zona; })[0];
        var k = el('div', 'carta mort-zaino');
        k.appendChild(el('small', 'eti', 'IL TUO ZAINO')); k.appendChild(el('b', 'big', z ? z.q + ' rifornimenti' : 'Vuoto'));
        k.appendChild(el('small', 'hint', ctx.prova ? 'In prova la posizione non conta: i tasti funzionano ovunque.' : zp ? 'Sei a ' + nomeP(zp.id) : 'Non sei in nessuna area'));
        cont.appendChild(k);
        var aMob = ctx.prova || (zp && zp.tipo === 'mob' && zp.fazione === ctx.team), aFob = ctx.prova ? fobMie[0] : (zp && fobMie.indexOf(zp) >= 0 ? zp : null);
        if (!z) { var b1 = bottone('Carica ' + R.viaggio + ' dal deposito', 'accent big', function () { ctx.scrivi({ tipo: 'rif', azione: 'carica', pt: zp ? zp.id : null }); }); b1.disabled = !aMob; cont.appendChild(b1); if (!aMob) cont.appendChild(el('small', 'hint', 'Si carica solo nella tua base principale.')); }
        else {
          var b2 = bottone(aFob ? 'Scarica qui · ' + nomeP(aFob.id) : 'Scarica in una FOB', 'accent big', function () { ctx.scrivi({ tipo: 'rif', azione: 'scarica', pt: aFob.id }); }); b2.disabled = !aFob; cont.appendChild(b2);
          cont.appendChild(bottone('Mi hanno eliminato: perdo il carico', 'link pericolo', function () { if (confirm('Perdere il carico?')) ctx.scrivi({ tipo: 'rif', azione: 'perso' }); }));
        }
        cont.appendChild(el('h4', 'sez', 'Le tue FOB'));
        if (!fobMie.length) cont.appendChild(el('p', 'hint', 'La tua fazione non ha FOB.'));
        fobMie.forEach(function (p) {
          var q = s.fob[p.id] && s.fob[p.id].team === ctx.team ? s.fob[p.id].q : 0, r0 = el('div', 'carta mort-fob');
          var h = el('div', 'mort-fob-h'); h.appendChild(el('b', null, nomeP(p.id))); h.appendChild(el('span', null, q + ' / ' + R.max)); r0.appendChild(h);
          var bar = el('div', 'mort-bar'), i = el('i'); i.style.width = Math.min(100, q / R.max * 100) + '%'; bar.appendChild(i); r0.appendChild(bar);
          var cn = s.cantieri[p.id], mo = s.mortai[p.id];
          if (mo) r0.appendChild(el('small', 'ok', 'Mortaio pronto · ' + Math.floor(q / R.colpo) + ' colpi'));
          else if (cn) r0.appendChild(el('small', 'avviso', 'Costruzione: ' + F.mmss(Math.max(0, cn.t + R.costruzione * 1000 - now)) + (cn.uid === ctx.uid ? ' · resta nell\'area' : '')));
          else {
            var qui = ctx.prova || zona === p.id, pu = ctx.puoCostruire;
            var bc = bottone(q >= R.costo ? 'Costruisci mortaio · ' + R.costo : 'Mortaio: mancano ' + (R.costo - q), q >= R.costo && qui && pu ? 'accent' : '', function () { ctx.scrivi({ tipo: 'mortaio', azione: 'costruisci', pt: p.id }); });
            bc.disabled = !(q >= R.costo && qui && pu); r0.appendChild(bc);
            if (q >= R.costo && !pu) r0.appendChild(el('small', 'hint', 'Lo costruisce un caposquadra o il comandante.'));
            else if (q >= R.costo && !qui) r0.appendChild(el('small', 'hint', 'Bisogna essere dentro la FOB.'));
          }
          cont.appendChild(r0);
        });
      } else if (sel.scheda === 'oss') {
        cont.appendChild(el('p', 'hint', 'Manda al mortaio dove sparare. Il nemico non vede le richieste.'));
        var ci = el('input'); ci.value = sel.coord; ci.placeholder = '32T 375310 4983462'; ci.className = 'mono'; ci.oninput = function () { sel.coord = ci.value; };
        cont.appendChild(campoForm('Coordinate UTM del bersaglio', ci));
        cont.appendChild(bottone('⌖ Scegli sulla mappa', '', function () { ctx.scegli(function (ll) { sel.coord = utmDi(ll.lat, ll.lon); disegna(); }); }));
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
        if (!miei.length) { cont.appendChild(el('p', 'hint', 'La tua fazione non ha mortai pronti. Si costruiscono nelle FOB, dalla scheda Rifornimenti.')); return; }
        if (miei.indexOf(sel.mortaio) < 0) sel.mortaio = miei[0];
        var mo = s.mortai[sel.mortaio], scorta = s.fob[sel.mortaio] ? s.fob[sel.mortaio].q : 0, P0 = (ctx.punti || []).filter(function (p) { return p.id === sel.mortaio; })[0];
        var hm = el('div', 'mort-mh');
        if (miei.length > 1) { var ms = select(miei.map(function (pt) { return [pt, nomeP(pt)]; }), sel.mortaio); ms.onchange = function () { sel.mortaio = ms.value; disegna(); }; hm.appendChild(ms); } else hm.appendChild(el('b', null, 'Mortaio · ' + nomeP(sel.mortaio)));
        hm.appendChild(el('span', 'mono', Math.floor(scorta / R.colpo) + ' colpi')); cont.appendChild(hm);
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
            km.appendChild(el('small', 'mort-sol', 'Soluzione (solo in prova): ' + Math.round(mm.dist) + ' m · deriva ' + Math.round(mm.mil) + ' · alzo ' + (al.join(' / ') || 'fuori portata')));
          }
          cont.appendChild(km);
        } else cont.appendChild(el('p', 'hint', 'Nessuna richiesta di fuoco: la manda un osservatore dalla scheda «Chiama il fuoco».'));
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
        var attesa = mo.ultimo ? mo.ultimo + R.cadenza * 1000 - now : 0, qui = ctx.prova || zona === sel.mortaio;
        var bf = bottone(attesa > 0 ? 'Ricarica il tubo · ' + Math.ceil(attesa / 1000) + ' s' : 'FUOCO', 'mort-fuoco', function () {
          if (!bl) { toast('Alzo fuori dai limiti: tra ' + M.ALZO_MIN + ' e ' + M.ALZO_MAX); return; }
          ctx.scrivi({ tipo: 'fuoco', pt: sel.mortaio, deriva: sel.deriva, alzo: sel.alzo, carica: sel.carica, rif: sel.missione || null }).then(function () { toast('Colpo partito · arrivo tra ' + Math.round(bl.volo) + ' s'); });
        });
        bf.disabled = attesa > 0 || scorta < R.colpo || !qui;
        cont.appendChild(bf);
        if (!qui) cont.appendChild(el('small', 'hint', 'Per sparare devi essere nella FOB del mortaio.'));
        else if (scorta < R.colpo) cont.appendChild(el('small', 'hint', 'Rifornimenti finiti: servono ' + R.colpo + ' per colpo.'));
      }
    }
    // si ridisegna solo quando cambia qualcosa (i conti alla rovescia ogni 5 secondi), per non perdere i tocchi
    var ultima = '';
    function firma() {
      var s = ctx.stato(), now = ctx.ora(), corre = Object.keys(s.cantieri).length || Object.keys(s.mortai).some(function (k) { return now - s.mortai[k].ultimo < s.regole.cadenza * 1000; });
      return JSON.stringify([s.fob, Object.keys(s.mortai), s.cantieri, s.zaini[ctx.uid], s.richieste.length, s.colpi.filter(function (c) { return c.arrivo <= now; }).length, s.colpi.length, ctx.zona(), corre ? Math.floor(now / 5000) : 0]);
    }
    var disegna0 = disegna; disegna = function () { ultima = firma(); disegna0(); };
    disegna();
    return { aggiorna: function () { if (firma() !== ultima) disegna(); } };
  }
  // segni sulla mappa: i miei mortai, le richieste della mia fazione e gli impatti recenti
  function segniMortaio(s, team, punti, now, tutto) {
    var out = [];
    Object.keys(s.mortai).forEach(function (pt) { var m = s.mortai[pt], p = punti.filter(function (q) { return q.id === pt; })[0]; if (p && p.lat != null && (tutto || m.team === team)) out.push({ tipo: 'mortaio', lat: p.lat, lon: p.lon, colore: COLORI[m.team] || '#2f7fd6' }); });
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
  function pagMortaioProva(id) {
    testata('Mortaio · BETA');
    if (!P('conflitti')) { app.appendChild(el('p', 'hint', 'Non disponibile.')); return; }
    var campi = D.campi.filter(function (c) { return c.geo; });
    if (!campi.length) { app.appendChild(el('p', 'hint', 'Serve una cartina con le coordinate (georeferenziata).')); return; }
    var cid = id || campi[0].id;
    var cs = select(campi.map(function (c) { return [c.id, c.nome]; }), cid); cs.onchange = function () { sostituisci('mortaioProva', cs.value); };
    app.appendChild(campoForm('Cartina', cs));
    app.appendChild(el('p', 'hint', 'Simulazione: niente arriva ai giocatori. I controlli di posizione sono disattivati e la costruzione dura 5 secondi. Per provare il colpo: rifornisci una FOB, costruisci, manda una richiesta toccando la mappa, imposta deriva, alzo e carica e spara.'));
    var mapBox = el('div', 'all-mappa mort-mappa'); app.appendChild(mapBox);
    var panBox = el('div', 'mort-pan'); app.appendChild(panBox);
    conCampo(cid, mapBox, function (cm0) {
      var cm = Object.assign({}, cm0, { punti: puntiGeo(cm0) }), team = 'blu', eventi = [], visti = {}, scegliCb = null, uid = S.stato().user.uid;
      var fob = cm.punti.filter(function (p) { return p.tipo === 'fob'; });
      if (!fob.length) { panBox.appendChild(el('p', 'hint avviso', 'Questa cartina non ha FOB: aggiungine una nell\'editor per provare il mortaio.')); }
      var own = {}; cm.punti.forEach(function (p) { own[p.id] = p.tipo === 'fob' || p.fazione === team ? team : p.fazione || null; });
      var cPrv = { regole: { mortaio: { costruzione: 5 } } };
      function st() { return window.AC_MORT.stato(cPrv, cm.punti, eventi, Date.now(), own); }
      var g0 = { inizio: Date.now() + 864e5, durata: 60, fazioni: [{ team: 'blu', mob: null, partenza: [] }, { team: 'rossa', mob: null, partenza: [] }] };
      var v = F.vista(mapBox, { g: g0, campo: cm, team: null, colori: COLORI, nomi: {}, ora: Date.now, anteprima: true, mobile: true,
        segni: function () { return segniMortaio(st(), team, cm.punti, Date.now(), true); },
        onTocco: function (lat, lon) { if (scegliCb) { var f0 = scegliCb; scegliCb = null; mapBox.classList.remove('scegli'); f0({ lat: lat, lon: lon }); } else toast('Per indicare un bersaglio: «Chiama il fuoco» → «Scegli sulla mappa»'); } });
      var pan = pannelloMortaio(panBox, {
        prova: true, soluzione: true, campo: cm, punti: cm.punti, team: team, uid: uid, ora: Date.now, zona: function () { return null; }, owner: function () { return own; }, puoCostruire: true,
        stato: st,
        scrivi: function (e) { e.uid = uid; e.team = team; e.t = Date.now(); eventi.push(e); pan.aggiorna(); v.ridisegna(); return Promise.resolve(); },
        scegli: function (cb) { scegliCb = cb; mapBox.classList.add('scegli'); mapBox.scrollIntoView({ behavior: 'smooth' }); toast('Tocca il bersaglio sulla mappa'); }
      });
      var ant = el('div', 'riga2'); ant.appendChild(bottone('Anteprima: telefono colpito', '', function () { allarmeColpito(9, true); }));
      ant.appendChild(bottone('Come funziona', '', infoMortaio)); app.appendChild(ant);
      var giro = setInterval(function () {
        var s = st();
        s.colpi.forEach(function (cp) { if (!visti[cp.id] && cp.arrivo <= Date.now()) { visti[cp.id] = true; suonoImpatto(false); var q = s.richieste.filter(function (r) { return r.id === cp.rif; })[0]; toast(q ? 'Osservatore: ' + window.AC_MORT.scarto(cp, q) : 'Colpo arrivato'); pan.aggiorna(); } });
        v.ridisegna(); if (s.colpi.some(function (cp) { return cp.arrivo > Date.now() - 2000; }) || Object.keys(s.cantieri).length || s.colpi.length) pan.aggiorna();
      }, 1000);
      var prima = chiusura; chiusura = function () { clearInterval(giro); v.chiudi(); if (prima) prima(); };
    });
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
      ['cartine', '⌖', 'Cartine', P('mappe')],
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
      app.appendChild(bottone('+ Nuova cartina', 'accent big', function () { vai('mappa', null); }));
      if (window.innerWidth < 900) app.appendChild(el('p', 'hint', 'Le cartine si disegnano meglio dal computer.'));
      D.campi.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); }).forEach(function (cm) {
        var r = riga(cm.nome, (cm.punti || []).length + ' aree' + (cm.geo ? '' : ' · senza coordinate'), function () { vai('mappa', cm.id); });
        // QR: dietro un tasto discreto
        var piu = bottone('QR ▾', 'link', function () { az.hidden = !az.hidden; });
        app.appendChild(piu);
        var az = el('div', 'riga-az'); az.hidden = true;
        az.appendChild(bottone('Stampa i QR', 'piccolo', function () { vai('stampaQr', cm.id); }));
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
    return Object.assign({}, cm, { punti: punti, link: (cm.link || []).filter(function (l) { return ids[l[0]] && ids[l[1]]; }) });
  }
  function pagAllenamento(id) {
    var a = D.allenamenti.filter(function (x) { return x.id === id; })[0]; var dove = app;
    testata(a ? a.titolo || 'Allenamento' : 'Allenamento');
    if (!a) { app.appendChild(el('p', 'hint', 'Allenamento non trovato.')); return; }
    if (P('allenamenti')) app.appendChild(bottone('⚙ Modifica', 'link', function () { vai('allenamentoModifica', a.id); }));
    var hero = el('div', 'conf-hero all-hero');
    hero.appendChild(el('div', 'conf-tipo verde', 'ALLENAMENTO · PORTE CHIUSE'));
    if (a.inizio) hero.appendChild(el('div', 'pm-data', dataLunga(a.inizio).toUpperCase()));
    var orari = el('div', 'pm-orari');
    [['RITROVO', a.ritrovo], ['INIZIO', a.inizio], ['FINE', a.fine]].forEach(function (o) { if (!o[1]) return; var d = el('div'); d.appendChild(el('small', null, o[0])); d.appendChild(el('b', null, ora(o[1]))); orari.appendChild(d); });
    hero.appendChild(orari);
    var lg = el('div', 'conf-luogo'); lg.appendChild(el('span', null, '⌖ ' + (a.luogo || 'Luogo da definire')));
    if (a.luogo || a.mapsUrl) lg.appendChild(link('Apri in Maps', mapsLink(a), 'btn piccolo'));
    hero.appendChild(lg);
    app.appendChild(hero);
    if (S.stato().me.team && (a.team || []).indexOf(S.stato().me.team) >= 0) {
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
  function pagAllenamentoModifica(id) {
    var vecchio = D.allenamenti.filter(function (x) { return x.id === id; })[0];
    testata(vecchio ? 'Modifica allenamento' : 'Nuovo allenamento');
    if (!P('allenamenti')) { app.appendChild(el('p', 'hint', 'Non disponibile.')); return; }
    var g7 = mezzanotte(Date.now() + 7 * GIORNO);
    var a = vecchio ? JSON.parse(JSON.stringify(vecchio)) : { titolo: 'Allenamento', luogo: '', mapsUrl: '', ritrovo: g7 + 8.5 * 3600000, inizio: g7 + 9 * 3600000, fine: g7 + 12.5 * 3600000, parcheggio: { testo: '', mapsUrl: '' }, campo: D.campi.length === 1 ? D.campi[0].id : '', team: [], argomenti: [] };
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
  function cartaAllenamento(a) {
    var k = el('button', 'carta promemoria verde'); k.type = 'button';
    var testa = el('div', 'pm-testa'); testa.appendChild(el('span', 'pm-eti', 'ALLENAMENTO')); if (a.inizio) testa.appendChild(el('span', 'pm-tra', traQuanto(a.inizio))); k.appendChild(testa);
    k.appendChild(el('h3', null, a.titolo || 'Allenamento'));
    if (a.inizio) k.appendChild(el('div', 'pm-data', dataBreve(a.inizio)));
    var orari = el('div', 'pm-orari');
    [['RITROVO', a.ritrovo], ['INIZIO', a.inizio], ['FINE', a.fine]].forEach(function (o) { if (!o[1]) return; var d = el('div'); d.appendChild(el('small', null, o[0])); d.appendChild(el('b', null, ora(o[1]))); orari.appendChild(d); });
    k.appendChild(orari);
    k.appendChild(el('div', 'pm-luogo', '⌖ ' + (a.luogo || 'Luogo da definire')));
    k.appendChild(el('span', 'pm-apri', 'Tocca per mappa e argomenti ›'));
    k.onclick = function () { vai('allenamento', a.id); };
    return k;
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
    var vecchio = D.conflitti.filter(function (x) { return x.id === cid; })[0];
    testata(vecchio ? 'Modifica conflict' : 'Nuovo conflict');
    var c = vecchio ? JSON.parse(JSON.stringify(vecchio)) : {
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
      var mobs = (cm.punti || []).filter(function (p) { return p.tipo === 'mob'; }), altri = (cm.punti || []).filter(function (p) { return p.tipo !== 'mob' && p.tipo !== 'fob'; });
      var mB = mobs.filter(function (p) { return p.fazione === 'blu'; })[0], mR = mobs.filter(function (p) { return p.fazione === 'rossa'; })[0];
      if (mB && mR) {
        // basi e FOB sono già assegnate alle fazioni nella cartina
        base.blu = mB.id; base.rossa = mR.id;
        var info = el('div', 'basi-info');
        [['blu', mB], ['rossa', mR]].forEach(function (x) {
          var fobs = (cm.punti || []).filter(function (p) { return p.tipo === 'fob' && p.fazione === x[0]; });
          var r = el('div', 'basi-r s-' + x[0]); r.appendChild(el('b', null, '⚑ ' + nomeArea(x[1], x[0])));
          if (fobs.length) r.appendChild(el('small', null, '▲ ' + fobs.map(function (p) { return nomeArea(p, x[0]); }).join(', ')));
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
    function difesaTutto() { var cm0 = campoMeta(cSel.value, 'conflict'); return ((cm0 && cm0.punti) || []).filter(function (p) { return p.tipo !== 'mob' && p.tipo !== 'fob'; }).map(function (p) { return p.id; }); }
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
      function fobDi(f) { return ((cmS && cmS.punti) || []).filter(function (p) { return p.tipo === 'fob' && p.fazione === f; }).map(function (p) { return p.id; }); }
      if (!cmS) { toast('Scegli la cartina del campo'); return; }
      if ((cmS.punti || []).filter(function (p) { return p.tipo === 'mob'; }).length < 2 || base.blu === base.rossa) { toast('Servono due basi di partenza diverse'); return; }
      var out = {
        id: c.id, titolo: tit.value.trim(), luogo: lg.value.trim(), mapsUrl: mu.value.trim(), campo: cSel.value,
        ritrovo: pv ? null : ms(hR.value), inizio: ini, fine: fin, prova: pv, provaDa: pv ? (vecchio && vecchio.prova && vecchio.provaDa) || ini : null, invitati: invitati,
        fazioni: [
          { id: 'blu', nome: nB.value.trim() || 'Blu', team: modo === 'addestramento' ? team : team.filter(function (t) { return fazioneDi[t] === 'blu'; }), mob: base.blu, partenza: partenza.blu.concat(fobDi('blu')) },
          { id: 'rossa', nome: nR.value.trim() || 'Rossa', team: modo === 'addestramento' ? team : team.filter(function (t) { return fazioneDi[t] === 'rossa'; }), mob: base.rossa, partenza: partenza.rossa.concat(fobDi('rossa')) }
        ],
        team: team, fazioneDi: fazioneDi, comandanti: { blu: cmB.value || 'ia', rossa: modo === 'addestramento' && !pv ? 'ia' : (cmR.value || 'ia') },
        modo: modo, fazioneUtente: fazioneUtente, nomiGioc: nomiGioc,
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
  var SIMB = { mob: '⚑', fob: '▲', chiave: '★', base: '●', torre: '📡' };
  var DESCR = { mob: 'Base principale', fob: 'Base avanzata (FOB)', chiave: 'Punto chiave', base: 'Punto base', torre: 'Torre radio' };
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
      .concat(allenamentiAttivi().filter(function (a) { return (a.inizio || 0) > Date.now() && (a.team || []).indexOf(st.me.team) >= 0; }).map(function (a) { return { k: 'a:' + a.id, id: a.id, coll: 'allenamenti', x: a }; }));
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
      stopCampi = S.ascoltaCampi(function (cm) { D.campi = cm; if (corrente().v === 'organizza') ridisegna(); });
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
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
