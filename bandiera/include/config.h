// Airsoft Conflict — impostazioni delle bandiere. Le stesse su tutte le bandiere, sull'HQ e sui tag finti.
// Soglia, tempo di conquista, luce e cicalino si cambiano anche senza ricaricare il programma:
// comandi da USB (Monitor seriale / pagina Banco) o via radio dall'HQ. Restano salvati sulla scheda.
#pragma once

// ---- LoRa (banda 433 MHz: 433,05–434,79 MHz, max 10 mW, max 10% del tempo in trasmissione)
// Frequenza diversa da quella di Meshtastic (433,875) per non disturbarsi a vicenda.
#define LORA_FREQ      434.100   // MHz
#define LORA_BW        125.0     // kHz
#define LORA_SF        9         // spreading factor: 9 = buon compromesso portata/tempo in aria
#define LORA_CR        5         // coding rate 4/5
#define LORA_SYNC      0x12      // parola di sincronia "privata" (Meshtastic usa 0x2B)
#define LORA_POTENZA   10        // dBm (10 mW)

// ---- Tag Bluetooth dei giocatori (iBeacon)
// Nell'app del tag imposta: UUID qui sotto, Major = fazione (1 blu, 2 rossa), Minor = numero del tag (1, 2, 3...)
#define TAG_UUID       "41435446-4c41-4721-8000-000000000001"
#define SOGLIA_RSSI    -80       // dBm: sotto questo valore il tag è "fuori dall'area". Si tara sul campo (comando: soglia -75)
#define TAG_VALIDO_MS  30000     // un tag conta per 30 s dall'ultima volta che è stato sentito

// ---- Conquista (fatta dalla bandiera da sola, così funziona anche senza app)
#define CONQUISTA_S    60        // secondi per conquistare con un giocatore (comando: tempo 60)

// ---- Ritmo
#define INVIO_MS       20000     // ogni quanto la bandiera manda il conteggio (20 s -> ~2% del tempo in aria)
#define MAX_TAG_PACCHETTO 20     // quanti tag elencare al massimo in un messaggio

// ---- Luce e cicalino della bandiera (versione essenziale)
#define PIN_LED        13        // dati della striscetta WS2812B
#define NUM_LED        8
#define LUCE           120       // luminosità 0-255 (comando: luce 200)
#define PIN_BUZZER     14        // segnale del cicalino attivo
#define BUZZER_BASSO   0         // 1 se il modulo cicalino suona col segnale basso (comando: buzzer inverti)
