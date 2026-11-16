# Architettura

```
┌──────────────── browser ────────────────┐        ┌──────────── server.js (Node) ────────────┐        ┌─ camere ─┐
│ Web Components (public/js/components/)  │  JSON  │ /api/cameras        elenco camere, prove  │        │          │
│ ConfigPage: moduli dalle capabilities   │◀──────▶│ /api/cameras/:id/backup|restore           │ Digest │  ISAPI   │
│ isapi.js: GET/PUT di XML (DOMParser)    │  XML   │ /isapi/:id/ISAPI/…  proxy con regole     │◀──────▶│  (HTTP)  │
│ i18n.js: italiano / inglese             │        │ file statici di public/                   │        │          │
└─────────────────────────────────────────┘        └───────────────────────────────────────────┘        └──────────┘
                                                              │
                                                     data/cameras.json (600)
```

## Principi

- **Zero dipendenze**: il server usa solo moduli di Node (`http`, `crypto`, `fs`, `fetch`); il browser solo
  standard web (Custom Elements, ES modules, `DOMParser`). Niente build: i file in `public/` sono quelli serviti.
- **L'XML della camera è la fonte di verità**. Il pannello non ha un suo modello dei dati: legge il documento
  ISAPI, cambia solo i campi toccati e lo rimanda intero (*read-modify-write*). I campi che il pannello non
  conosce restano intatti, e l'ordine degli elementi è quello che la camera si aspetta.
- **Le credenziali non arrivano mai al browser**: solo il server parla con le camere.
- **Ogni errore viene mostrato**, con il motivo dato dalla camera.

## Server

| File | Ruolo |
|---|---|
| `server.js` | server HTTP: file statici, `/api/cameras`, backup/ripristino, proxy `/isapi/` |
| `lib/digest.js` | Digest auth lato client (RFC 7616, MD5 e SHA-256, `qop=auth`) |
| `lib/camera.js` | client di una camera: tiene in cache la challenge Digest, ritenta una volta con un nonce nuovo; dopo credenziali rifiutate si ferma per 60 s |
| `lib/cameras.js` | elenco delle camere su `data/cameras.json` (scrittura atomica, permessi 600), validazione, `probe()` per provare la connessione |
| `lib/policy.js` | quali chiamate ISAPI il proxy può inoltrare (lettura, scrittura, mai) |
| `lib/hik-security.js` | cifratura dei parametri "security=1" usata per la password del backup |

### Proxy `/isapi/<id>/ISAPI/…`

1. Controlla `Host` (solo `localhost` se il server ascolta in locale, contro il DNS rebinding) e, per le
   scritture, `Origin` (solo le pagine del pannello).
2. Trova la camera `<id>` e controlla percorso e metodo con `lib/policy.js`.
3. Legge il corpo (massimo 1 MB), inoltra con Digest auth e passa la risposta così com'è, in streaming.
4. Timeout di 15 s, tranne per i flussi senza fine (`alertStream`, `httpPreview`).
5. Un 401 della camera diventa 502, così il browser non mostra la sua finestra di login.

### Regole (`lib/policy.js`)

- **Lettura**: `System`, `Image`, `Streaming`, `Event`, `Smart`, `ContentMgmt`, `Security/users`, `Security/capabilities`.
- **Scrittura**: video e OSD, ora, rete, audio, immagine, stream, eventi, `System/reboot`, `Security/users`.
- **Mai**: reset di fabbrica, firmware, attivazione, e `configurationData` in scrittura (il ripristino passa
  dall'endpoint dedicato).

### API delle camere

| Metodo e percorso | Cosa fa |
|---|---|
| `GET /api/cameras` | elenco, senza password |
| `POST /api/cameras` | aggiunge (prova prima la connessione; `force: true` per salvare una camera spenta) |
| `POST /api/cameras/test` | prova dati nuovi o una camera salvata (`id`) |
| `PUT /api/cameras/:id` | modifica; password vuota = invariata |
| `DELETE /api/cameras/:id` | rimuove |
| `POST /api/cameras/:id/backup` | `{ password }` → file di backup |
| `POST /api/cameras/:id/restore` | corpo = file, intestazione `X-Backup-Password` |

Gli errori sono JSON `{ error, code, params? }`: `error` è in italiano, `code` è stabile e il browser lo traduce.

## Frontend

| File | Ruolo |
|---|---|
| `public/js/app.js` | barra in alto (camera, menu, lingua) e router basato sull'hash (`#/osd`) |
| `public/js/isapi.js` | `get()`, `put()`, `update()` sugli XML della camera scelta; helper `val`, `setVal`, `el`, `addChild`, `capOf` |
| `public/js/config-page.js` | `ConfigPage`, base delle pagine di impostazioni |
| `public/js/cameras.js` | elenco camere e camera selezionata |
| `public/js/i18n.js`, `locales/` | traduzioni |
| `public/js/components/` | una pagina = un Custom Element (`<cam-osd>`, `<cam-motion>`, …) |
| `regions.js`, `schedule.js`, `alerts.js`, `password.js`, `net.js`, `timezone.js`, `osd-format.js` | logica pura, testata in Node |

### `ConfigPage`

Una pagina di impostazioni dichiara:

```js
class CamImage extends ConfigPage {
  static get title() { return t('nav.image'); }
  resources() { return [{ key: 'img', path: '/ISAPI/Image/channels/1', cap: '/ISAPI/Image/channels/1/capabilities' }]; }
  sections() {
    return [{ title: t('image.adjustments'), key: 'img', fields: [
      { sel: 'Color > brightnessLevel', label: t('image.brightness'), type: 'range' },
    ] }];
  }
}
```

- `sel` è un selettore CSS sull'XML (i nomi degli elementi funzionano in qualunque namespace).
- I tipi sono `bool`, `select`, `range`, `number`, `text`, `ipv4` e `custom` (con `render` e `bind`, per
  editor come le aree del movimento). Opzioni e limiti arrivano da `opt`, `min` e `max` delle capabilities.
- `when(doc)` mostra un campo solo quando serve; `validate` aggiunge controlli; `confirmSave` chiede conferma.
- Il salvataggio rimanda solo i documenti modificati, uno dopo l'altro. Se uno viene rifiutato, il messaggio
  dice quale sezione e quali erano già salvate.

### Un salvataggio, passo per passo

1. La pagina carica `GET /isapi/<id>/ISAPI/Image/channels/1` e le capabilities, e costruisce il modulo.
2. Spostando un cursore il pannello scrive il nuovo valore direttamente nel documento XML in memoria
   (`setVal`) e segna la risorsa come modificata.
3. *Salva*: controlli lato browser, poi `PUT` dell'intero documento serializzato. Gli elementi vuoti sono
   scritti come `<a></a>`, come fa la camera.
4. La camera risponde `ResponseStatus`: `statusCode` 1 = ok, 7 = ok ma serve un riavvio, altro = errore con
   `statusString` e `subStatusCode`, che vengono mostrati.
5. La pagina ricarica i valori dalla camera, così mostra ciò che la camera ha davvero salvato.

## Flussi continui

- **Eventi** (`<cam-event-log>`): `GET …/Event/notification/alertStream` è una risposta multipart che non
  finisce mai. Il browser la legge con `fetch` a pezzi, e `alerts.js` estrae gli `<EventNotificationAlert>`
  completi e scarta i "battiti" (`videoloss inactive`). Se cade, si riconnette dopo 5 s.
- **Video MJPEG**: `…/Streaming/channels/102/httpPreview` dentro un `<img>`; il browser gestisce da solo il
  `multipart/x-mixed-replace`.
