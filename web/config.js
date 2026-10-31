/* Configurazione di Airsoft Conflict (progetto Firebase dedicato, separato dai tesserini).
   I valori "firebase" vanno presi dalla console: Impostazioni progetto → Le tue app → app web. */
window.S40_CONFIG = {
  // organizzatore: per ora l'unico che crea team e giocate
  adminEmail: 'vaisittiluca@gmail.com',
  firebase: {
    apiKey: 'AIzaSyDeGxM0j_-Lm5EiXYGsPoejiGsBOYM-i58',
    // su iPhone il login deve passare dallo stesso indirizzo dell'app; altrove si usa quello standard di Firebase
    authDomain: (location.hostname === 'softair-giocate.web.app' &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)))
      ? 'softair-giocate.web.app' : 'softair-giocate.firebaseapp.com',
    projectId: 'softair-giocate',
    storageBucket: 'softair-giocate.firebasestorage.app',
    messagingSenderId: '545447779914',
    appId: '1:545447779914:web:c1ad1f9f862f70ac7650b3'
  }
};
