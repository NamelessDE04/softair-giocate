# Bandiere elettroniche · prima prova al banco

> **Novità (v0.2):** tre programmi (bandiera, HQ, tag finto) che si caricano dal browser su
> https://softair-giocate.web.app/firmware/ (Chrome o Edge su computer, cavo USB): niente da installare.
> Sono compilati da GitHub a ogni modifica. Per il debug: nell'app, carta **Banco bandiere** (organizzatori),
> che si collega all'HQ via Bluetooth (Android) o USB (computer), mostra conteggi, tag e segnali e manda comandi.
> La bandiera fa da sola la conquista: luce WS2812B sul pin 13, cicalino sul pin 14 (comandi in /firmware/).

Obiettivo di questa prova: **con i T-Beam che avete già e 4-5 tag Bluetooth**, verificare che
1. una bandiera riconosca i tag vicini e li conti per fazione;
2. il conteggio arrivi via LoRa a un T-Beam "HQ";
3. si capisca a che soglia di segnale tracciare il confine di un'area.

Mortaio, rifornimenti, barra LED e collegamento con l'app vengono dopo.

## Cosa serve
- 2 o più T-Beam a 433 MHz: uno fa da **HQ**, gli altri da **bandiera**
- 4-5 tag iBeacon (es. Feasycom FSC-BP103C) con la loro app di configurazione
- Un computer con **VS Code** e l'estensione **PlatformIO**
- Cavo USB per i T-Beam

## 1. Configurare i tag (dall'app del produttore, sul telefono)
| Campo | Valore |
|---|---|
| UUID | `41435446-4c41-4721-8000-000000000001` |
| Major | `1` = blu, `2` = rossa |
| Minor | numero del tag: 1, 2, 3, 4, 5 |
| Intervallo | 500 ms (o 1000 ms) |
| Potenza | media (0 dBm) |

Scrivete il numero (Minor) anche sul tag con un pennarello.

## 2. Caricare il programma sui T-Beam
1. Apri la cartella `bandiera` in VS Code (PlatformIO la riconosce da sola).
2. In basso scegli l'ambiente **env:bandiera** e premi **Upload** (→) con il T-Beam collegato.
3. Ripeti per ogni bandiera. Per il T-Beam dell'HQ scegli **env:hq**.
4. Apri il **Monitor seriale** (icona della spina, 115200): vedi cosa succede.

Ogni T-Beam ha un codice di 4 caratteri (es. `A1B2`), ricavato dalla scheda: lo vedi all'avvio.
Scrivetelo sulla scatola.

Per tornare a Meshtastic su un T-Beam basta rimettere il firmware dal sito flasher.meshtastic.org.

## 3. Prova al banco
1. Accendi la bandiera e l'HQ a qualche metro di distanza.
2. Ogni 20 s la bandiera scrive, ad esempio:
   ```
   [A1B2] invio #4: blu 2, rossi 1, tag sentiti 3, GPS ok, batteria 87% -> inviato
      tag 1 (blu) segnale -62 dBm DENTRO
      tag 3 (blu) segnale -71 dBm DENTRO
      tag 4 (rossa) segnale -88 dBm fuori
   ```
   Il pulsante del T-Beam fa partire un invio subito.
3. L'HQ riceve e scrive una riga per ogni messaggio:
   ```
   {"bandiera":"A1B2","seq":4,"blu":2,"rossi":1,"batt":87,...,"rssiLora":-54,"tag":[...]}
   ```

## 4. Prova sul campo: la soglia
1. Pianta la bandiera nel centro di un'area.
2. Un giocatore con il tag addosso (nel tattico, non in mano) si allontana piano.
3. Guardate a che distanza il segnale scende: quella è la soglia per il confine dell'area.
4. Cambia `SOGLIA_RSSI` in `include/config.h` (es. -80, -85) e ricarica.

Provate anche: tag dietro la schiena, nel tascone, due giocatori vicini.
E la portata LoRa: allontanate l'HQ finché smette di ricevere (`rssiLora` vicino a -120).

## Impostazioni (include/config.h)
- `LORA_FREQ` 434,100 MHz: lontana da Meshtastic (433,875), dentro la banda libera 433,05–434,79
- `LORA_POTENZA` 10 dBm = 10 mW, il massimo consentito in questa banda
- `INVIO_MS` 20 s: con SF9 la bandiera trasmette circa il 2% del tempo (limite di legge 10%)
- `SOGLIA_RSSI` -80 dBm: da tarare
- `TAG_VALIDO_MS` 30 s: per quanto un tag conta dopo l'ultima volta che è stato sentito

Funziona con T-Beam v1.1 e v1.2, con o senza display.

## Prossimi passi (dopo che questo funziona)
1. L'HQ manda i conteggi nell'app (Wi-Fi o telefono) e la mappa del conflict usa le bandiere.
2. Barra LED sulla bandiera.
3. Il resto (mortaio, rifornimenti, controlli anti-furbo).
