// Airsoft Conflict — bandiere elettroniche (prove al banco e in campo)
//
// BANDIERA: ascolta i tag Bluetooth (iBeacon) dei giocatori, conta blu e rossi vicini (segnale sopra la soglia),
//           fa da sola la conquista (luce della fazione + cicalino) e ogni 20 s manda tutto via LoRa all'HQ.
// HQ:       riceve le bandiere via LoRa; manda ogni messaggio come riga JSON su USB e su Bluetooth (pagina Banco dell'app).
//           Dall'app o da USB si mandano comandi alle bandiere (es. "cmd tutte soglia -75").
// TAG:      fa finta di essere il tag di un giocatore (per provare senza tag veri). Pulsante: corto = cambia fazione,
//           lungo = numero successivo.
// PATTUGLIA: T-Beam del caposquadra: manda la sua posizione GPS via LoRa ogni 15 s; l'HQ la passa all'app (pallino sulla mappa).
// INIETTORE: programma i tag veri DX-SMART (UUID, fazione, numero) via Bluetooth, senza l'app del produttore.
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

#if !defined(RUOLO_BANDIERA) && !defined(RUOLO_HQ) && !defined(RUOLO_TAG) && !defined(RUOLO_INIETTORE) && !defined(RUOLO_PATTUGLIA)
#error "Scegli l'ambiente bandiera, hq, tag, pattuglia o iniettore in PlatformIO"
#endif

#define VERSIONE "1.5.0"

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
const char *pmuNome = "nessuno";
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
  pmuNome = PMU->getChipModel() == XPOWERS_AXP2101 ? "AXP2101" : "AXP192";
  delay(200);   // la radio ha bisogno di un attimo dopo che le arriva corrente
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
  oled.clearDisplay(); oled.setTextColor(SSD1306_WHITE); oled.setTextWrap(false);   // niente a capo: le righe lunghe vengono tagliate, non si sovrappongono
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

// iBeacon dentro un pacchetto Bluetooth: guardo TUTTI i campi, non solo il primo "dati del produttore"
// (con l'ascolto attivo la risposta del tag si aggiunge al pacchetto e può contenere altri dati del produttore)
bool trovaIbeacon(const uint8_t *p, size_t n, uint8_t *u, uint16_t &maj, uint16_t &min_) {
  for (size_t i = 0; i + 1 < n;) {
    uint8_t l = p[i]; if (!l || i + 1 + l > n) break;
    if (p[i + 1] == 0xFF && l >= 26 && p[i + 2] == 0x4C && p[i + 3] == 0x00 && p[i + 4] == 0x02 && p[i + 5] == 0x15) {
      memcpy(u, p + i + 6, 16); maj = (p[i + 22] << 8) | p[i + 23]; min_ = (p[i + 24] << 8) | p[i + 25];
      return true;
    }
    i += 1 + l;
  }
  return false;
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

// ---------------------------------------------------------------- coordinate UTM (WGS84), come sul Garmin e sulla carta
struct Utm { int zona; char banda; double E, N; };
Utm aUtm(double lat, double lon) {
  Utm u; u.zona = (int)((lon + 180) / 6) + 1;
  const char *bande = "CDEFGHJKLMNPQRSTUVWX"; u.banda = bande[constrain((int)((lat + 80) / 8), 0, 19)];
  const double a = 6378137.0, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  double phi = lat * DEG_TO_RAD, lam = lon * DEG_TO_RAD, lam0 = ((u.zona - 1) * 6 - 180 + 3) * DEG_TO_RAD;
  double sp = sin(phi), cp = cos(phi), tp = tan(phi);
  double Nn = a / sqrt(1 - e2 * sp * sp), T = tp * tp, C = ep2 * cp * cp, A = cp * (lam - lam0);
  double M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * phi - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * sin(2 * phi)
                  + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * sin(4 * phi) - (35 * e2 * e2 * e2 / 3072) * sin(6 * phi));
  u.E = k0 * Nn * (A + (1 - T + C) * A * A * A / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * pow(A, 5) / 120) + 500000;
  u.N = k0 * (M + Nn * tp * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * pow(A, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * pow(A, 6) / 720));
  if (lat < 0) u.N += 10000000;
  return u;
}
double distanzaM(double la1, double lo1, double la2, double lo2) {
  double r = DEG_TO_RAD, x = (lo2 - lo1) * r * cos((la1 + la2) / 2 * r), y = (la2 - la1) * r;
  return sqrt(x * x + y * y) * 6371000.0;
}

// ---------------------------------------------------------------- LoRa (bandiera e HQ)
#if defined(RUOLO_BANDIERA) || defined(RUOLO_HQ) || defined(RUOLO_PATTUGLIA)
// Il T-Beam a 433 MHz può avere due chip radio: SX1278 (il più comune) o SX1268 (alcune V1.2). Si prova il primo, poi il secondo.
SX1278 r78 = new Module(LORA_CS, LORA_DIO0, LORA_RST, LORA_DIO1, SPI);
SX1262 r62 = new Module(LORA_CS, LORA_DIO1, LORA_RST, 32, SPI);   // 32 = BUSY
SX1268 r68 = new Module(LORA_CS, LORA_DIO1, LORA_RST, 32, SPI);
SX126x *r6 = nullptr;   // chip della famiglia SX126x trovato (SX1262 o SX1268)
bool is68 = false;
const char *chipRadio = "nessuno";
struct Radio {
  int transmit(uint8_t *p, size_t n) { return is68 ? r6->transmit(p, n) : r78.transmit(p, n); }
  int startReceive() { return is68 ? r6->startReceive() : r78.startReceive(); }
  size_t getPacketLength() { return is68 ? r6->getPacketLength() : r78.getPacketLength(); }
  int readData(uint8_t *p, size_t n) { return is68 ? r6->readData(p, n) : r78.readData(p, n); }
  float getRSSI() { return is68 ? r6->getRSSI() : r78.getRSSI(); }
  float getSNR() { return is68 ? r6->getSNR() : r78.getSNR(); }
} radio;
volatile bool arrivato = false;
volatile uint32_t nIrq = 0;
int statoLoRa = -999, ultimoTx = 1;   // 0 = tutto bene; 1 = nessun invio ancora
void IRAM_ATTR suArrivo() { arrivato = true; nIrq++; }
String diagnosi = "";
// legge a mano il registro della versione del chip radio (SX127x: 0x42 deve valere 0x12) e lo stato dell'alimentazione della radio
String leggiDiagnosi() {
  bool on = false; int mv = 0;
  if (PMU) {
    uint8_t ch = PMU->getChipModel() == XPOWERS_AXP2101 ? (uint8_t)XPOWERS_ALDO2 : (uint8_t)XPOWERS_LDO2;
    on = PMU->isPowerChannelEnable(ch); mv = PMU->getPowerChannelVoltage(ch);
  }
  pinMode(LORA_CS, OUTPUT); digitalWrite(LORA_CS, HIGH);
  pinMode(LORA_RST, OUTPUT); digitalWrite(LORA_RST, LOW); delay(5); digitalWrite(LORA_RST, HIGH); delay(20);
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  digitalWrite(LORA_CS, LOW); SPI.transfer(0x42); uint8_t v = SPI.transfer(0x00); digitalWrite(LORA_CS, HIGH);
  SPI.endTransaction();
  char b[48]; snprintf(b, sizeof(b), "V%s %d r42=%02X", on ? "on" : "OFF", mv, v);
  return String(b);
}
String loraTesto() { return statoLoRa ? "LoRa ERR " + String(statoLoRa) : ultimoTx == 0 ? String("TX ok") : ultimoTx == 1 ? String("TX -") : "TX ERR " + String(ultimoTx); }

bool accendiLoRa() {
  // radio spenta e riaccesa da zero (come negli esempi LilyGO), poi lettura diretta del chip
  if (PMU) {
    uint8_t ch = PMU->getChipModel() == XPOWERS_AXP2101 ? (uint8_t)XPOWERS_ALDO2 : (uint8_t)XPOWERS_LDO2;
    PMU->disablePowerOutput(ch); delay(250);
    PMU->setPowerChannelVoltage(ch, 3300); PMU->enablePowerOutput(ch); delay(250);
  }
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI);
  diagnosi = leggiDiagnosi();
  Serial.println("Diagnosi radio: " + diagnosi + "  (r42=12 = SX1278; r42=AA o simili = famiglia SX126x; r42=00 o FF = il chip non risponde)");
  int st = -1;
  for (int k = 0; k < (diagnosi.endsWith("=12") ? 3 : 1) && st != RADIOLIB_ERR_NONE; k++) { if (k) delay(300); st = r78.begin(LORA_FREQ, LORA_BW, LORA_SF, LORA_CR, LORA_SYNC, LORA_POTENZA, 8, 0); Serial.printf("Prova SX1278: %d\n", st); }
  if (st == RADIOLIB_ERR_NONE) {
    is68 = false; chipRadio = "SX1278";
    r78.setCRC(true); r78.setPacketReceivedAction(suArrivo);
  } else {
    // famiglia SX126x (r42=AA nella diagnosi): si prova come SX1262 e come SX1268, con TCXO 1,6 V (come LilyGO), 1,8 V e quarzo
    struct Prova { SX126x *m; const char *nome; float tcxo; } prove[] = {
      { &r62, "SX1262", 1.6 }, { &r68, "SX1268", 1.6 }, { &r62, "SX1262", 1.8 }, { &r68, "SX1268", 1.8 }, { &r62, "SX1262", 0 }, { &r68, "SX1268", 0 } };
    for (auto &q : prove) {
      if (q.m == &r62) st = r62.begin(LORA_FREQ, LORA_BW, LORA_SF, LORA_CR, LORA_SYNC, LORA_POTENZA, 8, q.tcxo);
      else st = r68.begin(LORA_FREQ, LORA_BW, LORA_SF, LORA_CR, LORA_SYNC, LORA_POTENZA, 8, q.tcxo);
      Serial.printf("Prova %s (TCXO %.1f V): %d\n", q.nome, q.tcxo, st);
      if (st == RADIOLIB_ERR_NONE) {
        is68 = true; r6 = q.m; chipRadio = q.nome;
        r6->setDio2AsRfSwitch(true); r6->setCRC(2); r6->setPacketReceivedAction(suArrivo);
        break;
      }
    }
  }
  statoLoRa = st;
  Serial.printf("Chip di alimentazione: %s · radio: %s · LoRa: %s (%d)\n", pmuNome, chipRadio, st == RADIOLIB_ERR_NONE ? "ok" : "NON partita", st);
  return st == RADIOLIB_ERR_NONE;
}
// trasmette e torna in ascolto
int trasmetti(const uint8_t *p, size_t n) {
  int st = radio.transmit((uint8_t *)p, n);
  ultimoTx = st;
  arrivato = false;
  radio.startReceive();
  return st;
}

// ---------------------------------------------------------------- chat LoRa
// I team leader scrivono dall'app (telefono -> Bluetooth -> il loro T-Beam pattuglia); HQ e bandiere ripetono i messaggi
// (al massimo 2 volte), così arrivano anche fuori portata diretta.
// T_MSG: 3-4 mittente · 5 progressivo · 6 ripetizioni rimaste · 7 tipo (0 globale, 1 fazione, 2 diretto, 3 conferma)
//        8 fazione del mittente (1 blu, 2 rossi, 0 nessuna) · 9-10 destinatario (diretto/conferma) · 11 progressivo confermato · 12.. "nome<TAB>testo"
// T_ANN: 3-4 id · 5 progressivo · 6 ripetizioni rimaste · 7 fazione · 8 batteria · 9.. nome   (ogni LoRa "chat" si annuncia ogni minuto)
#define T_MSG 4
#define T_ANN 5
#define CHAT_TTL 2
#define CHAT_MAX 160   // byte di nome + testo in un pacchetto
struct ChatVisto { uint16_t da; uint8_t tipo, seq; };
ChatVisto chatVisti[48]; int chatVi = 0;
bool chatGiaVisto(uint16_t da, uint8_t tipo, uint8_t seq) {
  for (auto &v : chatVisti) if (v.da == da && v.tipo == tipo && v.seq == seq) return true;
  chatVisti[chatVi] = { da, tipo, seq }; chatVi = (chatVi + 1) % 48; return false;
}
uint8_t chatRip[16 + CHAT_MAX]; size_t chatRipN = 0; uint32_t chatRipAlle = 0;
void (*chatCb)(const uint8_t *p, size_t n, float rssi) = nullptr;   // cosa fa questo ruolo con un messaggio (pattuglia, HQ)
bool chatRipete = false;                                             // bandiere e HQ ripetono
bool chatGiaVistoUltimo = false;
// un pacchetto chat/annuncio: true se era della chat (e quindi è già gestito)
bool chatRicevi(uint8_t *p, size_t n, float rssi) {
  if (n < 9 || p[0] != 'A' || p[1] != 'C' || (p[2] != T_MSG && p[2] != T_ANN)) return false;
  uint16_t da = (p[3] << 8) | p[4];
  if (da == mioId) return true;
  uint8_t tipo = p[2] == T_ANN ? 9 : (n > 7 ? p[7] : 0);
  bool giaVisto = chatGiaVisto(da, tipo, p[5]);
  if (!giaVisto && chatRipete && p[6] > 0 && !chatRipN && n <= sizeof(chatRip)) { memcpy(chatRip, p, n); chatRip[6]--; chatRipN = n; chatRipAlle = millis() + random(200, 1400); }
  chatGiaVistoUltimo = giaVisto;
  if (chatCb && (!giaVisto || (p[2] == T_MSG && tipo == 2))) chatCb(p, n, rssi);   // un diretto ripetuto va riconfermato (ma mostrato una volta sola)
  return true;
}
void chatLoop() { if (chatRipN && millis() >= chatRipAlle) { trasmetti(chatRip, chatRipN); chatRipN = 0; } }
uint8_t chatSeq = 0;
String chatPulito(String t) { t.replace("\\", "/"); t.replace("\"", "'"); t.replace("\t", " "); t.replace("\r", " "); t.replace("\n", " "); return t; }
// costruisce e manda un messaggio; restituisce il progressivo (per la conferma dei diretti)
uint8_t chatInvia(uint8_t tipo, uint8_t faz, uint16_t a, uint8_t seqConf, const String &nome, const String &testo, uint8_t *copia = nullptr, size_t *copiaN = nullptr) {
  String corpo = nome + "\t" + testo; int n = min((int)corpo.length(), CHAT_MAX);
  while (n > 0 && n < (int)corpo.length() && ((uint8_t)corpo[n] & 0xC0) == 0x80) n--;   // non spezzare una lettera accentata
  uint8_t p[12 + CHAT_MAX]; chatSeq++;
  p[0] = 'A'; p[1] = 'C'; p[2] = T_MSG; p[3] = mioId >> 8; p[4] = mioId & 0xFF; p[5] = chatSeq; p[6] = CHAT_TTL; p[7] = tipo; p[8] = faz;
  p[9] = a >> 8; p[10] = a & 0xFF; p[11] = seqConf; memcpy(p + 12, corpo.c_str(), n);
  chatGiaVisto(mioId, tipo, chatSeq);
  trasmetti(p, 12 + n);
  if (copia) { memcpy(copia, p, 12 + n); *copiaN = 12 + n; }
  return chatSeq;
}
void chatAnnuncia(uint8_t faz, uint8_t batt, const String &nome) {
  uint8_t p[9 + 32]; int n = min((int)nome.length(), 32); static uint8_t sq = 0; sq++;
  p[0] = 'A'; p[1] = 'C'; p[2] = T_ANN; p[3] = mioId >> 8; p[4] = mioId & 0xFF; p[5] = sq; p[6] = CHAT_TTL; p[7] = faz; p[8] = batt; memcpy(p + 9, nome.c_str(), n);
  chatGiaVisto(mioId, 9, sq);
  trasmetti(p, 9 + n);
}
const char *chatTipo(uint8_t t) { return t == 0 ? "globale" : t == 1 ? "fazione" : t == 2 ? "diretto" : "conferma"; }
// riga JSON per l'app con un messaggio o un annuncio ricevuto
String chatJson(const uint8_t *p, size_t n, float rssi) {
  uint16_t da = (p[3] << 8) | p[4];
  if (p[2] == T_ANN) {
    String nome = chatPulito(String((const char *)p + 9).substring(0, n - 9));
    return "{\"lora\":{\"id\":\"" + idTesto(da) + "\",\"nome\":\"" + nome + "\",\"f\":\"" + nomeFaz(p[7]) + "\",\"batt\":" + String(p[8]) + ",\"rssi\":" + String((int)rssi) + ",\"hop\":" + String(CHAT_TTL - p[6]) + "}}";
  }
  char buf[CHAT_MAX + 1]; int m = min((int)n - 12, CHAT_MAX); if (m < 0) m = 0; memcpy(buf, p + 12, m); buf[m] = 0;
  String corpo = buf; int tab = corpo.indexOf('\t');
  String nome = chatPulito(tab >= 0 ? corpo.substring(0, tab) : String("?")), testo = chatPulito(tab >= 0 ? corpo.substring(tab + 1) : corpo);
  return "{\"chat\":{\"da\":\"" + idTesto(da) + "\",\"seq\":" + String(p[5]) + ",\"nome\":\"" + nome + "\",\"f\":\"" + nomeFaz(p[8]) + "\",\"tipo\":\"" + chatTipo(p[7]) + "\",\"a\":\"" + idTesto((p[9] << 8) | p[10]) +
         "\",\"testo\":\"" + testo + "\",\"rssi\":" + String((int)rssi) + ",\"hop\":" + String(CHAT_TTL - p[6]) + "}}";
}

// Messaggi via LoRa (tutto in byte, per stare poco in aria). Iniziano tutti con 'A''C' e un tipo:
//  tipo 2 = stato di una bandiera:
//   3-4 id bandiera · 5 numero progressivo · 6 batteria % · 7 blu · 8 rossi · 9 quanti tag seguono
//   10-13 lat ×1e6 · 14-17 lon ×1e6 · 18 fazione che tiene l'area (0/1/2) · 19 fazione che sta conquistando
//   20 conquista % · 21 bit0 contesa · 22 soglia (dBm, con segno) · 23-24 secondi per conquistare
//   poi 4 byte per tag: minor (2), major (1), rssi (1)
//  tipo 3 = posizione di una pattuglia (vedi T_PAT)
//  tipo 0x10 = comando dall'HQ: 3-4 id bandiera (FFFF = tutte) · poi il testo del comando
//  tipo 0x11 = risposta di una bandiera a un comando: 3-4 id · poi il testo
#define T_STATO 2
#define T_PAT 3     // posizione di una pattuglia: 3-4 id · 5 progressivo · 6 batteria · 7-10 lat · 11-14 lon · 15 satelliti · 16 hdop×10 · 17 bit0 posizione valida
#define T_CMD 0x10
#define T_RISP 0x11
#define TESTA 25
#endif

#ifdef RUOLO_BANDIERA
// ================================================================ BANDIERA
TinyGPSPlus gps;
// ---- posizione della bandiera: media delle letture buone (HDOP basso, almeno 5 satelliti).
// Dopo 10 letture buone la posizione è "fissa" e va nel messaggio; se per 20 s di fila il GPS dice che è lontana
// più di 25 m dalla media, la bandiera è stata spostata: si ricomincia la media e per 10 minuti lo segnala all'HQ.
#define POS_N 60
double mLat = 0, mLon = 0; int nPos = 0, fuori = 0; uint32_t spostataDa = 0;
bool posFissa() { return nPos >= 10; }
bool spostata() { return spostataDa && millis() - spostataDa < 600000UL; }
void aggiornaPos() {
  if (!gps.location.isUpdated()) return;
  double la = gps.location.lat(), lo = gps.location.lng();
  if (!gps.hdop.isValid() || gps.hdop.hdop() > 2.5 || gps.satellites.value() < 5) return;
  if (posFissa()) {
    double d = TinyGPSPlus::distanceBetween(la, lo, mLat, mLon);
    if (d > 25) { if (++fuori >= 20) { nPos = 0; fuori = 0; spostataDa = millis(); if (!spostataDa) spostataDa = 1; Serial.println("GPS: bandiera spostata, rifaccio la posizione"); } return; }
    fuori = 0;
  }
  if (nPos < POS_N) { nPos++; mLat += (la - mLat) / nPos; mLon += (lo - mLon) / nPos; }
  else { mLat += (la - mLat) / POS_N; mLon += (lo - mLon) / POS_N; }
}
String gpsTesto() { return posFissa() ? String("GPS fisso") : gps.location.isValid() ? "GPS " + String(nPos) + "/10" : String("GPS --"); }
Adafruit_NeoPixel led(NUM_LED, PIN_LED, NEO_GRB + NEO_KHZ800);
struct Tag { uint16_t minor; uint8_t major; float rssi; uint32_t visto; };
#define MAX_TAG 64
Tag tags[MAX_TAG];
int nTag = 0;
portMUX_TYPE muxTag = portMUX_INITIALIZER_UNLOCKED;
uint8_t uuid[16];
uint8_t seq = 0;
uint32_t ultimoInvio = 0;
uint32_t invioMs = INVIO_MS;   // ogni quanto manda lo stato (comando "ogni 5" per le prove in casa; si riazzera spegnendo)
bool urgente = false;          // qualcosa è cambiato (conquista, contesa, persone): manda appena possibile (minimo ogni 5 s)

// mortaio: l'app (tramite l'HQ) avvisa la bandiera quando un colpo cade vicino. 1 = colpita (letale), 2 = colpi vicini, 3 = lontano
uint8_t colpoTipo = 0; int colpoDist = 0; uint32_t colpoDa = 0;
#define COLPITA_MS 12000
#define VICINO_MS  5000
// schermata POSIZIONE (per confrontare il GPS della bandiera con un Garmin): all'accensione per 20 minuti,
// col pulsante per 1 minuto; il comando "posizione 0" (inizio partita) la spegne
uint32_t posFino = 20UL * 60000UL;
// le altre bandiere, sentite via radio: servono per avvisare se sono troppo vicine
#define DIST_MIN 100
struct Altra { uint16_t id; double lat, lon; uint32_t t; };
Altra altre[6]; int nAltre = 0;
// giocatori colpiti dal mortaio (lista mandata dall'app): i loro tag non contano finché non rinascono
struct Morto { uint8_t f; uint16_t n; };
Morto morti[40]; int nMorti = 0;
bool morto(uint8_t f, uint16_t n) { for (int i = 0; i < nMorti; i++) if (morti[i].f == f && morti[i].n == n) return true; return false; }
// l'altra bandiera più vicina (distanza in metri, -1 = nessuna con posizione)
int piuVicina(uint16_t &chi) {
  int best = -1; if (nPos < 10) return -1;
  for (int i = 0; i < nAltre; i++) {
    if (millis() - altre[i].t > 120000UL) continue;
    int d = (int)distanzaM(mLat, mLon, altre[i].lat, altre[i].lon);
    if (best < 0 || d < best) { best = d; chi = altre[i].id; }
  }
  return best;
}
bool allarmeMortaio() { return colpoDa && ((colpoTipo == 1 && millis() - colpoDa < COLPITA_MS) || (colpoTipo == 2 && millis() - colpoDa < VICINO_MS)); }

// impostazioni (salvate sulla scheda)
int soglia = SOGLIA_RSSI, tempoConq = CONQUISTA_S, luce = LUCE;
uint32_t validoMs = TAG_VALIDO_MS;   // dopo quanto un tag non piu' sentito esce dall'area (comando: uscita 8)
bool muto = false, buzBasso = BUZZER_BASSO;

// stato della conquista
uint8_t owner = 0, progF = 0; float prog = 0; bool contesa = false;
uint8_t blu = 0, rossi = 0;
uint32_t bipLungoFino = 0, testFino = 0;

void salva() {
  pref.putInt("soglia", soglia); pref.putUInt("valido", validoMs); pref.putInt("tempo", tempoConq); pref.putInt("luce", luce);
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
    tags[i].rssi = (ora - tags[i].visto > validoMs) ? rssi : tags[i].rssi * 0.6f + rssi * 0.4f;
    tags[i].visto = ora;
  }
  portEXIT_CRITICAL(&muxTag);
}

class Ascolto : public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice *d) override {
    uint8_t u[16]; uint16_t major, minor;
    if (!trovaIbeacon(d->getPayload(), d->getPayloadLength(), u, major, minor)) return;
    if (memcmp(u, uuid, 16) != 0) return;
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
    if (ora - t.visto > 5 * validoMs) { tags[i] = tags[nTag - 1]; nTag--; i--; continue; }
    if (ora - t.visto < validoMs && t.rssi >= soglia && !morto(t.major, t.minor)) { if (t.major == 1) b++; else r++; }
  }
  portEXIT_CRITICAL(&muxTag);
  blu = b; rossi = r;
}

// conquista, un passo al secondo (stesse regole di base dell'app: conteso = tutto fermo; più giocatori = più veloce, max ×2)
void passoConquista(float dt) {
  uint8_t b0 = blu, r0 = rossi; bool c0 = contesa;
  conta();
  contesa = blu && rossi;
  if (b0 != blu || r0 != rossi || c0 != contesa) urgente = true;
  if (contesa) return;
  uint8_t X = blu ? 1 : rossi ? 2 : 0, n = blu ? blu : rossi;
  if (!X) { if (prog > 0) { prog -= dt / 2; if (prog <= 0) { prog = 0; progF = 0; } } return; }
  if (X == owner) { if (prog > 0) { prog -= dt; if (prog <= 0) { prog = 0; progF = 0; } } return; }
  if (progF != X) { progF = X; prog = 0; urgente = true; Serial.printf("Conquista iniziata: %s\n", nomeFaz(X)); }
  prog += min(2.0f, 1.0f + 0.5f * (n - 1)) * dt;
  if (prog >= tempoConq) {
    owner = X; prog = 0; progF = 0; bipLungoFino = millis() + 1500;
    Serial.printf("CONQUISTATA dai %s\n", nomeFaz(X));
    urgente = true;   // la notizia parte subito
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
  if (allarmeMortaio()) {
    // colpita: lampi bianco/arancio velocissimi; colpi vicini: arancio a scatti
    bool on = colpoTipo == 1 ? (ora / 90) % 2 : (ora / 250) % 2;
    uint32_t c = colpoTipo == 1 ? ((ora / 180) % 2 ? led.Color(255, 255, 255) : led.Color(255, 90, 0)) : led.Color(255, 90, 0);
    for (int i = 0; i < NUM_LED; i++) led.setPixelColor(i, on ? c : 0);
    led.show();
    digitalWrite(PIN_LED_ROSSO, on); digitalWrite(PIN_LED_BLU, on);
    return;
  }
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
  // LED semplici (rosso = fazione rossa, blu/verde = fazione blu)
  bool lr = false, lb = false;
  if (ora < testFino) { bool a = (ora / 250) % 2; lr = a; lb = !a; }
  else if (contesa) { bool a = (ora / 400) % 2; lr = a; lb = !a; }
  else if (progF && prog > 0) {
    uint32_t per = 1000 - (uint32_t)(700 * min(1.0f, prog / tempoConq));   // lampeggia sempre più veloce
    bool on = (ora % per) < per / 2;
    if (progF == 1) lb = on; else lr = on;
  } else if (owner) { lb = owner == 1; lr = owner == 2; }
  else { bool lampo = (ora % 3000) < 60; lr = lb = lampo; }   // neutra: un lampo ogni 3 s, per dire che è accesa
  digitalWrite(PIN_LED_ROSSO, lr); digitalWrite(PIN_LED_BLU, lb);
}
// cicalino: in conquista bip sempre più fitti, contesa bip veloci, conquistata un bip lungo
void suona() {
  uint32_t ora = millis(); bool on = false;
  if (allarmeMortaio()) {
    uint32_t d = ora - colpoDa;
    if (colpoTipo == 1) on = d < 1500 || (ora % 400) < 250;              // fischio lungo, poi sirena a colpi
    else on = (d % 1000) < 450 && ((d % 1000) / 150) % 2 == 0;           // tre bip al secondo
  }
  else if (ora < bipLungoFino || ora < testFino) on = (ora < bipLungoFino) || ((ora / 250) % 2);
  else if (contesa) on = (ora % 300) < 80;
  else if (progF && prog > 0) { uint32_t per = 1000 - (uint32_t)(600 * min(1.0f, prog / tempoConq)); on = (ora % per) < 80; }
  if (muto && ora >= testFino) on = false;
  digitalWrite(PIN_BUZZER, on != buzBasso ? HIGH : LOW);
}

String jsonStato() {
  String s = "{\"bandiera\":\"" + idTesto(mioId) + "\",\"seq\":" + String(seq) + ",\"blu\":" + String(blu) + ",\"rossi\":" + String(rossi) +
             ",\"owner\":" + jsonFaz(owner) + ",\"conq\":" + jsonFaz(progF) + ",\"pct\":" + String((int)(100 * prog / tempoConq)) +
             ",\"contesa\":" + (contesa ? "true" : "false") + ",\"soglia\":" + String(soglia) + ",\"tempo\":" + String(tempoConq) +
             ",\"batt\":" + String(batteria()) + ",\"gps\":" + (gps.location.isValid() ? "true" : "false") + ",\"gpsFisso\":" + (posFissa() ? "true" : "false") + ",\"spostata\":" + (spostata() ? "true" : "false") + (posFissa() ? String(",\"lat\":") + String(mLat, 6) + ",\"lon\":" + String(mLon, 6) : String("")) + ",\"lora\":" + String(statoLoRa) + ",\"tx\":" + String(ultimoTx) + ",\"pmu\":\"" + pmuNome + "\",\"radio\":\"" + chipRadio + "\",\"diag\":\"" + diagnosi + "\",\"tag\":[";
  uint32_t ora = millis(); bool primo = true;
  portENTER_CRITICAL(&muxTag);
  for (int i = 0; i < nTag; i++) {
    if (ora - tags[i].visto >= validoMs) continue;
    char b[72]; snprintf(b, sizeof(b), "%s{\"n\":%u,\"f\":\"%s\",\"rssi\":%d%s}", primo ? "" : ",", tags[i].minor, nomeFaz(tags[i].major), (int)tags[i].rssi, morto(tags[i].major, tags[i].minor) ? ",\"m\":1" : "");
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
    if (ora - t.visto >= validoMs) continue;
    uint8_t *q = p + TESTA + 4 * n;
    q[0] = t.minor >> 8; q[1] = t.minor & 0xFF; q[2] = t.major | (morto(t.major, t.minor) ? 0x80 : 0); q[3] = (uint8_t)(int8_t)constrain((int)t.rssi, -127, 0);
    n++;
  }
  portEXIT_CRITICAL(&muxTag);
  // nel messaggio solo la posizione media, quando è fissa (0 = non ancora)
  int32_t lat = posFissa() ? (int32_t)(mLat * 1e6) : 0;
  int32_t lon = posFissa() ? (int32_t)(mLon * 1e6) : 0;
  seq++;
  p[0] = 'A'; p[1] = 'C'; p[2] = T_STATO; p[3] = mioId >> 8; p[4] = mioId & 0xFF; p[5] = seq;
  p[6] = batteria(); p[7] = blu; p[8] = rossi; p[9] = n;
  memcpy(p + 10, &lat, 4); memcpy(p + 14, &lon, 4);
  p[18] = owner; p[19] = progF; p[20] = (uint8_t)constrain((int)(100 * prog / tempoConq), 0, 100); p[21] = (contesa ? 1 : 0) | (posFissa() ? 2 : 0) | (spostata() ? 4 : 0);   // bit: contesa, posizione fissa, spostata
  p[22] = (uint8_t)(int8_t)soglia; p[23] = tempoConq >> 8; p[24] = tempoConq & 0xFF;
  int st = trasmetti(p, TESTA + 4 * n);
  Serial.printf("[%s] invio #%u: blu %u, rossi %u, tag sentiti %u, area %s, GPS %s, batteria %s -> %s\n",
                idTesto(mioId).c_str(), seq, blu, rossi, n, nomeFaz(owner), gpsTesto().c_str(),
                battTesto(p[6]).c_str(), st == RADIOLIB_ERR_NONE ? "inviato" : "ERRORE LoRa");
  Serial.println(jsonStato());
}

// display: in alto grandi quanti blu e quanti rossi ci sono, sotto di chi è la bandiera, la barra della conquista e due righe di note
void centrato(const String &t, int y, int dim) { int w = t.length() * 6 * dim; oled.setTextSize(dim); oled.setCursor(max(0, (128 - w) / 2), y); oled.print(t); }
String fa(uint32_t da) { uint32_t s = (millis() - da) / 1000; return s < 60 ? String(s) + "s fa" : String(s / 60) + "min fa"; }
void aggiornaDisplay() {
  if (!haOled) return;
  uint32_t ora = millis();
  oled.clearDisplay(); oled.setTextWrap(false);
  if (allarmeMortaio()) {
    bool inv = colpoTipo == 1 && (ora / 300) % 2;   // colpita: schermo che lampeggia
    if (inv) oled.fillRect(0, 0, 128, 64, SSD1306_WHITE);
    oled.setTextColor(inv ? SSD1306_BLACK : SSD1306_WHITE);
    centrato("MORTAIO!", 2, 2);
    if (colpoTipo == 1) { centrato("COLPITA", 22, 2); centrato("Chi e' qui: colpito,", 44, 1); centrato("torna al rientro", 54, 1); }
    else { centrato("COLPI VICINI", 24, 1); centrato(String(colpoDist) + " m", 34, 2); centrato("al riparo!", 54, 1); }
    oled.display(); return;
  }
  oled.setTextColor(SSD1306_WHITE);
  uint16_t chiV = 0; int dV = piuVicina(chiV); bool vicina = dV >= 0 && dV < DIST_MIN;
  if (ora < posFino && !blu && !rossi && !progF && !contesa) {
    // POSIZIONE: UTM grande (come la legge il Garmin), sotto i gradi o l'avviso di distanza
    bool fis = posFissa(), ok = fis || gps.location.isValid();
    double la = fis ? mLat : gps.location.lat(), lo = fis ? mLon : gps.location.lng();
    oled.setTextSize(1); oled.setCursor(0, 0);
    oled.print("POSIZIONE " + idTesto(mioId) + " s" + String(gps.satellites.value()));
    if (!ok) { centrato("NO GPS", 20, 2); centrato("cielo aperto, attendi", 44, 1); centrato("pulsante: invio stato", 56, 1); oled.display(); return; }
    Utm u = aUtm(la, lo); char e[12], n[12]; snprintf(e, sizeof(e), "E%07ld", (long)lround(u.E)); snprintf(n, sizeof(n), "N%07ld", (long)lround(u.N));
    oled.setCursor(0, 10); oled.print("UTM " + String(u.zona) + String(u.banda) + (fis ? "  media ok" : "  media " + String(nPos) + "/10"));
    oled.setTextSize(2); oled.setCursor(0, 20); oled.print(e); oled.setCursor(0, 37); oled.print(n);
    oled.setTextSize(1); oled.setCursor(0, 56);
    if (dV >= 0 && (ora / 2500) % 2) oled.print(vicina ? "TROPPO VICINA " + String(dV) + "m!" : "Altra band. " + String(dV) + " m ok");
    else oled.print(String(la, 5) + " " + String(lo, 5));
    oled.display(); return;
  }
  // persone dentro
  oled.setTextSize(2); oled.setCursor(0, 0); oled.print("B" + String(blu));
  String r = "R" + String(rossi); oled.setCursor(128 - r.length() * 12, 0); oled.print(r);
  oled.setTextSize(1); centrato(String(seq), 4, 1);
  // di chi è
  if (owner) { oled.fillRect(0, 17, 128, 17, SSD1306_WHITE); oled.setTextColor(SSD1306_BLACK); centrato(owner == 1 ? "BLU" : "ROSSA", 18, 2); oled.setTextColor(SSD1306_WHITE); }
  else { oled.drawRect(0, 17, 128, 17, SSD1306_WHITE); centrato("NEUTRA", 18, 2); }
  // barra della conquista
  int pct = (int)(100 * prog / tempoConq);
  oled.setTextSize(1); oled.setCursor(0, 37); oled.print(contesa ? "!" : progF == 1 ? "B" : progF == 2 ? "R" : "-");
  oled.drawRect(9, 36, 92, 10, SSD1306_WHITE);
  if (contesa) { if ((ora / 500) % 2) { oled.fillRect(11, 38, 88, 6, SSD1306_WHITE); } }
  else if (progF && pct > 0) oled.fillRect(11, 38, constrain(88 * pct / 100, 1, 88), 6, SSD1306_WHITE);
  oled.setCursor(104, 37); oled.print(contesa ? "STOP" : String(progF ? pct : 0) + "%");
  // note: prima il mortaio (per 3 minuti), poi cosa sta succedendo
  String n1;
  if (colpoDa && ora - colpoDa < 180000UL) n1 = colpoTipo == 1 ? "MORTAIO: colpita " + fa(colpoDa) : colpoTipo == 2 ? "Mortaio: " + String(colpoDist) + "m " + fa(colpoDa) : "Mortaio lontano " + String(colpoDist) + "m";
  else if (contesa) n1 = "CONTESA: tutto fermo";
  else if (progF && prog > 0) n1 = String(progF == 1 ? "Conquistano i BLU" : "Conquistano i ROSSI");
  else if (owner) n1 = String("Tenuta dai ") + (owner == 1 ? "BLU" : "ROSSI");
  else n1 = (blu || rossi) ? String("...") : String("Nessuno nell'area");
  // colpiti dal mortaio che sono qui: non contano
  String mq; portENTER_CRITICAL(&muxTag);
  for (int i = 0; i < nTag; i++) if (ora - tags[i].visto < validoMs && tags[i].rssi >= soglia && morto(tags[i].major, tags[i].minor)) mq += String(tags[i].major == 1 ? " B" : " R") + String(tags[i].minor);
  portEXIT_CRITICAL(&muxTag);
  if (mq.length() && (ora / 3000) % 2) n1 = "Colpiti:" + mq;
  if (vicina && (ora / 2000) % 2) n1 = "TROPPO VICINA " + String(dV) + "m!";
  oled.setCursor(0, 48); oled.print(n1);
  oled.setCursor(0, 57); oled.print(statoLoRa ? diagnosi : gpsTesto() + " " + loraTesto() + " " + battTesto(batteria()) + (muto ? " MUTO" : ""));
  oled.display();
}

// comandi (da USB o via radio dall'HQ). Risponde con una riga di testo.
String comando(String c) {
  c.trim(); String low = c; low.toLowerCase();
  int sp = low.indexOf(' '); String k = sp < 0 ? low : low.substring(0, sp), v = sp < 0 ? "" : low.substring(sp + 1); v.trim();
  if (k == "soglia" && v.length()) { soglia = constrain(v.toInt(), -120, -20); salva(); return "soglia " + String(soglia) + " dBm"; }
  if (k == "tempo" && v.length()) { tempoConq = constrain(v.toInt(), 5, 3600); salva(); return "conquista in " + String(tempoConq) + " s"; }
  if (k == "luce" && v.length()) { luce = constrain(v.toInt(), 5, 255); salva(); return "luce " + String(luce); }
  if (k == "gps") return "GPS: " + String(gps.satellites.value()) + " satelliti, HDOP " + String(gps.hdop.hdop(), 1) + (posFissa() ? ", posizione fissa " + String(mLat, 6) + "," + String(mLon, 6) + " (" + String(nPos) + " letture)" : String(", posizione non ancora fissa (") + String(nPos) + "/10)") + (spostata() ? ", SPOSTATA" : "");
  if (k == "muto") { muto = v.length() ? v.toInt() != 0 : !muto; salva(); return muto ? "cicalino muto" : "cicalino attivo"; }
  if (k == "buzzer") { buzBasso = !buzBasso; salva(); return String("cicalino ") + (buzBasso ? "attivo col segnale basso" : "attivo col segnale alto"); }
  if (k == "uscita" && v.length()) { validoMs = constrain(v.toInt(), 2, 60) * 1000UL; salva(); return "un tag non sentito per " + String(validoMs / 1000) + " s esce dall'area"; }
  if (k == "reset") { owner = 0; prog = 0; progF = 0; ultimoInvio = 0; return "area neutra"; }
  if (k == "fazione") { owner = constrain(v.toInt(), 0, 2); prog = 0; progF = 0; ultimoInvio = 0; return String("area ai ") + nomeFaz(owner); }
  if (k == "test") { testFino = millis() + 4000; return "prova luce e cicalino per 4 s"; }
  if (k == "invia") { ultimoInvio = 0; return "invio subito"; }
  if (k == "ogni" && v.length()) { invioMs = constrain(v.toInt(), 3, 120) * 1000UL; ultimoInvio = 0; return "stato ogni " + String(invioMs / 1000) + " s (fino al riavvio)"; }
  if (k == "posizione") { posFino = v.length() && v.toInt() == 0 ? 0 : millis() + (v.length() ? v.toInt() : 60) * 1000UL; return posFino ? "schermata posizione" : "schermata di gioco"; }
  if (k == "morti") {
    // morti b3,r12 (lista completa, sostituisce la precedente) · morti - (nessuno)
    nMorti = 0; String l = v + ",";
    int da = 0, ix;
    while ((ix = l.indexOf(',', da)) >= 0 && nMorti < 40) {
      String t = l.substring(da, ix); t.trim(); da = ix + 1;
      if (t.length() >= 2 && (t[0] == 'b' || t[0] == 'r')) { morti[nMorti].f = t[0] == 'b' ? 1 : 2; morti[nMorti].n = t.substring(1).toInt(); nMorti++; }
    }
    urgente = true;
    return "colpiti fuori gioco: " + String(nMorti);
  }
  if (k == "colpo" || k == "mortaio") {
    // colpo <metri dall'impatto> [raggio colpita] [raggio vicino]: senza numeri = colpo in pieno
    int a = v.indexOf(' '), b2 = a < 0 ? -1 : v.indexOf(' ', a + 1);
    int d = v.length() ? v.toInt() : 0, let = a > 0 ? v.substring(a + 1).toInt() : 15, vic = b2 > 0 ? v.substring(b2 + 1).toInt() : 40;
    if (let <= 0) let = 15; if (vic < let) vic = 40;
    colpoDist = max(0, d); colpoTipo = d <= let ? 1 : d <= vic ? 2 : 3; colpoDa = millis(); urgente = true;
    return colpoTipo == 1 ? "MORTAIO: bandiera COLPITA (" + String(colpoDist) + " m)" : colpoTipo == 2 ? "mortaio: colpi vicini a " + String(colpoDist) + " m" : "mortaio: colpo lontano (" + String(colpoDist) + " m), nessun effetto";
  }
  if (k == "info") return "bandiera " + idTesto(mioId) + " v" + VERSIONE + " soglia " + String(soglia) + " tempo " + String(tempoConq) + " luce " + String(luce) +
                          (muto ? " muto" : "") + (buzBasso ? " buzzer-basso" : "") + " area " + nomeFaz(owner) + " tag " + String(nTag);
  if (k == "riavvia") { delay(200); ESP.restart(); }
  return "comandi: info, soglia -75, tempo 60, luce 120, muto, buzzer, reset, fazione 1|2|0, test, invia, ogni 5, colpo 10, posizione 0|60, morti b3,r1|-, riavvia";
}

void ascoltaRadio() {
  chatLoop();
  if (!arrivato) return;
  arrivato = false;
  uint8_t p[16 + CHAT_MAX]; size_t len = radio.getPacketLength();
  int st = radio.readData(p, min(len, sizeof(p) - 1));
  float rsC = radio.getRSSI();
  radio.startReceive();
  if (st == RADIOLIB_ERR_NONE && chatRicevi(p, min(len, sizeof(p) - 1), rsC)) return;   // chat: la bandiera la ripete e basta
  if (st == RADIOLIB_ERR_NONE && len >= TESTA && p[0] == 'A' && p[1] == 'C' && p[2] == T_STATO) {
    // stato di un'altra bandiera: ci interessa solo la sua posizione
    uint16_t o = (p[3] << 8) | p[4]; int32_t la, lo; memcpy(&la, p + 10, 4); memcpy(&lo, p + 14, 4);
    if (o == mioId || (!la && !lo)) return;
    int i = 0; for (; i < nAltre; i++) if (altre[i].id == o) break;
    if (i == nAltre) { if (nAltre < 6) nAltre++; else i = 0; }
    altre[i] = { o, la / 1e6, lo / 1e6, millis() };
    return;
  }
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
  ultimoInvio = millis() - invioMs + 1500;   // e poi lo stato aggiornato
}

void setup() {
  avvioComune("BANDIERA");
  pref.begin("ac", false);
  validoMs = pref.getUInt("valido", 8000);
  soglia = pref.getInt("soglia", SOGLIA_RSSI); tempoConq = pref.getInt("tempo", CONQUISTA_S); luce = pref.getInt("luce", LUCE);
  muto = pref.getBool("muto", false); buzBasso = pref.getBool("buzBasso", BUZZER_BASSO);
  chatRipete = true;   // le bandiere fanno da ripetitori per la chat dei team leader
  pinMode(PIN_BUZZER, OUTPUT); digitalWrite(PIN_BUZZER, buzBasso ? HIGH : LOW);
  led.begin(); led.clear(); led.show();
  pinMode(PIN_LED_ROSSO, OUTPUT); pinMode(PIN_LED_BLU, OUTPUT);
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
  ultimoInvio = millis() - invioMs + 5000;
}

void loop() {
  while (Serial1.available()) gps.encode(Serial1.read());
  aggiornaPos();
  String riga; if (leggiRiga(riga)) Serial.println("> " + comando(riga));
  ascoltaRadio();
  int b = pulsante();
  if (b == 1) { ultimoInvio = 0; posFino = millis() + 60000UL; aggiornaDisplay(); }
  if (b == 2) Serial.println("> " + comando("reset"));
  static uint32_t ultimoPasso = millis(), ultimoDisp = 0;
  // conteggio ogni secondo (prima solo a ogni invio, ogni 20 s: per questo l'uscita dall'area era lenta)
  if (millis() - ultimoPasso >= 1000) { conta(); passoConquista((millis() - ultimoPasso) / 1000.0f); ultimoPasso = millis(); }
  if (millis() - ultimoDisp >= 1000) { ultimoDisp = millis(); aggiornaDisplay(); }
  // un po' di casualità sul ritmo, così due bandiere non trasmettono sempre insieme
  static uint32_t attesa = INVIO_MS;
  if (millis() - ultimoInvio >= attesa || (urgente && millis() - ultimoInvio >= 5000)) { conta(); ultimoInvio = millis(); attesa = invioMs + random(0, invioMs >= 10000 ? 3000 : 500); urgente = false; invia(); }
  disegnaLuce(); suona();
  static uint32_t ultimoAll = 0;   // durante l'allarme del mortaio il display va aggiornato più spesso (lampeggia)
  if (allarmeMortaio() && millis() - ultimoAll >= 150) { ultimoAll = millis(); aggiornaDisplay(); }
  // La radio Bluetooth scarta i pacchetti identici gia' sentiti: l'iBeacon di un tag (sempre uguale) passerebbe
  // una volta sola. Ripartire con l'ascolto ogni secondo azzera quella memoria, cosi' ogni tag viene risentito.
  // (Spegnere il filtro invece intasa la scheda con tutti i pacchetti dei telefoni intorno.)
  NimBLEScan *sc = NimBLEDevice::getScan();
  static uint32_t ultimoRiavvio = 0;
  if (millis() - ultimoRiavvio >= 1000) { ultimoRiavvio = millis(); if (sc->isScanning()) sc->stop(); sc->start(0, nullptr, false); }
  else if (!sc->isScanning()) sc->start(0, nullptr, false);
  delay(20);
}
#endif

#if defined(RUOLO_HQ) || defined(RUOLO_PATTUGLIA)
// Bluetooth: servizio "UART" Nordic (lo stesso di tante app): l'app riceve righe JSON, manda comandi di testo.
#define NUS_SERV "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_RX   "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX   "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
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
// Bluetooth acceso col nome dato (l'app cerca i nomi che iniziano con AC-)
void avviaBle(const String &nome) {
  NimBLEDevice::init(nome.c_str());
  NimBLEServer *srv = NimBLEDevice::createServer();
  srv->setCallbacks(new ServerCb());
  NimBLEService *s = srv->createService(NUS_SERV);
  bleTx = s->createCharacteristic(NUS_TX, NIMBLE_PROPERTY::NOTIFY);
  NimBLECharacteristic *rx = s->createCharacteristic(NUS_RX, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  rx->setCallbacks(new RxCb());
  s->start();
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERV); adv->setScanResponse(true);
  adv->setMinInterval(800); adv->setMaxInterval(1600);   // 0,5-1 s: si trova lo stesso e consuma meno
  adv->start();
}
// righe arrivate dall'app via Bluetooth
void righeBle(void (*fai)(const String &)) {
  String bl; portENTER_CRITICAL(&muxBle); bl = daBle; daBle = ""; portEXIT_CRITICAL(&muxBle);
  static String buf; buf += bl;
  int nl; while ((nl = buf.indexOf('\n')) >= 0) { fai(buf.substring(0, nl)); buf = buf.substring(nl + 1); }
  if (buf.length() && bl.length() == 0) { fai(buf); buf = ""; }   // comando senza "a capo"
}
// messaggio diretto in attesa di conferma: si riprova 2 volte
struct ChatAttesa { bool on; uint8_t p[16 + CHAT_MAX]; size_t n; uint8_t seq; uint16_t a; int tent; uint32_t prox; } chatAtt = { false };
void chatRiprova() {
  if (!chatAtt.on || millis() < chatAtt.prox) return;
  if (chatAtt.tent >= 3) { chatAtt.on = false; esci("{\"fallito\":{\"seq\":" + String(chatAtt.seq) + ",\"a\":\"" + idTesto(chatAtt.a) + "\"}}"); return; }
  chatAtt.tent++; chatAtt.prox = millis() + 7000 + random(0, 2000); trasmetti(chatAtt.p, chatAtt.n);
}
// "chat g|f|d <id destinatario o -> <testo>" dall'app: manda e risponde {"inviato":...}
void chatDaApp(const String &c, uint8_t faz, const String &nome) {
  String r = c.substring(4); r.trim();
  int sp = r.indexOf(' '); if (sp < 0) return; String tt = r.substring(0, sp); r = r.substring(sp + 1);
  sp = r.indexOf(' '); if (sp < 0) return; String dest = r.substring(0, sp), testo = r.substring(sp + 1); testo.trim();
  if (!testo.length()) return;
  uint8_t tipo = tt == "f" ? 1 : tt == "d" ? 2 : 0;
  if (tipo == 1 && !faz) { esci("{\"log\":\"Per il canale di fazione collega il telefono: serve sapere la tua fazione\"}"); return; }
  uint16_t a = tipo == 2 ? (uint16_t)strtoul(dest.c_str(), nullptr, 16) : 0;
  uint8_t sq = chatInvia(tipo, faz, a, 0, nome, testo, chatAtt.p, &chatAtt.n);
  if (tipo == 2) { chatAtt.on = true; chatAtt.seq = sq; chatAtt.a = a; chatAtt.tent = 1; chatAtt.prox = millis() + 7000 + random(0, 2000); }
  esci("{\"inviato\":{\"seq\":" + String(sq) + ",\"tipo\":\"" + chatTipo(tipo) + "\",\"a\":\"" + idTesto(a) + "\",\"da\":\"" + idTesto(mioId) + "\",\"testo\":\"" + chatPulito(testo) + "\"}}");
}
// un messaggio arrivato: è per me? (miaFaz 0 = HQ: solo globale e diretti)
bool chatPerMe(const uint8_t *p, uint8_t miaFaz) {
  if (p[2] == T_ANN) return true;
  uint8_t tipo = p[7]; uint16_t a = (p[9] << 8) | p[10];
  return tipo == 0 || (tipo == 1 && miaFaz && p[8] == miaFaz) || ((tipo == 2 || tipo == 3) && a == mioId);
}
// conferma di un diretto ricevuto, e "ok" all'app quando arriva la conferma di un mio diretto
bool chatConferme(const uint8_t *p, uint8_t faz, const String &nome) {
  if (p[2] != T_MSG) return false;
  uint16_t da = (p[3] << 8) | p[4], a = (p[9] << 8) | p[10];
  if (p[7] == 3 && a == mioId) {
    if (chatAtt.on && chatAtt.a == da && chatAtt.seq == p[11]) chatAtt.on = false;
    esci("{\"ok\":{\"seq\":" + String(p[11]) + ",\"da\":\"" + idTesto(da) + "\"}}");
    return true;
  }
  if (p[7] == 2 && a == mioId) { delay(random(30, 250)); chatInvia(3, faz, da, p[5], nome, ""); }
  return false;
}
#endif

#ifdef RUOLO_HQ
// ================================================================ HQ
#include "qrgen.h"
TinyGPSPlus gps;
String qrTesto = "";   // se c'è, il display mostra il QR (es. per il mortaio); comando "qr <testo>" / "qr -" 
struct Band { uint16_t id; uint8_t blu, rossi, owner, batt; float rssi; uint32_t visto; };
#define MAX_BAND 8
Band band[MAX_BAND];
int nBand = 0, nPacchetti = 0, nScartati = 0, nPat = 0;
void registro(const String &s) { String e = s; e.replace("\\", "/"); e.replace("\"", "'"); esci("{\"log\":\"" + e + "\"}"); }

// tag dei giocatori vicini all'HQ (rientro dei colpiti): l'HQ li ascolta e li passa all'app, che decide chi torna in gioco
struct TagHq { uint16_t n; uint8_t f; float rssi; uint32_t visto; };
#define MAX_TAG_HQ 48
TagHq tagHq[MAX_TAG_HQ];
int nTagHq = 0;
portMUX_TYPE muxHq = portMUX_INITIALIZER_UNLOCKED;
uint8_t uuidHq[16];
class AscoltoHq : public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice *d) override {
    uint8_t u[16]; uint16_t major, minor;
    if (!trovaIbeacon(d->getPayload(), d->getPayloadLength(), u, major, minor) || memcmp(u, uuidHq, 16) != 0) return;
    if (major != 1 && major != 2) return;
    int rssi = d->getRSSI(); uint32_t ora = millis();
    portENTER_CRITICAL(&muxHq);
    int i = 0; for (; i < nTagHq; i++) if (tagHq[i].n == minor && tagHq[i].f == major) break;
    if (i == nTagHq) { if (nTagHq < MAX_TAG_HQ) { tagHq[nTagHq] = { minor, (uint8_t)major, (float)rssi, ora }; nTagHq++; } }
    else { tagHq[i].rssi = (ora - tagHq[i].visto > 4000) ? rssi : tagHq[i].rssi * 0.6f + rssi * 0.4f; tagHq[i].visto = ora; }
    portEXIT_CRITICAL(&muxHq);
  }
};
// ogni secondo: {"hqtag":[{"n":3,"f":"blu","rssi":-62},...]} con i tag sentiti negli ultimi 2,5 s
void mandaTagHq() {
  static TagHq copia[MAX_TAG_HQ]; int nc = 0; uint32_t ora = millis();
  portENTER_CRITICAL(&muxHq);   // dentro la sezione critica solo copie, niente String (allocano memoria)
  for (int i = 0; i < nTagHq; i++) {
    if (ora - tagHq[i].visto > 60000) { tagHq[i] = tagHq[nTagHq - 1]; nTagHq--; i--; continue; }
    if (ora - tagHq[i].visto <= 2500) copia[nc++] = tagHq[i];
  }
  portEXIT_CRITICAL(&muxHq);
  if (!nc) return;
  String out = "{\"hqtag\":[";
  for (int k = 0; k < nc; k++) {
    char h[48]; snprintf(h, sizeof(h), "%s{\"n\":%u,\"f\":\"%s\",\"rssi\":%d}", k ? "," : "", copia[k].n, copia[k].f == 1 ? "blu" : "rossa", (int)copia[k].rssi); out += h;
  }
  esci(out + "]}");
}
String msgTesto = ""; uint32_t msgFino = 0;   // scritta grande per qualche secondo (es. "RIENTRA B3"), comando "msg <testo>"

void mostra() {
  if (!haOled) return;
  oled.clearDisplay(); oled.setTextColor(SSD1306_WHITE); oled.setTextSize(1);
  if (msgTesto.length() && millis() < msgFino) {
    oled.fillRect(0, 0, 128, 64, (millis() / 400) % 2 ? SSD1306_WHITE : SSD1306_BLACK);
    oled.setTextColor((millis() / 400) % 2 ? SSD1306_BLACK : SSD1306_WHITE);
    int sp = msgTesto.indexOf(' '); String a = sp > 0 ? msgTesto.substring(0, sp) : msgTesto, b = sp > 0 ? msgTesto.substring(sp + 1) : "";
    oled.setTextSize(2); oled.setCursor(max(0, (128 - (int)a.length() * 12) / 2), 10); oled.print(a);
    if (b.length()) { oled.setTextSize(3); oled.setCursor(max(0, (128 - (int)b.length() * 18) / 2), 34); oled.print(b); }
    oled.display(); return;
  }
  if (qrTesto.length()) {
    // QR a sinistra (fondo chiaro, quadretti scuri, 2 pixel per quadretto), testo a destra
    static QRCode q; static uint8_t buf[300]; static String fatto;
    static int8_t ok = -1; if (fatto != qrTesto) { ok = -1; for (uint8_t v = 3; v <= 4 && ok != 0; v++) ok = qrcode_initText(&q, buf, v, ECC_LOW, qrTesto.c_str()); fatto = qrTesto; }
    if (ok == 0) {
      int sc = q.size * 2 <= 60 ? 2 : 1, w = q.size * sc, o = (64 - w) / 2;
      oled.fillRect(0, 0, 64, 64, SSD1306_WHITE);
      for (uint8_t y = 0; y < q.size; y++) for (uint8_t x = 0; x < q.size; x++) if (qrcode_getModule(&q, x, y)) oled.fillRect(o + x * sc, o + y * sc, sc, sc, SSD1306_BLACK);
    }
    oled.setCursor(68, 2); oled.print("MORTAIO");
    oled.setCursor(68, 14); oled.print("Inquadra");
    oled.setCursor(68, 24); oled.print("il QR col");
    oled.setCursor(68, 34); oled.print("telefono");
    oled.setCursor(68, 52); oled.printf("%s %d", bleConnesso ? "BT" : "--", nBand);
    oled.display(); return;
  }
  oled.setCursor(0, 0); oled.printf("HQ %s %s pk%d P%d%s", bleConnesso ? "BT" : "--", idTesto(mioId).c_str(), nPacchetti, nPat, statoLoRa ? " LORA!" : "");
  if (statoLoRa) { oled.setCursor(0, 44); oled.printf("LoRa ERR %d %s", statoLoRa, pmuNome); oled.setCursor(0, 54); oled.print(diagnosi); }
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
  if (low.startsWith("chat ")) { chatDaApp(c, 0, "HQ"); return; }
  if (low.startsWith("msg")) { msgTesto = c.substring(3); msgTesto.trim(); msgFino = millis() + 6000; mostra(); return; }
  if (low.startsWith("qr")) { String t = c.substring(2); t.trim(); qrTesto = (t == "-" ? "" : t); registro(qrTesto.length() ? "QR sul display: " + qrTesto : "QR tolto"); mostra(); return; }
  if (low == "riavvia") { delay(200); ESP.restart(); }
  registro("comandi: info · qr <testo>|- · msg <testo> · chat g|d <id|-> <testo> · cmd <id|tutte> <comando> (es. cmd tutte soglia -75, cmd A1B2 test) · riavvia");
}

void setup() {
  avvioComune("HQ");
  avviaBle("AC-HQ-" + idTesto(mioId));
  chatRipete = true;
  chatCb = [](const uint8_t *p, size_t n, float rssi) {
    if (!chatPerMe(p, 0)) return;   // la regia legge solo il globale e i messaggi diretti all'HQ
    if (chatConferme(p, 0, "HQ") || chatGiaVistoUltimo) return;
    esci(chatJson(p, n, rssi));
  };
  // ascolto dei tag (rientro all'HQ): finestra a metà, così resta tempo per il Bluetooth verso l'app
  if (!leggiUuid(TAG_UUID, uuidHq)) Serial.println("TAG_UUID scritto male in config.h");
  NimBLEScan *sc = NimBLEDevice::getScan();
  sc->setAdvertisedDeviceCallbacks(new AscoltoHq(), true);
  sc->setActiveScan(false); sc->setInterval(100); sc->setWindow(60); sc->setMaxResults(0);
  sc->start(0, nullptr, false);
  Serial1.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  if (!accendiLoRa()) { scrivi("HQ", "ERRORE", "LoRa non partita"); return; }
  radio.startReceive();
  scrivi("AIRSOFT CONFLICT", "HQ", "In ascolto", String(LORA_FREQ, 3) + " MHz", "BT: AC-HQ-" + idTesto(mioId));
  Serial.println("In ascolto delle bandiere. Bluetooth: AC-HQ-" + idTesto(mioId) + ". Scrivi 'aiuto' per i comandi.");
}

void loop() {
  static uint32_t ultimoDisplay = 0;
  if (millis() - ultimoDisplay > (millis() < msgFino ? 200 : 1000)) { ultimoDisplay = millis(); mostra(); }
  // tag vicini: ogni secondo all'app, e si riparte con l'ascolto (la radio scarta i pacchetti identici già sentiti)
  static uint32_t ultimoTag = 0;
  if (millis() - ultimoTag >= 1000) {
    ultimoTag = millis(); mandaTagHq();
    NimBLEScan *sc = NimBLEDevice::getScan(); if (sc->isScanning()) sc->stop(); sc->start(0, nullptr, false);
  }
  while (Serial1.available()) gps.encode(Serial1.read());
  String riga; if (leggiRiga(riga)) comando(riga);
  righeBle([](const String &x) { comando(x); });
  chatLoop(); chatRiprova();
  static uint32_t annuncio = 0;
  if (statoLoRa == 0 && millis() - annuncio > 60000) { annuncio = millis() - random(0, 5000); chatAnnuncia(0, batteria(), "HQ"); }
  // battito ogni 10 s: l'app capisce che l'HQ è vivo anche senza bandiere
  static uint32_t battito = 0;
  if (millis() - battito > 10000) { battito = millis(); esci("{\"hq\":\"" + idTesto(mioId) + "\",\"pacchetti\":" + String(nPacchetti) + ",\"scartati\":" + String(nScartati) + ",\"irq\":" + String(nIrq) + ",\"lora\":" + String(statoLoRa) + ",\"pmu\":\"" + pmuNome + "\",\"radio\":\"" + chipRadio + "\",\"diag\":\"" + diagnosi + "\",\"batt\":" + String(batteria()) +
                     (gps.location.isValid() && gps.location.age() < 10000 && gps.hdop.hdop() < 3 ? ",\"lat\":" + String(gps.location.lat(), 6) + ",\"lon\":" + String(gps.location.lng(), 6) : String("")) + ",\"sat\":" + String(gps.satellites.value()) + "}"); }
  if (!arrivato) { delay(5); return; }
  arrivato = false;
  uint8_t p[TESTA + 4 * MAX_TAG_PACCHETTO + 8 > 16 + CHAT_MAX ? TESTA + 4 * MAX_TAG_PACCHETTO + 8 : 16 + CHAT_MAX];
  size_t len = radio.getPacketLength();
  int st = radio.readData(p, min(len, sizeof(p)));
  float rs = radio.getRSSI(), sn = radio.getSNR();
  radio.startReceive();
  if (st == RADIOLIB_ERR_NONE && chatRicevi(p, min(len, sizeof(p)), rs)) { nPacchetti++; return; }
  if (st != RADIOLIB_ERR_NONE || len < 5 || p[0] != 'A' || p[1] != 'C') { nScartati++; registro("pacchetto scartato (err " + String(st) + ", " + String(len) + " byte, " + String((int)rs) + " dBm)"); return; }
  nPacchetti++;
  uint16_t id = (p[3] << 8) | p[4];
  if (p[2] == T_RISP) {
    p[min(len, sizeof(p) - 1)] = 0;
    String t = String((char *)p + 5); t.replace("\"", "'");
    esci("{\"risposta\":\"" + idTesto(id) + "\",\"testo\":\"" + t + "\",\"rssiLora\":" + String((int)rs) + "}");
    return;
  }
  if (p[2] == T_PAT && len >= 18) {
    int32_t la, lo; memcpy(&la, p + 7, 4); memcpy(&lo, p + 11, 4);
    char h[260];
    snprintf(h, sizeof(h), "{\"pattuglia\":\"%s\",\"seq\":%u,\"batt\":%u,\"fix\":%s,\"lat\":%.6f,\"lon\":%.6f,\"sat\":%u,\"hdop\":%.1f,\"rssiLora\":%.0f,\"snr\":%.1f}",
             idTesto(id).c_str(), p[5], p[6], (p[17] & 1) ? "true" : "false", la / 1e6, lo / 1e6, p[15], p[16] / 10.0, rs, sn);
    nPat++; esci(h);
    return;
  }
  if (p[2] != T_STATO || len < TESTA) { nScartati++; registro("pacchetto di tipo sconosciuto " + String(p[2])); return; }
  int i = 0; for (; i < nBand; i++) if (band[i].id == id) break;
  if (i == nBand) { if (nBand >= MAX_BAND) i = 0; else nBand++; }
  Band &b = band[i];
  b.id = id; b.batt = p[6]; b.blu = p[7]; b.rossi = p[8]; b.owner = p[18]; b.rssi = rs; b.visto = millis();
  int32_t lat, lon; memcpy(&lat, p + 10, 4); memcpy(&lon, p + 14, 4);
  char h[420];
  snprintf(h, sizeof(h), "{\"bandiera\":\"%s\",\"seq\":%u,\"blu\":%u,\"rossi\":%u,\"owner\":%s,\"conq\":%s,\"pct\":%u,\"contesa\":%s,\"soglia\":%d,\"tempo\":%u,\"batt\":%u,\"lat\":%.6f,\"lon\":%.6f,\"gpsFisso\":%s,\"spostata\":%s,\"rssiLora\":%.0f,\"snr\":%.1f,\"tag\":[",
           idTesto(id).c_str(), p[5], p[7], p[8], jsonFaz(p[18]).c_str(), jsonFaz(p[19]).c_str(), p[20], (p[21] & 1) ? "true" : "false",
           (int)(int8_t)p[22], (p[23] << 8) | p[24], p[6], lat / 1e6, lon / 1e6, (p[21] & 2) ? "true" : "false", (p[21] & 4) ? "true" : "false", rs, sn);
  String out = h;
  int n = min((int)p[9], (int)((len - TESTA) / 4));
  for (int k = 0; k < n; k++) {
    uint8_t *q = p + TESTA + 4 * k; char t[60];
    snprintf(t, sizeof(t), "%s{\"n\":%u,\"f\":\"%s\",\"rssi\":%d%s}", k ? "," : "", (q[0] << 8) | q[1], (q[2] & 0x7F) == 1 ? "blu" : "rossa", (int8_t)q[3], (q[2] & 0x80) ? ",\"m\":1" : "");
    out += t;
  }
  esci(out + "]}");
}
#endif

#ifdef RUOLO_PATTUGLIA
// ================================================================ PATTUGLIA (LoRa del team leader)
// Manda la posizione all'HQ e fa da ponte per la chat: telefono del team leader -> Bluetooth -> LoRa -> gli altri.
TinyGPSPlus gps;
uint8_t seq = 0;
uint32_t ultimo = 0, inviatoFino = 0;
int ultimoEsito = 1;
uint8_t miaFaz = 0; String mioNome = "";   // li manda il telefono quando si collega ("chi blu TAURI·WHIPLASH")
// risparmio: lo schermo si spegne da solo; di notte contrasto al minimo e niente lampeggi
bool notte = false, schermoAcceso = true; uint32_t accesoFino = 0, avvisoFino = 0; String avviso = "";
bool provaLum = false;   // prova della luminosità in corso (comando "lum")
uint8_t livNotte = 2;   // quanto è scuro di notte: 1 scurissimo, 2 medio, 3 chiaro (comando "livello N" o dall'Officina)
void contrasto() {
  if (!haOled) return;
  // contrasto, precarica (più bassa = più scuro), tensione VCOMH: i valori variano un po' da schermo a schermo
  // livello 1 = la "luminosità minima" standard di questi schermi (si vede sempre); 2 e 3 un po' più chiari.
  // Abbassare anche precarica e VCOMH su alcuni schermi spegneva del tutto i pixel: non lo faccio più.
  // NOTTE 1 = 1 16 16, scelto da Luca al buio sui suoi schermi; 2 e 3 un po' più chiari
  static const uint8_t L[4][3] = { { 0xCF, 0xF1, 0x40 }, { 1, 16, 16 }, { 8, 34, 32 }, { 32, 120, 48 } };
  const uint8_t *v = L[notte ? constrain(livNotte, 1, 3) : 0];
  oled.ssd1306_command(0x81); oled.ssd1306_command(v[0]);
  oled.ssd1306_command(0xD9); oled.ssd1306_command(v[1]);
  oled.ssd1306_command(0xDB); oled.ssd1306_command(v[2]);
}
// niente luci che fanno vedere il team leader: LED di carica del chip di alimentazione e LED del GPS (impulso al secondo)
void ubx(uint8_t cls, uint8_t id, const uint8_t *pl, uint16_t n) {
  uint8_t a = 0, b = 0; uint8_t h[4] = { cls, id, (uint8_t)(n & 0xFF), (uint8_t)(n >> 8) };
  Serial1.write(0xB5); Serial1.write(0x62);
  for (int i = 0; i < 4; i++) { Serial1.write(h[i]); a += h[i]; b += a; }
  for (int i = 0; i < n; i++) { Serial1.write(pl[i]); a += pl[i]; b += a; }
  Serial1.write(a); Serial1.write(b); Serial1.flush();
}
void spegniLed() {
  if (PMU) PMU->setChargingLedMode(XPOWERS_CHG_LED_OFF);
  // GPS u-blox: NEO-6 (CFG-TP, impulso spento) e NEO-M8 (CFG-TP5, impulso non attivo); quello che non capisce lo ignora
  uint8_t tp[20] = { 0x40, 0x42, 0x0F, 0x00, 0xA0, 0x86, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x32, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
  ubx(0x06, 0x07, tp, sizeof(tp));
  delay(60);
  uint8_t tp5[32] = { 0 }; tp5[0] = 0; tp5[1] = 1;   // indice 0, versione 1, flags = 0 (non attivo)
  ubx(0x06, 0x31, tp5, sizeof(tp5));
  delay(60);
  uint8_t salva[13] = { 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17 };   // CFG-CFG: salva nella memoria del GPS
  ubx(0x06, 0x09, salva, sizeof(salva));
}
void sveglia(uint32_t ms) {
  accesoFino = max<uint32_t>(accesoFino, millis() + ms);
  if (!schermoAcceso && haOled) { oled.ssd1306_command(0xAF); schermoAcceso = true; }
}
// ultimo messaggio da mostrare sul display
String msgNome = "", msgTesto = "", msgTipo = ""; uint32_t msgDa = 0; bool msgNuovo = false;
// gli ultimi messaggi, da ridare al telefono quando si ricollega
#define STORIA 12
String storia[STORIA]; int nStoria = 0;
void ricorda(const String &j) { if (nStoria < STORIA) storia[nStoria++] = j; else { for (int i = 1; i < STORIA; i++) storia[i - 1] = storia[i]; storia[STORIA - 1] = j; } }
void inviaPos() {
  bool ok = gps.location.isValid() && gps.location.age() < 10000;
  int32_t la = ok ? (int32_t)(gps.location.lat() * 1e6) : 0, lo = ok ? (int32_t)(gps.location.lng() * 1e6) : 0;
  uint8_t p[18]; seq++;
  p[0] = 'A'; p[1] = 'C'; p[2] = T_PAT; p[3] = mioId >> 8; p[4] = mioId & 0xFF; p[5] = seq; p[6] = batteria();
  memcpy(p + 7, &la, 4); memcpy(p + 11, &lo, 4);
  p[15] = (uint8_t)min((uint32_t)255, gps.satellites.value());
  p[16] = (uint8_t)min(255.0, gps.hdop.isValid() ? gps.hdop.hdop() * 10 : 255.0);
  p[17] = ok ? 1 : 0;
  ultimoEsito = trasmetti(p, sizeof(p));
  inviatoFino = millis() + 1200;
  Serial.printf("[%s] posizione #%u %s -> %s\n", idTesto(mioId).c_str(), seq, ok ? (String(la / 1e6, 6) + "," + String(lo / 1e6, 6)).c_str() : "senza GPS", ultimoEsito == RADIOLIB_ERR_NONE ? "inviata" : "ERRORE LoRa");
}
String nomeVisto() { return mioNome.length() ? mioNome : "LoRa " + idTesto(mioId); }
void stato() {   // per l'app: chi sono e come sto
  esci("{\"pat\":\"" + idTesto(mioId) + "\",\"nome\":\"" + chatPulito(mioNome) + "\",\"f\":\"" + nomeFaz(miaFaz) + "\",\"batt\":" + String(batteria()) + ",\"fix\":" + (gps.location.isValid() && gps.location.age() < 10000 ? "true" : "false") + ",\"lora\":" + String(statoLoRa) + "}");
}
void comandoPat(const String &c0) {
  String c = c0; c.trim(); String low = c; low.toLowerCase();
  if (low.startsWith("chi ")) {   // chi blu|rossa|- <nome>
    String r = c.substring(4); r.trim(); int sp = r.indexOf(' ');
    String f = sp > 0 ? r.substring(0, sp) : r; String n = sp > 0 ? r.substring(sp + 1) : "";
    miaFaz = f == "blu" ? 1 : f == "rossa" ? 2 : 0; n.trim(); mioNome = n.substring(0, 28);
    pref.putUChar("faz", miaFaz); pref.putString("nome", mioNome);
    stato(); if (statoLoRa == 0) chatAnnuncia(miaFaz, batteria(), nomeVisto());
    return;
  }
  if (low.startsWith("chat ")) { chatDaApp(c, miaFaz, nomeVisto()); return; }
  // prova a mano: "lum 0 241 64" = contrasto (0-255), precarica (1-255), VCOMH (0, 32, 48, 64). Non si salva: per trovare i valori giusti
  if (low.startsWith("lum ")) {
    long c1 = 0, p1 = 241, v1 = 64; sscanf(low.c_str() + 4, "%ld %ld %ld", &c1, &p1, &v1);
    c1 = constrain(c1, 0, 255); p1 = constrain(p1, 1, 255); v1 = constrain(v1, 0, 112);
    if (haOled) { oled.ssd1306_command(0x81); oled.ssd1306_command(c1); oled.ssd1306_command(0xD9); oled.ssd1306_command(p1); oled.ssd1306_command(0xDB); oled.ssd1306_command(v1); }
    sveglia(60000); provaLum = true; avviso = String(c1) + " " + String(p1) + " " + String(v1); avvisoFino = millis() + 60000;
    esci("{\"lum\":[" + String(c1) + "," + String(p1) + "," + String(v1) + "]}");
    return;
  }
  if (low.startsWith("livello")) { provaLum = false; livNotte = constrain(low.substring(7).toInt(), 1, 3); pref.putUChar("livNotte", livNotte); notte = true; pref.putBool("notte", true); contrasto(); sveglia(15000); avviso = "NOTTE " + String(livNotte); avvisoFino = millis() + 2000; stato(); return; }
  if (low.startsWith("notte")) { notte = low.indexOf('0') < 0; pref.putBool("notte", notte); contrasto(); sveglia(15000); stato(); return; }
  if (low == "storia") { for (int i = 0; i < nStoria; i++) esci(storia[i]); stato(); return; }
  if (low == "invia") { ultimo = millis(); inviaPos(); return; }
  if (low == "stato" || low == "info") { stato(); return; }
  if (low == "riavvia") { delay(200); ESP.restart(); }
  Serial.println("comandi: chi blu|rossa|- <nome>, chat g|f|d <id|-> <testo>, notte 1|0, storia, invia, stato, riavvia");
}
void setup() {
  avvioComune("PATTUGLIA");
  setCpuFrequencyMhz(80);   // basta e avanza per GPS, LoRa e Bluetooth: un terzo di consumo in meno del processore
  pref.begin("ac", false);
  miaFaz = pref.getUChar("faz", 0); mioNome = pref.getString("nome", "");
  notte = pref.getBool("notte", false); livNotte = pref.getUChar("livNotte", 1); contrasto(); sveglia(60000);
  avviaBle("AC-LORA-" + idTesto(mioId));
  chatCb = [](const uint8_t *p, size_t n, float rssi) {
    if (!chatPerMe(p, miaFaz)) return;
    if (chatConferme(p, miaFaz, nomeVisto()) || chatGiaVistoUltimo) return;
    String j = chatJson(p, n, rssi); esci(j);
    if (p[2] == T_MSG) {
      ricorda(j);
      char buf[CHAT_MAX + 1]; int m = min((int)n - 12, CHAT_MAX); if (m < 0) m = 0; memcpy(buf, p + 12, m); buf[m] = 0;
      String corpo = buf; int tab = corpo.indexOf('\t');
      msgNome = tab >= 0 ? corpo.substring(0, tab) : "?"; msgTesto = tab >= 0 ? corpo.substring(tab + 1) : corpo;
      msgTipo = p[7] == 0 ? "GLOBALE" : p[7] == 1 ? "FAZIONE" : "PER TE"; msgDa = millis(); msgNuovo = true;
      sveglia(60000);
    }
  };
  Serial1.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  delay(300); spegniLed();
  if (!accendiLoRa()) { scrivi("PATTUGLIA", "ERRORE", "LoRa non partita"); return; }
  radio.startReceive();
  Serial.println("Pattuglia " + idTesto(mioId) + ": posizione ogni " + String(PATTUGLIA_MS / 1000) + " s col GPS. Pulsante: accende lo schermo / giorno-notte; tenuto premuto = manda la posizione. Bluetooth: AC-LORA-" + idTesto(mioId));
  ultimo = millis() - PATTUGLIA_MS + 3000;
}
// testo lungo a righe da 21 caratteri (display piccolo)
String rigaN(const String &t, int k) { return t.substring(min((int)t.length(), k * 21), min((int)t.length(), k * 21 + 21)); }
void loop() {
  while (Serial1.available()) gps.encode(Serial1.read());
  bool ok = gps.location.isValid() && gps.location.age() < 10000;
  // con il GPS ogni 15 s (+ un po' a caso, per non trasmettere sempre insieme a qualcun altro); senza GPS non manda niente
  // (che il LoRa c'è lo dice già l'annuncio della chat, ogni 2 minuti)
  static uint32_t attesa = PATTUGLIA_MS;
  if (statoLoRa == 0 && ok && millis() - ultimo >= attesa) { ultimo = millis(); attesa = PATTUGLIA_MS + random(0, 3000); inviaPos(); }
  static uint32_t annuncio = 0;
  if (statoLoRa == 0 && millis() - annuncio > 120000) { annuncio = millis() - random(0, 8000); chatAnnuncia(miaFaz, batteria(), nomeVisto()); }
  // radio: chat e annunci degli altri
  if (arrivato) {
    arrivato = false;
    uint8_t p[16 + CHAT_MAX]; size_t len = radio.getPacketLength();
    int st = radio.readData(p, min(len, sizeof(p)));
    float rs = radio.getRSSI();
    radio.startReceive();
    if (st == RADIOLIB_ERR_NONE) chatRicevi(p, min(len, sizeof(p)), rs);
  }
  chatLoop(); chatRiprova();
  bool vedoMsg = msgNuovo && millis() - msgDa < 60000;
  // tasto: schermo spento -> lo accende; con un messaggio -> lo chiude; altrimenti giorno -> notte 3 -> 2 -> 1 -> giorno. Tenuto premuto: manda la posizione
  int pr = pulsante();
  if (provaLum && millis() >= avvisoFino) { provaLum = false; contrasto(); }
  if (pr == 1 && provaLum) { provaLum = false; avvisoFino = 0; contrasto(); sveglia(30000); pr = 0; }
  if (pr == 1) {
    if (!schermoAcceso) sveglia(30000);
    else if (vedoMsg) { msgNuovo = false; sveglia(30000); }
    else {   // giro: GIORNO -> NOTTE 3 (chiara) -> NOTTE 2 -> NOTTE 1 (scurissima) -> GIORNO
      if (!notte) { notte = true; livNotte = 3; } else if (livNotte > 1) livNotte--; else notte = false;
      pref.putBool("notte", notte); pref.putUChar("livNotte", livNotte); contrasto();
      avviso = notte ? "NOTTE " + String(livNotte) : "GIORNO"; avvisoFino = millis() + 1500; sveglia(30000);
    }
  }
  if (pr == 2) { sveglia(30000); ultimo = millis(); inviaPos(); avviso = "INVIATA"; avvisoFino = millis() + 1500; }
  if (schermoAcceso && millis() > accesoFino && haOled) { oled.invertDisplay(false); oled.ssd1306_command(0xAE); schermoAcceso = false; }
  static uint32_t disp = 0;
  if (schermoAcceso && millis() < avvisoFino) {
    if (millis() - disp >= 300) { disp = millis(); if (provaLum) scrivi("PROVA: contr prec vcom", avviso, "ABCDEFGHIJ 0123456789", "TAURI WHIPLASH BLU", "tasto = torna normale");
      else scrivi("", "  " + avviso, "", notte ? "schermo scuro (" + String(livNotte) + "/3)" : "contrasto pieno", ""); }
  } else if (schermoAcceso && millis() - disp >= 500) {
    disp = millis();
    if (vedoMsg) {
      int pagine = max(1, ((int)msgTesto.length() + 62) / 63), pg = ((millis() - msgDa) / 4000) % pagine;
      // di giorno lampeggia per farsi notare; di notte no (niente luce)
      if (haOled && !notte && ((millis() - msgDa) < 3000) && ((millis() / 250) % 2)) { oled.invertDisplay(true); } else if (haOled) oled.invertDisplay(false);
      scrivi(msgTipo + " " + String((millis() - msgDa) / 1000) + "s" + (pagine > 1 ? " " + String(pg + 1) + "/" + String(pagine) : ""), msgNome.substring(0, 10),
             rigaN(msgTesto, pg * 3), rigaN(msgTesto, pg * 3 + 1), rigaN(msgTesto, pg * 3 + 2));
    } else {
      if (haOled) oled.invertDisplay(false);
      uint32_t prossimo = attesa - min<uint32_t>(millis() - ultimo, attesa);
      scrivi(nomeVisto().substring(0, 15) + " " + battTesto(batteria()),
             millis() < inviatoFino ? String(ultimoEsito == RADIOLIB_ERR_NONE ? "INVIATA" : "ERR LoRa") : ok ? "GPS OK" : "NO GPS",
             ok ? String(gps.location.lat(), 5) + " " + String(gps.location.lng(), 5) : String("cerco i satelliti... cielo aperto"),
             String(miaFaz == 1 ? "BLU" : miaFaz == 2 ? "ROSSI" : "fazione ?") + " · BT " + (bleConnesso ? "telefono ok" : "AC-LORA-" + idTesto(mioId)),
             ok ? "#" + String(seq) + " " + loraTesto() + " prossima " + String(prossimo / 1000) + "s" : String("posizione: aspetto il GPS"));
    }
  }
  String r; if (leggiRiga(r)) comandoPat(r);
  righeBle(comandoPat);
  static uint32_t st10 = 0; if (millis() - st10 > 10000) { st10 = millis(); stato(); }
  delay(10);
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

#ifdef RUOLO_INIETTORE
// Tutto quello che l'iniettore scrive va su USB e, se un telefono e' collegato via Bluetooth (pagina Beacon prog), anche a lui.
// Cosi' i tag si programmano anche sul campo dal cellulare Android, senza computer.
#define NUS_SERV "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_RX   "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX   "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
NimBLECharacteristic *bleTx = nullptr;
volatile bool bleConnesso = false;
String daBle = "";
portMUX_TYPE muxBle = portMUX_INITIALIZER_UNLOCKED;
class ServerCb : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *s) override { bleConnesso = true; NimBLEDevice::startAdvertising(); }
  void onDisconnect(NimBLEServer *s) override { bleConnesso = false; NimBLEDevice::startAdvertising(); }
};
class RxCb : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c) override { std::string v = c->getValue(); portENTER_CRITICAL(&muxBle); daBle += String(v.c_str()); portEXIT_CRITICAL(&muxBle); }
};
class Uscita : public Print {
  String riga;
 public:
  size_t write(uint8_t c) override {
    Serial.write(c);
    if (c == '\r') return 1;
    riga += (char)c;
    if (c == '\n' || riga.length() > 400) {
      if (bleConnesso && bleTx) for (int i = 0; i < (int)riga.length(); i += 20) {
        String pz = riga.substring(i, min((int)riga.length(), i + 20));
        bleTx->setValue((uint8_t *)pz.c_str(), pz.length()); bleTx->notify(); delay(4);
      }
      riga = "";
    }
    return 1;
  }
};
Uscita Out;
// ================================================================ INIETTORE
// Programma i tag veri DX-SMART (DX-CP35 e simili) senza la loro app: si collega via Bluetooth al tag più vicino
// e gli scrive UUID, Major (fazione), Minor (numero), intervallo e potenza. Poi controlla nell'aria che trasmetta giusto.
// Protocollo (dal codice della loro app): servizio FFE0, risposte su FFE1 (notifiche), comandi su FFE2, password su FFE3.
// Ogni comando: 'N' 'O' codice lunghezza dati... xor(codice, lunghezza, dati).
uint8_t uuid[16];
String pwd = "dx1234";
bool silenzioPwd = false, ultimoPwdErr = false;   // per riprovare con le password di fabbrica conosciute
int potIdx = 4, intIdx = 5, vicinoDb = -60;       // potenza 0-7 (da -19,5 a +2,5 dBm), intervallo ×100 ms, soglia "tag in mano"
bool autoOn = false; uint8_t autoFaz = 1; uint16_t autoNum = 1;
String ultimo = "", stato = "Pronto";
String fatti[40]; int nFatti = 0;                 // indirizzi dei tag già programmati in questa sessione (modo automatico)
const char *POT_TESTO[] = { "-19.5", "-13.5", "-7", "-3.5", "-1", "+1", "+1.5", "+2.5" };

// risposte del tag
uint8_t rxBuf[64]; int rxLen = 0, rxAtteso = 0;
volatile int nRisp = 0; bool rispTx = true; bool rilettoOk = false;
uint8_t ultimaHex[64]; volatile int ultimaHexLen = 0;
void stampaRisp() { String h = "  <- risposta"; for (int k = 0; k < ultimaHexLen; k++) { char b[4]; snprintf(b, sizeof(b), " %02X", ultimaHex[k]); h += b; } Out.println(h); }
volatile int ultimaRisp = -1; uint8_t rispDati[40]; volatile int rispLen = 0;
uint8_t grezzo[16][24]; uint8_t grezzoLen[16]; uint16_t grezzoDa[16]; volatile int nGrezzo = 0;   // notifiche cosi' come arrivano (per la sonda)
void notifica(NimBLERemoteCharacteristic *c, uint8_t *d, size_t n, bool isNotify) {
  if (nGrezzo < 16) { int k = nGrezzo; grezzoLen[k] = min((int)n, 24); memcpy(grezzo[k], d, grezzoLen[k]); grezzoDa[k] = c->getUUID().getNative()->u16.value; nGrezzo = k + 1; }
  for (size_t i = 0; i < n; i++) {
    uint8_t b = d[i];
    if (rxLen == 0 && b != 0x4E) continue;
    if (rxLen == 1 && b != 0x4F) { rxLen = 0; continue; }
    rxBuf[rxLen++] = b;
    if (rxLen == 4) rxAtteso = b + 5;
    if (rxLen >= 4 && rxLen == rxAtteso) {
      uint8_t x = rxBuf[2] ^ rxBuf[3]; for (int k = 0; k < rxBuf[3]; k++) x ^= rxBuf[4 + k];
      if (x == rxBuf[rxLen - 1]) { rispLen = min((int)rxBuf[3], 40); memcpy(rispDati, rxBuf + 4, rispLen); ultimaRisp = rxBuf[2]; nRisp++; }
      ultimaHexLen = rxLen; memcpy(ultimaHex, rxBuf, rxLen);   // la stampa si fa fuori dalla callback
      rxLen = 0; rxAtteso = 0;
    }
    if (rxLen >= (int)sizeof(rxBuf)) rxLen = 0;
  }
}
std::string pacchetto(uint8_t cod, const uint8_t *d, uint8_t n) {
  std::string s; s += (char)0x4E; s += (char)0x4F; s += (char)cod; s += (char)n;
  uint8_t x = cod ^ n; for (int i = 0; i < n; i++) { s += (char)d[i]; x ^= d[i]; }
  s += (char)x; return s;
}
String hexMac(const NimBLEAddress &a) { String s = a.toString().c_str(); s.toUpperCase(); return s; }
void esito(bool ok, const String &mac, uint8_t f, uint16_t n, const String &testo, bool verificato) {
  if (ok) ultimo = String(f == 1 ? "B" : "R") + String(n) + (verificato ? " OK" : " da ver."); else ultimo = String(f == 1 ? "B" : "R") + String(n) + " ERRORE";
  if (ok) Out.println(String("FATTO: tag ") + nomeFaz(f) + " #" + String(n) + " (" + mac + ")" + (verificato ? ", controllato in onda" : ", scritto ma non ancora visto in onda"));
  else Out.println(String("ERRORE: ") + testo);
  String t = testo; t.replace("\"", "'");
  Out.printf("{\"iniettore\":\"%s\",\"f\":\"%s\",\"n\":%u,\"mac\":\"%s\",\"verificato\":%s,\"testo\":\"%s\"}\n", ok ? "ok" : "errore", nomeFaz(f), n, mac.c_str(), verificato ? "true" : "false", t.c_str());
}

// iBeacon nella pubblicità: 4C 00 02 15 + uuid(16) + major(2) + minor(2) + potenza
// cerco l'iBeacon in TUTTI i campi del pacchetto (pubblicità + risposta alla scansione), non solo nel primo "dati del produttore":
// i CP35 nella risposta alla scansione mettono altri dati loro, che a volte coprivano l'iBeacon
bool leggiIbeacon(NimBLEAdvertisedDevice &d, uint8_t *u, uint16_t &maj, uint16_t &min_) {
  return trovaIbeacon(d.getPayload(), d.getPayloadLength(), u, maj, min_);
}
// I CP35 trasmettono a turno piu' pacchetti (iBeacon, Eddystone, nome...): bisogna guardarli uno per uno,
// non solo l'ultimo ricevuto. Questa tabella raccoglie tutto quello che si sente durante una scansione.
struct Visto { char mac[18]; char nome[20]; int rssi; bool coll, ib, nostro; uint16_t ma, mi; uint8_t tipo; uint16_t mv; char tlm[33]; char altro[48]; };
#define MAX_VISTI 72
Visto visti[MAX_VISTI]; volatile int nVisti = 0; volatile bool raccogli = false;
portMUX_TYPE muxV = portMUX_INITIALIZER_UNLOCKED;
class Raccolta : public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice *d) override {
    if (!raccogli) return;
    String mac = hexMac(d->getAddress());
    uint8_t u[16]; uint16_t ma = 0, mi = 0; bool ib = leggiIbeacon(*d, u, ma, mi);
    bool nostro = ib && !memcmp(u, uuid, 16);
    std::string nm = d->haveName() ? d->getName() : std::string();
    bool coll = d->getAdvType() == 0 || d->getAdvType() == 1;
    // Eddystone TLM (servizio FEAA, tipo 0x20): dentro c'e' la tensione della batteria in mV
    uint16_t mv = 0; char tlm[33] = "", altro[48] = "";
    for (int k = 0; k < (int)d->getServiceDataCount(); k++) {
      std::string sd = d->getServiceData(k);
      bool feaa = d->getServiceDataUUID(k) == NimBLEUUID((uint16_t)0xFEAA);
      if (feaa && sd.size() >= 4 && (uint8_t)sd[0] == 0x20) {
        // byte grezzi del TLM, per capire il formato dei CP35 (finiscono nell'elenco batterie)
        for (int j = 0; j < (int)sd.size() && j < 16; j++) sprintf(tlm + 2 * j, "%02X", (uint8_t)sd[j]);
        // tensione: si prova il formato standard (20 00 VV VV) e le varianti, si tiene il primo valore da pila (1,8 - 3,7 V)
        const uint8_t *q = (const uint8_t *)sd.data();
        uint16_t prove[] = { (uint16_t)(q[2] << 8 | q[3]), (uint16_t)(q[1] << 8 | q[2]), (uint16_t)(q[3] << 8 | q[2]), (uint16_t)(q[2] << 8 | q[1]) };
        for (uint16_t x : prove) if (x >= 1800 && x <= 3700) { mv = x; break; }
      } else if (!feaa && sd.size()) {
        // altri dati (es. il pacchetto "informazioni" dei DX, che potrebbe contenere la batteria)
        snprintf(altro, 8, "%s:", d->getServiceDataUUID(k).toString().substr(0, 6).c_str());
        int o = strlen(altro);
        for (int j = 0; j < (int)sd.size() && o + 2 < 47; j++, o += 2) sprintf(altro + o, "%02X", (uint8_t)sd[j]);
      }
    }
    // in casa ci sono decine di altri dispositivi Bluetooth (telefoni, TV, cuffie...): la tabella non deve riempirsi di quelli
    bool utile = ib || mv || tlm[0] || nm.size() || d->getRSSI() >= vicinoDb;
    portENTER_CRITICAL(&muxV);
    int i = 0; for (; i < nVisti; i++) if (!strcmp(visti[i].mac, mac.c_str())) break;
    if (i == nVisti) {
      if (!utile) i = MAX_VISTI;
      else if (nVisti < MAX_VISTI) nVisti++;
      else {   // piena: prendo il posto del dispositivo estraneo più debole
        int peggio = -1;
        for (int k = 0; k < nVisti; k++) if (!visti[k].ib && !visti[k].tlm[0] && (peggio < 0 || visti[k].rssi < visti[peggio].rssi)) peggio = k;
        i = (peggio >= 0 && (ib || tlm[0] || d->getRSSI() > visti[peggio].rssi)) ? peggio : MAX_VISTI;
      }
      if (i < MAX_VISTI) { memset(&visti[i], 0, sizeof(Visto)); strncpy(visti[i].mac, mac.c_str(), 17); visti[i].rssi = -999; visti[i].tipo = d->getAddress().getType(); }
    }
    if (i < MAX_VISTI) {
      Visto &v = visti[i];
      if (d->getRSSI() > v.rssi) v.rssi = d->getRSSI();
      if (coll) v.coll = true;
      if (nm.size() && !v.nome[0]) strncpy(v.nome, nm.c_str(), 19);
      if (ib && (!v.ib || nostro)) { v.ib = true; v.nostro = nostro; v.ma = ma; v.mi = mi; }
      if (mv) v.mv = mv;
      if (tlm[0]) strcpy(v.tlm, tlm);
      if (altro[0] && !v.altro[0]) strcpy(v.altro, altro);
    }
    portEXIT_CRITICAL(&muxV);
  }
};
// La radio Bluetooth scarta i pacchetti identici già sentiti nella stessa scansione: i CP35 ripetono sempre gli stessi,
// quindi una scansione lunga ne perde tanti. Faccio tante scansioni da 1 s di fila e sommo quello che sento.
void scansiona(int sec) {
  NimBLEScan *sc = NimBLEDevice::getScan();
  sc->setDuplicateFilter(false);
  nVisti = 0; raccogli = true;
  // a turno: ascolto "passivo" (ogni pacchetto arriva subito, così non si perdono gli iBeacon) e "attivo" (chiede anche il nome)
  for (int k = 0; k < sec; k++) { sc->setActiveScan(k % 2 == 1); sc->start(1, false); sc->clearResults(); }
  sc->setActiveScan(true);
  raccogli = false;
}

void schermo() {
  // riga grande (max 10 caratteri): il prossimo tag che verra' scritto
  String r2 = autoOn ? String(String(autoFaz == 1 ? "BLU" : "ROSSO") + " #" + String(autoNum)) : String("FERMO");
  scrivi(autoOn ? "INIETTORE  in corso" : "INIETTORE  fermo", r2, stato.substring(0, 21),
         ultimo.length() ? ("Ultimo: " + ultimo).substring(0, 21) : String(""), ("pot " + String(POT_TESTO[potIdx]) + "dBm  " + String(intIdx * 100) + "ms").substring(0, 21));
}

bool programma1(NimBLEAddress a, uint8_t f, uint16_t n) {
  ultimoPwdErr = false; rilettoOk = false;
  String mac = hexMac(a);
  stato = "Collego " + mac.substring(9); schermo();
  Out.println("Collego " + mac + "...");
  NimBLEClient *c = NimBLEDevice::createClient();
  c->setConnectTimeout(6);
  bool ok = false; String err = "";
  if (!c->connect(a)) err = "non si collega (tienilo vicino e riprova)";
  NimBLERemoteService *s = nullptr; NimBLERemoteCharacteristic *rx = nullptr, *tx = nullptr, *pw = nullptr;
  if (!err.length()) {
    // elenco di servizi e caratteristiche, PRIMA di prendere i puntatori: rileggere i servizi li invaliderebbe (era il riavvio della 0.8.3)
    std::vector<NimBLERemoteService *> *sv = c->getServices(true);
    for (auto *x : *sv) {
      Out.printf("  servizio %s\n", x->getUUID().toString().c_str());
      std::vector<NimBLERemoteCharacteristic *> *cv = x->getCharacteristics(true);
      for (auto *y : *cv) Out.printf("    car. %s%s%s%s%s\n", y->getUUID().toString().c_str(), y->canRead() ? " lettura" : "", y->canWrite() ? " scrittura" : "",
                                       y->canWriteNoResponse() ? " scrittura-veloce" : "", y->canNotify() ? " notifica" : (y->canIndicate() ? " indicazione" : ""));
    }
    s = c->getService(NimBLEUUID((uint16_t)0xFFE0));
    if (!s) err = "non e' un tag DX-SMART (manca il servizio FFE0)";
  }
  if (!err.length()) {
    rx = s->getCharacteristic(NimBLEUUID((uint16_t)0xFFE1)); tx = s->getCharacteristic(NimBLEUUID((uint16_t)0xFFE2)); pw = s->getCharacteristic(NimBLEUUID((uint16_t)0xFFE3));
    if (!rx || !tx) err = "caratteristiche FFE1/FFE2 mancanti";
  }
  if (!err.length()) {
    rxLen = 0; ultimaRisp = -1;
    // la scrittura del CCCD deve essere CON conferma (Write Request): il CP35 ignora quella veloce (visto nel log della loro app)
    bool sub = rx->canNotify() ? rx->subscribe(true, notifica, true) : (rx->canIndicate() ? rx->subscribe(false, notifica, true) : false);
    Out.println(sub ? "  notifiche attive" : "  NOTIFICHE NON ATTIVE");
    rispTx = tx->canWrite();   // come l'app Android: scrittura con conferma se il tag la supporta
    delay(300);
    // serve la password?
    std::string q = pacchetto(0x25, nullptr, 0); tx->writeValue((uint8_t *)q.data(), q.size(), rispTx);
    uint32_t t0 = millis(); while (ultimaRisp != 0x25 && millis() - t0 < 2000) delay(20);
    bool serve = ultimaRisp != 0x25 || rispLen < 1 || rispDati[0] != 0;
    if (ultimaRisp == 0x25) stampaRisp();
    Out.println(ultimaRisp == 0x25 ? (serve ? "Il tag chiede la password" : "Il tag non chiede la password") : "Nessuna risposta alla domanda password: la mando comunque");
    if (serve && pw) { pw->writeValue((uint8_t *)pwd.c_str(), pwd.length(), pw->canWrite()); delay(500); }
    if (!c->isConnected()) { err = "password errata (prova il tasto Password)"; ultimoPwdErr = true; }
  }
  if (!err.length()) {
    stato = "Scrivo..."; schermo();
    uint8_t mj[2] = { 0, f }, mn[2] = { (uint8_t)(n >> 8), (uint8_t)(n & 0xFF) };
    uint8_t rs = (uint8_t)(int8_t)-57, iv = (uint8_t)intIdx, pt = (uint8_t)potIdx;
    struct { uint8_t cod; const uint8_t *d; uint8_t n; const char *nome; } passi[] = {
      { 0x12, nullptr, 0, "slot 2 (iBeacon)" }, { 0x62, nullptr, 0, "tipo iBeacon" }, { 0x74, uuid, 16, "UUID" }, { 0x75, mj, 2, "Major (fazione)" },
      { 0x76, mn, 2, "Minor (numero)" }, { 0x77, &rs, 1, "RSSI a 1 m" }, { 0x78, &iv, 1, "intervallo" }, { 0x79, &pt, 1, "potenza" },
      { 0xA0, nullptr, 0, "sensore spento" }, { 0x60, nullptr, 0, "salva" } };
    for (auto &p : passi) {
      if (!c->isConnected()) { err = String("il tag si e' scollegato durante: ") + p.nome; break; }
      std::string k = pacchetto(p.cod, p.d, p.n);
      int prima = nRisp;
      if (!tx->writeValue((uint8_t *)k.data(), k.size(), rispTx)) { err = String("scrittura non riuscita: ") + p.nome; break; }
      uint32_t t1 = millis(); while (nRisp == prima && millis() - t1 < 600) delay(10);
      Out.printf("  %s %s\n", p.nome, nRisp != prima ? "ok (risposto)" : "inviato (nessuna risposta)");
      if (nRisp != prima) stampaRisp();
      delay(150);
    }
    if (!err.length()) ok = true;
    // rilettura dal tag: 4E 4F 62 -> risponde 62 + UUID(16) + Major(2) + Minor(2) + ...
    if (ok && c->isConnected()) {
      delay(400); nGrezzo = 0;
      std::string q = pacchetto(0x62, nullptr, 0); tx->writeValue((uint8_t *)q.data(), q.size(), rispTx);
      uint32_t t2 = millis(); bool letto = false;
      while (millis() - t2 < 1500 && !letto) {
        for (int k = 0; k < nGrezzo; k++) if (grezzoLen[k] >= 21 && grezzo[k][0] == 0x62) {
          uint8_t *g = grezzo[k]; letto = true;
          bool giusto = !memcmp(g + 1, uuid, 16) && g[17] == 0 && g[18] == f && ((g[19] << 8) | g[20]) == n;
          Out.printf("  riletto dal tag: Major %u, Minor %u, UUID %s -> %s\n", (g[17] << 8) | g[18], (g[19] << 8) | g[20], !memcmp(g + 1, uuid, 16) ? "nostro" : "DIVERSO", giusto ? "GIUSTO" : "SBAGLIATO");
          rilettoOk = giusto;
        }
        delay(20);
      }
      if (!letto) Out.println("  rilettura: nessuna risposta");
    }
  }
  if (c->isConnected()) c->disconnect();
  NimBLEDevice::deleteClient(c);
  if (!ok && ultimoPwdErr && silenzioPwd) { Out.println("Password " + pwd + " rifiutata"); return false; }
  if (!ok) { stato = "ERRORE"; esito(false, mac, f, n, err, false); schermo(); return false; }
  // controllo nell'aria: il tag deve trasmettere UUID, fazione e numero giusti
  stato = "Controllo in onda..."; schermo();
  bool visto = rilettoOk;
  for (int giro = 0; giro < 3 && !visto; giro++) {
    scansiona(3);
    for (int i = 0; i < nVisti; i++) if (visti[i].nostro && visti[i].ma == f && visti[i].mi == n) visto = true;
  }
  stato = visto ? "Fatto" : "Scritto, non visto";
  esito(true, mac, f, n, visto ? "" : "il tag potrebbe riavviarsi: ricontrolla con 'elenco'", visto);
  schermo();
  return true;
}

// prova la password impostata, poi quelle di fabbrica conosciute; quella che funziona resta salvata
bool programma(NimBLEAddress a, uint8_t f, uint16_t n) {
  String prove[] = { pwd, "dx1234", "DX1234", "555555", "000000" };
  String usata = pwd;
  for (int i = 0; i < 5; i++) {
    bool doppia = false; for (int k = 0; k < i; k++) if (prove[k] == prove[i]) doppia = true;
    if (doppia) continue;
    pwd = prove[i]; silenzioPwd = i < 4;
    bool ok = programma1(a, f, n);
    if (ok) { if (pwd != usata) { pref.putString("pwd", pwd); Out.println("Password giusta: " + pwd + " (salvata)"); } silenzioPwd = false; return true; }
    if (!ultimoPwdErr) { pwd = usata; silenzioPwd = false; return false; }
    delay(500);
  }
  pwd = usata; silenzioPwd = false; return false;
}

// il tag più vicino (sopra la soglia "in mano"), collegabile, non ancora fatto in questa sessione
bool piuVicino(NimBLEAddress &out, bool saltaFatti) {
  scansiona(2);
  int best = -999; String scelto = ""; uint8_t tipo = BLE_ADDR_PUBLIC;
  for (int i = 0; i < nVisti; i++) {
    Visto &v = visti[i];
    if (v.rssi < vicinoDb || v.rssi <= best || !v.coll) continue;
    bool gia = false; for (int k = 0; k < nFatti; k++) if (fatti[k] == String(v.mac)) gia = true;
    if (gia && saltaFatti) continue;
    best = v.rssi; scelto = v.mac; tipo = v.tipo;
  }
  if (!scelto.length()) return false;
  out = NimBLEAddress(std::string(scelto.c_str()), tipo);
  return true;
}

void elenco() {
  scansiona(10);   // i CP35 mandano il pacchetto iBeacon a turno con gli altri: 8 s bastano per sentirli tutti
  String js = "{\"vicini\":["; int nostri = 0;
  Out.println("Tag nei dintorni (i nostri hanno l'UUID giusto):");
  for (int i = 0; i < nVisti; i++) {
    Visto &v = visti[i];
    if (!v.ib && v.rssi < vicinoDb) continue;
    if (v.nostro) nostri++;
    String descr = v.nostro ? String(String(v.ma == 1 ? "BLU" : v.ma == 2 ? "ROSSO" : "?") + " #" + String(v.mi)) :
                   v.ib ? String("iBeacon di altri (major " + String(v.ma) + ", minor " + String(v.mi) + ")") : String(v.coll ? "collegabile, non iBeacon" : "non iBeacon");
    Out.printf("  %s  %4d dBm  %-10s %s\n", v.mac, v.rssi, v.nome, descr.c_str());
    char b[200]; snprintf(b, sizeof(b), "%s{\"mac\":\"%s\",\"nome\":\"%s\",\"rssi\":%d,\"nostro\":%s,\"f\":\"%s\",\"n\":%u,\"mv\":%u}", js.endsWith("[") ? "" : ",", v.mac, v.nome, v.rssi, v.nostro ? "true" : "false", v.nostro ? nomeFaz(v.ma) : "", v.nostro ? v.mi : 0, v.mv);
    js += b;
  }
  Out.println(js + "]}");
  ultimo = String(nostri) + " tag in onda"; schermo();
}

// SONDA: prova i diversi modi di parlare al tag e stampa tutto quello che risponde, senza cambiare niente
String hx(const uint8_t *d, int n) { String h; for (int k = 0; k < n; k++) { char b[4]; snprintf(b, sizeof(b), "%02X ", d[k]); h += b; } return h; }
void stampaGrezzo(const char *dopo) {
  if (!nGrezzo) { Out.printf("    (%s: nessuna notifica)\n", dopo); return; }
  for (int k = 0; k < nGrezzo; k++) Out.printf("    <- %s notifica da %04X: %s\n", dopo, grezzoDa[k], hx(grezzo[k], grezzoLen[k]).c_str());
  nGrezzo = 0;
}
void sonda() {
  NimBLEAddress a; if (!piuVicino(a, false)) { Out.println("SONDA: nessun tag vicino"); return; }
  Out.println("SONDA su " + hexMac(a));
  NimBLEClient *c = NimBLEDevice::createClient(); c->setConnectTimeout(6);
  if (!c->connect(a)) { Out.println("SONDA: non si collega"); NimBLEDevice::deleteClient(c); return; }
  NimBLERemoteService *s = c->getService(NimBLEUUID((uint16_t)0xFFE0));
  if (!s) { Out.println("SONDA: niente FFE0"); c->disconnect(); NimBLEDevice::deleteClient(c); return; }
  NimBLERemoteCharacteristic *ch[3] = { s->getCharacteristic(NimBLEUUID((uint16_t)0xFFE1)), s->getCharacteristic(NimBLEUUID((uint16_t)0xFFE2)), s->getCharacteristic(NimBLEUUID((uint16_t)0xFFE3)) };
  for (int i = 0; i < 3; i++) if (ch[i] && ch[i]->canRead()) { std::string v = ch[i]->readValue(); Out.printf("  lettura FFE%d: %s| \"%s\"\n", i + 1, hx((const uint8_t *)v.data(), v.size()).c_str(), v.c_str()); }
  nGrezzo = 0;
  for (int i = 0; i < 3; i++) if (ch[i] && (ch[i]->canNotify() || ch[i]->canIndicate())) Out.printf("  iscrizione FFE%d: %s\n", i + 1, ch[i]->subscribe(ch[i]->canNotify(), notifica, true) ? "ok" : "NO");
  delay(500); stampaGrezzo("dopo l'iscrizione");
  std::string q = pacchetto(0x25, nullptr, 0), r = pacchetto(0x34, nullptr, 0), f = pacchetto(0x10, nullptr, 0);
  struct { int ch; bool conf; const std::string *dati; const char *nome; } prove[] = {
    { 1, true, &q, "0x25 (password?) su FFE2 con conferma" }, { 0, false, &q, "0x25 su FFE1 veloce" }, { 0, true, &q, "0x25 su FFE1 con conferma" },
    { 1, true, &f, "0x10 (slot) su FFE2" }, { 0, false, &f, "0x10 su FFE1" }, { 1, true, &r, "0x34 (parametri) su FFE2" }, { 0, false, &r, "0x34 su FFE1" } };
  for (auto &p : prove) {
    if (!c->isConnected()) { Out.println("  il tag si e' scollegato"); break; }
    NimBLERemoteCharacteristic *x = ch[p.ch]; if (!x) continue;
    bool ok = x->writeValue((const uint8_t *)p.dati->data(), p.dati->size(), p.conf);
    Out.printf("  %s: %s\n", p.nome, ok ? "scritto" : "RIFIUTATO");
    delay(700); stampaGrezzo(p.nome);
  }
  // password sul canale FFE3 e di nuovo la domanda
  if (c->isConnected() && ch[2]) {
    bool ok = ch[2]->writeValue((const uint8_t *)pwd.c_str(), pwd.length(), true);
    Out.printf("  password '%s' su FFE3: %s\n", pwd.c_str(), ok ? "scritta" : "RIFIUTATA");
    delay(700); stampaGrezzo("dopo la password");
    if (c->isConnected() && ch[1]) { ch[1]->writeValue((const uint8_t *)f.data(), f.size(), true); delay(700); stampaGrezzo("0x10 dopo la password"); }
    if (c->isConnected()) for (int i = 0; i < 3; i++) if (ch[i] && ch[i]->canRead()) { std::string v = ch[i]->readValue(); Out.printf("  lettura FFE%d dopo: %s\n", i + 1, hx((const uint8_t *)v.data(), v.size()).c_str()); }
  }
  Out.println(c->isConnected() ? "SONDA finita (ancora collegato)" : "SONDA finita (il tag ha chiuso)");
  if (c->isConnected()) c->disconnect();
  NimBLEDevice::deleteClient(c);
}

void comando(String c) {
  c.trim(); String low = c; low.toLowerCase();
  int sp = low.indexOf(' '); String k = sp < 0 ? low : low.substring(0, sp), v = sp < 0 ? "" : c.substring(sp + 1); v.trim();
  String vl = v; vl.toLowerCase();
  auto faz = [](const String &s) -> uint8_t { return (s.startsWith("r") || s.startsWith("2")) ? 2 : 1; };
  if (k == "auto" && v.length()) {
    int s2 = vl.indexOf(' '); autoFaz = faz(vl); autoNum = s2 > 0 ? constrain(vl.substring(s2 + 1).toInt(), 1, 999) : 1; autoOn = true; nFatti = 0;
    stato = "Avvicina un tag"; Out.printf("Modo automatico: %s dal numero %u. Avvicina un tag alla volta all'iniettore.\n", nomeFaz(autoFaz), autoNum);
    Out.printf("{\"auto\":true,\"f\":\"%s\",\"n\":%u}\n", nomeFaz(autoFaz), autoNum); schermo(); return;
  }
  if (k == "stop") { autoOn = false; stato = "Pronto"; Out.println("{\"auto\":false}"); schermo(); return; }
  // per la pagina "Beacon prog": chi c'e' appoggiato all'iniettore (e quanti altri tag sono vicini)
  if (k == "vicino" && !v.length()) {
    // I tag gia' programmati (trasmettono il nostro UUID) non contano: si cerca il tag NUOVO piu' vicino.
    // Solo se non c'e' nessun tag nuovo si riporta quello gia' fatto piu' vicino (per dire "questo e' gia' B2").
    scansiona(3);
    auto candidato = [](Visto &v) { return v.rssi >= vicinoDb && (v.ib || !strncmp(v.nome, "CP35", 4) || v.coll); };
    int best = -1, altri = 0;
    for (int i = 0; i < nVisti; i++) if (candidato(visti[i]) && !visti[i].nostro && (best < 0 || visti[i].rssi > visti[best].rssi)) best = i;
    if (best >= 0) {
      for (int i = 0; i < nVisti; i++) if (i != best && candidato(visti[i]) && !visti[i].nostro && visti[i].rssi >= visti[best].rssi - 12) altri++;
    } else {
      for (int i = 0; i < nVisti; i++) if (candidato(visti[i]) && visti[i].nostro && (best < 0 || visti[i].rssi > visti[best].rssi)) best = i;
    }
    if (best < 0) { Out.println("{\"vicino\":{\"mac\":\"\"}}"); return; }
    Visto &w = visti[best];
    Out.printf("{\"vicino\":{\"mac\":\"%s\",\"nome\":\"%s\",\"rssi\":%d,\"nostro\":%s,\"f\":\"%s\",\"n\":%u,\"altri\":%d,\"cp35\":%s}}\n",
               w.mac, w.nome, w.rssi, w.nostro ? "true" : "false", w.nostro ? nomeFaz(w.ma) : "", w.nostro ? w.mi : 0, altri, !strncmp(w.nome, "CP35", 4) ? "true" : "false");
    return;
  }
  // programma proprio quel tag (indirizzo), non "il piu' vicino": niente scambi tra un controllo e la scrittura
  if (k == "progmac" && v.length()) {
    int s1 = v.indexOf(' '), s2 = s1 > 0 ? v.indexOf(' ', s1 + 1) : -1;
    if (s1 < 0 || s2 < 0) { Out.println("uso: progmac AA:BB:CC:DD:EE:FF blu 3"); return; }
    String mac = v.substring(0, s1); mac.toUpperCase();
    String fs = vl.substring(s1 + 1, s2); uint8_t f = faz(fs); uint16_t n = constrain(v.substring(s2 + 1).toInt(), 1, 999);
    potIdx = 7; intIdx = 5;   // sempre +2,5 dBm e 500 ms: uguali per tutti i tag
    scansiona(2);
    int i = 0; for (; i < nVisti; i++) if (mac == String(visti[i].mac)) break;
    if (i == nVisti) { esito(false, mac, f, n, "tag non trovato: tienilo appoggiato e riprova", false); return; }
    programma(NimBLEAddress(std::string(visti[i].mac), visti[i].tipo), f, n);
    return;
  }
  if (k == "prog" && v.length()) {
    int s2 = vl.indexOf(' '); uint8_t f = faz(vl); uint16_t n = s2 > 0 ? constrain(vl.substring(s2 + 1).toInt(), 1, 999) : 1;
    NimBLEAddress a; if (!piuVicino(a, false)) { esito(false, "", f, n, "nessun tag vicino: tienilo appoggiato all'iniettore", false); return; }
    programma(a, f, n); return;
  }
  if (k == "elenco") { elenco(); return; }
  // tutti i tag NUOVI (non ancora nostri) intorno all'iniettore, per programmarli in blocco
  // "nuovi -80 tutti": anche quelli già programmati (per riprogrammarli)
  if (k == "nuovi") {
    int soglia = v.length() ? constrain(v.toInt(), -100, -20) : -80;
    bool tutti = v.indexOf("tutti") >= 0;
    scansiona(10);
    String js = "{\"nuovi\":[";
    for (int i = 0; i < nVisti; i++) {
      Visto &w = visti[i];
      if (w.rssi < soglia) continue;
      if (w.nostro ? !tutti : strncmp(w.nome, "CP35", 4) != 0) continue;
      char b[160]; snprintf(b, sizeof(b), "%s{\"mac\":\"%s\",\"nome\":\"%s\",\"rssi\":%d,\"mv\":%u,\"nostro\":%s,\"f\":\"%s\",\"n\":%u}", js.endsWith("[") ? "" : ",", w.mac, w.nome, w.rssi, w.mv,
                           w.nostro ? "true" : "false", w.nostro ? nomeFaz(w.ma) : "", w.nostro ? w.mi : 0);
      js += b;
    }
    Out.println(js + "]}");
    return;
  }
  // batterie di tutti i tag (lettura dai pacchetti TLM, senza collegarsi): 8 secondi per sentirli tutti
  if (k == "batterie") {
    scansiona(12);
    String js = "{\"batterie\":[";
    for (int i = 0; i < nVisti; i++) {
      Visto &w = visti[i];
      if (!w.nostro && strncmp(w.nome, "CP35", 4)) continue;
      char b[240]; snprintf(b, sizeof(b), "%s{\"mac\":\"%s\",\"nostro\":%s,\"f\":\"%s\",\"n\":%u,\"mv\":%u,\"rssi\":%d,\"tlm\":\"%s\",\"altro\":\"%s\"}", js.endsWith("[") ? "" : ",", w.mac, w.nostro ? "true" : "false", w.nostro ? nomeFaz(w.ma) : "", w.nostro ? w.mi : 0, w.mv, w.rssi, w.tlm, w.altro);
      js += b;
    }
    Out.println(js + "]}");
    return;
  }
  // fa lampeggiare un tag (la sua luce rossa lampeggia finche' e' collegato): per riconoscerlo e scriverci il numero
  if (k == "lampeggia" && v.length()) {
    int s1 = v.indexOf(' '); String mac = s1 > 0 ? v.substring(0, s1) : v; mac.toUpperCase();
    int sec = s1 > 0 ? constrain(v.substring(s1 + 1).toInt(), 2, 60) : 15;
    scansiona(2);
    int i = 0; for (; i < nVisti; i++) if (mac == String(visti[i].mac)) break;
    if (i == nVisti) { Out.printf("{\"lampeggia\":\"%s\",\"ok\":false}\n", mac.c_str()); return; }
    NimBLEClient *c = NimBLEDevice::createClient(); c->setConnectTimeout(6);
    bool ok = c->connect(NimBLEAddress(std::string(visti[i].mac), visti[i].tipo));
    Out.printf("{\"lampeggia\":\"%s\",\"ok\":%s,\"sec\":%d}\n", mac.c_str(), ok ? "true" : "false", sec);
    stato = "Lampeggia " + mac.substring(12); schermo();
    uint32_t t0 = millis();
    while (ok && c->isConnected() && millis() - t0 < (uint32_t)sec * 1000) {
      delay(50);
      String bl; portENTER_CRITICAL(&muxBle); bl = daBle; portEXIT_CRITICAL(&muxBle);
      if (bl.indexOf("basta") >= 0) { portENTER_CRITICAL(&muxBle); daBle = ""; portEXIT_CRITICAL(&muxBle); break; }
      if (Serial.available()) break;
    }
    if (c->isConnected()) c->disconnect();
    NimBLEDevice::deleteClient(c);
    stato = "Pronto"; schermo();
    Out.printf("{\"lampeggia\":\"%s\",\"fine\":true}\n", mac.c_str());
    return;
  }
  if (k == "sonda") { sonda(); return; }
  if (k == "pwd" && v.length()) { pwd = v; pref.putString("pwd", pwd); Out.println("password " + pwd); return; }
  if (k == "pot" && v.length()) { potIdx = constrain(v.toInt(), 0, 7); pref.putInt("pot", potIdx); Out.println(String("potenza ") + POT_TESTO[potIdx] + " dBm"); schermo(); return; }
  if (k == "intervallo" && v.length()) { intIdx = constrain(v.toInt() >= 100 ? v.toInt() / 100 : v.toInt(), 1, 10); pref.putInt("int", intIdx); Out.println("intervallo " + String(intIdx * 100) + " ms"); schermo(); return; }
  if (k == "vicino" && v.length()) { vicinoDb = constrain(v.toInt(), -100, -20); pref.putInt("vic", vicinoDb); Out.println("tag 'in mano' sopra " + String(vicinoDb) + " dBm"); return; }
  if (k == "info") {
    Out.printf("{\"iniettore\":\"info\",\"pwd\":\"%s\",\"pot\":\"%s\",\"int\":%d,\"vicino\":%d,\"auto\":%s,\"f\":\"%s\",\"n\":%u}\n", pwd.c_str(), POT_TESTO[potIdx], intIdx * 100, vicinoDb, autoOn ? "true" : "false", nomeFaz(autoFaz), autoNum);
    return;
  }
  if (k == "riavvia") { delay(200); ESP.restart(); }
  Out.println("comandi: auto blu 1 | auto rossa 1 (programma in fila i tag che avvicini), stop, prog blu 3 (solo il tag piu' vicino), elenco, pot 0-7, intervallo 500, pwd dx1234, vicino -60, info");
}

void setup() {
  avvioComune("INIETTORE");
  pref.begin("ac", false);
  pwd = pref.getString("pwd", "dx1234"); potIdx = pref.getInt("pot", 4); intIdx = pref.getInt("int", 5); vicinoDb = pref.getInt("vic", -60);
  if (!leggiUuid(TAG_UUID, uuid)) Out.println("TAG_UUID scritto male in config.h");
  if (PMU) { if (PMU->getChipModel() == XPOWERS_AXP2101) PMU->disablePowerOutput(XPOWERS_ALDO2); else PMU->disablePowerOutput(XPOWERS_LDO2); }
  NimBLEDevice::init(("AC-INJ-" + idTesto(mioId)).c_str());
  NimBLEDevice::setPower(ESP_PWR_LVL_N0);
  NimBLEServer *srv = NimBLEDevice::createServer();
  srv->setCallbacks(new ServerCb());
  NimBLEService *sv = srv->createService(NUS_SERV);
  bleTx = sv->createCharacteristic(NUS_TX, NIMBLE_PROPERTY::NOTIFY);
  NimBLECharacteristic *rxc = sv->createCharacteristic(NUS_RX, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  rxc->setCallbacks(new RxCb());
  sv->start();
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERV); adv->setScanResponse(true); adv->start();
  NimBLEScan *sc = NimBLEDevice::getScan(); sc->setActiveScan(true); sc->setInterval(100); sc->setWindow(99);
  sc->setAdvertisedDeviceCallbacks(new Raccolta(), true);   // true: ogni pacchetto, anche dello stesso tag
  schermo();
  Out.println("Iniettore pronto. Scrivi 'auto blu 1' e avvicina i tag uno alla volta. 'aiuto' per i comandi.");
  Out.println("{\"iniettore\":\"pronto\"}");
}

void loop() {
  String riga; if (leggiRiga(riga)) comando(riga);
  String bl; portENTER_CRITICAL(&muxBle); bl = daBle; daBle = ""; portEXIT_CRITICAL(&muxBle);
  static String bufBle; bufBle += bl;
  int nl; while ((nl = bufBle.indexOf('\n')) >= 0) { String c = bufBle.substring(0, nl); bufBle = bufBle.substring(nl + 1); c.trim(); if (c.length()) comando(c); }
  if (pulsante() == 1) { autoOn = !autoOn; stato = autoOn ? "Avvicina un tag" : "Pronto"; schermo(); }
  if (autoOn) {
    NimBLEAddress a;
    if (piuVicino(a, true)) {
      String mac = hexMac(a);
      if (programma(a, autoFaz, autoNum)) {
        if (nFatti < 40) fatti[nFatti++] = mac;
        autoNum++;
        stato = "Avvicina il prossimo";
        Out.printf("{\"auto\":true,\"f\":\"%s\",\"n\":%u}\n", nomeFaz(autoFaz), autoNum);
        schermo();
      }
    }
  }
  delay(50);
}
#endif
