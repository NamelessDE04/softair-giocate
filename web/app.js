/* Airsoft Conflict — interfaccia.
   Schermate: codice invito · promemoria · pagina del conflict (settimana / giorno / partita) · team · organizzazione. */
(function () {
  'use strict';

  var VERSIONE = '0.13';
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
  function campoMeta(id) { return D.campi.filter(function (x) { return x.id === id; })[0] || null; }
  // carica la cartina completa (con l'immagine) e poi chiama fn; se nel frattempo si cambia schermata non fa nulla
  function conCampo(id, box, fn) {
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
  function motore(c) {
    return {
      id: c.id, inizio: c.inizio, durata: (c.fine - c.inizio) / 60000, regole: Object.assign({}, c.regole || {}, addestramento(c) ? { attacco: 'blu' } : {}),
      fazioni: (c.fazioni || []).map(function (f) { return { team: f.id, mob: f.mob, partenza: f.partenza || [], comandante: (c.comandanti || {})[f.id] || 'ia' }; })
    };
  }
  function fase(c, now) {
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
  var D = { team: [], conflitti: [], adesioni: {}, contatti: {}, campi: [] };
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
    var r = { home: home, conflitto: pagConflitto, team: pagTeam, teamModifica: pagTeamModifica, profilo: pagProfilo, organizza: pagOrganizza, stampaQr: pagStampaQr, posa: pagPosa, giocatori: pagGiocatori, permessi: pagPermessi, mappa: pagMappa, conflittoModifica: pagConflittoModifica, prova: pagProva }[c.v];
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
    var f = $('foglio'); f.innerHTML = ''; f.appendChild(el('span', 'maniglia'));
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
    var lista = attivi(), inviti = [], promemoria = [];
    lista.forEach(function (c) {
      if (P('conflitti')) { promemoria.push(c); return; }
      if (!me.team || (c.team || []).indexOf(me.team) < 0) return;
      var a = miaAdesione(c.id);
      if (!a) inviti.push(c); else if (a.si) promemoria.push(c);
    });
    if (!inviti.length && !promemoria.length) { schermataInvito(); return; }
    inviti.forEach(function (c) { app.appendChild(cartaInvito(c)); });
    promemoria.forEach(function (c) { app.appendChild(cartaPromemoria(c)); });
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
    var r = el('div', 'riga2');
    r.appendChild(bottone('Partecipo', 'accent', function () { S.rispondiInvito(c.id, true).then(function () { toast('Ci sei! Promemoria salvato'); }, errore); }));
    r.appendChild(bottone('Non vengo', '', function () { S.rispondiInvito(c.id, false).then(function () { toast('Risposta inviata'); }, errore); }));
    k.appendChild(r);
    return k;
  }

  function cartaPromemoria(c) {
    var k = el('button', 'carta promemoria'); k.type = 'button';
    var f = mieFaz(c), fs = fase(c);
    if (f) k.style.setProperty('--faz', COLORI[f]);
    var testa = el('div', 'pm-testa');
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
    box.appendChild(hero);

    if (!P('conflitti') && st.me.team) {
      var a = miaAdesione(c.id), r = el('div', 'risposta');
      r.appendChild(el('span', null, a ? (a.si ? 'Hai confermato la presenza' : 'Hai detto che non vieni') : 'Ci sarai?'));
      r.appendChild(bottone(a && a.si ? 'Non vengo più' : 'Partecipo', a && a.si ? 'piccolo' : 'accent piccolo', function () { S.rispondiInvito(c.id, !(a && a.si)).then(function () { mostra(); }, errore); }));
      box.appendChild(r);
    }
    if (P('conflitti')) {
      var adm = el('div', 'riga2');
      adm.appendChild(bottone('Modifica conflict', '', function () { vai('conflittoModifica', c.id); }));
      adm.appendChild(bottone('+ Nuovo post', 'accent', function () { editorPost(c, null); }));
      box.appendChild(adm);
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
      if (addestramento(c)) {
        var nomi = Object.keys(c.nomiGioc || {}).filter(function (u) { return ((c.fazioneUtente || {})[u] || 'blu') === f.id; }).map(function (u) { return c.nomiGioc[u]; }).sort();
        var lst = el('div', 'faz-gioc'); nomi.forEach(function (n) { lst.appendChild(el('span', null, n)); });
        if (!nomi.length) lst.appendChild(el('span', 'hint', 'Nessuno'));
        k.appendChild(lst);
        k.appendChild(el('small', 'faz-nota', f.id === 'blu' ? 'Comandante automatico · conquista i punti chiave' : 'Ognuno riceve il suo posto dal comandante automatico'));
        fz.appendChild(k); return;
      }
      (f.team || []).forEach(function (tid) {
        var t = teamDi(tid); if (!t) return;
        var row = el('div', 'faz-team');
        row.appendChild(logo(t, 40));
        var info = el('div', 'faz-info');
        info.appendChild(el('b', null, t.nome));
        var n = P('risposte') ? ades.filter(function (x) { return x.team === tid && x.si; }).length : 0;
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

    // risposte agli inviti (solo organizzatore: si possono togliere)
    if (P('risposte')) {
      box.appendChild(el('h3', 'sez', 'Risposte'));
      var rBox = el('div', 'carta');
      var si = ades.filter(function (x) { return x.si; }), no = ades.filter(function (x) { return !x.si; });
      if (!ades.length) rBox.appendChild(el('p', 'hint', 'Nessuna risposta ancora.'));
      [['Vengono', si], ['Non vengono', no]].forEach(function (g) {
        if (!g[1].length) return;
        rBox.appendChild(el('h4', 'ris-tit', g[0] + ' · ' + g[1].length));
        g[1].forEach(function (a) {
          var r = el('div', 'gioc'); r.appendChild(el('span', null, (a.nome || 'Giocatore') + ' · ' + ((teamDi(a.team) || {}).nome || '')));
          r.appendChild(bottone('✕', 'icon', function () { if (confirm('Togliere la risposta di ' + (a.nome || 'questo giocatore') + '?')) S.eliminaAdesione(c.id, a.id).catch(errore); }));
          rBox.appendChild(r);
        });
      });
      box.appendChild(rBox);
    }

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
    conCampo(c.campo, box, function (cm) {
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
    conCampo(c.campo, box, function (cm) { v = F.vista(box, { g: motore(c), campo: cm, team: f, colori: COLORI, nomi: nomiFaz(c), ora: Date.now, anteprima: true }); });
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
    conCampo(c.campo, box, function (cm) {
    var v = F.vista(box, {
      g: motore(c), campo: cm, team: f, ordiniPersonali: personali, colori: COLORI, nomi: nomiFaz(c), ora: Date.now,
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
      if (qrInSospeso) { var pre = qrInSospeso; qrInSospeso = null; setTimeout(function () { scQr(pre); }, 400); }
    }
    var stopE = S.ascoltaEventi(c.id, function (ev) { ultimi = ev; v.aggiorna(ev); });
    var prima = chiusura; chiusura = function () { stopE(); v.chiudi(); if (prima) prima(); };
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
  function nomeG(u) { return u.callsign || u.nome || u.email || 'Giocatore'; }
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
        r.appendChild(el('span', null, nomeG(u)));
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
    form.appendChild(campoForm('Nome da mostrare', refNome));
    form.appendChild(campoForm('Numero di cellulare', refTel));
    form.appendChild(el('p', 'hint', 'Il nome e il numero del referente li vedono i giocatori dei conflict a cui partecipa il team, per organizzarsi.'));
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
        var r = el('div', 'm-riga'); r.appendChild(el('span', null, nomeG(u)));
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
      if (u && !refNome.value) refNome.value = u.nome || nomeG(u);
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
    var n = el('input'); n.value = me.nome || ''; f.appendChild(campoForm('Nome', n));
    var cs = el('input'); cs.value = me.callsign || ''; cs.placeholder = 'es. Falco'; f.appendChild(campoForm('Nome in codice (callsign)', cs));
    f.appendChild(el('p', 'hint', 'Accesso: ' + (st.user.email || '')));
    f.appendChild(bottone('Salva', 'accent big', function () { S.aggiornaProfilo({ nome: n.value.trim(), callsign: cs.value.trim() }).then(function () { toast('Salvato'); indietro(); }, errore); }));
    if (me.team) f.appendChild(bottone('Lascia il team', 'link pericolo', function () { if (confirm('Vuoi uscire dal team?')) S.togliMembro(st.user.uid).then(function () { sostituisci('home'); }, errore); }));
  }

  // ================= GIOCATORI (solo organizzatore)
  function editorGiocatore(u) {
    apriFoglio(function (f) {
      f.appendChild(el('h3', null, nomeG(u)));
      if (u.email) f.appendChild(el('p', 'hint', u.email));
      var n = el('input'); n.value = u.nome || ''; f.appendChild(campoForm('Nome', n));
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
          var r = el('div', 'gioc apribile'); r.appendChild(el('span', null, nomeG(u)));
          if (u.ruolo && u.ruolo !== 'truppa') r.appendChild(el('small', 'tag', S.nomeRuolo(u.ruolo).toUpperCase()));
          r.appendChild(el('small', 'hint', u.email || ''));
          r.onclick = function () { editorGiocatore(u); };
          k.appendChild(r);
        });
        box.appendChild(k);
      });
    });
  }

  // ================= ORGANIZZA (solo organizzatore)
  function pagOrganizza() {
    testata('Organizza');
    if (S.stato().dev) {
      app.appendChild(el('h3', 'sez', 'Ruoli e permessi'));
      app.appendChild(bottone('Cosa può vedere e fare ogni ruolo', 'accent', function () { vai('permessi'); }));
    }
    if (P('conflitti')) {
      app.appendChild(el('h3', 'sez', 'Conflict'));
      app.appendChild(bottone('+ Nuovo conflict', 'accent', function () { vai('conflittoModifica', null); }));
      D.conflitti.slice().sort(function (a, b) { return b.inizio - a.inizio; }).forEach(function (c) {
        var r = el('button', 'riga-lista'); r.type = 'button';
        r.appendChild(el('b', null, c.titolo)); r.appendChild(el('small', null, dataBreve(c.inizio) + ' · ' + (c.team || []).length + ' team'));
        r.onclick = function () { vai('conflitto', c.id); };
        app.appendChild(r);
      });
    }
    if (P('mappe')) {
      app.appendChild(el('h3', 'sez', 'Cartine'));
      app.appendChild(bottone('+ Nuova cartina', 'accent', function () { vai('mappa', null); }));
      if (window.innerWidth < 900) app.appendChild(el('p', 'hint', 'L\'editor delle cartine è pensato per il computer.'));
      D.campi.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); }).forEach(function (cm) {
        var r = el('button', 'riga-lista'); r.type = 'button';
        var n = (cm.punti || []).length;
        r.appendChild(el('b', null, cm.nome)); r.appendChild(el('small', null, n + ' aree · ' + (cm.link || []).length + ' collegamenti · ' + (cm.geo ? 'georeferenziata' : 'senza coordinate')));
        r.onclick = function () { vai('mappa', cm.id); };
        app.appendChild(r);
        var az = el('div', 'riga-az');
        az.appendChild(bottone('Stampa i QR', 'piccolo', function () { vai('stampaQr', cm.id); }));
        az.appendChild(bottone('Posa i QR', 'piccolo', function () { vai('posa', cm.id); }));
        app.appendChild(az);
      });
    }
    if (P('giocatori')) {
      app.appendChild(el('h3', 'sez', 'Giocatori'));
      app.appendChild(bottone(S.stato().dev ? 'Tutti i giocatori e i loro ruoli' : 'Tutti i giocatori iscritti', '', function () { vai('giocatori'); }));
    }
    if (P('team')) {
      app.appendChild(el('h3', 'sez', 'Team'));
      app.appendChild(bottone('+ Nuovo team', 'accent', function () {
        var n = prompt('Nome del nuovo team'); if (!n || !n.trim()) return;
        S.creaTeam(n.trim()).then(function (tid) { vai('team', tid); }, errore);
      }));
      D.team.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); }).forEach(function (t) {
        var r = el('button', 'riga-lista con-logo'); r.type = 'button';
        r.appendChild(logo(t, 36));
        var i = el('div'); i.appendChild(el('b', null, t.nome)); i.appendChild(el('small', null, t.referente && t.referente.nome ? 'Ref. ' + t.referente.nome : 'Referente da indicare')); r.appendChild(i);
        r.onclick = function () { vai('team', t.id); };
        app.appendChild(r);
      });
    }
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
    var dt = el('input'); dt.type = 'date'; dt.value = locale(c.inizio).slice(0, 10); form.appendChild(campoForm('Data', dt));
    var tre = el('div', 'tre');
    function oraInput(ms) { var i = el('input'); i.type = 'time'; i.value = ms ? ora(ms) : ''; return i; }
    var hR = oraInput(c.ritrovo), hI = oraInput(c.inizio), hF = oraInput(c.fine);
    tre.appendChild(campoForm('Ritrovo', hR)); tre.appendChild(campoForm('Inizio', hI)); tre.appendChild(campoForm('Fine', hF));
    form.appendChild(tre);
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
      var cm = campoMeta(cSel.value);
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
    function difesaTutto() { var cm0 = campoMeta(cSel.value); return ((cm0 && cm0.punti) || []).filter(function (p) { return p.tipo !== 'mob' && p.tipo !== 'fob'; }).map(function (p) { return p.id; }); }
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
      var ad = modo === 'addestramento';
      tBox.hidden = hintF.hidden = ad; adBox.hidden = !ad;
      if (cmR && cmR.parentNode) cmR.parentNode.hidden = ad;
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
        var tt = modo === 'addestramento' ? (id === 'blu' ? [tAd] : []) : Object.keys(scelta).filter(function (t) { return scelta[t] === id; });
        tt.forEach(function (t) {
          (membriDi[t] || []).filter(function (u) { return modo !== 'addestramento' || !ruolo[u.id]; }).slice().sort(function (a, b) { return (b.ruolo === 'comandante') - (a.ruolo === 'comandante'); }).forEach(function (u) {
            var q = el('option', null, (u.ruolo === 'comandante' ? '★ ' : '') + nomeG(u) + ' (' + (teamDi(t) || {}).nome + ')'); q.value = u.id; s.appendChild(q);
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
      if (!dt.value || !hI.value || !hF.value) { toast('Servono data, inizio e fine'); return; }
      function ms(h) { return h ? new Date(dt.value + 'T' + h).getTime() : null; }
      var ini = ms(hI.value), fin = ms(hF.value); if (fin <= ini) fin += GIORNO;
      var team = [], fazioneDi = {}, fazioneUtente = {}, nomiGioc = {};
      if (modo === 'addestramento') {
        var mm = membriDi[tAd] || [], dif = mm.filter(function (u) { return ruolo[u.id] === 'rossa'; });
        if (!tAd) { toast('Scegli il team'); return; }
        if (!dif.length || dif.length === mm.length) { toast('Servono giocatori sia in attacco sia in difesa'); return; }
        team = [tAd]; fazioneDi[tAd] = 'blu'; fazioneUtente = {}; nomiGioc = {};
        dif.forEach(function (u) { fazioneUtente[u.id] = 'rossa'; });
        mm.forEach(function (u) { nomiGioc[u.id] = nomeG(u); });
      } else Object.keys(scelta).forEach(function (t) { if (scelta[t]) { team.push(t); fazioneDi[t] = scelta[t]; } });
      var cmS = campoMeta(cSel.value);
      function fobDi(f) { return ((cmS && cmS.punti) || []).filter(function (p) { return p.tipo === 'fob' && p.fazione === f; }).map(function (p) { return p.id; }); }
      if (!cmS) { toast('Scegli la cartina del campo'); return; }
      if ((cmS.punti || []).filter(function (p) { return p.tipo === 'mob'; }).length < 2 || base.blu === base.rossa) { toast('Servono due basi di partenza diverse'); return; }
      var out = {
        id: c.id, titolo: tit.value.trim(), luogo: lg.value.trim(), mapsUrl: mu.value.trim(), campo: cSel.value,
        ritrovo: ms(hR.value), inizio: ini, fine: fin,
        fazioni: [
          { id: 'blu', nome: nB.value.trim() || 'Blu', team: modo === 'addestramento' ? team : team.filter(function (t) { return fazioneDi[t] === 'blu'; }), mob: base.blu, partenza: partenza.blu.concat(fobDi('blu')) },
          { id: 'rossa', nome: nR.value.trim() || 'Rossa', team: modo === 'addestramento' ? team : team.filter(function (t) { return fazioneDi[t] === 'rossa'; }), mob: base.rossa, partenza: partenza.rossa.concat(fobDi('rossa')) }
        ],
        team: team, fazioneDi: fazioneDi, comandanti: { blu: cmB.value || 'ia', rossa: modo === 'addestramento' ? 'ia' : (cmR.value || 'ia') },
        modo: modo, fazioneUtente: fazioneUtente, nomiGioc: nomiGioc,
        mappaDa: mSel.value === '' ? null : mezzanotte(ini) - Number(mSel.value) * GIORNO,
        parcheggio: { testo: pT.value.trim(), mapsUrl: pU.value.trim(), da: pSel.value === '' ? null : mezzanotte(ini) - Number(pSel.value) * GIORNO },
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
  function foglioQr(cm, p, tok) {
    var f = el('section', 'qr-foglio');
    f.appendChild(el('div', 'qr-testa', 'AIRSOFT CONFLICT · ' + cm.nome.toUpperCase()));
    var corpo = el('div', 'qr-corpo'); f.appendChild(corpo);
    var sx = el('div', 'qr-sx'); corpo.appendChild(sx);
    sx.appendChild(el('div', 'qr-tipo', DESCR[p.tipo] + (p.fazione ? ' · fazione ' + p.fazione : '')));
    sx.appendChild(el('div', 'qr-nome', (SIMB[p.tipo] || '') + ' ' + p.nome.toUpperCase()));
    if (p.nomi && (p.nomi.blu || p.nomi.rossa)) sx.appendChild(el('div', 'qr-nomi', 'Per i blu: ' + (p.nomi.blu || p.nome) + '  ·  Per i rossi: ' + (p.nomi.rossa || p.nome)));
    var q = el('div', 'qr-codice'); q.innerHTML = svgQr(urlQr(cm, p, tok)); sx.appendChild(q);
    sx.appendChild(el('div', 'qr-tok', 'Codice: ' + tok));
    var dx = el('div', 'qr-dx'); corpo.appendChild(dx);
    dx.appendChild(el('h4', null, 'Cos\'è'));
    dx.appendChild(el('p', null, p.tipo === 'mob'
      ? 'La base principale: qui si rientra. Con l\'app, «Scansiona QR» segna che sei in base.'
      : 'Un\'area da conquistare o da tenere. Durante la partita, quando sei dentro l\'area, apri l\'app e premi «Scansiona QR» (oppure inquadralo con la fotocamera del telefono): conti come presente qui per 6 minuti, anche se il GPS non ti trova.'));
    dx.appendChild(el('h4', null, 'Dove va messo'));
    if (p.notaQr) dx.appendChild(el('p', 'qr-nota', p.notaQr));
    if (p.lat != null) {
      var u = window.AC_MAPPE.utmTesto(p.lat, p.lon);
      dx.appendChild(el('p', 'qr-coo', 'UTM ' + u + '\nLat/Lon ' + p.lat.toFixed(5) + ', ' + p.lon.toFixed(5)));
    }
    var im = new Image(); im.className = 'qr-mappa'; im.alt = ''; dx.appendChild(im);
    ritaglio(cm, p).then(function (d) { if (d) im.src = d; else im.remove(); });
    f.appendChild(el('div', 'qr-piede', 'Non spostare e non coprire questo foglio · cerchio rosso = area di ' + (p.raggio || 30) + ' m'));
    return f;
  }
  function pagStampaQr(id) {
    testata('QR da stampare');
    if (!P('mappe')) { app.appendChild(el('p', 'hint', 'Non hai il permesso per le cartine.')); return; }
    conCampo(id, app, function (cm) {
      var box = el('div', 'qr-pagina'); app.appendChild(box);
      box.appendChild(el('p', 'hint', 'Preparo i codici…'));
      var formato = 'a4';
      function disegna(cod) {
        box.innerHTML = '';
        var ctr = el('div', 'qr-ctr');
        ctr.appendChild(el('p', 'hint', cm.nome + ': ' + cm.punti.length + ' fogli, uno per area. Stampali, mettili in una bustina trasparente o plastificali, poi falli posare: chi li posa usa ☰ → «Posa i QR».'));
        var seg = el('div', 'seg seg-largo');
        [['a4', 'Un foglio A4 per area'], ['a5', 'Due per foglio (A5)']].forEach(function (o) {
          var b = bottone(o[1], 'seg-b' + (formato === o[0] ? ' on' : ''), function () { formato = o[0]; fogli.className = 'qr-fogli ' + formato; Array.prototype.forEach.call(seg.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); });
          seg.appendChild(b);
        });
        ctr.appendChild(seg);
        var r = el('div', 'riga2');
        r.appendChild(bottone('Stampa', 'accent', function () { document.body.classList.add('stampa-qr'); window.print(); setTimeout(function () { document.body.classList.remove('stampa-qr'); }, 500); }));
        r.appendChild(bottone('Nuovi codici', '', function () {
          if (!confirm('Creare codici nuovi? I fogli già stampati smettono di funzionare e vanno ristampati tutti.')) return;
          S.preparaQr(cm, true).then(disegna, errore);
        }));
        ctr.appendChild(r);
        box.appendChild(ctr);
        var fogli = el('div', 'qr-fogli ' + formato); box.appendChild(fogli);
        cm.punti.slice().sort(function (a, b) { return 'mobfobchiavebasetorre'.indexOf(a.tipo) - 'mobfobchiavebasetorre'.indexOf(b.tipo) || a.nome.localeCompare(b.nome); })
          .forEach(function (p) { fogli.appendChild(foglioQr(cm, p, cod[p.id])); });
      }
      S.preparaQr(cm, false).then(disegna, errore);
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
      var v = F.vista(box, { g: g0, campo: cm, team: null, colori: COLORI, nomi: {}, ora: Date.now, anteprima: true });
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
            var dati = { nome: me.callsign || me.nome || '', uid: S.stato().user.uid, t: Date.now(), lat: mia ? mia.lat : null, lon: mia ? mia.lon : null, dist: b ? b.m : null };
            return S.segnaPosa(cm.id, p.id, dati).then(function () {
              var lontano = b && b.m > Math.max(40, (p.raggio || 30) * 1.5);
              return { ok: true, avviso: lontano, titolo: (SIMB[p.tipo] || '') + ' ' + p.nome + ' posato',
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
          r.appendChild(el('span', 'posa-stato', ps ? '✓' : (SIMB[p.tipo] || '●')));
          var info = el('div', 'posa-info');
          info.appendChild(el('b', null, p.nome));
          info.appendChild(el('small', null, p.notaQr || DESCR[p.tipo]));
          if (ps) info.appendChild(el('small', 'ok', 'Posato da ' + (ps.nome || '—') + ' alle ' + ora(ps.t)));
          r.appendChild(info);
          if (x.b) { var d = el('span', 'posa-dist'); var fr = el('i', null, '↑'); fr.style.transform = 'rotate(' + x.b.ang + 'deg)'; d.appendChild(fr); d.appendChild(el('span', null, x.b.m + ' m ' + x.b.dir)); r.appendChild(d); }
          if (ps && P('mappe')) r.appendChild(bottone('✕', 'icon', function () { if (confirm('Segnare ' + p.nome + ' come da posare?')) S.togliPosa(cm.id, p.id).catch(errore); }));
          pann.appendChild(r);
        });
      }
      lista();
      var prima = chiusura; chiusura = function () { stopP(); if (watch != null) navigator.geolocation.clearWatch(watch); v.chiudi(); pg.classList.remove('posa'); if (prima) prima(); };
      if (qrInSospeso) { var t0 = qrInSospeso; qrInSospeso = null; setTimeout(function () { scansionaTesto(t0); }, 300); }
      function scansionaTesto(t) { apriScanner('QR', function () { return S.leggiQr(cm, t).then(function (r) { if (!r.punto) return { ok: false, titolo: 'QR non valido', testo: r.errore }; return S.segnaPosa(cm.id, r.punto.id, { nome: (S.stato().me.callsign || S.stato().me.nome || ''), uid: S.stato().user.uid, t: Date.now(), lat: mia ? mia.lat : null, lon: mia ? mia.lon : null, dist: null }).then(function () { return { ok: true, titolo: r.punto.nome + ' posato' }; }); }); }); }
    });
  }
  var qrInSospeso = null;

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
  var avviato = false, aperturaFatta = false, stopCampi = null, stopContatti = null, stopTeam = null, stopConf = null, uidPrima = null;
  function ascoltaAdesioniDi(lista) {
    var ids = lista.map(function (c) { return c.id; });
    Object.keys(stopAdesioni).forEach(function (id) { if (ids.indexOf(id) < 0) { stopAdesioni[id](); delete stopAdesioni[id]; delete D.adesioni[id]; } });
    ids.forEach(function (id) {
      if (stopAdesioni[id]) return;
      stopAdesioni[id] = S.ascoltaAdesioni(id, function (a) { D.adesioni[id] = a; ridisegna(); });
    });
  }
  // ridisegna solo le schermate "statiche" (non la mappa né i moduli in compilazione)
  function ridisegna() {
    var v = corrente().v;
    if (v === 'home' || v === 'organizza' || (v === 'team' && !document.activeElement.matches('input,textarea,select'))) mostra();
    else if (v === 'conflitto') {
      var c = D.conflitti.filter(function (x) { return x.id === corrente().p; })[0];
      if (!c || (fase(c) !== 'live' && fase(c) !== 'giorno' && !$('pieno').querySelector('.fz'))) mostra();
    }
    aperturaAutomatica();
  }
  // il giorno del conflict (o durante la partita) l'app si apre direttamente lì
  function aperturaAutomatica() {
    if (aperturaFatta || pila.length > 1) return;
    var st = S.stato();
    // aperta da un QR: in partita conta come scansione, altrimenti (a chi posa) segna il foglio come posato
    if (qrInSospeso && D.campi.length) {
      var cid = decodeURIComponent(qrInSospeso.match(/[?&]qr=([^&#]+)/)[1]).split('.')[0];
      var live = attivi().filter(function (x) { return fase(x) === 'live' && x.campo === cid && mieFaz(x); })[0];
      if (live) { aperturaFatta = true; vai('conflitto', live.id); return; }
      if (posaConsentita()) { aperturaFatta = true; vai('posa', cid); return; }
      qrInSospeso = null; toast('QR di un\'area: si usa durante la partita');
    }
    var c = attivi().filter(function (x) {
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
      if (stopContatti) stopContatti();
      stopContatti = S.ascoltaContatti(function (m) { D.contatti = m; ridisegna(); });
      if (stopCampi) stopCampi();
      stopCampi = S.ascoltaCampi(function (cm) { D.campi = cm; if (corrente().v === 'organizza') ridisegna(); });
      stopTeam = S.ascoltaTeam(function (t) { D.team = t; ridisegna(); });
      stopConf = S.ascoltaConflitti(function (c) { D.conflitti = c; ascoltaAdesioniDi(attivi()); ridisegna(); });
    }
    ridisegna();
  });
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
