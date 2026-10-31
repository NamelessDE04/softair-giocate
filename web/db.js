/* Collegamento al database (Firebase) di Softair 4.0.
   Raccolte:
   - utenti/{uid}            { email, nome, callsign, team, codice }   il team lo sceglie il giocatore con il codice d'invito
   - team/{tid}              { nome, colore }                          i nomi dei team li vedono tutti
   - inviti/{codice}         { team }                                  si legge solo conoscendo il codice
   - giocate/{gid}           { titolo, luogo, inizio, durata, team[], obiettivi[] }
   - segreti/{gid}           { <obiettivo>: codice }                   solo l'organizzatore (servono per stampare i QR)
   - giocate/{gid}/catture   { obiettivo, team, uid, nome, ora }       una per ogni QR scansionato */
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
    // cache sul telefono: si gioca anche senza rete, le catture partono appena torna il segnale
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
          // primo accesso: si crea il profilo (senza team)
          if (s.metadata && s.metadata.fromCache) return;
          ref.set({ email: u.email || '', nome: u.displayName || '', callsign: '', team: null }).catch(function (e) {
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

  // ---------- letture in tempo reale (ognuna restituisce la funzione per smettere di ascoltare)
  function lista(qs) { return qs.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
  api.ascoltaTeam = function (cb) { return db.collection('team').onSnapshot(function (qs) { cb(lista(qs)); }, function () { cb([]); }); };
  api.ascoltaGiocate = function (cb) {
    var q = db.collection('giocate');
    if (!stato.admin) {
      if (!stato.me || !stato.me.team) { cb([]); return function () {}; }
      q = q.where('team', 'array-contains', stato.me.team);
    }
    return q.onSnapshot(function (qs) { cb(lista(qs)); }, function () { cb([]); });
  };
  api.ascoltaCatture = function (gid, cb) {
    return db.collection('giocate/' + gid + '/catture').onSnapshot({ includeMetadataChanges: true }, function (qs) {
      cb(qs.docs.map(function (d) {
        return Object.assign({ id: d.id, inAttesa: !!(d.metadata && d.metadata.hasPendingWrites) }, d.data());
      }));
    }, function () { cb([]); });
  };
  api.ascoltaMembri = function (tid, cb) {
    return db.collection('utenti').where('team', '==', tid).onSnapshot(function (qs) { cb(lista(qs)); }, function () { cb([]); });
  };

  // ---------- profilo e team
  api.aggiornaProfilo = function (p) { return db.collection('utenti').doc(stato.user.uid).set(p, { merge: true }); };
  var ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente 0/O e 1/I: si leggono male
  function codice(n) {
    var a = new Uint8Array(n); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (x) { return ALFABETO[x % ALFABETO.length]; }).join('');
  }
  api.codice = codice;
  api.creaTeam = function (nome, colore) {
    var tid = db.collection('team').doc().id, cod = codice(6);
    var b = db.batch();
    // il codice NON va nel documento del team (che leggono tutti): sta solo in inviti/, che l'organizzatore può elencare
    b.set(db.collection('team').doc(tid), { nome: nome, colore: colore });
    b.set(db.collection('inviti').doc(cod), { team: tid });
    return b.commit().then(function () { return tid; });
  };
  api.entraTeam = function (cod) {
    cod = (cod || '').trim().toUpperCase();
    return db.collection('inviti').doc(cod).get().then(function (s) {
      if (!s.exists) throw new Error('Codice non valido');
      return api.aggiornaProfilo({ team: s.data().team, codice: cod });
    });
  };
  // solo per l'organizzatore: codice d'invito di ogni team { tid: codice }
  api.ascoltaInviti = function (cb) {
    return db.collection('inviti').onSnapshot(function (qs) {
      var m = {}; qs.docs.forEach(function (d) { m[d.data().team] = d.id; }); cb(m);
    }, function () { cb({}); });
  };
  api.togliMembro = function (uid) { return db.collection('utenti').doc(uid).set({ team: null, codice: null }, { merge: true }); };

  // ---------- giocate
  api.nuovoId = function () { return db.collection('giocate').doc().id; };
  api.salvaGiocata = function (g, segreti) {
    var dati = JSON.parse(JSON.stringify(g)); var gid = dati.id; delete dati.id;
    var b = db.batch();
    b.set(db.collection('giocate').doc(gid), dati);
    b.set(db.collection('segreti').doc(gid), segreti);
    return b.commit();
  };
  api.leggiSegreti = function (gid) { return db.collection('segreti').doc(gid).get().then(function (s) { return s.exists ? s.data() : {}; }); };
  api.eliminaGiocata = function (gid) {
    return Promise.all([db.collection('giocate').doc(gid).delete(), db.collection('segreti').doc(gid).delete()]);
  };
  // la cattura viene scritta subito nella cache del telefono: senza rete parte appena c'è segnale
  api.registraCattura = function (gid, c) {
    var ref = db.collection('giocate/' + gid + '/catture').doc();
    ref.set(c).catch(function (e) { console.warn('cattura non salvata', e); });
    return ref.id;
  };
  api.annullaCattura = function (gid, cid) { return db.collection('giocate/' + gid + '/catture').doc(cid).delete(); };

  // impronta del codice di un obiettivo: nel piano della giocata c'è solo l'impronta, non il codice
  api.impronta = function (gid, cod) {
    var txt = new TextEncoder().encode(gid + ':' + (cod || '').trim().toUpperCase());
    return crypto.subtle.digest('SHA-256', txt).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  };
})();
