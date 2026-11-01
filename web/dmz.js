/* Airsoft Conflict — modalità DMZ (stile Warzone): squadre contro squadre, contratti, zaino, estrazioni.
   Lo stato si ricalcola dagli eventi (come nel conflict). L'app scrive solo quattro tipi di evento:
   { tipo:'prendi'|'lascia', squadra, contratto, t }
   { tipo:'qr', squadra, punto, t }          scansione di un QR: è il motore a decidere cosa vale
   { tipo:'eliminata', squadra, da, t }      da = squadra che ha eliminato (facoltativa)
   Contratti:
   ricognizione  più punti da scansionare nell'ordine giusto
   recupero      la cassa va esfiltrata entro un tempo, altrimenti si perde
   intel         i documenti rivelano un'area bonus da raggiungere
   sabotaggio    due scansioni nella stessa area a distanza di qualche minuto: bisogna tenere la posizione
   caccia        vale quando la squadra bersaglio dichiara di essere stata eliminata da voi */
(function () {
  'use strict';

  var TIPI = {
    ricognizione: { nome: 'Ricognizione', valore: 250, testo: 'Scansionate i punti di osservazione nell\'ordine indicato.' },
    recupero: { nome: 'Recupero', valore: 300, testo: 'Recuperate la cassa (QR dell\'area) ed esfiltratela entro il tempo limite, o va persa.' },
    intel: { nome: 'Intel', valore: 400, testo: 'Recuperate i documenti (QR dell\'area): indicano un\'area con un bonus.' },
    sabotaggio: { nome: 'Sabotaggio', valore: 500, testo: 'Piazzate la carica (QR dell\'area), tenete la posizione e scansionate di nuovo per farla saltare.' },
    caccia: { nome: 'Caccia', valore: 600, testo: 'Eliminate la squadra bersaglio: vale quando loro dichiarano di essere stati eliminati da voi.' }
  };
  var FORMATI = [[2, 'Duo'], [3, 'Trio'], [4, 'Quad'], [6, 'Squad (fino a 6)']];
  var NOMI = ['Spettro', 'Vipera', 'Orso', 'Corvo', 'Lince', 'Mastino', 'Falco', 'Cobra', 'Lupo', 'Ombra', 'Tasso', 'Furia'];
  // ogni/aperta: estrazioni (minuti) · taglia: premio per squadra eliminata · tieni: minuti del sabotaggio · cassa: minuti per esfiltrare il recupero · bonus: valore dell'area bonus dell'intel
  var REGOLE = { ogni: 15, aperta: 4, taglia: 200, tieni: 3, cassa: 20, bonus: 150 };
  var MIN = 60000;

  function regole(d) { return Object.assign({}, REGOLE, d.regole || {}); }
  // estrazione n. i su n: si apre ogni "ogni" minuti per "aperta" minuti, sfalsate tra loro
  function finestra(d, i, t) {
    var R = regole(d), n = Math.max(1, (d.estrazioni || []).length), P = R.ogni * MIN, O = R.aperta * MIN;
    var off = i * P / n, x = t - d.inizio - off;
    if (x < 0) return { aperta: false, tra: -x };
    var m = x % P;
    return m < O ? { aperta: true, chiude: O - m } : { aperta: false, tra: P - m };
  }
  function tappe(c) { return c.tappe && c.tappe.length ? c.tappe : [c.area]; }

  function stato(d, eventi, now) {
    var fine = d.fine, t0 = Math.min(now, fine), R = regole(d);
    var sq = {}, con = {}, log = [], CON = {};
    (d.contratti || []).forEach(function (c) { con[c.id] = { stato: 'libero', da: null }; CON[c.id] = c; });
    (d.squadre || []).forEach(function (s) {
      sq[s.id] = { id: s.id, nome: s.nome, contratto: null, prog: 0, innesco: null, casse: [], bonus: null, zaino: 0, salvato: 0, uccisioni: 0, morti: 0, fatti: 0, esito: null };
    });
    function rilascia(s) {
      if (s.contratto && con[s.contratto] && con[s.contratto].stato === 'preso') con[s.contratto] = { stato: 'libero', da: null };
      s.contratto = null; s.prog = 0; s.innesco = null;
    }
    function completa(s, c, t) {
      con[c.id] = { stato: 'fatto', da: s.id }; s.contratto = null; s.prog = 0; s.innesco = null; s.fatti++;
      log.push({ t: t, testo: s.nome + ' ha completato «' + c.titolo + '»' });
    }
    // casse del recupero non esfiltrate in tempo: si perdono
    function scadenze(t) {
      Object.keys(sq).forEach(function (k) {
        var s = sq[k];
        s.casse = s.casse.filter(function (x) {
          if (x.scade > t) return true;
          s.zaino -= x.valore; log.push({ t: x.scade, testo: s.nome + ' ha perso una cassa (tempo scaduto)' }); return false;
        });
      });
    }
    function qr(s, p, t) {
      var i = (d.estrazioni || []).indexOf(p);
      if (i >= 0) {
        var w = finestra(d, i, t);
        if (!w.aperta) return { k: 'chiusa', tra: w.tra };
        if (s.zaino <= 0) return { k: 'vuoto' };
        var v = s.zaino; log.push({ t: t, testo: s.nome + ' ha esfiltrato ' + v });
        s.salvato += v; s.zaino = 0; s.casse = [];
        return { k: 'esfil', valore: v };
      }
      if (s.bonus && s.bonus.area === p) { var b = s.bonus.valore; s.zaino += b; s.bonus = null; log.push({ t: t, testo: s.nome + ' ha trovato il bonus dell\'intel' }); return { k: 'bonus', valore: b }; }
      var c = s.contratto && CON[s.contratto];
      if (!c || c.tipo === 'caccia') return { k: 'nessuno' };
      if (c.tipo === 'ricognizione') {
        var tp = tappe(c);
        if (p === tp[s.prog]) {
          s.prog++;
          if (s.prog < tp.length) return { k: 'tappa', n: s.prog, tot: tp.length, prossima: tp[s.prog] };
          s.zaino += c.valore; completa(s, c, t); return { k: 'fatto', valore: c.valore };
        }
        return { k: tp.indexOf(p) >= 0 ? 'ordine' : 'altrove', area: tp[s.prog] };
      }
      if (p !== c.area) return { k: 'altrove', area: c.area };
      if (c.tipo === 'sabotaggio') {
        if (s.innesco == null) { s.innesco = t; return { k: 'innesco', resta: R.tieni * MIN }; }
        var resta = s.innesco + R.tieni * MIN - t;
        if (resta > 0) return { k: 'attendi', resta: resta };
        s.zaino += c.valore; completa(s, c, t); return { k: 'fatto', valore: c.valore };
      }
      if (c.tipo === 'recupero') {
        s.zaino += c.valore; s.casse.push({ valore: c.valore, scade: t + R.cassa * MIN }); completa(s, c, t);
        return { k: 'cassa', valore: c.valore, scade: R.cassa * MIN };
      }
      // intel
      s.zaino += c.valore; completa(s, c, t);
      if (c.bonus) { s.bonus = { area: c.bonus, valore: R.bonus }; return { k: 'intel', valore: c.valore, area: c.bonus, bonus: R.bonus }; }
      return { k: 'fatto', valore: c.valore };
    }

    var ev = (eventi || []).filter(function (e) { return e.t <= t0 && sq[e.squadra]; }).sort(function (a, b) { return a.t - b.t; });
    ev.forEach(function (e) {
      scadenze(e.t);
      var s = sq[e.squadra], c = e.contratto && CON[e.contratto];
      if (e.tipo === 'prendi') {
        if (c && !s.contratto && con[c.id].stato === 'libero' && !(c.tipo === 'caccia' && c.bersaglio === s.id)) { con[c.id] = { stato: 'preso', da: s.id }; s.contratto = c.id; s.prog = 0; s.innesco = null; s.esito = { k: 'preso' }; }
        else s.esito = { k: 'occupato' };
      } else if (e.tipo === 'lascia') { if (s.contratto === e.contratto) rilascia(s); }
      else if (e.tipo === 'qr') s.esito = qr(s, e.punto, e.t);
      else if (e.tipo === 'eliminata') {
        log.push({ t: e.t, testo: s.nome + ' eliminata' + (e.da && sq[e.da] ? ' da ' + sq[e.da].nome : '') + (s.zaino ? ': perde ' + s.zaino : '') });
        s.zaino = 0; s.casse = []; s.bonus = null; s.morti++;
        // il contratto resta, ma si riparte da capo (tappe e carica)
        s.prog = 0; s.innesco = null;
        var k = e.da && sq[e.da];
        if (k && k.id !== s.id) {
          k.uccisioni++; k.zaino += R.taglia;
          var cc = k.contratto && CON[k.contratto];
          if (cc && cc.tipo === 'caccia' && cc.bersaglio === s.id) { k.zaino += cc.valore; completa(k, cc, e.t); }
        }
      }
    });
    scadenze(t0);
    var finita = now >= fine;
    if (finita) Object.keys(sq).forEach(function (k) { sq[k].persoAllaFine = sq[k].zaino; sq[k].zaino = 0; sq[k].casse = []; });
    var classifica = Object.keys(sq).map(function (k) { return sq[k]; }).sort(function (a, b) { return b.salvato - a.salvato || b.uccisioni - a.uccisioni; });
    log.sort(function (a, b) { return b.t - a.t; });
    return { squadre: sq, contratti: con, classifica: classifica, finita: finita, log: log, regole: R };
  }
  // area su cui deve andare la squadra adesso (per evidenziarla sulla mappa)
  function obiettivo(d, s) {
    var c = s && s.contratto && (d.contratti || []).filter(function (x) { return x.id === s.contratto; })[0];
    if (!c || c.tipo === 'caccia') return s && s.bonus ? s.bonus.area : null;
    return c.tipo === 'ricognizione' ? tappe(c)[s.prog] : c.area;
  }

  function mescola(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function nuovoId() { return 'c' + Math.random().toString(36).slice(2, 7); }
  // contratti generati dalle aree (estrazioni e basi escluse): tipi a rotazione, una caccia ogni tanto
  function generaContratti(d, aree) {
    var tipi = ['recupero', 'intel', 'sabotaggio', 'ricognizione'], out = [], i = 0;
    var libere = aree.filter(function (p) { return (d.estrazioni || []).indexOf(p.id) < 0 && p.tipo !== 'mob'; });
    function nome(id) { var p = libere.filter(function (x) { return x.id === id; })[0]; return p ? p.nome : '?'; }
    libere.forEach(function (p) {
      var tp = tipi[i++ % tipi.length], extra = p.tipo === 'chiave' ? 100 : 0, altre = mescola(libere.filter(function (x) { return x.id !== p.id; })).map(function (x) { return x.id; });
      var c = { id: nuovoId(), tipo: tp, titolo: TIPI[tp].nome + ' · ' + p.nome, area: p.id, valore: TIPI[tp].valore + extra };
      if (tp === 'ricognizione' && altre.length) {
        c.tappe = [p.id].concat(altre.slice(0, Math.min(2, altre.length)));
        c.titolo = 'Ricognizione · ' + c.tappe.map(nome).join(' → ');
        c.valore += 100 * (c.tappe.length - 1);
      }
      if (tp === 'intel' && altre.length) c.bonus = altre[0];
      out.push(c);
    });
    (d.squadre || []).forEach(function (s) {
      if (Math.random() < 0.5 || (d.squadre || []).length < 2) return;
      out.push({ id: nuovoId(), tipo: 'caccia', titolo: 'Caccia · ' + s.nome, bersaglio: s.id, area: null, valore: TIPI.caccia.valore });
    });
    return out;
  }
  // squadre composte a caso dai giocatori scelti, del formato voluto
  function componi(giocatori, n) {
    var g = mescola(giocatori), k = Math.max(1, Math.round(g.length / n)), sq = [];
    for (var s = 0; s < k; s++) sq.push({ id: 's' + (s + 1), nome: NOMI[s % NOMI.length], membri: [] });
    g.forEach(function (u, i) { sq[i % k].membri.push(u); });
    return sq;
  }

  window.AC_DMZ = { TIPI: TIPI, FORMATI: FORMATI, NOMI: NOMI, REGOLE: REGOLE, regole: regole, finestra: finestra, stato: stato, obiettivo: obiettivo, tappe: tappe, generaContratti: generaContratti, componi: componi };
})();
