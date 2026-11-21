/* Officina AC: nella app Android le pagine parlano col cavo USB e col Bluetooth del telefono
   attraverso ACNativo; qui ricostruisco navigator.serial e navigator.bluetooth come nei browser da computer,
   così le pagine (firmware, iniettore, beacon, bandiere) funzionano senza cambiare niente. */
(function () {
  if (!window.ACNativo || window.ACPonte) return;
  var attesa = {}, n = 0;
  function chiama(nome, args) {
    return new Promise(function (ok, ko) { var id = ++n; attesa[id] = { ok: ok, ko: ko }; ACNativo.chiama(nome, id, JSON.stringify(args || {})); });
  }
  function aB64(u8) { var s = '', i, c = 0x8000; for (i = 0; i < u8.length; i += c) s += String.fromCharCode.apply(null, u8.subarray(i, i + c)); return btoa(s); }
  function daB64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function u8di(x) { return x instanceof Uint8Array ? x : x instanceof ArrayBuffer ? new Uint8Array(x) : ArrayBuffer.isView(x) ? new Uint8Array(x.buffer, x.byteOffset, x.byteLength) : new TextEncoder().encode(String(x)); }
  var P = window.ACPonte = { app: true, chiama: chiama };
  P._fine = function (id, ok, dati) { var a = attesa[id]; delete attesa[id]; if (!a) return; if (ok) a.ok(dati); else a.ko(Object.assign(new Error(dati), { name: 'NetworkError' })); };

  // ------------------------------------------------ scelta da un elenco (porta USB, dispositivo Bluetooth)
  function finestra(titolo) {
    var v = document.createElement('div');
    v.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);display:flex;align-items:flex-end;justify-content:center;font-family:system-ui,sans-serif';
    var b = document.createElement('div');
    b.style.cssText = 'background:#1d2218;color:#eee;width:100%;max-width:520px;border-radius:16px 16px 0 0;padding:18px 16px 22px;max-height:75vh;overflow:auto;box-shadow:0 -6px 30px #000';
    var h = document.createElement('div'); h.textContent = titolo; h.style.cssText = 'font-weight:700;font-size:18px;margin-bottom:10px'; b.appendChild(h);
    var l = document.createElement('div'); b.appendChild(l);
    var nota = document.createElement('div'); nota.style.cssText = 'color:#9a9;font-size:14px;margin:8px 2px'; b.appendChild(nota);
    var x = document.createElement('button'); x.textContent = 'Annulla'; x.style.cssText = 'margin-top:10px;width:100%;padding:12px;border-radius:10px;border:1px solid #444;background:#222;color:#ddd;font-size:16px'; b.appendChild(x);
    v.appendChild(b); document.body.appendChild(v);
    return { lista: l, nota: nota, annulla: x, chiudi: function () { v.remove(); } };
  }
  function voce(f, testo, sotto, cb) {
    var r = document.createElement('button');
    r.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;padding:12px;border-radius:10px;border:1px solid #556;background:#2a3122;color:#fff;font-size:16px';
    r.textContent = testo; if (sotto) { var s = document.createElement('div'); s.textContent = sotto; s.style.cssText = 'color:#aab;font-size:13px;margin-top:2px'; r.appendChild(s); }
    r.onclick = cb; f.lista.appendChild(r);
  }
  function annullato() { var e = new Error('Nessun dispositivo scelto'); e.name = 'NotFoundError'; return e; }
  function hex(x) { return ('000' + (x || 0).toString(16)).slice(-4); }

  // ------------------------------------------------ USB: navigator.serial
  var aperta = null;
  function Porta(info) { this._info = info; this.readable = null; this.writable = null; this._l = {}; this._c = null; this.connected = true; }
  Porta.prototype.getInfo = function () { return { usbVendorId: this._info.vid, usbProductId: this._info.pid }; };
  Porta.prototype.open = function (o) {
    var self = this;
    return chiama('usbApri', { id: this._info.id, baud: (o && o.baudRate) || 115200 }).then(function () {
      self.readable = new ReadableStream({ start: function (c) { self._c = c; }, cancel: function () { self._c = null; } });
      self.writable = new WritableStream({ write: function (ch) { return chiama('usbScrivi', { b64: aB64(u8di(ch)) }); } });
      aperta = self;
    });
  };
  Porta.prototype.setSignals = function (s) {
    s = s || {};
    return chiama('usbSegnali', { dtr: s.dataTerminalReady == null ? null : !!s.dataTerminalReady, rts: s.requestToSend == null ? null : !!s.requestToSend });
  };
  Porta.prototype.getSignals = function () { return Promise.resolve({ dataCarrierDetect: false, clearToSend: true, ringIndicator: false, dataSetReady: true }); };
  Porta.prototype.close = function () {
    var self = this;
    return chiama('usbChiudi').then(function () { try { if (self._c) self._c.close(); } catch (e) {} self._c = null; self.readable = null; self.writable = null; if (aperta === self) aperta = null; });
  };
  Porta.prototype.forget = function () { return Promise.resolve(); };
  Porta.prototype.addEventListener = function (t, f) { (this._l[t] = this._l[t] || []).push(f); };
  Porta.prototype.removeEventListener = function (t, f) { this._l[t] = (this._l[t] || []).filter(function (g) { return g !== f; }); };
  P._rx = function (s) { if (aperta && aperta._c) { try { aperta._c.enqueue(daB64(s)); } catch (e) {} } };
  P._persa = function () {
    var p = aperta; aperta = null; if (!p) return;
    try { if (p._c) p._c.error(new Error('Cavo USB scollegato')); } catch (e) {}
    p._c = null; p.readable = null; p.writable = null; p.connected = false;
    (p._l.disconnect || []).forEach(function (f) { try { f({ target: p }); } catch (e) {} });
    (serialL.disconnect || []).forEach(function (f) { try { f({ target: p }); } catch (e) {} });
  };
  var serialL = {};
  var serial = {
    requestPort: function () {
      return chiama('usbElenco').then(JSON.parse).then(function (l) {
        if (!l.length) { var e = new Error('Nessuna scheda USB: collega il T-Beam col cavo OTG'); e.name = 'NotFoundError'; alert(e.message); throw e; }
        if (l.length === 1) return new Porta(l[0]);
        return new Promise(function (ok, ko) {
          var f = finestra('Scegli la porta USB');
          l.forEach(function (x) { voce(f, x.nome, hex(x.vid) + ':' + hex(x.pid), function () { f.chiudi(); ok(new Porta(x)); }); });
          f.annulla.onclick = function () { f.chiudi(); ko(annullato()); };
        });
      });
    },
    getPorts: function () { return Promise.resolve(aperta ? [aperta] : []); },
    addEventListener: function (t, f) { (serialL[t] = serialL[t] || []).push(f); },
    removeEventListener: function () {}
  };
  try { Object.defineProperty(navigator, 'serial', { value: serial, configurable: true }); } catch (e) { navigator.serial = serial; }

  // ------------------------------------------------ Bluetooth: navigator.bluetooth (solo quello che usano le nostre pagine)
  var disp = null, trovati = null, ceErr = null;
  P._bleTrovato = function (d) { if (trovati) trovati(d); };
  P._bleErrore = function (m) { if (ceErr) ceErr(m); };
  P._bleRx = function (s) {
    if (!disp) return; var u = daB64(s), dv = new DataView(u.buffer);
    disp._car.forEach(function (c) { if (!c._notifiche) return; c.value = dv; (c._l.characteristicvaluechanged || []).forEach(function (f) { try { f({ target: c }); } catch (e) {} }); });
  };
  P._bleChiuso = function () {
    var d = disp; if (!d || !d.gatt.connected) return; d.gatt.connected = false;
    (d._l.gattserverdisconnected || []).forEach(function (f) { try { f({ target: d }); } catch (e) {} });
  };
  function Car(d, uuid) { this._d = d; this.uuid = uuid; this._l = {}; this._notifiche = false; this.value = null; this.properties = { notify: true, write: true, writeWithoutResponse: true }; }
  Car.prototype.addEventListener = function (t, f) { (this._l[t] = this._l[t] || []).push(f); };
  Car.prototype.removeEventListener = function (t, f) { this._l[t] = (this._l[t] || []).filter(function (g) { return g !== f; }); };
  Car.prototype.startNotifications = function () { this._notifiche = true; return Promise.resolve(this); };
  Car.prototype.stopNotifications = function () { this._notifiche = false; return Promise.resolve(this); };
  Car.prototype.writeValue = Car.prototype.writeValueWithoutResponse = Car.prototype.writeValueWithResponse = function (v) { return chiama('bleScrivi', { b64: aB64(u8di(v)) }).then(function () {}); };
  function Disp(id, nome) {
    var self = this; this.id = id; this.name = nome; this._l = {}; this._car = [];
    this.gatt = {
      connected: false, device: self,
      connect: function () { return chiama('bleConnetti', { id: id }).then(function () { disp = self; self.gatt.connected = true; return self.gatt; }); },
      disconnect: function () { chiama('bleChiudi'); },
      getPrimaryService: function (u) {
        return Promise.resolve({ uuid: u, device: self, getCharacteristic: function (cu) { var c = new Car(self, cu); self._car.push(c); return Promise.resolve(c); } });
      }
    };
  }
  Disp.prototype.addEventListener = function (t, f) { (this._l[t] = this._l[t] || []).push(f); };
  Disp.prototype.removeEventListener = function (t, f) { this._l[t] = (this._l[t] || []).filter(function (g) { return g !== f; }); };
  var bluetooth = {
    getAvailability: function () { return Promise.resolve(true); },
    requestDevice: function (o) {
      var pre = ((o && o.filters) || []).map(function (f) { return f.namePrefix || f.name; }).filter(Boolean);
      return new Promise(function (ok, ko) {
        var f = finestra('Dispositivi vicini'), finito = false;
        f.nota.textContent = 'Cerco… (il dispositivo deve essere acceso e vicino)';
        function chiudi() { finito = true; trovati = null; ceErr = null; chiama('bleFerma'); f.chiudi(); }
        trovati = function (d) { voce(f, d.nome, d.id + ' · ' + d.rssi + ' dBm', function () { chiudi(); ok(new Disp(d.id, d.nome)); }); };
        ceErr = function (m) { f.nota.textContent = m; };
        f.annulla.onclick = function () { chiudi(); ko(annullato()); };
        chiama('bleCerca', { prefissi: pre }).catch(function (e) { if (!finito) { chiudi(); alert(e.message); ko(annullato()); } });
        setTimeout(function () { if (!finito && !f.lista.children.length) f.nota.textContent = 'Non trovo niente: il T-Beam è acceso? Il Bluetooth e la posizione del telefono sono attivi?'; }, 8000);
      });
    }
  };
  try { Object.defineProperty(navigator, 'bluetooth', { value: bluetooth, configurable: true }); } catch (e) { navigator.bluetooth = bluetooth; }
})();
