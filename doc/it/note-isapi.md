# Note su ISAPI

Cose scoperte sulla camera (DS-2CD1043G2-LIU, firmware V5.8.42) durante lo sviluppo. Molte non sono
documentate, o lo sono poco. Dove serviva, il comportamento è stato ricavato dal codice del web UI originale.

## Autenticazione

- La camera usa la **Digest auth** (`qop="auth"`, MD5) su HTTP. Il nonce resta valido per più richieste:
  il pannello lo riusa incrementando `nc`, e ritenta una volta quando la camera ne manda uno nuovo.
- Il web UI originale non usa la Digest: fa il login e poi manda un'intestazione `SessionTag` a ogni richiesta.
- Dopo alcuni tentativi con la password sbagliata la camera **blocca l'account** per un po'.

## Risposte e salvataggi

- Le scritture rispondono con un `ResponseStatus`: `statusCode` 1 = ok, 7 = ok ma serve un riavvio,
  altri valori = errore con `statusString` e `subStatusCode` (es. `badXmlContent`).
- Rimandare il documento intero letto con GET, modificato solo nei campi toccati, funziona su tutte le
  sezioni provate: OSD, immagine, stream, NTP, luce ibrida, movimento, pianificazioni, azioni, email.
- `Content-Type: application/xml` va bene.
- I documenti hanno a volte un `xmlns` ripetuto su elementi interni: si mantiene così com'è.

## Capabilities

- Quasi ogni risorsa ha una `/capabilities` con `opt="a,b,c"`, `min` e `max`. Il pannello costruisce i moduli da lì.
- **Risoluzioni**: larghezze e altezze arrivano come due liste parallele (`videoResolutionWidth opt="640,640,1280"`,
  `videoResolutionHeight opt="360,480,720"`) da accoppiare per posizione.
- **Fotogrammi**: `maxFrameRate` è in centesimi (`2000` = 20 fps); sotto 1 fps i valori sono 50, 25, 12, 6
  (1/2, 1/4, 1/8, 1/16).
- Alcune `/capabilities` rispondono 500 (`Event/triggers/VMD-1/capabilities`). Le azioni supportate da ogni
  evento sono invece in **`/ISAPI/Event/triggersCap`**.

## OSD

- Le coordinate sono su uno schermo di riferimento di **704 × 576**, con l'origine **in basso a sinistra**:
  `positionY` cresce verso l'alto e indica il bordo superiore del testo. Verificato spostando la data e
  confrontando con lo snapshot.
- Le posizioni vanno a passi di `minOSDMoveValue` (16).
- Testi liberi in `…/overlays/text` (`TextOverlayList`), salvati separatamente dal resto.

## Movimento

- Con `regionType opt="grid,region"` questo modello usa le **aree a poligoni** (`RegionList`), non la griglia
  `gridMap`, che resta a zero. Lo fa anche il web UI originale.
- Coordinate delle aree su **0–1000** con l'origine **in basso a sinistra**. Fino a 4 aree, con 4–10 punti
  (`regionEdgesNum`).
- `targetType`: `human`, `vehicle` (rilevamento con riconoscimento di persone e veicoli).
- Pianificazione in `…/Event/schedules/motionDetections/VMD_video1`: un `TimeBlock` per ogni fascia di ogni
  giorno (1 = lunedì … 7 = domenica), con `24:00` come fine giornata.
- **Azioni** in `…/Event/triggers/VMD-1`. Su questo modello il movimento supporta solo `center`, `email` e
  `FTP` (`triggersCap`). Chiedere `HTTP` fa rifiutare **l'intero documento** con `badXmlContent`.
  Come `id` di ogni azione la camera usa il nome del metodo (`center`).
- Gli eventi arrivano in `alertStream` solo se è attiva l'azione `center`.

## Flusso eventi

- `GET /ISAPI/Event/notification/alertStream`: `multipart/mixed`, una parte `EventNotificationAlert` per
  evento, e ogni pochi secondi un "battito" `videoloss` / `inactive` da ignorare.

## Email

- La camera salva il server SMTP in `<hostName>` oppure, **se è un indirizzo IP, in `<ipAddress>`**, con
  `addressingFormatType` che dice quale dei due. Lo stesso vale per FTP e server HTTP.
- Le password non vengono restituite: per lasciarle invariate basta non mandare `<password>`.
- **Prova**: `POST /ISAPI/System/Network/mailing/test` con un `<mailingTestDescription>` (mittente, server,
  porta, TLS, autenticazione, destinatari). La risposta è 200 con l'esito in `<errorDescription>`:
  `ok`, `connect server fail`, `password error`, `no dns`, `no gateway`, …

## Video MJPEG

- Lo stream secondario supporta `MJPEG`; con quella codifica `…/Streaming/channels/102/httpPreview` dà un
  `multipart/x-mixed-replace` che un `<img>` mostra direttamente. Con H.264 la stessa richiesta risponde 403.

## Backup della configurazione

- `GET /ISAPI/System/configurationData` senza altro risponde 400 `cfgFileSecretKeyError`
  ("secretkey is necessary"): la camera esporta solo con una **password del backup**, da **1 a 16 caratteri**
  (con più di 16 dà lo stesso errore).
- La password va mandata cifrata: `?secretkey=<hex>&security=1&iv=<hex>`.
  - `GET /ISAPI/Security/capabilities?username=<utente>` dà `keyIterateNum` (100), `isIrreversible` (true) e `salt`;
  - chiave = SHA-256 di `sha256(utente + salt + password) + "AaBbCcDd1234!@#$"`, ripetuto `keyIterateNum`
    volte, primi 32 caratteri esadecimali → AES-128;
  - `secretkey` = AES-128-CBC (PKCS7) del base64 della password del backup, in esadecimale; `iv` = 16 byte casuali.
- Lo stesso schema (`security=1&iv=`) il web UI lo usa per altri parametri sensibili.
- Il **ripristino** usa la stessa `secretkey` con un `PUT` del file. Con la camera finta funziona; sulla
  camera vera **non è ancora stato provato**.

## Utenti

- `POST /ISAPI/Security/users`, `PUT` e `DELETE` su `/ISAPI/Security/users/<id>` richiedono
  `<loginPassword>`, cioè la password dell'amministratore che fa la modifica.
- Regole delle password: 8–16 caratteri, almeno due tipi di caratteri, senza il nome utente.
- Creazione ed eliminazione sono provate solo con la camera finta.

## Il web UI originale

- Molte pagine falliscono perché il frontend chiede funzioni che il modello non ha (risposte 403/404) e
  dipende da un plugin. Per esempio, nella pagina OSD il salvataggio non mandava nessuna richiesta.
- I suoi script sono serviti compressi (gzip): per leggerli serve `curl --compressed`.
