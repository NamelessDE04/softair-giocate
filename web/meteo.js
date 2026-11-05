/* Airsoft Conflict — previsioni del tempo per un evento, confrontando più modelli meteo.
   Dati: Open-Meteo (gratuito, senza chiave), che dà accesso ai modelli dei servizi meteo nazionali:
   pensato per il Piemonte: più peso ai modelli ad alta risoluzione che coprono il Nord-Ovest e vedono bene Alpi e valli
   (ItaliaMeteo-ARPAE ICON-2I 2,2 km, MeteoSwiss ICON-CH1 1 km e CH2 2 km, Météo-France AROME/ARPEGE, ICON-D2/EU),
   più ECMWF, il miglior modello globale, che regge anche a una-due settimane. Niente GFS: troppo grossolano per le valli.
   Ogni modello si chiede a parte: se uno non risponde o non copre quella data, si usano gli altri.
   Il risultato è un "consenso": temperatura mediana, quanti modelli danno pioggia, raffiche, e quanto vanno d'accordo. */
(function () {
  'use strict';
  // [modello, nome, peso]: i modelli locali contano di più (coprono solo i primi giorni: oltre, restano quelli che ci arrivano)
  var MODELLI = [
    ['italia_meteo_arpae_icon_2i', 'ItaliaMeteo', 3], ['meteoswiss_icon_ch1', 'MeteoSwiss 1 km', 3], ['meteoswiss_icon_ch2', 'MeteoSwiss', 2.5],
    ['meteofrance_seamless', 'Météo-France', 2], ['icon_seamless', 'ICON', 2], ['ecmwf_ifs025', 'ECMWF', 2]
  ];
  var ORIZZONTE = 15 * 86400000;   // oltre ~15 giorni nessun modello è affidabile
  var VALIDO = 3600000;            // previsione in cache per un'ora
  var mem = {};

  function leggi(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function scrivi(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function giorno(t) { var d = new Date(t); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  // mediana pesata: v = [[valore, peso], ...]
  function medianaP(v) {
    v = v.slice().sort(function (x, y) { return x[0] - y[0]; });
    var tot = v.reduce(function (s, x) { return s + x[1]; }, 0), acc = 0;
    for (var i = 0; i < v.length; i++) { acc += v[i][1]; if (acc >= tot / 2) return v[i][0]; }
    return null;
  }
  function mediana(a) { a = a.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; }

  // coordinate dell'evento: centro della cartina del campo, altrimenti il nome del luogo cercato su OpenStreetMap
  function coordinate(ev) {
    var S = window.S40, U = window.AC_UTM;
    var daCampo = ev.campo && S && S.caricaCampo ? S.caricaCampo(ev.campo).then(function (cm) {
      if (cm && cm.geo && cm.w) { var ll = U.daPixel(cm.geo, cm.w / 2, cm.h / 2); return { lat: ll.lat, lon: ll.lon }; }
      return null;
    }, function () { return null; }) : Promise.resolve(null);
    return daCampo.then(function (p) {
      if (p || !ev.luogo) return p;
      var k = 'geo:' + ev.luogo.trim().toLowerCase(), c = leggi(k);
      if (c) return c;
      return fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=it&q=' + encodeURIComponent(ev.luogo))
        .then(function (r) { return r.json(); }).then(function (j) {
          if (!j || !j[0]) return null;
          var q = { lat: +j[0].lat, lon: +j[0].lon }; scrivi(k, q); return q;
        }).catch(function () { return null; });
    });
  }

  function unModello(m, p, da, a) {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat.toFixed(4) + '&longitude=' + p.lon.toFixed(4) +
      '&hourly=temperature_2m,precipitation,wind_gusts_10m,weather_code,cloud_cover&models=' + m[0] +
      '&timezone=Europe%2FRome&timeformat=unixtime&wind_speed_unit=kmh&start_date=' + giorno(da) + '&end_date=' + giorno(a);
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.hourly) return null;
      var h = j.hourly, ore = [];
      for (var i = 0; i < h.time.length; i++) {
        var t = h.time[i] * 1000;
        if (t < da - 1800000 || t > a + 1800000 || h.temperature_2m[i] == null) continue;
        ore.push({ t: t, temp: h.temperature_2m[i], pioggia: h.precipitation[i] || 0, raffica: h.wind_gusts_10m[i] || 0, codice: h.weather_code[i] || 0, nuvole: h.cloud_cover[i] || 0 });
      }
      if (!ore.length) return null;
      var tt = ore.map(function (o) { return o.temp; }), cod = ore.map(function (o) { return o.codice; });
      return {
        nome: m[1], peso: m[2], tMin: Math.min.apply(null, tt), tMax: Math.max.apply(null, tt),
        pioggia: ore.reduce(function (s, o) { return s + o.pioggia; }, 0),
        orePioggia: ore.filter(function (o) { return o.pioggia >= 0.2; }).length,
        raffica: Math.max.apply(null, ore.map(function (o) { return o.raffica; })),
        nuvole: ore.reduce(function (s, o) { return s + o.nuvole; }, 0) / ore.length,
        temporale: cod.some(function (c) { return c >= 95; }), neve: cod.some(function (c) { return (c >= 71 && c <= 77) || c === 85 || c === 86; }),
        nebbia: cod.filter(function (c) { return c === 45 || c === 48; }).length >= ore.length / 3
      };
    }).catch(function () { return null; });
  }

  function consenso(rr) {
    var n = rr.length; if (!n) return null;
    var P = rr.reduce(function (s, r) { return s + (r.peso || 1); }, 0), peso = function (f) { return rr.filter(f).reduce(function (s, r) { return s + (r.peso || 1); }, 0); };
    var piovono = rr.filter(function (r) { return r.pioggia >= 1; }), mm = piovono.map(function (r) { return r.pioggia; });
    var quota = peso(function (r) { return r.pioggia >= 1; }) / P, maggioranza = function (f) { return peso(f) > P / 2; };
    var mp = function (k) { return medianaP(rr.map(function (r) { return [r[k], r.peso || 1]; })); };
    var tMin = mp('tMin'), tMax = mp('tMax'), raffica = mp('raffica'), nuvole = mp('nuvole');
    var icona = maggioranza(function (r) { return r.neve; }) ? '🌨' : quota >= 0.5 ? (maggioranza(function (r) { return r.temporale; }) ? '⛈' : '🌧')
      : maggioranza(function (r) { return r.nebbia; }) ? '🌫' : quota > 0 ? '🌦' : nuvole > 70 ? '☁' : nuvole > 30 ? '⛅' : '☀';
    var cielo = quota === 0 ? 'asciutto' : quota < 0.34 ? 'pioggia poco probabile' : quota < 0.67 ? 'possibile pioggia' : 'pioggia probabile';
    if (piovono.length) { var lo = Math.max(1, Math.round(Math.min.apply(null, mm))), hi = Math.max(1, Math.round(Math.max.apply(null, mm))); cielo += ' (' + (lo === hi ? lo : lo + '–' + hi) + ' mm)'; }
    // accordo: quanto si scostano le temperature massime e quanto è divisa la pioggia
    var spread = Math.max.apply(null, rr.map(function (r) { return r.tMax; })) - Math.min.apply(null, rr.map(function (r) { return r.tMax; }));
    var diviso = quota > 0.2 && quota < 0.8;
    var accordo = n < 2 ? 'un solo modello' : spread <= 3 && !diviso ? 'modelli d\'accordo' : spread <= 6 && !(quota > 0.35 && quota < 0.65) ? 'abbastanza d\'accordo' : 'modelli in disaccordo';
    return {
      icona: icona, tMin: Math.round(tMin), tMax: Math.round(tMax), cielo: cielo, quota: quota,
      raffica: Math.round(raffica), ventoso: raffica >= 40, accordo: accordo, n: n,
      fonti: rr.map(function (r) { return r.nome; }), dettaglio: rr
    };
  }

  // ev: { campo, luogo, ritrovo, inizio, fine } → Promise di { stato:'ok'|'lontano'|'nessun luogo'|'errore', ... }
  function previsione(ev) {
    var da = ev.ritrovo || ev.inizio, a = ev.fine || (ev.inizio + 6 * 3600000), ora = Date.now();
    if (!da) return Promise.resolve({ stato: 'nessuna data' });
    if (a < ora) return Promise.resolve({ stato: 'passato' });
    if (da - ora > ORIZZONTE) return Promise.resolve({ stato: 'lontano', dal: da - ORIZZONTE });
    if (da < ora) da = ora;
    return coordinate(ev).then(function (p) {
      if (!p) return { stato: 'nessun luogo' };
      var k = 'meteo:' + p.lat.toFixed(2) + ',' + p.lon.toFixed(2) + ':' + Math.round(da / 3600000) + '-' + Math.round(a / 3600000);
      var c = mem[k] || leggi(k);
      if (c && ora - c.quando < VALIDO) return c;
      return Promise.all(MODELLI.map(function (m) { return unModello(m, p, da, a); })).then(function (rr) {
        var ris = consenso(rr.filter(Boolean));
        if (!ris) return { stato: 'errore' };
        ris.stato = 'ok'; ris.quando = ora; ris.lat = p.lat; ris.lon = p.lon;
        mem[k] = ris; scrivi(k, ris); return ris;
      });
    }).catch(function () { return { stato: 'errore' }; });
  }

  // riquadro compatto per le carte della home
  function riquadro(ev) {
    var box = document.createElement('div'); box.className = 'meteo';
    box.textContent = '… previsioni';
    previsione(ev).then(function (r) {
      if (r.stato === 'passato' || r.stato === 'nessuna data') { box.remove(); return; }
      if (r.stato === 'lontano') { box.className = 'meteo spento'; box.textContent = 'Previsioni meteo dal ' + new Date(r.dal).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }); return; }
      if (r.stato !== 'ok') { box.className = 'meteo spento'; box.textContent = r.stato === 'nessun luogo' ? 'Meteo: luogo non trovato' : 'Meteo non disponibile'; return; }
      box.innerHTML = '';
      var riga = document.createElement('div'); riga.className = 'meteo-r';
      var ic = document.createElement('span'); ic.className = 'meteo-ic'; ic.textContent = r.icona; riga.appendChild(ic);
      var tx = document.createElement('span');
      tx.textContent = (r.tMin === r.tMax ? r.tMax : r.tMin + '–' + r.tMax) + '° · ' + r.cielo + ' · raffiche ' + r.raffica + ' km/h' + (r.ventoso ? ' ⚠' : '');
      riga.appendChild(tx); box.appendChild(riga);
      var s = document.createElement('small');
      s.textContent = r.accordo + ' (' + r.n + ': ' + r.fonti.join(', ') + ') · dati Open-Meteo';
      box.appendChild(s);
      box.title = r.dettaglio.map(function (d) { return d.nome + ': ' + Math.round(d.tMin) + '–' + Math.round(d.tMax) + '°, ' + d.pioggia.toFixed(1) + ' mm, raffiche ' + Math.round(d.raffica); }).join('\n');
    });
    return box;
  }

  window.AC_METEO = { previsione: previsione, riquadro: riquadro, consenso: consenso };
})();
