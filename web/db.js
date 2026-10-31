/* Collegamento al database (Firebase) di Airsoft Conflict.
   Raccolte:
   - utenti/{uid}                 { email, nome, callsign, team, squadra, codice }
   - team/{tid}                   { nome, logo, referente:{nome,tel}, referenteUid, squadre:[{id,nome}] }
   - inviti/{codice}              { team }          si legge solo conoscendo il codice
   - codiciTeam/{tid}             { codice }        lo vedono organizzatore e referente del team
   - conflitti/{cid}              { titolo, luogo, mapsUrl, ritrovo, inizio, fine, campo, fazioni[], team[], fazioneDi{}, comandanti{}, mappaDa, parcheggio{} }
   - conflitti/{cid}/bacheca      { tipo, titolo, testo, img, pubblica }
   - conflitti/{cid}/adesioni/{uid} { team, nome, si, t }
   - conflitti/{cid}/eventi       { tipo:'zona'|'ordine', uid, team(=fazione), pt, t, ... } */
(function () {
  'use strict';

  var C = window.S40_CONFIG || {};
  var api = { pronto: false };
  window.S40 = api;

  var fb = null, auth = null, db = null;
  var stato = { fase: 'carico', user: null, me: null, admin: false, dev: false, ruolo: 'truppa', permessi: null, errore: '' };

  // ---------- ruoli e permessi (la tabella la decide il developer, in config/permessi)
  var RUOLI = [['organizzatore', 'Organizzatore'], ['comandante', 'Comandante di fazione'], ['caposquadra', 'Caposquadra'], ['truppa', 'Truppa']];
  var PERMESSI = [
    ['Organizzazione', [
      ['conflitti', 'Creare e modificare conflict e bacheca (vede tutti i conflict)'],
      ['team', 'Creare, modificare ed eliminare team e codici'],
      ['giocatori', 'Modificare, spostare ed eliminare giocatori'],
      ['risposte', 'Vedere chi ha risposto agli inviti']]],
    ['Prima del conflict', [
      ['bachecaPrima', 'Leggere i post della bacheca prima della pubblicazione'],
      ['cartinaPrima', 'Vedere la cartina del campo prima della data'],
      ['parcheggioPrima', 'Vedere il parcheggio prima della data'],
      ['telefoni', 'Vedere il numero di cellulare dei referenti'],
      ['rosa', 'Vedere i giocatori del proprio team']]],
    ['In partita', [
      ['ordini', 'Dare ordini alla propria fazione'],
      ['presenze', 'Vedere i compagni presenti in tutti i punti'],
      ['prova', 'Usare la mappa di prova']]]
  ];
  var DEFAULT = {
    organizzatore: { conflitti: true, team: true, giocatori: true, risposte: true, bachecaPrima: true, cartinaPrima: true, parcheggioPrima: true, telefoni: true, rosa: true, ordini: true, presenze: true, prova: true },
    comandante: { risposte: true, cartinaPrima: true, parcheggioPrima: true, telefoni: true, rosa: true, ordini: true, presenze: true, prova: true },
    caposquadra: { parcheggioPrima: true, telefoni: true, rosa: true, presenze: true, prova: true },
    truppa: { telefoni: true, rosa: true, prova: true }
  };
  api.RUOLI = RUOLI; api.PERMESSI = PERMESSI; api.DEFAULT = DEFAULT;
  api.nomeRuolo = function (r) { if (r === 'developer') return 'Developer'; var x = RUOLI.filter(function (q) { return q[0] === r; })[0]; return x ? x[1] : 'Truppa'; };
  // può fare/vedere p? il developer può sempre tutto
  api.puo = function (p) {
    if (stato.dev) return true;
    var tab = stato.permessi || DEFAULT, r = tab[stato.ruolo] || {};
    return r[p] === true;
  };
  api.permessi = function () { return JSON.parse(JSON.stringify(stato.permessi || DEFAULT)); };
  api.salvaPermessi = function (tab) { return db.collection('config').doc('permessi').set(tab); };
  var ascoltatori = [];
  function emetti() { ascoltatori.forEach(function (f) { try { f(stato); } catch (e) { console.error(e); } }); }
  api.onStato = function (f) { ascoltatori.push(f); f(stato); };
  api.stato = function () { return stato; };

  function isAdmin(u) { return !!(u && u.email && C.adminEmail && u.email.toLowerCase() === C.adminEmail.toLowerCase()); }

  api.avvia = function () {
    if (!window.firebase || !C.firebase) {
      stato.fase = 'errore'; stato.errore = 'Configurazione del database mancante.'; emetti(); return;
    }
    fb = window.firebase;
    fb.initializeApp(C.firebase);
    auth = fb.auth(); db = fb.firestore();
    try { db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}
    var stopMe = null, stopPerm = null;
    auth.onAuthStateChanged(function (u) {
      if (stopMe) { stopMe(); stopMe = null; }
      if (stopPerm) { stopPerm(); stopPerm = null; }
      stato.user = u; stato.dev = stato.admin = isAdmin(u); stato.me = null;
      if (u) stopPerm = db.collection('config').doc('permessi').onSnapshot(function (s) {
        stato.permessi = s.exists ? s.data() : null; if (stato.fase === 'pronto') emetti();
      }, function () {});
      if (!u) { stato.fase = 'login'; emetti(); return; }
      stato.fase = 'carico'; emetti();
      var ref = db.collection('utenti').doc(u.uid);
      stopMe = ref.onSnapshot(function (s) {
        if (!s.exists) {
          if (s.metadata && s.metadata.fromCache) return;
          ref.set({ email: u.email || '', nome: u.displayName || '', callsign: '', team: null, squadra: null }).catch(function (e) {
            stato.fase = 'errore'; stato.errore = 'Profilo non creato: ' + (e.message || e); emetti();
          });
          return;
        }
        stato.me = Object.assign({ uid: u.uid }, s.data());
        stato.ruolo = stato.dev ? 'developer' : (stato.me.ruolo || 'truppa');
        stato.fase = 'pronto'; emetti();
      }, function (e) { stato.fase = 'errore'; stato.errore = 'Database non raggiungibile: ' + (e.message || e); emetti(); });
    });
  };

  api.login = function () {
    var p = new fb.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return auth.signInWithPopup(p);
  };
  api.logout = function () { return auth.signOut(); };

  function lista(qs) { return qs.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
  function doc(s) { return s.exists ? Object.assign({ id: s.id }, s.data()) : null; }

  // ---------- profilo
  api.aggiornaProfilo = function (p) { return db.collection('utenti').doc(stato.user.uid).set(p, { merge: true }); };

  // ---------- team
  var ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente 0/O e 1/I
  function codice(n) {
    var a = new Uint8Array(n); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (x) { return ALFABETO[x % ALFABETO.length]; }).join('');
  }
  api.idBreve = function () { return codice(5).toLowerCase(); };
  api.ascoltaTeam = function (cb) { return db.collection('team').onSnapshot(function (qs) { cb(lista(qs)); }, function () { cb([]); }); };
  api.ascoltaUnTeam = function (tid, cb) { return db.collection('team').doc(tid).onSnapshot(function (s) { cb(doc(s)); }, function () { cb(null); }); };
  api.creaTeam = function (nome) {
    var tid = db.collection('team').doc().id, cod = codice(6);
    var b = db.batch();
    b.set(db.collection('team').doc(tid), { nome: nome, logo: '', referente: { nome: '', tel: '' }, referenteUid: null, squadre: [] });
    b.set(db.collection('inviti').doc(cod), { team: tid });
    b.set(db.collection('codiciTeam').doc(tid), { codice: cod });
    return b.commit().then(function () { return tid; });
  };
  api.salvaTeam = function (tid, dati) { return db.collection('team').doc(tid).set(dati, { merge: true }); };
  // cellulare del referente: sta a parte, così lo vede solo chi ha il permesso
  api.ascoltaContatti = function (cb) {
    if (!api.puo('telefoni') && !api.puo('team')) { cb({}); return function () {}; }
    return db.collection('contatti').onSnapshot(function (qs) { var m = {}; qs.docs.forEach(function (d) { m[d.id] = d.data().tel || ''; }); cb(m); }, function () { cb({}); });
  };
  api.leggiContatto = function (tid) { return db.collection('contatti').doc(tid).get().then(function (s) { return s.exists ? s.data().tel || '' : ''; }, function () { return ''; }); };
  api.salvaContatto = function (tid, tel) { return db.collection('contatti').doc(tid).set({ tel: tel || '' }); };
  // elimina il team: i giocatori restano senza team e il team esce dai conflict
  api.eliminaTeam = function (tid) {
    return Promise.all([
      db.collection('codiciTeam').doc(tid).get(),
      db.collection('utenti').where('team', '==', tid).get(),
      db.collection('conflitti').where('team', 'array-contains', tid).get()
    ]).then(function (r) {
      var b = db.batch();
      if (r[0].exists && r[0].data().codice) b.delete(db.collection('inviti').doc(r[0].data().codice));
      r[1].docs.forEach(function (d) { b.set(d.ref, { team: null, squadra: null, codice: null }, { merge: true }); });
      r[2].docs.forEach(function (d) {
        var c = d.data(), fd = Object.assign({}, c.fazioneDi || {}); delete fd[tid];
        b.set(d.ref, {
          team: (c.team || []).filter(function (x) { return x !== tid; }), fazioneDi: fd,
          fazioni: (c.fazioni || []).map(function (f) { return Object.assign({}, f, { team: (f.team || []).filter(function (x) { return x !== tid; }) }); })
        }, { merge: true });
      });
      b.delete(db.collection('codiciTeam').doc(tid));
      b.delete(db.collection('contatti').doc(tid));
      b.delete(db.collection('team').doc(tid));
      return b.commit();
    });
  };
  // nuovo codice d'invito (il vecchio smette di funzionare)
  api.nuovoCodice = function (tid) {
    return db.collection('codiciTeam').doc(tid).get().then(function (s) {
      var cod = codice(6), b = db.batch();
      if (s.exists && s.data().codice) b.delete(db.collection('inviti').doc(s.data().codice));
      b.set(db.collection('inviti').doc(cod), { team: tid });
      b.set(db.collection('codiciTeam').doc(tid), { codice: cod });
      return b.commit().then(function () { return cod; });
    });
  };
  // solo organizzatore: tutti i giocatori
  api.ascoltaUtenti = function (cb) { return db.collection('utenti').onSnapshot(function (qs) { cb(lista(qs)); }, function () { cb([]); }); };
  api.salvaUtente = function (uid, dati) { return db.collection('utenti').doc(uid).set(dati, { merge: true }); };
  api.eliminaUtente = function (uid) { return db.collection('utenti').doc(uid).delete(); };
  api.eliminaAdesione = function (cid, uid) { return db.collection('conflitti/' + cid + '/adesioni').doc(uid).delete(); };
  api.codiceTeam = function (tid) {
    return db.collection('codiciTeam').doc(tid).get().then(function (s) { return s.exists ? s.data().codice : ''; }, function () { return ''; });
  };
  api.entraTeam = function (cod) {
    cod = (cod || '').trim().toUpperCase();
    return db.collection('inviti').doc(cod).get().then(function (s) {
      if (!s.exists) throw new Error('Codice non valido');
      return api.aggiornaProfilo({ team: s.data().team, codice: cod, squadra: null });
    });
  };
  api.ascoltaMembri = function (tid, cb) {
    return db.collection('utenti').where('team', '==', tid).onSnapshot(function (qs) { cb(lista(qs)); }, function () { cb([]); });
  };
  api.leggiMembri = function (tid) {
    return db.collection('utenti').where('team', '==', tid).get().then(lista, function () { return []; });
  };
  api.impostaSquadra = function (uid, sq) { return db.collection('utenti').doc(uid).set({ squadra: sq || null }, { merge: true }); };
  api.togliMembro = function (uid) { return db.collection('utenti').doc(uid).set({ team: null, codice: null, squadra: null }, { merge: true }); };

  // ---------- conflitti
  api.nuovoId = function () { return db.collection('conflitti').doc().id; };
  api.ascoltaConflitti = function (cb) {
    var q = db.collection('conflitti');
    if (!api.puo('conflitti')) {
      if (!stato.me || !stato.me.team) { cb([]); return function () {}; }
      q = q.where('team', 'array-contains', stato.me.team);
    }
    return q.onSnapshot(function (qs) { cb(lista(qs)); }, function () { cb([]); });
  };
  api.salvaConflitto = function (c) {
    var dati = JSON.parse(JSON.stringify(c)); var cid = dati.id; delete dati.id;
    return db.collection('conflitti').doc(cid).set(dati);
  };
  api.eliminaConflitto = function (cid) { return db.collection('conflitti').doc(cid).delete(); };
  api.ascoltaBacheca = function (cid, cb) {
    return db.collection('conflitti/' + cid + '/bacheca').onSnapshot(function (qs) { cb(lista(qs)); }, function () { cb([]); });
  };
  api.salvaPost = function (cid, p) {
    var dati = Object.assign({}, p), id = dati.id || db.collection('conflitti/' + cid + '/bacheca').doc().id; delete dati.id;
    return db.collection('conflitti/' + cid + '/bacheca').doc(id).set(dati);
  };
  api.eliminaPost = function (cid, id) { return db.collection('conflitti/' + cid + '/bacheca').doc(id).delete(); };
  api.ascoltaAdesioni = function (cid, cb) {
    // senza il permesso si legge solo la propria risposta
    if (!api.puo('risposte') && !api.puo('conflitti')) {
      return db.collection('conflitti/' + cid + '/adesioni').doc(stato.user.uid).onSnapshot(function (s) { cb(s.exists ? [Object.assign({ id: s.id }, s.data())] : []); }, function () { cb([]); });
    }
    return db.collection('conflitti/' + cid + '/adesioni').onSnapshot(function (qs) { cb(lista(qs)); }, function () { cb([]); });
  };
  api.rispondiInvito = function (cid, si) {
    var me = stato.me;
    return db.collection('conflitti/' + cid + '/adesioni').doc(stato.user.uid)
      .set({ team: me.team, nome: me.callsign || me.nome || '', si: !!si, t: Date.now() });
  };
  // eventi di gioco (posizione nei punti, ordini del comandante)
  api.ascoltaEventi = function (cid, cb) {
    return db.collection('conflitti/' + cid + '/eventi').onSnapshot(function (qs) { cb(qs.docs.map(function (d) { return d.data(); })); }, function () { cb([]); });
  };
  api.scriviEvento = function (cid, e) { db.collection('conflitti/' + cid + '/eventi').doc().set(e).catch(function (x) { console.warn('evento non salvato', x); }); };
})();
