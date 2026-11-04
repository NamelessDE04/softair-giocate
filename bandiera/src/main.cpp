// Airsoft Conflict — bandiere elettroniche (prove al banco e in campo)
//
// BANDIERA: ascolta i tag Bluetooth (iBeacon) dei giocatori, conta blu e rossi vicini (segnale sopra la soglia),
//           fa da sola la conquista (luce della fazione + cicalino) e ogni 20 s manda tutto via LoRa all'HQ.
// HQ:       riceve le bandiere via LoRa; manda ogni messaggio come riga JSON su USB e su Bluetooth (pagina Banco dell'app).
//           Dall'app o da USB si mandano comandi alle bandiere (es. "cmd tutte soglia -75").
// TAG:      fa finta di essere il tag di un giocatore (per provare senza tag veri). Pulsante: corto = cambia fazione,
//           lungo = numero successivo.
//
// Scheda: LILYGO T-Beam v1.1/v1.2 (ESP32, SX1278 433 MHz, GPS, display OLED facoltativo).
// Il programma riconosce da solo il chip di alimentazione (AXP192 sulla v1.1, AXP2101 sulla v1.2).
// Ogni riga che inizia con { è JSON per la pagina Banco; le altre sono testo per le persone.

#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <Preferences.h>
#include <RadioLib.h>
#include <XPowersLib.h>
#include <TinyGPSPlus.h>
#include <Adafruit_SSD1306.h>
#include <NimBLEDevice.h>
#include "config.h"
#ifdef RUOLO_BANDIERA
#include <Adafruit_NeoPixel.h>
#endif

#if !defined(RUOLO_BANDIERA) && !defined(RUOLO_HQ) && !defined(RUOLO_TAG)
#error "Scegli l'ambiente bandiera, hq o tag in PlatformIO"
#endif

#define VERSIONE "0.2"

// ---- pin del T-Beam
#define LORA_SCK   5
#define LORA_MISO  19
#define LORA_MOSI  27
#define LORA_CS    18
#define LORA_RST   23
#define LORA_DIO0  26
#define LORA_DIO1  33
#define GPS_RX     34
#define GPS_TX     12
#define I2C_SDA    21
#define I2C_SCL    22
#define PULSANTE   38

XPowersLibInterface *PMU = nullptr;
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
Preferences pref;
bool haOled = false;
uint16_t mioId = 0;

// ---------------------------------------------------------------- alimentazione
// Sul T-Beam la radio LoRa e il GPS si accendono dal chip di alimentazione: senza questo non funzionano.
bool accendiPMU() {
  PMU = new XPowersAXP2101(Wire);
  if (!PMU->init()) { delete PMU; PMU = nullptr; }
  if (!PMU) { PMU = new XPowersAXP192(Wire); if (!PMU->init()) { delete PMU; PMU = nullptr; } }
  if (!PMU) return false;
  if (PMU->getChipModel() == XPOWERS_AXP2101) {
    PMU->setPowerChannelVoltage(XPOWERS_ALDO2, 3300); PMU->enablePowerOutput(XPOWERS_ALDO2);   // LoRa
    PMU->setPowerChannelVoltage(XPOWERS_ALDO3, 3300); PMU->enablePowerOutput(XPOWERS_ALDO3);   // GPS
  } else {
    PMU->setPowerChannelVoltage(XPOWERS_LDO2, 3300); PMU->enablePowerOutput(XPOWERS_LDO2);     // LoRa
    PMU->setPowerChannelVoltage(XPOWERS_LDO3, 3300); PMU->enablePowerOutput(XPOWERS_LDO3);     // GPS
    PMU->enablePowerOutput(XPOWERS_DCDC1);                                                      // display
  }
  PMU->enableBattDetection();
  PMU->enableBattVoltageMeasure();
  return true;
}
uint8_t batteria() {
  if (!PMU || !PMU->isBatteryConnect()) return 255;     // 255 = senza batteria (alimentata da USB)
  int p = PMU->getBatteryPercent();
  return p < 0 ? 255 : (uint8_t)constrain(p, 0, 100);
}
String battTesto(uint8_t b) { return b == 255 ? String("USB") : String(b) + "%"; }

// ---------------------------------------------------------------- display
void scrivi(const String &r1, const String &r2, const String &r3 = "", const String &r4 = "", const String &r5 = "") {
  if (!haOled) return;
  oled.clearDisplay(); oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(1); oled.setCursor(0, 0); oled.println(r1);
  oled.setTextSize(2); oled.setCursor(0, 12); oled.println(r2);
  oled.setTextSize(1); oled.setCursor(0, 32); oled.println(r3); oled.setCursor(0, 42); oled.println(r4); oled.setCursor(0, 52); oled.println(r5);
  oled.display();
}
String idTesto(uint16_t id) { char b[6]; snprintf(b, sizeof(b), "%04X", id); return String(b); }
const char *nomeFaz(uint8_t f) { return f == 1 ? "blu" : f == 2 ? "rossa" : "nessuna"; }
String jsonFaz(uint8_t f) { return f == 1 ? "\"blu\"" : f == 2 ? "\"rossa\"" : "null"; }

void avvioComune(const char *ruolo) {
  Serial.begin(115200); delay(300);
  Wire.begin(I2C_SDA, I2C_SCL);
  if (!accendiPMU()) Serial.println("Chip di alimentazione non trovato: controlla la scheda");
  Wire.beginTransmission(0x3C); if (Wire.endTransmission() == 0) haOled = oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  uint64_t mac = ESP.getEfuseMac(); mioId = (uint16_t)((mac >> 32) & 0xFFFF);
  Serial.printf("\n=== Airsoft Conflict · %s %s · programma %s ===\n", ruolo, idTesto(mioId).c_str(), VERSIONE);
  Serial.printf("{\"avvio\":\"%s\",\"id\":\"%s\",\"versione\":\"%s\"}\n", ruolo, idTesto(mioId).c_str(), VERSIONE);
  scrivi("AIRSOFT CONFLICT", String(ruolo).substring(0, 9), "id " + idTesto(mioId), "Avvio...");
  pinMode(PULSANTE, INPUT);
}

// righe di comando da USB (una per riga)
bool leggiRiga(String &out) {
  static String buf;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') { out = buf; buf = ""; out.trim(); return out.length() > 0; }
    if (buf.length() < 200) buf += c;
  }
  return false;
}

// pulsante: 1 = premuto corto, 2 = premuto lungo (dopo 1,5 s, senza aspettare il rilascio)
int pulsante() {
  static bool giu = false, lungoFatto = false; static uint32_t da = 0;
  bool p = digitalRead(PULSANTE) == LOW;
  if (p && !giu) { giu = true; lungoFatto = false; da = millis(); }
  if (p && giu && !lungoFatto && millis() - da > 1500) { lungoFatto = true; return 2; }
  if (!p && giu) { giu = false; if (!lungoFatto && millis() - da > 40) return 1; }
  return 0;
}

bool leggiUuid(const char *s, uint8_t *out) {
  int k = 0;
  for (int i = 0; s[i] && k < 32; i++) {
    char c = s[i]; if (c == '-') continue;
    int v = (c >= '0' && c <= '9') ? c - '0' : (c >= 'a' && c <= 'f') ? c - 'a' + 10 : (c >= 'A' && c <= 'F') ? c - 'A' + 10 : -1;
    if (v < 0) return false;
    if (k % 2 == 0) out[k / 2] = v << 4; else out[k / 2] |= v;
    k++;
  }
  return k == 32;
}

// ---------------------------------------------------------------- LoRa (bandiera e HQ)
#if defined(RUOLO_BANDIERA) || defined(RUOLO_HQ)
SX1278 radio = new Module(LORA_CS, LORA_DIO0, LORA_RST, LORA_DIO1, SPI);
volatile bool arrivato = false;
void IRAM_ATTR suArrivo() { arrivato = true; }

bool accendiLoRa() {
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_CS);
  int st = radio.begin(LORA_FREQ, LORA_BW, LORA_SF, LORA_CR, LORA_SYNC, LORA_POTENZA, 8, 0);
  if (st != RADIOLIB_ERR_NONE) { Serial.printf("LoRa NON partita, errore %d\n", st); return false; }
  radio.setCRC(true);
  radio.setPacketReceivedAction(suArrivo);
  return true;
}
// trasmette e torna in ascolto
int trasmetti(const uint8_t *p, size_t n) {
  int st = radio.transmit((uint8_t *)p, n);
  arrivato = false;
  radio.startReceive();
  return st;
}

// Messaggi via LoRa (tutto in byte, per stare poco in aria). Iniziano tutti con 'A''C' e un tipo:
//  tipo 2 = stato di una bandiera:
//   3-4 id bandiera · 5 numero progressivo · 6 batteria % · 7 blu · 8 rossi · 9 quanti tag seguono
//   10-13 lat ×1e6 · 14-17 lon ×1e6 · 18 fazione che tiene l'area (0/1/2) · 19 fazione che sta conquistando
//   20 conquista % · 21 bit0 contesa · 22 soglia (dBm, con segno) · 23-24 secondi per conquistare
//   poi 4 byte per tag: minor (2), major (1), rssi (1)
//  tipo 0x10 = comando dall'HQ: 3-4 id bandiera (FFFF = tutte) · poi il testo del comando
//  tipo 0x11 = risposta di una bandiera a un comando: 3-4 id · poi il testo
#define T_STATO 2
#define T_CMD 0x10
#define T_RISP 0x11
#define TESTA 25
#endif

#ifdef RUOLO_BANDIERA
// ================================================================ BANDIERA
TinyGPSPlus gps;
Adafruit_NeoPixel led(NUM_LED, PIN_LED, NEO_GRB + NEO_KHZ800);
struct Tag { uint16_t minor; uint8_t major; float rssi; uint32_t visto; };
#define MAX_TAG 64
Tag tags[MAX_TAG];
int nTag = 0;
portMUX_TYPE muxTag = portMUX_INITIALIZER_UNLOCKED;
uint8_t uuid[16];
uint8_t seq = 0;
uint32_t ultimoInvio = 0;

// impostazioni (salvate sulla scheda)
int soglia = SOGLIA_RSSI, tempoConq = CONQUISTA_S, luce = LUCE;
bool muto = false, buzBasso = BUZZER_BASSO;

// stato della conquista
uint8_t owner = 0, progF = 0; float prog = 0; bool contesa = false;
uint8_t blu = 0, rossi = 0;
uint32_t bipLungoFino = 0, testFino = 0;

void salva() {
  pref.putInt("soglia", soglia); pref.putInt("tempo", tempoConq); pref.putInt("luce", luce);
  pref.putBool("muto", muto); pref.putBool("buzBasso", buzBasso);
}

// un tag sentito: segnale medio (si muove meno a ogni pacchetto) e ora dell'ultimo ascolto
void registra(uint16_t minor, uint8_t major, int rssi) {
  uint32_t ora = millis();
  portENTER_CRITICAL(&muxTag);
  int i = 0;
  for (; i < nTag; i++) if (tags[i].minor == minor && tags[i].major == major) break;
  if (i == nTag) {
    if (nTag < MAX_TAG) { tags[nTag] = { minor, major, (float)rssi, ora }; nTag++; }
  } else {
    tags[i].rssi = (ora - tags[i].visto > TAG_VALIDO_MS) ? rssi : tags[i].rssi * 0.7f + rssi * 0.3f;
    tags[i].visto = ora;
  }
  portEXIT_CRITICAL(&muxTag);
}

class Ascolto : public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice *d) override {
    if (!d->haveManufacturerData()) return;
    std::string m = d->getManufacturerData();
    if (m.length() < 25) return;
    const uint8_t *b = (const uint8_t *)m.data();
    // iBeacon: produttore 0x004C, tipo 0x02, lunghezza 0x15
    if (b[0] != 0x4C || b[1] != 0x00 || b[2] != 0x02 || b[3] != 0x15) return;
    if (memcmp(b + 4, uuid, 16) != 0) return;
    uint16_t major = (b[20] << 8) | b[21], minor = (b[22] << 8) | b[23];
    if (major != 1 && major != 2) return;    // 1 blu, 2 rossa
    registra(minor, (uint8_t)major, d->getRSSI());
  }
};

// conta chi è dentro adesso (e fa pulizia dei tag spariti da molto)
void conta() {
  uint32_t ora = millis(); uint8_t b = 0, r = 0;
  portENTER_CRITICAL(&muxTag);
  for (int i = 0; i < nTag; i++) {
    Tag &t = tags[i];
    if (ora - t.visto > 5 * TAG_VALIDO_MS) { tags[i] = tags[nTag - 1]; nTag--; i--; continue; }
    if (ora - t.visto < TAG_VALIDO_MS && t.rssi >= soglia) { if (t.major == 1) b++; else r++; }
  }
  portEXIT_CRITICAL(&muxTag);
  blu = b; rossi = r;
}

// conquista, un passo al secondo (stesse regole di base dell'app: conteso = tutto fermo; più giocatori = più veloce, max ×2)
void passoConquista(float dt) {
  conta();
  contesa = blu && rossi;
  if (contesa) return;
  uint8_t X = blu ? 1 : rossi ? 2 : 0, n = blu ? blu : rossi;
  if (!X) { if (prog > 0) { prog -= dt / 2; if (prog <= 0) { prog = 0; progF = 0; } } return; }
  if (X == owner) { if (prog > 0) { prog -= dt; if (prog <= 0) { prog = 0; progF = 0; } } return; }
  if (progF != X) { progF = X; prog = 0; Serial.printf("Conquista iniziata: %s\n", nomeFaz(X)); }
  prog += min(2.0f, 1.0f + 0.5f * (n - 1)) * dt;
  if (prog >= tempoConq) {
    owner = X; prog = 0; progF = 0; bipLungoFino = millis() + 1500;
    Serial.printf("CONQUISTATA dai %s\n", nomeFaz(X));
    ultimoInvio = 0;   // la notizia parte subito
  }
}

uint32_t coloreDi(uint8_t f, int lum) {
  if (f == 1) return led.Color(0, lum / 4, lum);
  if (f == 2) return led.Color(lum, 0, 0);
  return led.Color(lum / 6, lum / 6, lum / 6);   // neutra: bianco fioco
}
// luce: neutra bianco fioco · tenuta: colore fisso · in conquista: LED del colore di chi conquista quanti la percentuale,
// che lampeggiano · contesa: blu e rosso alternati
void disegnaLuce() {
  uint32_t ora = millis();
  led.setBrightness(constrain(luce, 5, 255));
  if (ora < testFino) {
    uint32_t c[] = { led.Color(0, 64, 255), led.Color(255, 0, 0), led.Color(0, 255, 0), led.Color(255, 255, 255) };
    for (int i = 0; i < NUM_LED; i++) led.setPixelColor(i, c[(ora / 500) % 4]);
  } else if (contesa) {
    bool a = (ora / 400) % 2;
    for (int i = 0; i < NUM_LED; i++) led.setPixelColor(i, coloreDi((i % 2) ^ a ? 1 : 2, 255));
  } else if (progF && prog > 0) {
    int k = (int)ceil(prog / tempoConq * NUM_LED); bool on = (ora / 400) % 2;
    for (int i = 0; i < NUM_LED; i++) led.setPixelColor(i, i < k ? (on || i < k - 1 ? coloreDi(progF, 255) : 0) : coloreDi(owner, owner ? 60 : 255));
  } else {
    for (int i = 0; i < NUM_LED; i++) led.setPixelColor(i, coloreDi(owner, 255));
  }
  led.show();
}
// cicalino: in conquista bip sempre più fitti, contesa bip veloci, conquistata un bip lungo
void suona() {
  uint32_t ora = millis(); bool on = false;
  if (ora < bipLungoFino || ora < testFino) on = (ora < bipLungoFino) || ((ora / 250) % 2);
  else if (contesa) on = (ora % 300) < 80;
  else if (progF && prog > 0) { uint32_t per = 1000 - (uint32_t)(600 * min(1.0f, prog / tempoConq)); on = (ora % per) < 80; }
  if (muto && ora >= testFino) on = false;
  digitalWrite(PIN_BUZZER, on != buzBasso ? HIGH : LOW);
}

String jsonStato() {
  String s = "{\"bandiera\":\"" + idTesto(mioId) + "\",\"seq\":" + String(seq) + ",\"blu\":" + String(blu) + ",\"rossi\":" + String(rossi) +
             ",\"owner\":" + jsonFaz(owner) + ",\"conq\":" + jsonFaz(progF) + ",\"pct\":" + String((int)(100 * prog / tempoConq)) +
             ",\"contesa\":" + (contesa ? "true" : "false") + ",\"soglia\":" + String(soglia) + ",\"tempo\":" + String(tempoConq) +
             ",\"batt\":" + String(batteria()) + ",\"gps\":" + (gps.location.isValid() ? "true" : "false") + ",\"tag\":[";
  uint32_t ora = millis(); bool primo = true;
  portENTER_CRITICAL(&muxTag);
  for (int i = 0; i < nTag; i++) {
    if (ora - tags[i].visto >= TAG_VALIDO_MS) continue;
    char b[64]; snprintf(b, sizeof(b), "%s{\"n\":%u,\"f\":\"%s\",\"rssi\":%d}", primo ? "" : ",", tags[i].minor, nomeFaz(tags[i].major), (int)tags[i].rssi);
    s += b; primo = false;
  }
  portEXIT_CRITICAL(&muxTag);
  return s + "]}";
}

void invia() {
  uint8_t p[TESTA + 4 * MAX_TAG_PACCHETTO];
  uint8_t n = 0;
  uint32_t ora = millis();
  portENTER_CRITICAL(&muxTag);
  for (int i = 0; i < nTag && n < MAX_TAG_PACCHETTO; i++) {
    Tag &t = tags[i];
    // nel messaggio vanno anche i tag sentiti ma sotto soglia: servono per tarare la soglia dall'HQ
    if (ora - t.visto >= TAG_VALIDO_MS) continue;
    uint8_t *q = p + TESTA + 4 * n;
    q[0] = t.minor >> 8; q[1] = t.minor & 0xFF; q[2] = t.major; q[3] = (uint8_t)(int8_t)constrain((int)t.rssi, -127, 0);
    n++;
  }
  portEXIT_CRITICAL(&muxTag);
  int32_t lat = gps.location.isValid() ? (int32_t)(gps.location.lat() * 1e6) : 0;
  int32_t lon = gps.location.isValid() ? (int32_t)(gps.location.lng() * 1e6) : 0;
  seq++;
  p[0] = 'A'; p[1] = 'C'; p[2] = T_STATO; p[3] = mioId >> 8; p[4] = mioId & 0xFF; p[5] = seq;
  p[6] = batteria(); p[7] = blu; p[8] = rossi; p[9] = n;
  memcpy(p + 10, &lat, 4); memcpy(p + 14, &lon, 4);
  p[18] = owner; p[19] = progF; p[20] = (uint8_t)constrain((int)(100 * prog / tempoConq), 0, 100); p[21] = contesa ? 1 : 0;
  p[22] = (uint8_t)(int8_t)soglia; p[23] = tempoConq >> 8; p[24] = tempoConq & 0xFF;
  int st = trasmetti(p, TESTA + 4 * n);
  Serial.printf("[%s] invio #%u: blu %u, rossi %u, tag sentiti %u, area %s, GPS %s, batteria %s -> %s\n",
                idTesto(mioId).c_str(), seq, blu, rossi, n, nomeFaz(owner), gps.location.isValid() ? "ok" : "senza fix",
                battTesto(p[6]).c_str(), st == RADIOLIB_ERR_NONE ? "inviato" : "ERRORE LoRa");
  Serial.println(jsonStato());
}

void aggiornaDisplay() {
  String riga = contesa ? "CONTESA" : (progF && prog > 0) ? String(progF == 1 ? "BLU " : "ROSSI ") + String((int)(100 * prog / tempoConq)) + "%" : String("Area: ") + nomeFaz(owner);
  scrivi("BAND " + idTesto(mioId) + " #" + String(seq) + " " + battTesto(batteria()),
         "B" + String(blu) + "  R" + String(rossi),
         riga, "Tag sentiti: " + String(nTag) + " soglia " + String(soglia),
         String(gps.location.isValid() ? "GPS ok" : "GPS cerca...") + (muto ? "  MUTO" : ""));
}

// comandi (da USB o via radio dall'HQ). Risponde con una riga di testo.
String comando(String c) {
  c.trim(); String low = c; low.toLowerCase();
  int sp = low.indexOf(' '); String k = sp < 0 ? low : low.substring(0, sp), v = sp < 0 ? "" : low.substring(sp + 1); v.trim();
  if (k == "soglia" && v.length()) { soglia = constrain(v.toInt(), -120, -20); salva(); return "soglia " + String(soglia) + " dBm"; }
  if (k == "tempo" && v.length()) { tempoConq = constrain(v.toInt(), 5, 3600); salva(); return "conquista in " + String(tempoConq) + " s"; }
  if (k == "luce" && v.length()) { luce = constrain(v.toInt(), 5, 255); salva(); return "luce " + String(luce); }
  if (k == "muto") { muto = v.length() ? v.toInt() != 0 : !muto; salva(); return muto ? "cicalino muto" : "cicalino attivo"; }
  if (k == "buzzer") { buzBasso = !buzBasso; salva(); return String("cicalino ") + (buzBasso ? "attivo col segnale basso" : "attivo col segnale alto"); }
  if (k == "reset") { owner = 0; prog = 0; progF = 0; ultimoInvio = 0; return "area neutra"; }
  if (k == "fazione") { owner = constrain(v.toInt(), 0, 2); prog = 0; progF = 0; ultimoInvio = 0; return String("area ai ") + nomeFaz(owner); }
  if (k == "test") { testFino = millis() + 4000; return "prova luce e cicalino per 4 s"; }
  if (k == "invia") { ultimoInvio = 0; return "invio subito"; }
  if (k == "info") return "bandiera " + idTesto(mioId) + " v" + VERSIONE + " soglia " + String(soglia) + " tempo " + String(tempoConq) + " luce " + String(luce) +
                          (muto ? " muto" : "") + (buzBasso ? " buzzer-basso" : "") + " area " + nomeFaz(owner) + " tag " + String(nTag);
  if (k == "riavvia") { delay(200); ESP.restart(); }
  return "comandi: info, soglia -75, tempo 60, luce 120, muto, buzzer, reset, fazione 1|2|0, test, invia, riavvia";
}

void ascoltaRadio() {
  if (!arrivato) return;
  arrivato = false;
  uint8_t p[120]; size_t len = radio.getPacketLength();
  int st = radio.readData(p, min(len, sizeof(p) - 1));
  radio.startReceive();
  if (st != RADIOLIB_ERR_NONE || len < 6 || p[0] != 'A' || p[1] != 'C' || p[2] != T_CMD) return;
  uint16_t a = (p[3] << 8) | p[4];
  if (a != 0xFFFF && a != mioId) return;
  p[min(len, sizeof(p) - 1)] = 0;
  String c = String((char *)p + 5), r = comando(c);
  Serial.printf("Comando via radio: %s -> %s\n", c.c_str(), r.c_str());
  // risposta all'HQ (dopo un attimo a caso, così più bandiere non rispondono insieme)
  delay(random(50, a == 0xFFFF ? 1500 : 200));
  uint8_t q[110]; q[0] = 'A'; q[1] = 'C'; q[2] = T_RISP; q[3] = mioId >> 8; q[4] = mioId & 0xFF;
  int n = min((int)r.length(), 100); memcpy(q + 5, r.c_str(), n);
  trasmetti(q, 5 + n);
  ultimoInvio = millis() - INVIO_MS + 1500;   // e poi lo stato aggiornato
}

void setup() {
  avvioComune("BANDIERA");
  pref.begin("ac", false);
  soglia = pref.getInt("soglia", SOGLIA_RSSI); tempoConq = pref.getInt("tempo", CONQUISTA_S); luce = pref.getInt("luce", LUCE);
  muto = pref.getBool("muto", false); buzBasso = pref.getBool("buzBasso", BUZZER_BASSO);
  pinMode(PIN_BUZZER, OUTPUT); digitalWrite(PIN_BUZZER, buzBasso ? HIGH : LOW);
  led.begin(); led.clear(); led.show();
  testFino = millis() + 1500;   // all'accensione: giro di colori e due bip, per vedere che luce e cicalino vanno
  if (!leggiUuid(TAG_UUID, uuid)) Serial.println("TAG_UUID scritto male in config.h");
  Serial1.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  if (!accendiLoRa()) scrivi("BANDIERA " + idTesto(mioId), "ERRORE", "LoRa non partita");
  else radio.startReceive();
  NimBLEDevice::init("");
  NimBLEScan *sc = NimBLEDevice::getScan();
  sc->setAdvertisedDeviceCallbacks(new Ascolto(), true);   // true: ogni pacchetto, anche dello stesso tag
  sc->setActiveScan(false);
  sc->setInterval(100); sc->setWindow(99);
  sc->setMaxResults(0);                                     // non tenere in memoria i risultati
  sc->start(0, nullptr, false);                             // ascolto continuo
  Serial.println(comando("info"));
  Serial.println("Scrivi 'aiuto' per i comandi. Pulsante: corto = invio subito, lungo = area neutra.");
  ultimoInvio = millis() - INVIO_MS + 5000;
}

void loop() {
  while (Serial1.available()) gps.encode(Serial1.read());
  String riga; if (leggiRiga(riga)) Serial.println("> " + comando(riga));
  ascoltaRadio();
  int b = pulsante();
  if (b == 1) ultimoInvio = 0;
  if (b == 2) Serial.println("> " + comando("reset"));
  static uint32_t ultimoPasso = millis(), ultimoDisp = 0;
  if (millis() - ultimoPasso >= 1000) { passoConquista((millis() - ultimoPasso) / 1000.0f); ultimoPasso = millis(); }
  if (millis() - ultimoDisp >= 1000) { ultimoDisp = millis(); aggiornaDisplay(); }
  // un po' di casualità sul ritmo, così due bandiere non trasmettono sempre insieme
  static uint32_t attesa = INVIO_MS;
  if (millis() - ultimoInvio >= attesa) { conta(); ultimoInvio = millis(); attesa = INVIO_MS + random(0, 3000); invia(); }
  disegnaLuce(); suona();
  // se lo scanner si ferma, ripartire
  NimBLEScan *sc = NimBLEDevice::getScan();
  if (!sc->isScanning()) sc->start(0, nullptr, false);
  delay(20);
}
#endif

#ifdef RUOLO_HQ
// ================================================================ HQ
// Bluetooth: servizio "UART" Nordic (lo stesso di tante app): l'app riceve righe JSON, manda comandi di testo.
#define NUS_SERV "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_RX   "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX   "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
struct Band { uint16_t id; uint8_t blu, rossi, owner, batt; float rssi; uint32_t visto; };
#define MAX_BAND 8
Band band[MAX_BAND];
int nBand = 0, nPacchetti = 0, nScartati = 0;
NimBLECharacteristic *bleTx = nullptr;
volatile bool bleConnesso = false;
String daBle = "";
portMUX_TYPE muxBle = portMUX_INITIALIZER_UNLOCKED;

class ServerCb : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *s) override { bleConnesso = true; }
  void onDisconnect(NimBLEServer *s) override { bleConnesso = false; NimBLEDevice::startAdvertising(); }
};
class RxCb : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c) override {
    std::string v = c->getValue();
    portENTER_CRITICAL(&muxBle); daBle += String(v.c_str()); portEXIT_CRITICAL(&muxBle);
  }
};

// una riga verso USB e (se collegato) verso l'app via Bluetooth, a pezzi da 20 byte
void esci(const String &s) {
  Serial.println(s);
  if (!bleConnesso || !bleTx) return;
  String t = s + "\n";
  for (int i = 0; i < (int)t.length(); i += 20) {
    String pz = t.substring(i, min((int)t.length(), i + 20));
    bleTx->setValue((uint8_t *)pz.c_str(), pz.length()); bleTx->notify();
    delay(4);
  }
}
void registro(const String &s) { String e = s; e.replace("\\", "/"); e.replace("\"", "'"); esci("{\"log\":\"" + e + "\"}"); }

void mostra() {
  if (!haOled) return;
  oled.clearDisplay(); oled.setTextColor(SSD1306_WHITE); oled.setTextSize(1);
  oled.setCursor(0, 0); oled.printf("HQ %s %s pk%d", bleConnesso ? "BT" : "--", idTesto(mioId).c_str(), nPacchetti);
  for (int i = 0; i < nBand && i < 5; i++) {
    Band &b = band[i];
    uint32_t s = (millis() - b.visto) / 1000;
    oled.setCursor(0, 12 + i * 10);
    oled.printf("%s B%u R%u %c %lus %d", idTesto(b.id).c_str(), b.blu, b.rossi, b.owner == 1 ? 'b' : b.owner == 2 ? 'r' : '-', (unsigned long)s, (int)b.rssi);
  }
  oled.display();
}

// comandi all'HQ: "cmd <id|tutte> <comando>" passa il comando alle bandiere; "info" elenca le bandiere
void comando(String c) {
  c.trim(); if (!c.length()) return;
  String low = c; low.toLowerCase();
  if (low.startsWith("cmd ")) {
    String resto = c.substring(4); resto.trim();
    int sp = resto.indexOf(' '); if (sp < 0) { registro("uso: cmd <id|tutte> <comando>"); return; }
    String chi = resto.substring(0, sp), cosa = resto.substring(sp + 1); cosa.trim();
    uint16_t a = chi.equalsIgnoreCase("tutte") ? 0xFFFF : (uint16_t)strtoul(chi.c_str(), nullptr, 16);
    uint8_t p[110]; p[0] = 'A'; p[1] = 'C'; p[2] = T_CMD; p[3] = a >> 8; p[4] = a & 0xFF;
    int n = min((int)cosa.length(), 100); memcpy(p + 5, cosa.c_str(), n);
    int st = trasmetti(p, 5 + n);
    registro("comando a " + (a == 0xFFFF ? String("tutte") : idTesto(a)) + ": " + cosa + (st == RADIOLIB_ERR_NONE ? " (inviato)" : " (ERRORE LoRa)"));
    return;
  }
  if (low == "info") {
    registro("HQ " + idTesto(mioId) + " v" + VERSIONE + " pacchetti " + String(nPacchetti) + " scartati " + String(nScartati) + " bandiere " + String(nBand));
    for (int i = 0; i < nBand; i++) registro(" " + idTesto(band[i].id) + " B" + String(band[i].blu) + " R" + String(band[i].rossi) + " " + String((millis() - band[i].visto) / 1000) + " s fa, " + String((int)band[i].rssi) + " dBm");
    return;
  }
  if (low == "riavvia") { delay(200); ESP.restart(); }
  registro("comandi: info · cmd <id|tutte> <comando> (es. cmd tutte soglia -75, cmd A1B2 test) · riavvia");
}

void setup() {
  avvioComune("HQ");
  NimBLEDevice::init(("AC-HQ-" + idTesto(mioId)).c_str());
  NimBLEServer *srv = NimBLEDevice::createServer();
  srv->setCallbacks(new ServerCb());
  NimBLEService *s = srv->createService(NUS_SERV);
  bleTx = s->createCharacteristic(NUS_TX, NIMBLE_PROPERTY::NOTIFY);
  NimBLECharacteristic *rx = s->createCharacteristic(NUS_RX, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  rx->setCallbacks(new RxCb());
  s->start();
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERV); adv->setScanResponse(true);
  adv->start();
  if (!accendiLoRa()) { scrivi("HQ", "ERRORE", "LoRa non partita"); return; }
  radio.startReceive();
  scrivi("AIRSOFT CONFLICT", "HQ", "In ascolto", String(LORA_FREQ, 3) + " MHz", "BT: AC-HQ-" + idTesto(mioId));
  Serial.println("In ascolto delle bandiere. Bluetooth: AC-HQ-" + idTesto(mioId) + ". Scrivi 'aiuto' per i comandi.");
}

void loop() {
  static uint32_t ultimoDisplay = 0;
  if (millis() - ultimoDisplay > 1000) { ultimoDisplay = millis(); mostra(); }
  String riga; if (leggiRiga(riga)) comando(riga);
  String bl; portENTER_CRITICAL(&muxBle); bl = daBle; daBle = ""; portEXIT_CRITICAL(&muxBle);
  static String bufBle; bufBle += bl;
  int nl; while ((nl = bufBle.indexOf('\n')) >= 0) { comando(bufBle.substring(0, nl)); bufBle = bufBle.substring(nl + 1); }
  if (bufBle.length() && bl.length() == 0) { comando(bufBle); bufBle = ""; }   // comando senza "a capo"
  // battito ogni 10 s: l'app capisce che l'HQ è vivo anche senza bandiere
  static uint32_t battito = 0;
  if (millis() - battito > 10000) { battito = millis(); esci("{\"hq\":\"" + idTesto(mioId) + "\",\"pacchetti\":" + String(nPacchetti) + ",\"scartati\":" + String(nScartati) + ",\"batt\":" + String(batteria()) + "}"); }
  if (!arrivato) { delay(5); return; }
  arrivato = false;
  uint8_t p[TESTA + 4 * MAX_TAG_PACCHETTO + 8];
  size_t len = radio.getPacketLength();
  int st = radio.readData(p, min(len, sizeof(p)));
  float rs = radio.getRSSI(), sn = radio.getSNR();
  radio.startReceive();
  if (st != RADIOLIB_ERR_NONE || len < 5 || p[0] != 'A' || p[1] != 'C') { nScartati++; registro("pacchetto scartato (err " + String(st) + ", " + String(len) + " byte, " + String((int)rs) + " dBm)"); return; }
  nPacchetti++;
  uint16_t id = (p[3] << 8) | p[4];
  if (p[2] == T_RISP) {
    p[min(len, sizeof(p) - 1)] = 0;
    String t = String((char *)p + 5); t.replace("\"", "'");
    esci("{\"risposta\":\"" + idTesto(id) + "\",\"testo\":\"" + t + "\",\"rssiLora\":" + String((int)rs) + "}");
    return;
  }
  if (p[2] != T_STATO || len < TESTA) { nScartati++; registro("pacchetto di tipo sconosciuto " + String(p[2])); return; }
  int i = 0; for (; i < nBand; i++) if (band[i].id == id) break;
  if (i == nBand) { if (nBand >= MAX_BAND) i = 0; else nBand++; }
  Band &b = band[i];
  b.id = id; b.batt = p[6]; b.blu = p[7]; b.rossi = p[8]; b.owner = p[18]; b.rssi = rs; b.visto = millis();
  int32_t lat, lon; memcpy(&lat, p + 10, 4); memcpy(&lon, p + 14, 4);
  char h[360];
  snprintf(h, sizeof(h), "{\"bandiera\":\"%s\",\"seq\":%u,\"blu\":%u,\"rossi\":%u,\"owner\":%s,\"conq\":%s,\"pct\":%u,\"contesa\":%s,\"soglia\":%d,\"tempo\":%u,\"batt\":%u,\"lat\":%.6f,\"lon\":%.6f,\"rssiLora\":%.0f,\"snr\":%.1f,\"tag\":[",
           idTesto(id).c_str(), p[5], p[7], p[8], jsonFaz(p[18]).c_str(), jsonFaz(p[19]).c_str(), p[20], (p[21] & 1) ? "true" : "false",
           (int)(int8_t)p[22], (p[23] << 8) | p[24], p[6], lat / 1e6, lon / 1e6, rs, sn);
  String out = h;
  int n = min((int)p[9], (int)((len - TESTA) / 4));
  for (int k = 0; k < n; k++) {
    uint8_t *q = p + TESTA + 4 * k; char t[60];
    snprintf(t, sizeof(t), "%s{\"n\":%u,\"f\":\"%s\",\"rssi\":%d}", k ? "," : "", (q[0] << 8) | q[1], q[2] == 1 ? "blu" : "rossa", (int8_t)q[3]);
    out += t;
  }
  esci(out + "]}");
}
#endif

#ifdef RUOLO_TAG
// ================================================================ TAG FINTO
// Un T-Beam che fa da tag di un giocatore: manda lo stesso segnale iBeacon dei tag veri.
uint8_t uuid[16];
uint8_t fazione = 1; uint16_t numero = 1; int potenza = 7;
const esp_power_level_t LIVELLI[] = { ESP_PWR_LVL_N12, ESP_PWR_LVL_N9, ESP_PWR_LVL_N6, ESP_PWR_LVL_N3, ESP_PWR_LVL_N0, ESP_PWR_LVL_P3, ESP_PWR_LVL_P6, ESP_PWR_LVL_P9 };
const int DBM[] = { -12, -9, -6, -3, 0, 3, 6, 9 };

void annuncia() {
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  adv->stop();
  NimBLEDevice::setPower(LIVELLI[potenza]);
  uint8_t m[25] = { 0x4C, 0x00, 0x02, 0x15 };
  memcpy(m + 4, uuid, 16);
  m[20] = 0; m[21] = fazione; m[22] = numero >> 8; m[23] = numero & 0xFF; m[24] = (uint8_t)(int8_t)-59;
  NimBLEAdvertisementData d;
  d.setFlags(0x04);
  d.setManufacturerData(std::string((char *)m, 25));
  adv->setAdvertisementData(d);
  adv->setScanResponse(false);
  adv->setAdvertisementType(BLE_GAP_CONN_MODE_NON);
  adv->setMinInterval(160); adv->setMaxInterval(240);   // 100–150 ms
  adv->start();
  pref.putUChar("faz", fazione); pref.putUShort("num", numero); pref.putInt("pot", potenza);
  String f = fazione == 1 ? "BLU" : "ROSSA";
  scrivi("TAG FINTO  " + idTesto(mioId), f + " #" + String(numero), "potenza " + String(DBM[potenza]) + " dBm",
         "corto: cambia fazione", "lungo: numero +1");
  Serial.printf("Tag %u, fazione %s, potenza %d dBm\n", numero, nomeFaz(fazione), DBM[potenza]);
  Serial.printf("{\"tag\":%u,\"f\":\"%s\",\"pot\":%d}\n", numero, nomeFaz(fazione), DBM[potenza]);
}

void comando(String c) {
  c.trim(); c.toLowerCase();
  int sp = c.indexOf(' '); String k = sp < 0 ? c : c.substring(0, sp), v = sp < 0 ? "" : c.substring(sp + 1); v.trim();
  if ((k == "f" || k == "fazione") && v.length()) { fazione = v.toInt() == 2 ? 2 : 1; annuncia(); return; }
  if ((k == "n" || k == "numero") && v.length()) { numero = constrain(v.toInt(), 1, 999); annuncia(); return; }
  if ((k == "pot" || k == "potenza") && v.length()) { potenza = constrain(v.toInt(), 0, 7); annuncia(); return; }
  if (k == "info") { annuncia(); return; }
  if (k == "riavvia") { delay(200); ESP.restart(); }
  Serial.println("comandi: f 1|2 (fazione), n 12 (numero), pot 0-7 (potenza, da -12 a +9 dBm), info, riavvia");
}

void setup() {
  avvioComune("TAG");
  pref.begin("ac", false);
  fazione = pref.getUChar("faz", 1); numero = pref.getUShort("num", (mioId % 50) + 1); potenza = pref.getInt("pot", 7);
  if (!leggiUuid(TAG_UUID, uuid)) Serial.println("TAG_UUID scritto male in config.h");
  // la radio LoRa non serve: la lasciamo spenta per risparmiare
  if (PMU) { if (PMU->getChipModel() == XPOWERS_AXP2101) PMU->disablePowerOutput(XPOWERS_ALDO2); else PMU->disablePowerOutput(XPOWERS_LDO2); }
  NimBLEDevice::init("");
  annuncia();
  Serial.println("Scrivi 'aiuto' per i comandi. Pulsante: corto = cambia fazione, lungo = numero +1.");
}

void loop() {
  String riga; if (leggiRiga(riga)) comando(riga);
  int b = pulsante();
  if (b == 1) { fazione = fazione == 1 ? 2 : 1; annuncia(); }
  if (b == 2) { numero = numero >= 999 ? 1 : numero + 1; annuncia(); }
  static uint32_t t = 0;
  if (millis() - t > 15000) { t = millis(); Serial.printf("{\"tag\":%u,\"f\":\"%s\",\"pot\":%d,\"batt\":%u}\n", numero, nomeFaz(fazione), DBM[potenza], batteria()); }
  delay(20);
}
#endif
