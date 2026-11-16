# Guida alle pagine

Regole comuni a tutte le pagine di impostazioni:

- i moduli mostrano **solo i valori che la camera accetta** (li legge dalle sue *capabilities*) e solo i campi
  pertinenti: per esempio l'intensità manuale compare solo in modalità manuale;
- la barra in basso dice sempre lo stato: *Modifiche non salvate*, *Salvato*, oppure *Non salvato* con il
  motivo. Se la pagina salva più parti, il messaggio dice quale parte la camera ha rifiutato e quali erano già salvate;
- *Annulla modifiche* ricarica i valori dalla camera;
- uscendo da una pagina con modifiche non salvate, il pannello chiede conferma.

## Live

- **Stream principale** (alta qualità) o **secondario** (più leggero), visti come **snapshot JPEG**,
  al massimo 5 al secondo (oppure 1 al secondo, o ogni 5 secondi).
- **Video MJPEG**: se lo stream secondario è impostato su MJPEG (pagina *Video*), compare l'opzione
  *Video MJPEG* e il browser mostra un video vero, senza plugin. Altrimenti un avviso spiega come attivarlo.
- Quando la scheda del browser non è visibile, il live si ferma per non caricare la camera.

## Immagine

- Luminosità, contrasto, saturazione, nitidezza.
- **Luce ibrida**: modalità *Intelligente* (infrarossi, luce bianca quando la camera vede persone), *Solo luce
  bianca*, *Solo infrarossi*, *Spenta*; durata e intensità della luce bianca.
- Giorno/notte (automatica, sempre giorno, sempre notte) con sensibilità e ritardo.
- Otturatore massimo, antisfarfallio 50/60 Hz, WDR, BLC, HLC, bilanciamento del bianco, riduzione del rumore.
- Un'anteprima si aggiorna dopo ogni salvataggio.

## Video

Per lo stream principale e quello secondario: codifica (H.264, H.265, MJPEG solo sul secondario), risoluzione,
fotogrammi al secondo, bitrate costante o variabile, qualità, intervallo dei fotogrammi chiave, profilo H.264,
codifica intelligente (H.264+/H.265+), audio.

Prima di salvare il pannello chiede conferma: la camera riavvia lo stream modificato e registrazioni e app
collegate si interrompono per qualche secondo.

## OSD

Le scritte sovrapposte al video: data e ora, nome del canale, fino a 4 testi liberi.

- **Trascina le scritte** sull'anteprima per spostarle, oppure selezionale e usa le frecce (Maiusc: passi più grandi).
- Le posizioni sono arrotondate al passo minimo della camera (16 su questo modello).
- Formato della data e dell'ora, giorno della settimana, dimensione e colore del carattere, allineamento.

## Data e ora

- **Sincronizzazione**: NTP (consigliata) o manuale. In manuale, *Usa l'ora di questo computer* imposta l'ora
  al momento del salvataggio.
- **Fuso orario** e **ora legale europea** (ultima domenica di marzo → ultima di ottobre). Senza ora legale,
  d'estate la camera segna un'ora indietro.
- Server NTP, porta e intervallo di sincronizzazione.

## Rete

DHCP o indirizzo statico (IP, maschera, gateway), DNS, MTU. Il pannello controlla indirizzi e maschera e
avvisa se il gateway non è nella stessa sottorete. Se cambi indirizzo o passi al DHCP chiede conferma: dopo
dovrai aggiornare l'indirizzo della camera nella pagina *Camere*. IPv6 non viene toccato.

## Movimento

- **Rilevamento**: attivo/spento, sensibilità, *Cosa rilevare* (persone, veicoli: almeno uno),
  *Evidenzia il movimento nel video* (riquadri sulle zone in movimento).
- **Aree di rilevamento**: fino a 4 poligoni da 4 a 10 punti, disegnati sopra l'immagine.
  - trascina i **punti gialli** per cambiare forma, trascina l'area selezionata per spostarla;
  - doppio clic su un punto, oppure Canc dalla tastiera, per toglierlo; *Aggiungi punto* lo aggiunge sul lato più lungo;
  - le forme con lati incrociati o troppo piccole vengono segnalate prima del salvataggio.
- **Pianificazione**: fasce orarie per ogni giorno della settimana (fino a 8), *Sempre attivo*,
  *Copia il lunedì su tutti i giorni*. Un giorno senza fasce è spento.
- **Quando rileva movimento**: le azioni che la camera supporta per questo evento (su questo modello:
  *Avvisa le app e il registro eventi*, *Manda un'email*, *Carica le foto su FTP*).
- **Eventi in tempo reale**: in fondo alla pagina, gli eventi che la camera rileva adesso. Serve
  *Avvisa le app e il registro eventi* attivo. È il modo più semplice per provare le impostazioni.

## Notifiche

Dove la camera manda gli avvisi. Quali eventi li usano si sceglie nella pagina *Movimento*.

- **Email**: mittente, server SMTP (nome o IP), porta, cifratura (SSL/TLS, STARTTLS), autenticazione, fino a
  3 destinatari, foto allegata.
  - **Invia email di prova** usa i valori del modulo anche se non sono ancora salvati e mostra il motivo
    di un eventuale errore (server irraggiungibile, password sbagliata, DNS…).
- **FTP**: server, porta, accesso anonimo o utente/password, cartella, caricamento delle foto.
- **Server HTTP**: la camera manda gli eventi in XML a un indirizzo (per esempio un sistema domotico).
  Su questo modello il movimento non può usarlo come azione.

Le password non vengono mai rilette dalla camera: un campo password vuoto significa "lascia quella salvata".
Per le impostazioni di Brevo e per Mailpit vedi [Risoluzione dei problemi](problemi.md#email).

## Utenti

- Elenco degli account, con indicato quello usato dal pannello.
- **Aggiungi** un utente *Operatore* (vede e configura, non gestisce gli utenti) o *Utente* (solo visione).
- **Modifica** la password o il livello, **elimina** un utente (l'amministratore non si può eliminare).
- La camera chiede la **password attuale dell'amministratore** per confermare ogni modifica; il pannello non la salva.
- Regole delle password Hikvision: 8–16 caratteri, almeno due tipi tra minuscole, maiuscole, numeri e simboli,
  senza il nome utente.
- Se cambi la password dell'utente usato dal pannello, il pannello aggiorna anche la sua copia.

## Dispositivo

- Modello, numero di serie, MAC, firmware, ora della camera.
- **Riavvia la camera**: dopo la conferma il pannello aspetta che torni online e lo segnala.
- **Scarica il backup**: un file con tutte le impostazioni. La camera lo esporta solo con una **password del
  backup** (da 1 a 16 caratteri) che scegli tu: cifra il file e servirà per il ripristino, quindi conservala
  insieme al file.
- **Ripristino**: scegli un backup fatto da questa camera o da una dello stesso modello e inserisci la sua
  password. Sostituisce tutte le impostazioni e riavvia la camera; il pannello aspetta che torni online.
  Scarica sempre un backup prima di provarlo.

## Camere

Aggiungi, modifica (lasciando vuota la password resta quella attuale), prova e rimuovi le camere. Ogni camera
mostra se risponde e il modello. Vedi [Installazione e avvio](installazione.md#aggiungere-una-camera).

## Lingua

Menu in alto a destra: italiano o inglese. La scelta resta nel browser; la prima volta vale la lingua del
browser. Cambiando lingua con modifiche non salvate, il pannello chiede conferma.
