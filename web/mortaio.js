/* Airsoft Conflict — mortaio: rifornimenti dell'HQ, costruzione all'HQ, richieste di fuoco, tiro e impatti.
   Come in Arma Reforger (Conflict): la base principale (HQ) riceve rifornimenti a intervalli regolari.
   Il mortaio si costruisce solo all'HQ (niente da trasportare) e si paga con quei rifornimenti, come ogni colpo.
   Tutto si ricalcola dagli eventi del conflict (stesso risultato su ogni telefono):
   { tipo:'mortaio', azione:'costruisci'|'annulla', uid, team, pt, t }
   { tipo:'richiesta', uid, team, id, lat, lon, testo, t }
   { tipo:'fuoco', uid, team, pt, deriva, alzo, carica, rif, t }
   Direzione (deriva) in millesimi NATO (6400 = giro completo) rispetto al nord della griglia UTM; alzo in millesimi. */
(function () {
  'use strict';
  var U = window.AC_UTM;
  // reddito: rifornimenti che arrivano all'HQ ogni "periodo" secondi · iniziali: quelli di partenza · max: capienza dell'HQ
  // costo: postazione · colpo: costo di un colpo · costruzione: secondi · letale/vicino: raggi in metri · cadenza: secondi tra due colpi
  var REGOLE = { reddito: 200, periodo: 300, iniziali: 0, max: 3000, costo: 1500, colpo: 50, costruzione: 180, letale: 15, vicino: 40, cadenza: 20 };
  var CARICHE = [45, 65, 80, 95];          // velocità alla bocca (m/s) per carica 0..3
  var ALZO_MIN = 800, ALZO_MAX = 1530, G = 9.81, MIL = 2 * Math.PI / 6400;

  // versione semplificata (la sceglie l'organizzatore): si danno distanza e direzione, o le coordinate lette sulla carta,
  // e alzo e carica li calcola l'app. Più comoda, quindi costa di più.
  var SEMPLICE = { costo: 2200, colpo: 100 };
  function semplice(c) { return !!(c && c.mortaio === 'semplice'); }
  function regole(c) { return Object.assign({}, REGOLE, semplice(c) ? SEMPLICE : {}, (c && c.regole && c.regole.mortaio) || {}); }
  // tiro calcolato dall'app: la carica più bassa che arriva, tiro curvo. direzione in gradi (0 = nord, 90 = est)
  function tiroPer(dist, gradi) {
    for (var c = 0; c < CARICHE.length; c++) {
      var a = alzoPer(dist, c);
      if (a != null) return { carica: c, alzo: a, deriva: ((gradi % 360) + 360) % 360 * 6400 / 360, volo: balistica(a, c).volo, dist: dist };
    }
    return null;
  }
  function portata() { return { min: Math.ceil(balistica(ALZO_MAX, 0).gittata), max: Math.floor(balistica(ALZO_MIN, CARICHE.length - 1).gittata) }; }
  // alzo (millesimi) e carica -> gittata (m) e tempo di volo (s); fuori dai limiti del tubo: null
  function balistica(alzo, carica) {
    var v = CARICHE[carica]; if (v == null || alzo < ALZO_MIN || alzo > ALZO_MAX) return null;
    var th = alzo * MIL;
    return { gittata: v * v * Math.sin(2 * th) / G, volo: 2 * v * Math.sin(th) / G };
  }
  // alzo per una gittata (tiro curvo): quello che sta nella tavola di tiro
  function alzoPer(gittata, carica) {
    var v = CARICHE[carica], s = gittata * G / (v * v);
    if (s > 1) return null;
    var m = Math.round((Math.PI - Math.asin(s)) / 2 / MIL);
    return m < ALZO_MIN || m > ALZO_MAX ? null : m;
  }
  function tavola(da, a, passo) {
    var out = [];
    for (var R = da; R <= a; R += passo) out.push({ m: R, alzi: CARICHE.map(function (_, c) { var z = alzoPer(R, c); return z == null ? null : { alzo: z, volo: balistica(z, c).volo }; }) });
    return out;
  }
  // distanza (m) e direzione (millesimi, nord della griglia) da a a b
  function misura(a, b) {
    var p = U.daLatLon(a.lat, a.lon), q = U.daLatLon(b.lat, b.lon, p.zona);
    var dE = q.E - p.E, dN = q.N - p.N, az = Math.atan2(dE, dN); if (az < 0) az += 2 * Math.PI;
    return { dist: Math.sqrt(dE * dE + dN * dN), mil: az / MIL, dE: dE, dN: dN };
  }
  function sposta(a, mil, dist) {
    var p = U.daLatLon(a.lat, a.lon), th = mil * MIL;
    return U.aLatLon(p.zona, p.nord, p.E + dist * Math.sin(th), p.N + dist * Math.cos(th));
  }
  var PUNTI = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'];
  function versoDi(mil) { return PUNTI[Math.round(((mil % 6400) + 6400) % 6400 / 800) % 8]; }
  // numeri casuali ripetibili (stesso colpo = stesso punto d'impatto su ogni telefono)
  function rng(seme) {
    var h = 1779033703 ^ seme.length;
    for (var i = 0; i < seme.length; i++) { h = Math.imul(h ^ seme.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return function () { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()); }
  // punto d'impatto: la balistica con i valori impostati più la dispersione di un tubo vero (circa 2% in gittata, 6 millesimi in direzione)
  function impatto(da, deriva, alzo, carica, seme) {
    var b = balistica(alzo, carica); if (!b) return null;
    var r = rng(seme), dist = b.gittata * (1 + gauss(r) * 0.02), dir = deriva + gauss(r) * 6;
    var p = sposta(da, dir, dist);
    return { lat: p.lat, lon: p.lon, gittata: dist, volo: b.volo };
  }

  // basi principali (HQ) delle fazioni: dal conflict, altrimenti dalla cartina
  function hqDi(c, punti) {
    var out = {};
    ((c && c.fazioni) || []).forEach(function (f) { if (f.mob) out[f.id] = f.mob; });
    (punti || []).forEach(function (p) { if (p.tipo === 'mob' && p.fazione && !out[p.fazione]) out[p.fazione] = p.id; });
    return out;
  }
  // stato dei rifornimenti e dei mortai di una partita (inizio: quando è partita)
  function stato(c, punti, eventi, now, owner, inizio) {
    var R = regole(c), P = {}, HQ = hqDi(c, punti), cassa = {}, mortai = {}, cantieri = {}, richieste = [], colpi = [], log = [];
    (punti || []).forEach(function (p) { P[p.id] = p; });
    Object.keys(HQ).forEach(function (f) { cassa[f] = { q: R.iniziali, scatto: inizio != null ? inizio : now }; });
    // i rifornimenti arrivano a scatti: ogni periodo, fino alla capienza
    function accredita(t) {
      Object.keys(cassa).forEach(function (f) {
        var k = cassa[f], n = Math.floor((t - k.scatto) / (R.periodo * 1000));
        if (n > 0) { k.q = Math.min(R.max, k.q + n * R.reddito); k.scatto += n * R.periodo * 1000; }
      });
    }
    function chiudiCantieri(t) {
      Object.keys(cantieri).forEach(function (f) {
        var k = cantieri[f]; if (t - k.t < R.costruzione * 1000) return;
        mortai[f] = { pt: k.pt, team: f, da: k.t + R.costruzione * 1000, ultimo: 0 }; delete cantieri[f];
        log.push({ t: k.t + R.costruzione * 1000, team: f, testo: 'Mortaio pronto all\'HQ' });
      });
    }
    var ev = (eventi || []).filter(function (e) { return e.t <= now && (e.tipo === 'mortaio' || e.tipo === 'richiesta' || e.tipo === 'fuoco'); })
      .sort(function (a, b) { return a.t - b.t; });
    ev.forEach(function (e) {
      accredita(e.t); chiudiCantieri(e.t);
      var f = e.team, k = cassa[f];
      if (e.tipo === 'mortaio') {
        if (e.azione === 'costruisci' && k && !mortai[f] && !cantieri[f] && k.q >= R.costo) { k.q -= R.costo; cantieri[f] = { uid: e.uid, team: f, pt: HQ[f], t: e.t }; }
        else if (e.azione === 'annulla' && cantieri[f]) { delete cantieri[f]; if (k) k.q = Math.min(R.max, k.q + R.costo); }
      } else if (e.tipo === 'richiesta') richieste.push({ id: e.id, uid: e.uid, team: f, lat: e.lat, lon: e.lon, testo: e.testo || '', t: e.t });
      else if (e.tipo === 'fuoco') {
        var m = mortai[f], P0 = m && P[m.pt];
        if (!m || !k || k.q < R.colpo || !P0 || P0.lat == null || e.t - m.ultimo < R.cadenza * 1000) return;
        var imp = impatto({ lat: P0.lat, lon: P0.lon }, e.deriva, e.alzo, e.carica, e.uid + ':' + e.t);
        if (!imp) return;
        k.q -= R.colpo; m.ultimo = e.t;
        colpi.push({ id: e.uid + ':' + e.t, team: f, pt: m.pt, uid: e.uid, rif: e.rif || null, t: e.t, arrivo: e.t + imp.volo * 1000, lat: imp.lat, lon: imp.lon, gittata: imp.gittata });
      }
    });
    accredita(now); chiudiCantieri(now);
    var prossimo = {}; Object.keys(cassa).forEach(function (f) { prossimo[f] = cassa[f].q >= R.max ? null : cassa[f].scatto + R.periodo * 1000; });
    return { regole: R, hq: HQ, cassa: cassa, prossimo: prossimo, mortai: mortai, cantieri: cantieri, richieste: richieste, colpi: colpi, log: log };
  }
  // dove è caduto un colpo rispetto al bersaglio, a parole
  function scarto(colpo, bersaglio) {
    var m = misura(bersaglio, colpo);
    if (m.dist < 8) return 'colpo sul bersaglio';
    return 'colpo caduto ' + Math.round(m.dist) + ' m a ' + versoDi(m.mil) + ' del bersaglio';
  }

  window.AC_MORT = { REGOLE: REGOLE, CARICHE: CARICHE, ALZO_MIN: ALZO_MIN, ALZO_MAX: ALZO_MAX, regole: regole, balistica: balistica, alzoPer: alzoPer, tavola: tavola, misura: misura, sposta: sposta, versoDi: versoDi, impatto: impatto, stato: stato, hqDi: hqDi, scarto: scarto, semplice: semplice, tiroPer: tiroPer, portata: portata };
})();
