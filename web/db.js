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
  var stato = { fase: 'carico', user: null, me: null, admin: false, errore: '' };
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
    var stopMe = null;
    auth.onAuthStateChanged(function (u) {
      if (stopMe) { stopMe(); stopMe = null; }
      stato.user = u; stato.admin = isAdmin(u); stato.me = null;
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
  api.eliminaTeam = function (tid) {
    return db.collection('codiciTeam').doc(tid).get().then(function (s) {
      var b = db.batch();
      if (s.exists && s.data().codice) b.delete(db.collection('inviti').doc(s.data().codice));
      b.delete(db.collection('codiciTeam').doc(tid));
      b.delete(db.collection('team').doc(tid));
      return b.commit();
    });
  };
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
    if (!stato.admin) {
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
