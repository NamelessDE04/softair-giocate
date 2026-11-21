/* Officina AC (app Android): niente account né database. Le pagine dell'app che usano solo i dispositivi
   (firmware, iniettore, beacon, bandiere, chat LoRa) funzionano; il resto risponde "non disponibile qui". */
(function () {
  var MSG = 'Nell\'Officina (senza account) questo non si salva: fallo dall\'app web.';
  var stato = { fase: 'pronto', user: { uid: 'officina', email: '' }, dev: true, admin: true, ruolo: 'developer', permessi: null, privato: {}, privacy: null,
    me: { uid: 'officina', callsign: 'Officina', team: null, squadra: null, nome: '', email: '' } };
  var RUOLI = [['organizzatore', 'Organizzatore'], ['comandante', 'Comandante'], ['caposquadra', 'Caposquadra'], ['truppa', 'Truppa']];
  var base = {
    RUOLI: RUOLI, PERMESSI: [], DEFAULT: {}, REGOLE: {},
    stato: function () { return stato; },
    onStato: function (f) { setTimeout(function () { f(stato); }, 0); },
    avvia: function () {},
    puo: function () { return true; },
    permessi: function () { return {}; },
    nomeRuolo: function (r) { var x = RUOLI.filter(function (q) { return q[0] === r; })[0]; return r === 'developer' ? 'Officina' : x ? x[1] : 'Truppa'; },
    vedeTelefoni: function () { return false; },
    privacyTelefoni: function () { return 'referenti'; },
    sistemaPrivacy: function () { return Promise.resolve(0); },
    campoInCache: function () { return null; },
    idBreve: function () { return Math.random().toString(36).slice(2, 10); },
    nuovoId: function () { return Math.random().toString(36).slice(2, 12); },
    nuovoCampoId: function () { return Math.random().toString(36).slice(2, 12); },
    impronta: function (t) { return String(t).length.toString(36); }
  };
  window.S40 = new Proxy(base, {
    get: function (o, k) {
      if (k in o) return o[k];
      if (typeof k !== 'string') return undefined;
      if (/^ascolta/.test(k)) return function () { return function () {}; };
      if (/^(leggi|carica|codici)/.test(k)) return function () { return Promise.resolve(/Chat|Membri/.test(k) ? [] : null); };
      return function () { return Promise.reject(new Error(MSG)); };
    }
  });
})();
