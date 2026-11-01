/* Airsoft Conflict — modalità DMZ (stile Warzone): squadre contro squadre, contratti, zaino, estrazioni.
   Lo stato si ricalcola dagli eventi, come nel conflict:
   { tipo:'prendi'|'lascia'|'fatto', squadra, contratto, t }   contratti
   { tipo:'esfil', squadra, punto, t }                          estrazione (vale solo se il punto è aperto)
   { tipo:'eliminata', squadra, da (squadra che ha eliminato, facoltativa), t } */
(function () {
  'use strict';

  var TIPI = {
    recupero: { nome: 'Recupero', valore: 300, testo: 'Raggiungi l\'area e recupera la cassa: scansiona il QR. Poi portala a un\'estrazione.' },
    intel: { nome: 'Intel', valore: 400, testo: 'Raggiungi l\'area e recupera i documenti: scansiona il QR.' },
    sabotaggio: { nome: 'Sabotaggio', valore: 500, testo: 'Raggiungi l\'obiettivo e sabotalo: scansiona il QR e tieni l\'area finché non è confermato.' },
    ricognizione: { nome: 'Ricognizione', valore: 250, testo: 'Raggiungi il punto di osservazione e scansiona il QR.' },
    caccia: { nome: 'Caccia', valore: 600, testo: 'Elimina la squadra bersaglio: vale quando loro dichiarano di essere stati eliminati da voi.' }
  };
  var FORMATI = [[2, 'Duo'], [3, 'Trio'], [4, 'Quad'], [6, 'Squad (fino a 6)']];
  var NOMI = ['Spettro', 'Vipera', 'Orso', 'Corvo', 'Lince', 'Mastino', 'Falco', 'Cobra', 'Lupo', 'Ombra', 'Tasso', 'Furia'];
  var REGOLE = { ogni: 15, aperta: 4, taglia: 200 };

  function regole(d) { return Object.assign({}, REGOLE, d.regole || {}); }
  // estrazione n. i su n: si apre ogni "ogni" minuti per "aperta" minuti, sfalsate tra loro
  function finestra(d, i, t) {
    var R = regole(d), n = Math.max(1, (d.estrazioni || []).length), P = R.ogni * 60000, O = R.aperta * 60000;
    var off = i * P / n, x = t - d.inizio - off;
    if (x < 0) return { aperta: false, tra: -x };
    var m = x % P;
    return m < O ? { aperta: true, chiude: O - m } : { aperta: false, tra: P - m };
  }
  function stato(d, eventi, now) {
    var fine = d.fine, t0 = Math.min(now, fine), R = regole(d);
    var sq = {}, con = {};
    (d.squadre || []).forEach(function (s) { sq[s.id] = { id: s.id, nome: s.nome, contratto: null, zaino: 0, salvato: 0, uccisioni: 0, morti: 0, fatti: 0 }; });
    (d.contratti || []).forEach(function (c) { con[c.id] = { stato: 'libero', da: null }; });
    function rilascia(s) { if (s.contratto && con[s.contratto] && con[s.contratto].stato === 'preso') con[s.contratto] = { stato: 'libero', da: null }; s.contratto = null; }
    var ev = (eventi || []).filter(function (e) { return e.t <= t0 && sq[e.squadra]; }).sort(function (a, b) { return a.t - b.t; }), log = [];
    ev.forEach(function (e) {
      var s = sq[e.squadra], c = e.contratto && (d.contratti || []).filter(function (x) { return x.id === e.contratto; })[0];
      if (e.tipo === 'prendi' && c && !s.contratto && con[c.id].stato === 'libero') { con[c.id] = { stato: 'preso', da: s.id }; s.contratto = c.id; }
      else if (e.tipo === 'lascia' && s.contratto === e.contratto) rilascia(s);
      else if (e.tipo === 'fatto' && c && s.contratto === c.id && c.tipo !== 'caccia') {
        con[c.id] = { stato: 'fatto', da: s.id }; s.contratto = null; s.zaino += c.valore; s.fatti++;
        log.push({ t: e.t, testo: s.nome + ' ha completato «' + c.titolo + '»' });
      } else if (e.tipo === 'esfil') {
        var i = (d.estrazioni || []).indexOf(e.punto);
        if (i >= 0 && finestra(d, i, e.t).aperta && s.zaino > 0) { log.push({ t: e.t, testo: s.nome + ' ha esfiltrato ' + s.zaino }); s.salvato += s.zaino; s.zaino = 0; }
      } else if (e.tipo === 'eliminata') {
        log.push({ t: e.t, testo: s.nome + ' eliminata' + (e.da && sq[e.da] ? ' da ' + sq[e.da].nome : '') + (s.zaino ? ': perde ' + s.zaino : '') });
        s.zaino = 0; s.morti++; rilascia(s);
        var k = e.da && sq[e.da];
        if (k && k.id !== s.id) {
          k.uccisioni++; k.zaino += R.taglia;
          // contratto di caccia su questa squadra, preso da chi l'ha eliminata
          if (k.contratto) {
            var cc = (d.contratti || []).filter(function (x) { return x.id === k.contratto; })[0];
            if (cc && cc.tipo === 'caccia' && cc.bersaglio === s.id) { con[cc.id] = { stato: 'fatto', da: k.id }; k.contratto = null; k.zaino += cc.valore; k.fatti++; }
          }
        }
      }
    });
    var finita = now >= fine;
    if (finita) Object.keys(sq).forEach(function (k) { sq[k].persoAllaFine = sq[k].zaino; sq[k].zaino = 0; });
    var classifica = Object.keys(sq).map(function (k) { return sq[k]; }).sort(function (a, b) { return b.salvato - a.salvato || b.uccisioni - a.uccisioni; });
    return { squadre: sq, contratti: con, classifica: classifica, finita: finita, log: log.reverse(), regole: R };
  }
  // contratti generati dalle aree (le estrazioni escluse): tipi a rotazione, una caccia ogni tanto
  function generaContratti(d, aree) {
    var tipi = ['recupero', 'intel', 'sabotaggio', 'ricognizione'], out = [], i = 0;
    var libere = aree.filter(function (p) { return (d.estrazioni || []).indexOf(p.id) < 0 && p.tipo !== 'mob'; });
    libere.forEach(function (p) {
      var tp = tipi[i++ % tipi.length];
      out.push({ id: 'c' + Math.random().toString(36).slice(2, 7), tipo: tp, titolo: TIPI[tp].nome + ' · ' + p.nome, area: p.id, valore: TIPI[tp].valore + (p.tipo === 'chiave' ? 100 : 0) });
    });
    (d.squadre || []).forEach(function (s) {
      if (Math.random() < 0.5 || (d.squadre || []).length < 2) return;
      out.push({ id: 'c' + Math.random().toString(36).slice(2, 7), tipo: 'caccia', titolo: 'Caccia · ' + s.nome, bersaglio: s.id, area: null, valore: TIPI.caccia.valore });
    });
    return out;
  }
  // squadre composte in automatico dai giocatori scelti, del formato voluto
  function componi(giocatori, n) {
    var g = giocatori.slice();
    for (var i = g.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = g[i]; g[i] = g[j]; g[j] = t; }
    var k = Math.max(1, Math.round(g.length / n)), sq = [];
    for (var s = 0; s < k; s++) sq.push({ id: 's' + (s + 1), nome: NOMI[s % NOMI.length], membri: [] });
    g.forEach(function (u, i) { sq[i % k].membri.push(u); });
    return sq;
  }

  window.AC_DMZ = { TIPI: TIPI, FORMATI: FORMATI, NOMI: NOMI, REGOLE: REGOLE, regole: regole, finestra: finestra, stato: stato, generaContratti: generaContratti, componi: componi };
})();
