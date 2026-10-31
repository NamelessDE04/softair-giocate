/* Airsoft Conflict — Combat a scenari (PCS): generatore di scenari a tappe.
   Dalle tappe (settore, durata, peso delle abilità 0-100) genera: nome dell'operazione, prefazione,
   obiettivi bilanciati (primario, secondari, bonus) con punteggio, briefing per la squadra,
   posizionamento dei difensori, materiale, soluzioni e scheda punti per l'organizzazione.
   Tutto è generico: si stampa e si usa anche senza l'app. */
(function () {
  'use strict';

  var SKILL = [
    ['comunicazioni', 'Comunicazioni'], ['navigazione', 'Navigazione'], ['tiro', 'Tiro dinamico'],
    ['medicina', 'Medicina tattica'], ['rompicapo', 'Rompicapo'], ['osservazione', 'Osservazione'],
    ['incursione', 'Incursione'], ['ingaggi', 'Ingaggi pesanti'], ['sniper', 'Tiri sniper']
  ];
  var TEMI = [
    ['auto', 'A sorpresa'], ['ostaggio', 'Recupero ostaggio'], ['sabotaggio', 'Sabotaggio'],
    ['intel', 'Recupero informazioni'], ['ricognizione', 'Ricognizione in profondità'], ['esfiltrazione', 'Esfiltrazione di un informatore']
  ];

  // generatore casuale ripetibile (stesso seme = stesso scenario)
  function rng(seme) {
    var a = seme >>> 0;
    var f = function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.int = function (a0, b0) { return a0 + Math.floor(f() * (b0 - a0 + 1)); };
    f.pick = function (l) { return l[Math.floor(f() * l.length)]; };
    return f;
  }
  function livello(v) { return v >= 67 ? 3 : v >= 34 ? 2 : 1; }
  function sceltaPesata(r, voci) {
    var tot = voci.reduce(function (s, v) { return s + v.peso; }, 0), x = r() * tot;
    for (var i = 0; i < voci.length; i++) { x -= voci[i].peso; if (x <= 0) return voci[i]; }
    return voci[voci.length - 1];
  }
  function cifre(r, n) { var s = ''; for (var i = 0; i < n; i++) s += r.int(0, 9); return s; }
  var NATO = ['ALFA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL', 'INDIA', 'KILO', 'LIMA', 'MIKE', 'OSCAR', 'ROMEO', 'SIERRA', 'TANGO', 'VICTOR', 'ZULU'];
  var COLORI = ['rosso', 'giallo', 'blu', 'verde', 'bianco', 'arancione'];

  /* ---------- obiettivi: per ogni abilità alcuni modelli; L = livello 1-3 (dalla barra).
     Ogni modello restituisce { titolo, testo (per la squadra), verifica (per l'arbitro), materiale[], soluzione } */
  var OBJ = {
    comunicazioni: [
      function (L, r, t) {
        var parola = r.pick(NATO) + ' ' + r.pick(NATO), min = [10, 8, 6][L - 1];
        return { titolo: 'Contatto radio con il comando', testo: 'Entro ' + min + ' minuti dall\'IN stabilite il contatto con il comando sulla frequenza che vi viene consegnata all\'IN e trasmettete la parola d\'ordine ricevuta.' + (L > 1 ? ' Usate i nominativi, niente nomi propri.' : '') + (L > 2 ? ' La frequenza è cifrata: la ricavate dalla tabella consegnata.' : ''),
          verifica: 'L\'arbitro (o il comando) riceve la parola d\'ordine «' + parola + '» entro ' + min + ' minuti' + (L > 1 ? ', con procedura radio corretta' : '') + '.', materiale: ['Biglietto con frequenza' + (L > 2 ? ' cifrata e tabella di cifratura' : '') + ' e parola d\'ordine «' + parola + '»'], soluzione: 'Parola d\'ordine: ' + parola };
      },
      function (L, r, t) {
        var punti = [2, 3, 4][L - 1];
        return { titolo: 'Rapporto di situazione (SITREP)', testo: 'Prima di uscire dall\'OUT trasmettete al comando un rapporto ' + (L > 1 ? 'in formato S.A.L.U.T.E. (forze, attività, posizione, unità, tempo, equipaggiamento)' : 'con posizione, nemici visti e stato della squadra') + ' su ' + punti + ' elementi osservati nel settore.',
          verifica: 'Rapporto completo con almeno ' + punti + ' elementi veri (confrontare con il dossier difensori)' + (L > 1 ? ' e formato rispettato' : '') + '.', materiale: [], soluzione: 'Elementi veri: vedi posizioni dei difensori di questa tappa.' };
      },
      function (L, r, t) {
        var msg = r.pick(['IL CONVOGLIO PARTE ALLE ', 'LO SCAMBIO AVVIENE ALLE ', 'IL RADUNO E FISSATO PER LE ']) + r.int(10, 23) + ':' + r.pick(['00', '15', '30', '45']);
        return { titolo: 'Intercettazione', testo: 'Il nemico trasmette a intervalli su un canale da individuare' + (L > 1 ? ' (vi viene dato solo l\'intervallo di frequenze)' : '') + '. Ascoltate, annotate il messaggio' + (L > 2 ? ', decifratelo' : '') + ' e riferitelo al comando.',
          verifica: 'Messaggio riportato correttamente: «' + msg + '».', materiale: ['Una radio dell\'organizzazione che ripete il messaggio ogni 3 minuti' + (L > 2 ? ' in alfabeto NATO cifrato (spostamento di 3 lettere)' : '')], soluzione: msg };
      }
    ],
    navigazione: [
      function (L, r, t) {
        var n = L, col = r.pick(COLORI), marc = [];
        for (var i = 0; i < n; i++) marc.push('marker ' + col + ' n.' + (i + 1) + ' (codice ' + cifre(r, 3) + ')');
        return { titolo: 'Raggiungere ' + (n > 1 ? n + ' punti' : 'il punto') + ' in carta', testo: 'All\'IN ricevete ' + (n > 1 ? n + ' coordinate UTM' : 'una coordinata UTM') + '. Raggiungete ' + (n > 1 ? 'i punti' : 'il punto') + ' e annotate il codice del marker ' + col + '.' + (L > 2 ? ' Solo carta e bussola: telefoni e GPS restano spenti.' : ''),
          verifica: 'Codici dei marker riportati: ' + marc.join(', ') + '.', materiale: marc.map(function (m) { return 'Cartellino ' + m; }).concat(['Foglio con le coordinate dei marker (da preparare sul campo)']), soluzione: marc.join(' · ') };
      },
      function (L, r, t) {
        var az = r.int(10, 350), m = [80, 150, 250][L - 1];
        return { titolo: 'Percorso ad azimut', testo: 'Dall\'IN seguite l\'azimut ' + az + '° per circa ' + m + ' m' + (L > 1 ? ', poi il secondo azimut indicato sul cartellino che troverete' : '') + ' e recuperate il plico.',
          verifica: 'Plico recuperato e consegnato all\'OUT.', materiale: ['Plico sigillato posato a ' + m + ' m dall\'IN, azimut ' + az + '°' + (L > 1 ? ', con cartellino per la seconda tratta' : '')], soluzione: 'Azimut ' + az + '° per ' + m + ' m' };
      }
    ],
    tiro: [
      function (L, r, t) {
        var n = [4, 6, 8][L - 1], s = [90, 60, 45][L - 1];
        return { titolo: 'Neutralizzare i bersagli', testo: 'Nel settore ci sono ' + n + ' bersagli (sagome o piattelli). Colpiteli tutti in movimento entro ' + s + ' secondi dal primo colpo' + (L > 2 ? ', senza colpire le sagome «civili» con il segno bianco' : '') + '.',
          verifica: 'Bersagli colpiti entro ' + s + ' s' + (L > 2 ? ', nessun civile colpito' : '') + '. Punteggio pieno con tutti i bersagli, metà con almeno ' + Math.ceil(n / 2) + '.', materiale: [n + ' bersagli a scatto o piattelli' + (L > 2 ? ', 2 sagome civili con segno bianco' : ''), 'Cronometro'], soluzione: '' };
      },
      function (L, r, t) {
        var st = [1, 2, 3][L - 1];
        return { titolo: 'Bonifica ' + (st > 1 ? 'di ' + st + ' locali' : 'del locale'), testo: 'Bonificate ' + (st > 1 ? st + ' locali in sequenza' : 'il locale indicato') + ': all\'interno bersagli e un elemento da recuperare.' + (L > 1 ? ' Muovetevi in coppia, sempre coperti.' : ''),
          verifica: 'Tutti i bersagli colpiti ed elemento recuperato; ogni operatore colpito da un difensore all\'interno annulla il bonus della tappa.', materiale: ['Bersagli nei locali', 'Elemento da recuperare (busta o chiavetta)'], soluzione: '' };
      }
    ],
    medicina: [
      function (L, r, t) {
        var fer = L > 2 ? 2 : 1, m = [30, 60, 100][L - 1];
        return { titolo: (fer > 1 ? 'Due feriti' : 'Ferito') + ' da evacuare', testo: 'Nel settore ' + (fer > 1 ? 'ci sono due feriti' : 'c\'è un ferito') + ' (figurante o manichino con cartellino). Trattatelo secondo M.A.R.C.H.' + (fer > 1 ? ', decidete chi trattare per primo' : '') + ' ed evacuatelo per ' + m + ' m fino al punto indicato.',
          verifica: 'Laccio applicato correttamente sull\'arto giusto, ferito evacuato senza abbandonare la sicurezza' + (fer > 1 ? ', ordine di triage corretto (prima il cartellino ROSSO)' : '') + '.', materiale: [(fer > 1 ? 'Due figuranti o manichini' : 'Un figurante o manichino') + ' con cartellino ferita', 'Laccio emostatico da addestramento', 'Barella o telo da trascinamento'], soluzione: fer > 1 ? 'Triage: prima il ferito con cartellino ROSSO (emorragia), poi il GIALLO.' : '' };
      },
      function (L, r, t) {
        return { titolo: 'Kit medico', testo: 'Recuperate il kit medico nascosto nel settore' + (L > 1 ? ' e portatelo all\'OUT integro: serve nella tappa successiva' : '') + '.',
          verifica: 'Kit consegnato' + (L > 1 ? ' integro (sigillo intatto)' : '') + '.', materiale: ['Sacca medica sigillata'], soluzione: '' };
      }
    ],
    rompicapo: [
      function (L, r, t) {
        var n = [3, 4, 4][L - 1], cod = cifre(r, n);
        return { titolo: 'Lucchetto a combinazione', testo: 'Il materiale è chiuso con un lucchetto a ' + n + ' cifre. La combinazione è nascosta nel settore' + (L > 1 ? ' in ' + n + ' indizi separati' : '') + (L > 2 ? ', ognuno da decifrare' : '') + '.',
          verifica: 'Lucchetto aperto con la combinazione ' + cod + '.', materiale: ['Cassetta con lucchetto a ' + n + ' cifre (combinazione ' + cod + ')', (L > 1 ? n + ' cartellini indizio (una cifra ciascuno' + (L > 2 ? ', scritta come operazione da risolvere' : '') + ')' : 'Cartellino con la combinazione nascosto nel settore')], soluzione: 'Combinazione: ' + cod };
      },
      function (L, r, t) {
        var parola = r.pick(['FALCO', 'TORRE', 'PONTE', 'NEBBIA', 'RADICE', 'COBALTO']), sp = r.int(1, 5);
        var cif = parola.split('').map(function (ch) { return String.fromCharCode((ch.charCodeAt(0) - 65 + sp) % 26 + 65); }).join('');
        return { titolo: 'Messaggio cifrato', testo: 'Trovate il messaggio «' + cif + '» e decifratelo' + (L > 1 ? ': la chiave è un numero nascosto nel settore' : ' (ogni lettera è spostata di ' + sp + ' posizioni)') + '. La parola è la password dell\'OUT.',
          verifica: 'Password all\'OUT: «' + parola + '».', materiale: ['Cartellino con «' + cif + '»'].concat(L > 1 ? ['Cartellino con la chiave «' + sp + '» nascosto nel settore'] : []), soluzione: cif + ' → ' + parola + ' (spostamento ' + sp + ')' };
      }
    ],
    osservazione: [
      function (L, r, t) {
        var n = [5, 8, 12][L - 1], s = [120, 90, 60][L - 1];
        return { titolo: 'Osservazione della postazione', testo: 'Da una posizione coperta osservate la postazione indicata per ' + s + ' secondi senza farvi scoprire. Poi, all\'OUT, riportate più dettagli possibile.',
          verifica: 'Su ' + n + ' oggetti/dettagli predisposti: punteggio pieno con almeno ' + Math.ceil(n * 0.75) + ', metà con ' + Math.ceil(n / 2) + '. Squadra scoperta = zero.', materiale: [n + ' oggetti o dettagli ben visibili nella postazione (annotarli)'], soluzione: 'Elenco degli oggetti messi nella postazione' };
      },
      function (L, r, t) {
        return { titolo: 'Contare le forze nemiche', testo: 'Individuate quanti nemici presidiano il settore e dove, senza ingaggiarli' + (L > 2 ? ' (alcuni sono mimetizzati)' : '') + '.',
          verifica: 'Numero esatto dei difensori della tappa (vedi tabella) = punteggio pieno, ±1 = metà.', materiale: L > 2 ? ['1-2 sagome mimetizzate da contare come nemici'] : [], soluzione: 'Difensori della tappa' + (L > 2 ? ' più le sagome mimetizzate' : '') };
      }
    ],
    incursione: [
      function (L, r, t) {
        return { titolo: 'Infiltrazione senza contatto', testo: 'Raggiungete l\'obiettivo e lasciate il segnale (nastro ' + r.pick(COLORI) + ') senza essere scoperti dalle sentinelle' + (L > 1 ? '. Se vi scoprono, la sentinella dà l\'allarme e la postazione si rinforza' : '') + '.',
          verifica: 'Segnale lasciato senza allarme = punteggio pieno; con allarme = metà.', materiale: ['Nastro segnale', 'Fischietto per l\'allarme delle sentinelle'], soluzione: '' };
      },
      function (L, r, t) {
        var min = [8, 6, 4][L - 1];
        return { titolo: 'Piazzare la carica', testo: 'Piazzate la carica simulata sull\'obiettivo e allontanatevi oltre il punto di sicurezza entro ' + min + ' minuti' + (L > 2 ? ', senza sparare un colpo' : '') + '.',
          verifica: 'Carica piazzata nel punto giusto e squadra al sicuro entro ' + min + ' minuti.', materiale: ['Carica simulata (scatola con timer o cartellino)'], soluzione: '' };
      }
    ],
    ingaggi: [
      function (L, r, t) {
        return { titolo: 'Assalto alla postazione', testo: 'Conquistate la postazione difesa e tenetela per 2 minuti.',
          verifica: 'Postazione conquistata (difensori in postazione fissa colpiti o ritirati) e tenuta 2 minuti.', materiale: ['Postazione con riparo (sacchi, bancali)'], soluzione: '' };
      },
      function (L, r, t) {
        var min = [3, 5, 8][L - 1];
        return { titolo: 'Tenere la posizione', testo: 'Raggiunto il punto indicato, tenetelo per ' + min + ' minuti contro il contrattacco.',
          verifica: 'Punto tenuto ' + min + ' minuti con almeno metà squadra non colpita.', materiale: [], soluzione: '' };
      }
    ],
    sniper: [
      function (L, r, t) {
        var d = [30, 50, 70][L - 1], c = [5, 3, 2][L - 1];
        return { titolo: 'Tiro a lunga distanza', testo: 'Dalla posizione di tiro colpite il bersaglio a circa ' + d + ' m con al massimo ' + c + ' colpi.',
          verifica: 'Bersaglio colpito entro ' + c + ' colpi.', materiale: ['Bersaglio a ' + d + ' m (piattello o gong)', 'Posizione di tiro segnata'], soluzione: '' };
      },
      function (L, r, t) {
        return { titolo: 'Eliminare l\'obiettivo di alto valore', testo: 'Un obiettivo di alto valore (difensore con fascia ' + r.pick(COLORI) + ') si sposta nel settore' + (L > 1 ? ' scortato' : '') + '. Eliminatelo con un solo colpo dal tiratore scelto' + (L > 2 ? ' prima che raggiunga il punto di fuga' : '') + '.',
          verifica: 'Obiettivo colpito dal tiratore scelto con il primo colpo.', materiale: ['Fascia colorata per l\'obiettivo'], soluzione: '' };
      }
    ]
  };

  // ---------- difensori: quanti e con che compito, in base alle abilità della tappa
  function difensori(sk, r, obiettivi) {
    var out = [], L = function (k) { return livello(sk[k] || 0); }, v = function (k) { return sk[k] || 0; };
    out.push({ ruolo: 'Sentinella', posizione: 'Vicino all\'IN, 40-60 m dentro il settore, coperta, con vista sul sentiero d\'ingresso.', compito: 'Osserva e dà l\'allarme (fischietto) se vede la squadra. Ingaggia solo se ingaggiata.' });
    if (v('ingaggi') > 0 || v('tiro') > 50) {
      var n = 1 + Math.round(v('ingaggi') / 50);
      for (var i = 0; i < n; i++) out.push({ ruolo: 'Postazione fissa', posizione: 'Sull\'obiettivo principale, dietro riparo' + (i ? ', a 10-15 m dalla prima per incrociare il fuoco' : '') + '.', compito: 'Difende l\'obiettivo. Non si sposta oltre 10 m dalla postazione.' });
    }
    if (v('incursione') > 33) out.push({ ruolo: 'Pattuglia', posizione: 'In movimento lento tra l\'IN e l\'obiettivo, giro di 3-4 minuti.', compito: 'Cerca la squadra. Se la scopre dà l\'allarme e ingaggia.' });
    if (v('sniper') > 33) out.push({ ruolo: 'Tiratore scelto nemico', posizione: 'In posizione elevata o defilata con vista sull\'area di avvicinamento.', compito: 'Ingaggia da lontano chi resta allo scoperto. Si sposta dopo ogni colpo.' });
    if (v('osservazione') > 50) out.push({ ruolo: 'Osservatore mimetizzato', posizione: 'Immobile e mimetizzato vicino al percorso più probabile.', compito: 'Non spara: conta come scoperto se la squadra lo individua e lo segnala.' });
    var ferito = obiettivi.some(function (o) { return /ferit/i.test(o.titolo); });
    if (ferito) out.push({ ruolo: 'Figurante ferito', posizione: 'Steso nel punto del ferito, con il cartellino della ferita.', compito: 'Recita la parte del ferito. Non spara e non è bersaglio.' });
    if (L('ingaggi') === 3) out.push({ ruolo: 'Squadra di contrattacco', posizione: 'Fuori vista, 80-100 m oltre l\'obiettivo.', compito: 'Parte su segnale dell\'arbitro dopo la conquista dell\'obiettivo.' });
    return out.slice(0, 8);
  }

  // ---------- storia
  var AGG = ['Grigio', 'Silenzioso', 'di Ferro', 'Nero', 'di Vetro', 'Freddo', 'Lungo'];
  var NOMI = ['Lupo', 'Falco', 'Tuono', 'Corvo', 'Ponte', 'Inverno', 'Mastino', 'Vento'];
  var NEMICI = ['una milizia irregolare che controlla la valle', 'un gruppo armato legato al traffico di armi', 'una cellula di sabotatori infiltrata nella zona', 'i resti di una compagnia di mercenari senza più comando'];
  var STORIE = {
    ostaggio: function (op, nem, tappe) { return 'Da tre giorni un tecnico dell\'acquedotto è trattenuto da ' + nem + '. Le ultime informazioni lo collocano oltre ' + tappe[tappe.length - 1] + '. La vostra squadra entra dalla zona di ' + tappe[0] + ' e deve aprirsi la strada settore per settore, raccogliendo informazioni e riportando l\'ostaggio vivo. Il tempo gioca contro di voi: ogni ora che passa il gruppo potrebbe spostarlo.'; },
    sabotaggio: function (op, nem, tappe) { return 'Il deposito che rifornisce ' + nem + ' si trova nella zona di ' + tappe[tappe.length - 1] + '. Distruggerlo significa togliere loro la capacità di combattere per settimane. Partite da ' + tappe[0] + ': lungo la strada dovrete eliminare gli avamposti, raccogliere i codici di accesso e arrivare all\'obiettivo senza che diano l\'allarme generale.'; },
    intel: function (op, nem, tappe) { return 'Un nostro informatore ha nascosto documenti decisivi su ' + nem + ' in più punti della zona. Partite da ' + tappe[0] + ' e recuperate tutto il materiale fino a ' + tappe[tappe.length - 1] + ': ogni elemento che trovate rende più chiaro il quadro del nemico. Niente va lasciato indietro.'; },
    ricognizione: function (op, nem, tappe) { return 'Il comando prepara un\'operazione su larga scala contro ' + nem + ', ma la zona da ' + tappe[0] + ' a ' + tappe[tappe.length - 1] + ' è una macchia bianca sulle nostre carte. Entrate, osservate, contate, comunicate. Il vostro compito è vedere senza essere visti e riportare tutto quello che serve a chi verrà dopo di voi.'; },
    esfiltrazione: function (op, nem, tappe) { return 'Un informatore infiltrato in ' + nem + ' è stato scoperto e deve uscire dalla zona entro oggi. Vi aspetta oltre ' + tappe[tappe.length - 1] + '. Partite da ' + tappe[0] + ', raggiungetelo e riportatelo indietro: è ferito, è stanco e il nemico lo sta cercando quanto voi.'; }
  };

  // ---------- generazione completa
  function genera(sc) {
    var seme = sc.seme || 1, r = rng(seme), tappe = sc.tappe || [];
    var tema = sc.tema && sc.tema !== 'auto' ? sc.tema : r.pick(['ostaggio', 'sabotaggio', 'intel', 'ricognizione', 'esfiltrazione']);
    var operazione = 'Operazione ' + r.pick(NOMI) + ' ' + r.pick(AGG), nemico = r.pick(NEMICI);
    var nomiSettori = tappe.map(function (t, i) { return t.settore || 'Settore ' + (i + 1); });
    var prefazione = STORIE[tema](operazione, nemico, nomiSettori.length ? nomiSettori : ['la zona di partenza']);
    var usati = {}, totale = 0;
    var out = tappe.map(function (t, i) {
      var sk = t.skill || {}, durata = t.durata || 45;
      var voci = SKILL.map(function (k) { return { k: k[0], nome: k[1], peso: sk[k[0]] || 0 }; }).filter(function (v) { return v.peso > 0; });
      if (!voci.length) voci = SKILL.map(function (k) { return { k: k[0], nome: k[1], peso: 50 }; });
      var nSec = durata >= 40 ? 2 : 1, nBon = durata >= 60 ? 2 : 1, n = Math.min(voci.length, 1 + nSec + nBon);
      // primario: l'abilità con il peso più alto (a parità, a caso); poi secondari e bonus pescati in proporzione al peso
      var ord = voci.slice().sort(function (a, b) { return b.peso - a.peso || r() - 0.5; });
      var scelte = [ord[0]], resto = ord.slice(1);
      while (scelte.length < n && resto.length) { var x = sceltaPesata(r, resto); scelte.push(x); resto.splice(resto.indexOf(x), 1); }
      // se ci sono meno abilità che obiettivi, si ripete l'abilità più pesata
      while (scelte.length < 1 + nSec + nBon) scelte.push(sceltaPesata(r, voci));
      var obiettivi = scelte.map(function (s, j) {
        var tipo = j === 0 ? 'primario' : j <= nSec ? 'secondario' : 'bonus', L = livello(s.peso);
        // a rotazione tra i modelli della stessa abilità, partendo da uno a caso: niente doppioni nello stesso scenario
        var modelli = OBJ[s.k];
        if (usati[s.k] == null) usati[s.k] = r.int(0, modelli.length - 1); else usati[s.k]++;
        var m = modelli[usati[s.k] % modelli.length];
        var o = m(L, r, t);
        var base = { primario: 120, secondario: 60, bonus: 30 }[tipo], fattore = [0.8, 1, 1.25][L - 1];
        o.punti = Math.round(base * fattore / 5) * 5; o.tipo = tipo; o.skill = s.k; o.skillNome = s.nome; o.livello = L;
        totale += o.punti;
        return o;
      });
      var dif = difensori(sk, r, obiettivi);
      var materiale = []; obiettivi.forEach(function (o) { (o.materiale || []).forEach(function (m) { materiale.push(m); }); });
      var punti = obiettivi.reduce(function (s, o) { return s + o.punti; }, 0);
      var intro = r.pick(['Il settore è presidiato.', 'Movimenti nemici segnalati nelle ultime ore.', 'Zona calma in apparenza: non fidatevi.', 'Il nemico sa che state arrivando.']);
      return {
        n: i + 1, settore: nomiSettori[i], durata: durata, area: t.area || null,
        briefing: 'Tappa ' + (i + 1) + ' — ' + nomiSettori[i] + '. ' + intro + ' Avete ' + durata + ' minuti dall\'IN all\'OUT. ' + 'Obiettivo principale: ' + obiettivi[0].titolo.toLowerCase() + '.',
        obiettivi: obiettivi, difensori: dif, materiale: materiale, punti: punti
      };
    });
    return { operazione: operazione, tema: tema, nemico: nemico, prefazione: prefazione, tappe: out, totale: totale, seme: seme, generato: Date.now() };
  }

  var REGOLE = [
    'Ogni tappa ha un IN (inizio) e un OUT (fine). Il tempo parte all\'IN e si ferma all\'OUT: oltre il tempo la tappa vale solo i punti già confermati.',
    'Gli obiettivi primari valgono di più; i secondari e i bonus si sommano. L\'arbitro conferma ogni obiettivo sulla scheda punti.',
    'Colpito: braccio alzato, si raggiunge il punto di attesa del settore e si rientra dopo 3 minuti, senza parlare di quanto visto.',
    'I difensori sono dell\'organizzazione: seguono i loro ordini e non possono essere interrogati.',
    'Sicurezza: occhiali sempre indossati. Il canale radio di sicurezza ha la precedenza su tutto. «STOP GIOCO» ferma tutti.'
  ];

  window.AC_PCS = { SKILL: SKILL, TEMI: TEMI, genera: genera, REGOLE: REGOLE, livello: livello };
})();
