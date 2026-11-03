// Airsoft Conflict — impostazioni delle bandiere. Le stesse su tutte le bandiere e sull'HQ.
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
#define SOGLIA_RSSI    -80       // dBm: sotto questo valore il tag è "fuori dall'area". Si tara sul campo.
#define TAG_VALIDO_MS  30000     // un tag conta per 30 s dall'ultima volta che è stato sentito

// ---- Ritmo
#define INVIO_MS       20000     // ogni quanto la bandiera manda il conteggio (20 s -> ~2% del tempo in aria)
#define MAX_TAG_PACCHETTO 20     // quanti tag elencare al massimo in un messaggio
