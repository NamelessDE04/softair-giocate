// Airsoft Conflict — bandiere elettroniche (prima prova al banco)
//
// BANDIERA: ascolta i tag Bluetooth (iBeacon) dei giocatori, conta quanti blu e quanti rossi sono
//           vicini (segnale sopra SOGLIA_RSSI) e ogni 20 s manda il conteggio via LoRa.
// HQ:       riceve i messaggi delle bandiere e li stampa sul computer (Monitor seriale) e sul display.
//
// Scheda: LILYGO T-Beam v1.1/v1.2 (ESP32, SX1278 433 MHz, GPS NEO-6M/NEO-M8N, display OLED facoltativo).
// Il programma riconosce da solo il chip di alimentazione (AXP192 sulla v1.1, AXP2101 sulla v1.2).

#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <RadioLib.h>
#include <XPowersLib.h>
#include <TinyGPSPlus.h>
#include <Adafruit_SSD1306.h>
#include "config.h"
#ifdef RUOLO_BANDIERA
#include <NimBLEDevice.h>
#endif

#if !defined(RUOLO_BANDIERA) && !defined(RUOLO_HQ)
#error "Scegli l'ambiente bandiera o hq in PlatformIO"
#endif

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

SX1278 radio = new Module(LORA_CS, LORA_DIO0, LORA_RST, LORA_DIO1, SPI);
XPowersLibInterface *PMU = nullptr;
TinyGPSPlus gps;
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
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

// ---------------------------------------------------------------- LoRa
bool accendiLoRa() {
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_CS);
  int st = radio.begin(LORA_FREQ, LORA_BW, LORA_SF, LORA_CR, LORA_SYNC, LORA_POTENZA, 8, 0);
  if (st != RADIOLIB_ERR_NONE) { Serial.printf("LoRa NON partita, errore %d\n", st); return false; }
  radio.setCRC(true);
  return true;
}

// Messaggio di una bandiera (tutto in byte, per stare poco in aria):
//  0-1 'A''C' · 2 versione · 3-4 id bandiera · 5 numero progressivo · 6 batteria % · 7 blu · 8 rossi
//  9 quanti tag seguono · 10-13 lat ×1e6 · 14-17 lon ×1e6 · poi 4 byte per tag: minor (2), major (1), rssi (1)
#define TESTA 18

#ifdef RUOLO_BANDIERA
// ================================================================ BANDIERA
struct Tag { uint16_t minor; uint8_t major; float rssi; uint32_t visto; };
#define MAX_TAG 64
Tag tags[MAX_TAG];
int nTag = 0;
portMUX_TYPE muxTag = portMUX_INITIALIZER_UNLOCKED;
uint8_t uuid[16];
uint8_t seq = 0;
uint32_t ultimoInvio = 0;

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

void invia() {
  uint8_t p[TESTA + 4 * MAX_TAG_PACCHETTO];
  uint8_t blu = 0, rossi = 0, n = 0;
  uint32_t ora = millis();
  String elenco = "";
  portENTER_CRITICAL(&muxTag);
  for (int i = 0; i < nTag; i++) {
    Tag &t = tags[i];
    bool vivo = ora - t.visto < TAG_VALIDO_MS, dentro = vivo && t.rssi >= SOGLIA_RSSI;
    if (dentro) { if (t.major == 1) blu++; else rossi++; }
    // nel messaggio vanno anche i tag sentiti ma sotto soglia: servono per tarare la soglia dall'HQ
    if (vivo && n < MAX_TAG_PACCHETTO) {
      uint8_t *q = p + TESTA + 4 * n;
      q[0] = t.minor >> 8; q[1] = t.minor & 0xFF; q[2] = t.major; q[3] = (uint8_t)(int8_t)constrain((int)t.rssi, -127, 0);
      n++;
    }
  }
  portEXIT_CRITICAL(&muxTag);
  int32_t lat = gps.location.isValid() ? (int32_t)(gps.location.lat() * 1e6) : 0;
  int32_t lon = gps.location.isValid() ? (int32_t)(gps.location.lng() * 1e6) : 0;
  p[0] = 'A'; p[1] = 'C'; p[2] = 1; p[3] = mioId >> 8; p[4] = mioId & 0xFF; p[5] = seq++;
  p[6] = batteria(); p[7] = blu; p[8] = rossi; p[9] = n;
  memcpy(p + 10, &lat, 4); memcpy(p + 14, &lon, 4);
  int st = radio.transmit(p, TESTA + 4 * n);

  Serial.printf("[%s] invio #%u: blu %u, rossi %u, tag sentiti %u, GPS %s, batteria %u%% -> %s\n",
                idTesto(mioId).c_str(), p[5], blu, rossi, n, gps.location.isValid() ? "ok" : "senza fix", p[6],
                st == RADIOLIB_ERR_NONE ? "inviato" : "ERRORE");
  for (int i = 0; i < n; i++) {
    uint8_t *q = p + TESTA + 4 * i;
    int rs = (int8_t)q[3];
    Serial.printf("   tag %u (%s) segnale %d dBm %s\n", (q[0] << 8) | q[1], q[2] == 1 ? "blu" : "rossa", rs, rs >= SOGLIA_RSSI ? "DENTRO" : "fuori");
    if (i < 2) elenco += "#" + String((q[0] << 8) | q[1]) + (q[2] == 1 ? "B " : "R ") + String(rs) + "  ";
  }
  scrivi("BANDIERA " + idTesto(mioId) + "  #" + String(p[5]),
         "B" + String(blu) + "  R" + String(rossi),
         "Tag sentiti: " + String(n) + "  soglia " + String(SOGLIA_RSSI),
         elenco,
         String(gps.location.isValid() ? "GPS ok" : "GPS cerca...") + "  batt " + (p[6] == 255 ? String("USB") : String(p[6]) + "%"));
}

void setup() {
  Serial.begin(115200); delay(300);
  Wire.begin(I2C_SDA, I2C_SCL);
  if (!accendiPMU()) Serial.println("Chip di alimentazione non trovato: controlla la scheda");
  Wire.beginTransmission(0x3C); if (Wire.endTransmission() == 0) haOled = oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  uint64_t mac = ESP.getEfuseMac(); mioId = (uint16_t)((mac >> 32) & 0xFFFF);
  Serial.printf("\n=== Airsoft Conflict · BANDIERA %s ===\n", idTesto(mioId).c_str());
  scrivi("AIRSOFT CONFLICT", "BAND " + idTesto(mioId), "Avvio...");
  if (!leggiUuid(TAG_UUID, uuid)) Serial.println("TAG_UUID scritto male in config.h");
  Serial1.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  if (!accendiLoRa()) { scrivi("BANDIERA " + idTesto(mioId), "ERRORE", "LoRa non partita"); }
  pinMode(PULSANTE, INPUT);
  NimBLEDevice::init("");
  NimBLEScan *sc = NimBLEDevice::getScan();
  sc->setAdvertisedDeviceCallbacks(new Ascolto(), true);   // true: ogni pacchetto, anche dello stesso tag
  sc->setActiveScan(false);
  sc->setInterval(100); sc->setWindow(99);
  sc->setMaxResults(0);                                     // non tenere in memoria i risultati
  sc->start(0, nullptr, false);                             // ascolto continuo
  Serial.println("In ascolto dei tag. Primo invio tra pochi secondi.");
  ultimoInvio = millis() - INVIO_MS + 5000;
}

void loop() {
  while (Serial1.available()) gps.encode(Serial1.read());
  // pulsante: invio subito (comodo per le prove)
  static bool prima = true;
  bool premuto = digitalRead(PULSANTE) == LOW;
  if (premuto && !prima) ultimoInvio = 0;
  prima = premuto;
  // un po' di casualità sul ritmo, così due bandiere non trasmettono sempre insieme
  static uint32_t attesa = INVIO_MS;
  if (millis() - ultimoInvio >= attesa) { ultimoInvio = millis(); attesa = INVIO_MS + random(0, 3000); invia(); }
  // se lo scanner si ferma, ripartire
  NimBLEScan *sc = NimBLEDevice::getScan();
  if (!sc->isScanning()) sc->start(0, nullptr, false);
  delay(10);
}
#endif

#ifdef RUOLO_HQ
// ================================================================ HQ
struct Band { uint16_t id; uint8_t blu, rossi, nTag, batt, seq; int32_t lat, lon; float rssi, snr; uint32_t visto; };
#define MAX_BAND 8
Band band[MAX_BAND];
int nBand = 0;
volatile bool arrivato = false;
void IRAM_ATTR suArrivo() { arrivato = true; }

void mostra() {
  if (!haOled) return;
  oled.clearDisplay(); oled.setTextColor(SSD1306_WHITE); oled.setTextSize(1);
  oled.setCursor(0, 0); oled.println("HQ  bandiere: " + String(nBand));
  for (int i = 0; i < nBand && i < 5; i++) {
    Band &b = band[i];
    uint32_t s = (millis() - b.visto) / 1000;
    oled.setCursor(0, 12 + i * 10);
    oled.printf("%s B%u R%u %lus %ddB", idTesto(b.id).c_str(), b.blu, b.rossi, (unsigned long)s, (int)b.rssi);
  }
  oled.display();
}

void setup() {
  Serial.begin(115200); delay(300);
  Wire.begin(I2C_SDA, I2C_SCL);
  if (!accendiPMU()) Serial.println("Chip di alimentazione non trovato: controlla la scheda");
  Wire.beginTransmission(0x3C); if (Wire.endTransmission() == 0) haOled = oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  uint64_t mac = ESP.getEfuseMac(); mioId = (uint16_t)((mac >> 32) & 0xFFFF);
  Serial.printf("\n=== Airsoft Conflict · HQ %s ===\n", idTesto(mioId).c_str());
  if (!accendiLoRa()) { scrivi("HQ", "ERRORE", "LoRa non partita"); return; }
  radio.setPacketReceivedAction(suArrivo);
  radio.startReceive();
  scrivi("AIRSOFT CONFLICT", "HQ", "In ascolto", String(LORA_FREQ, 3) + " MHz");
  Serial.println("In ascolto delle bandiere...");
}

void loop() {
  static uint32_t ultimoDisplay = 0;
  if (millis() - ultimoDisplay > 1000) { ultimoDisplay = millis(); mostra(); }
  if (!arrivato) { delay(5); return; }
  arrivato = false;
  uint8_t p[TESTA + 4 * MAX_TAG_PACCHETTO];
  size_t len = radio.getPacketLength();
  int st = radio.readData(p, min(len, sizeof(p)));
  float rs = radio.getRSSI(), sn = radio.getSNR();
  radio.startReceive();
  if (st != RADIOLIB_ERR_NONE || len < TESTA || p[0] != 'A' || p[1] != 'C' || p[2] != 1) return;
  uint16_t id = (p[3] << 8) | p[4];
  int i = 0; for (; i < nBand; i++) if (band[i].id == id) break;
  if (i == nBand) { if (nBand >= MAX_BAND) return; nBand++; }
  Band &b = band[i];
  b.id = id; b.seq = p[5]; b.batt = p[6]; b.blu = p[7]; b.rossi = p[8]; b.nTag = p[9];
  memcpy(&b.lat, p + 10, 4); memcpy(&b.lon, p + 14, 4);
  b.rssi = rs; b.snr = sn; b.visto = millis();
  // riga JSON: la leggerà il programma che porta i dati nell'app (prossimo passo)
  Serial.printf("{\"bandiera\":\"%s\",\"seq\":%u,\"blu\":%u,\"rossi\":%u,\"batt\":%u,\"lat\":%.6f,\"lon\":%.6f,\"rssiLora\":%.0f,\"snr\":%.1f,\"tag\":[",
                idTesto(id).c_str(), b.seq, b.blu, b.rossi, b.batt, b.lat / 1e6, b.lon / 1e6, rs, sn);
  int n = min((int)p[9], (int)((len - TESTA) / 4));
  for (int k = 0; k < n; k++) {
    uint8_t *q = p + TESTA + 4 * k;
    Serial.printf("%s{\"n\":%u,\"f\":\"%s\",\"rssi\":%d}", k ? "," : "", (q[0] << 8) | q[1], q[2] == 1 ? "blu" : "rossa", (int8_t)q[3]);
  }
  Serial.println("]}");
}
#endif
