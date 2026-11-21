package it.airsoftconflict.officina

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.PendingIntent
import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.hoho.android.usbserial.driver.CdcAcmSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import com.hoho.android.usbserial.util.SerialInputOutputManager
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Officina AC: le pagine dell'app (copiate dentro l'APK) in una WebView, più un "ponte" che dà loro
 * il cavo USB (OTG) e il Bluetooth del telefono, con le stesse interfacce del browser (Web Serial e Web Bluetooth).
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private val main = Handler(Looper.getMainLooper())
    private val lavoro = Executors.newSingleThreadExecutor()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(true)
        web = WebView(this)
        setContentView(web)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            mediaPlaybackRequiresUserGesture = false
        }
        web.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == "appassets.androidplatform.net") return false
                try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: Exception) {}
                return true
            }
        }
        web.webChromeClient = WebChromeClient()
        web.addJavascriptInterface(Ponte(), "ACNativo")
        val ponteJs = assets.open("ponte.js").bufferedReader().readText()
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
            WebViewCompat.addDocumentStartJavaScript(web, ponteJs, setOf("*"))
        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else super.onBackPressed() }

    override fun onDestroy() { chiudiUsb(); chiudiBle(); super.onDestroy() }

    private fun js(codice: String) = main.post { web.evaluateJavascript(codice, null) }
    private fun fine(id: Int, ok: Boolean, dati: String = "") = js("window.ACPonte&&ACPonte._fine($id,$ok,${JSONObject.quote(dati)})")

    inner class Ponte {
        @JavascriptInterface
        fun chiama(nome: String, id: Int, args: String) {
            val a = try { JSONObject(args) } catch (_: Exception) { JSONObject() }
            main.post {
                try {
                    when (nome) {
                        "usbElenco" -> fine(id, true, usbElenco().toString())
                        "usbApri" -> usbApri(id, a.getInt("id"), a.optInt("baud", 115200))
                        "usbScrivi" -> usbScrivi(id, a.getString("b64"))
                        "usbSegnali" -> usbSegnali(id, a)
                        "usbChiudi" -> { chiudiUsb(); fine(id, true) }
                        "bleCerca" -> bleCerca(id, a.optJSONArray("prefissi"))
                        "bleFerma" -> { fermaScan(); fine(id, true) }
                        "bleConnetti" -> bleConnetti(id, a.getString("id"))
                        "bleScrivi" -> bleScrivi(id, a.getString("b64"))
                        "bleChiudi" -> { chiudiBle(); fine(id, true) }
                        "vibra" -> fine(id, true)
                        else -> fine(id, false, "funzione sconosciuta: $nome")
                    }
                } catch (e: Exception) { fine(id, false, e.message ?: e.toString()) }
            }
        }
    }

    // ================================================================ USB
    private val usbManager by lazy { getSystemService(Context.USB_SERVICE) as UsbManager }
    private var porta: UsbSerialPort? = null
    private var portaDev: Int = -1
    private var io: SerialInputOutputManager? = null
    private val AZIONE_PERMESSO = "it.airsoftconflict.officina.USB_PERMESSO"

    private fun prober(): UsbSerialProber {
        val t = UsbSerialProber.getDefaultProbeTable()
        t.addProduct(0x1a86, 0x55d4, CdcAcmSerialDriver::class.java)   // CH9102 (T-Beam recenti)
        t.addProduct(0x1a86, 0x55d3, CdcAcmSerialDriver::class.java)
        t.addProduct(0x1a86, 0x55d5, CdcAcmSerialDriver::class.java)
        return UsbSerialProber(t)
    }
    private fun driverDi(idDev: Int): UsbSerialDriver? =
        prober().findAllDrivers(usbManager).firstOrNull { it.device.deviceId == idDev }
            ?: usbManager.deviceList.values.firstOrNull { it.deviceId == idDev }?.let { CdcAcmSerialDriver(it) }

    private fun usbElenco(): JSONArray {
        val out = JSONArray(); val visti = HashSet<Int>()
        for (d in prober().findAllDrivers(usbManager)) { visti.add(d.device.deviceId); out.put(infoDev(d.device)) }
        for (dev in usbManager.deviceList.values) if (!visti.contains(dev.deviceId)) out.put(infoDev(dev).put("generico", true))
        return out
    }
    private fun infoDev(d: UsbDevice) = JSONObject().put("id", d.deviceId).put("vid", d.vendorId).put("pid", d.productId)
        .put("nome", (if (Build.VERSION.SDK_INT >= 21) d.productName else null) ?: "USB")

    private fun usbApri(id: Int, idDev: Int, baud: Int) {
        val drv = driverDi(idDev) ?: return fine(id, false, "Scheda USB non trovata: ricollega il cavo")
        if (!usbManager.hasPermission(drv.device)) {
            val ricevi = object : BroadcastReceiver() {
                override fun onReceive(c: Context, i: Intent) {
                    try { unregisterReceiver(this) } catch (_: Exception) {}
                    if (i.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) usbApri(id, idDev, baud)
                    else fine(id, false, "Permesso USB negato")
                }
            }
            ContextCompat.registerReceiver(this, ricevi, IntentFilter(AZIONE_PERMESSO), ContextCompat.RECEIVER_NOT_EXPORTED)
            val flag = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
            val pi = PendingIntent.getBroadcast(this, 0, Intent(AZIONE_PERMESSO).setPackage(packageName), flag)
            usbManager.requestPermission(drv.device, pi)
            return
        }
        lavoro.execute {
            try {
                chiudiUsb()
                val conn = usbManager.openDevice(drv.device) ?: throw Exception("Non riesco ad aprire la scheda USB")
                val p = drv.ports[0]
                p.open(conn)
                p.setParameters(baud, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
                porta = p; portaDev = idDev
                val m = SerialInputOutputManager(p, object : SerialInputOutputManager.Listener {
                    override fun onNewData(data: ByteArray) { js("ACPonte._rx('" + Base64.encodeToString(data, Base64.NO_WRAP) + "')") }
                    override fun onRunError(e: Exception) { if (porta === p) { chiudiUsb(); js("ACPonte._persa()") } }
                })
                m.readBufferSize = 4096
                m.start(); io = m
                fine(id, true)
            } catch (e: Exception) { fine(id, false, e.message ?: e.toString()) }
        }
    }
    private fun usbScrivi(id: Int, b64: String) {
        val dati = Base64.decode(b64, Base64.DEFAULT)
        lavoro.execute {
            val p = porta ?: return@execute fine(id, false, "Porta USB chiusa")
            try { p.write(dati, 3000); fine(id, true) } catch (e: Exception) { fine(id, false, e.message ?: "scrittura USB fallita") }
        }
    }
    private fun usbSegnali(id: Int, a: JSONObject) {
        lavoro.execute {
            val p = porta ?: return@execute fine(id, false, "Porta USB chiusa")
            try {
                if (a.has("dtr") && !a.isNull("dtr")) p.dtr = a.getBoolean("dtr")
                if (a.has("rts") && !a.isNull("rts")) p.rts = a.getBoolean("rts")
                fine(id, true)
            } catch (e: Exception) { fine(id, false, e.message ?: "segnali USB") }
        }
    }
    private fun chiudiUsb() {
        try { io?.stop() } catch (_: Exception) {}
        io = null
        try { porta?.close() } catch (_: Exception) {}
        porta = null; portaDev = -1
    }

    // ================================================================ Bluetooth (solo il servizio "UART" Nordic dei nostri T-Beam)
    private val NUS = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e")
    private val NUS_RX = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e")
    private val NUS_TX = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e")
    private val CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    private val bt by lazy { (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter }
    private var scanCb: ScanCallback? = null
    private var gatt: BluetoothGatt? = null
    private var rxChar: BluetoothGattCharacteristic? = null
    private var mtu = 23
    private var idConnessione = -1
    private val coda = ArrayDeque<ByteArray>()
    private var idScrittura = -1
    private var inScrittura = false
    private var dopoPermessi: (() -> Unit)? = null

    private fun permessiBle(): Array<String> = if (Build.VERSION.SDK_INT >= 31)
        arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
    else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    private fun conPermessi(id: Int, fai: () -> Unit) {
        val mancano = permessiBle().filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (mancano.isEmpty()) { fai(); return }
        dopoPermessi = { if (permessiBle().all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }) fai() else fine(id, false, "Permesso Bluetooth negato") }
        requestPermissions(mancano.toTypedArray(), 7)
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        val f = dopoPermessi; dopoPermessi = null; f?.invoke()
    }

    @SuppressLint("MissingPermission")
    private fun bleCerca(id: Int, prefissi: JSONArray?) = conPermessi(id) {
        if (bt == null || !bt.isEnabled) return@conPermessi fine(id, false, "Accendi il Bluetooth del telefono")
        fermaScan()
        val pre = (0 until (prefissi?.length() ?: 0)).map { prefissi!!.getString(it) }
        val visti = HashSet<String>()
        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, r: ScanResult) {
                val nome = r.scanRecord?.deviceName ?: r.device.name ?: return
                if (pre.isNotEmpty() && pre.none { nome.startsWith(it) }) return
                if (!visti.add(r.device.address)) return
                js("ACPonte._bleTrovato(" + JSONObject().put("id", r.device.address).put("nome", nome).put("rssi", r.rssi) + ")")
            }
            override fun onScanFailed(errorCode: Int) { js("ACPonte._bleErrore('Ricerca Bluetooth non partita (" + errorCode + ")')") }
        }
        scanCb = cb
        bt.bluetoothLeScanner.startScan(null, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), cb)
        main.postDelayed({ if (scanCb === cb) fermaScan() }, 20000)
        fine(id, true)
    }
    @SuppressLint("MissingPermission")
    private fun fermaScan() { val cb = scanCb ?: return; scanCb = null; try { bt.bluetoothLeScanner?.stopScan(cb) } catch (_: Exception) {} }

    @SuppressLint("MissingPermission")
    private fun bleConnetti(id: Int, indirizzo: String) = conPermessi(id) {
        fermaScan(); chiudiBle()
        idConnessione = id; mtu = 23
        val dev = bt.getRemoteDevice(indirizzo)
        val cb = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) { main.post { if (!g.requestMtu(185)) g.discoverServices() } }
                else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    main.post {
                        if (idConnessione >= 0) { fine(idConnessione, false, "Collegamento Bluetooth non riuscito ($status)"); idConnessione = -1 }
                        if (gatt === g) { try { g.close() } catch (_: Exception) {}; gatt = null; rxChar = null; js("ACPonte._bleChiuso()") }
                    }
                }
            }
            override fun onMtuChanged(g: BluetoothGatt, m: Int, status: Int) { if (status == BluetoothGatt.GATT_SUCCESS) mtu = m; main.post { g.discoverServices() } }
            override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
                main.post {
                    val s = g.getService(NUS)
                    val tx = s?.getCharacteristic(NUS_TX); rxChar = s?.getCharacteristic(NUS_RX)
                    if (tx == null || rxChar == null) { fine(idConnessione, false, "Non è un dispositivo Airsoft Conflict"); idConnessione = -1; g.disconnect(); return@post }
                    g.setCharacteristicNotification(tx, true)
                    val d = tx.getDescriptor(CCCD)
                    @Suppress("DEPRECATION")
                    if (d != null) { d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE; g.writeDescriptor(d) }
                    else { fine(idConnessione, true); idConnessione = -1 }
                }
            }
            override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, status: Int) {
                main.post { if (idConnessione >= 0) { fine(idConnessione, true); idConnessione = -1 } }
            }
            @Deprecated("Deprecated in Java")
            override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
                @Suppress("DEPRECATION") val v = c.value ?: return
                js("ACPonte._bleRx('" + Base64.encodeToString(v, Base64.NO_WRAP) + "')")
            }
            override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray) {
                js("ACPonte._bleRx('" + Base64.encodeToString(value, Base64.NO_WRAP) + "')")
            }
            override fun onCharacteristicWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) { main.post { inScrittura = false; prossimoPezzo() } }
        }
        gatt = if (Build.VERSION.SDK_INT >= 23) dev.connectGatt(this, false, cb, BluetoothDevice.TRANSPORT_LE) else dev.connectGatt(this, false, cb)
    }
    private fun bleScrivi(id: Int, b64: String) {
        if (gatt == null || rxChar == null) return fine(id, false, "Bluetooth non collegato")
        val dati = Base64.decode(b64, Base64.DEFAULT); val pz = maxOf(20, mtu - 3)
        var i = 0
        while (i < dati.size) { coda.addLast(dati.copyOfRange(i, minOf(dati.size, i + pz))); i += pz }
        if (idScrittura >= 0) fine(idScrittura, true)
        idScrittura = id
        prossimoPezzo()
    }
    @SuppressLint("MissingPermission")
    private fun prossimoPezzo() {
        if (inScrittura) return
        val g = gatt; val c = rxChar
        if (g == null || c == null) { coda.clear(); if (idScrittura >= 0) { fine(idScrittura, false, "Bluetooth scollegato"); idScrittura = -1 }; return }
        val pezzo = coda.removeFirstOrNull()
        if (pezzo == null) { if (idScrittura >= 0) { fine(idScrittura, true); idScrittura = -1 }; return }
        inScrittura = true
        @Suppress("DEPRECATION")
        run {
            c.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            c.value = pezzo
            if (!g.writeCharacteristic(c)) { inScrittura = false; main.postDelayed({ coda.addFirst(pezzo); prossimoPezzo() }, 30) }
        }
    }
    @SuppressLint("MissingPermission")
    private fun chiudiBle() {
        val g = gatt ?: return
        gatt = null; rxChar = null; coda.clear(); inScrittura = false
        try { g.disconnect(); g.close() } catch (_: Exception) {}
        js("ACPonte._bleChiuso()")
    }
}
