# Pannello camera Hikvision

Un pannello web veloce e pulito per configurare le **camere IP Hikvision** tramite le API ISAPI. Sostituisce il web
UI integrato nella camera, che su alcuni modelli non riesce a salvare diverse impostazioni e richiede un plugin del browser.

- **Zero dipendenze.** Un piccolo server Node.js (solo moduli inclusi in Node) e Web Components in JavaScript puro.
  Nessun pacchetto da installare, nessuna build, nessun framework.
- **Più camere** in un solo pannello, aggiunte dal browser. Le credenziali restano sul server e non arrivano mai alla pagina.
- **Ogni salvataggio dice com'è andato.** Se la camera rifiuta un'impostazione, vedi il suo motivo e quale sezione non è passata.
- Interfaccia in **italiano e inglese**.

*🇬🇧 English version: [README.md](README.md)*

---

## Funzioni

| Pagina | Cosa puoi fare |
|---|---|
| **Live** | snapshot JPEG (fino a 5 al secondo), oppure **video MJPEG** vero quando lo stream secondario è in MJPEG, senza plugin |
| **Immagine** | luminosità, contrasto, saturazione, nitidezza, **luce ibrida** (IR / bianca / intelligente), giorno/notte, WDR, BLC, HLC, bilanciamento del bianco, riduzione del rumore |
| **Video** | codifica, risoluzione, fotogrammi, bitrate, qualità, GOP, H.264+/H.265+, audio, per stream principale e secondario |
| **OSD** | data e ora, nome del canale e fino a 4 testi, **trascinati al loro posto** sopra l'anteprima |
| **Data e ora** | NTP o manuale, fuso orario, ora legale europea |
| **Rete** | DHCP o IPv4 statico, DNS, MTU, con controlli e un avviso prima di cambiare indirizzo |
| **Movimento** | **aree disegnate come poligoni** sull'immagine, filtro persone/veicoli, sensibilità, pianificazione settimanale, azioni collegate e **registro eventi in tempo reale** |
| **Notifiche** | email (con tasto **invia email di prova**), FTP, server HTTP |
| **Utenti** | aggiunta, modifica ed eliminazione degli account della camera |
| **Dispositivo** | informazioni, **riavvio**, **backup e ripristino** cifrati della configurazione |
| **Camere** | aggiunta, prova, modifica e rimozione delle camere |

I moduli si costruiscono dalle **capabilities** che ogni camera dichiara, quindi propongono solo valori accettati.
Reset di fabbrica, aggiornamento firmware e attivazione **non** sono disponibili, di proposito.

**Provato su:** DS-2CD1043G2-LIU, firmware V5.8.42. Altre camere Hikvision con ISAPI dovrebbero funzionare in buona
parte, ma non sono state provate: le segnalazioni sono benvenute.

---

## Avvio rapido

### Requisiti

- **Node.js 21 o più recente** ([nodejs.org](https://nodejs.org)); controlla con `node --version`
- Una camera raggiungibile via HTTP dal tuo computer, con utente e password
- Facoltativo: [pnpm](https://pnpm.io) per lanciare gli script (va bene anche `node` da solo)

### Avvio

```bash
git clone https://github.com/teo666/hikvision-panel.git
cd hikvision-panel
pnpm start            # oppure: node server.js
```

Apri **http://127.0.0.1:8080**. La prima volta si apre la pagina **Camere**:

1. Clicca **Aggiungi camera**.
2. Inserisci un nome, l'indirizzo della camera (es. `192.168.1.64`), utente e password.
3. Clicca **Aggiungi**: il pannello prova prima la connessione e mostra il modello della camera.

Fatto: scegli una pagina dal menu in alto. Con più camere, passi dall'una all'altra con il selettore in alto a sinistra.

> **Consiglio:** crea sulla camera un account *Operatore* dedicato al pannello (pagina **Utenti**) invece di usare `admin`.

### Impostazioni (facoltative)

Copia `.env.example` in `.env` nella cartella del progetto e modificalo, oppure usa variabili d'ambiente:

| Variabile | Default | Significato |
|---|---|---|
| `HOST` | `127.0.0.1` | indirizzo su cui ascolta il pannello; `127.0.0.1` = solo da questo computer |
| `PORT` | `8080` | porta del pannello |
| `CAMERAS_FILE` | `data/cameras.json` | dove vengono salvate le camere e le loro credenziali |

Le credenziali delle camere sono salvate in `data/cameras.json`, leggibile solo dal tuo utente ed escluso da git.

### Usarlo da altri dispositivi della rete

```bash
HOST=0.0.0.0 pnpm start
```

⚠️ **Il pannello non ha un login proprio**: chiunque lo raggiunga comanda le tue camere. Fallo solo su una rete
fidata, oppure mettilo dietro un reverse proxy con autenticazione. Vedi [Sicurezza](doc/it/sicurezza.md).

### Tenerlo sempre acceso

Il pannello è un normale processo Node, quindi va bene qualsiasi gestore di processi. Per esempio, su Linux con systemd:

```ini
# /etc/systemd/system/hikvision-panel.service
[Unit]
Description=Hikvision Camera Panel
After=network-online.target

[Service]
WorkingDirectory=/opt/hikvision-panel
ExecStart=/usr/bin/node server.js
Environment=HOST=0.0.0.0
Restart=on-failure
User=panel

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now hikvision-panel
```

### Aggiornare

```bash
git pull
pnpm start            # riavvia il server
```

---

## Sviluppo

Non hai una camera a portata di mano? Il repository include una **camera finta** che si comporta come quella vera
(Digest auth, XML presi da una camera reale, flusso eventi, utenti, backup…):

```bash
pnpm fake-camera                                        # camera finta su :8081, utente "test", password "test-pass"
CAMERAS_FILE=/tmp/cams-dev.json PORT=8090 pnpm start    # pannello con un elenco di camere separato
```

Poi aggiungi la camera `127.0.0.1:8081` dal pannello su http://127.0.0.1:8090.

```bash
pnpm test             # node:test, nessuna dipendenza
```

### Come funziona

```
browser (Web Components)  ──JSON / XML──▶  server.js (Node)  ──Digest auth──▶  camere (ISAPI)
```

Il server serve le pagine, conserva le camere e inoltra le chiamate ISAPI, aggiungendo l'autenticazione e
ammettendo solo un elenco di operazioni. Il browser legge l'XML della camera, cambia solo i campi toccati e rimanda
il documento intero: le impostazioni che il pannello non conosce restano intatte.

| Percorso | Cosa fa |
|---|---|
| `server.js` | server HTTP: file statici, API delle camere, backup/ripristino, proxy ISAPI |
| `lib/` | Digest auth, client della camera, elenco camere, regole del proxy, cifratura dei parametri |
| `public/js/components/` | una pagina = un Web Component |
| `public/js/config-page.js` | classe base che costruisce i moduli dalle capabilities della camera |
| `public/js/locales/` | testi in italiano e inglese |
| `tools/fake-camera.js` | camera finta per sviluppo e test |
| `test/` | test, con XML presi da una camera reale |

---

## Documentazione

| | Italiano | English |
|---|---|---|
| Panoramica | [doc/it](doc/it/README.md) | [doc/en](doc/en/README.md) |
| Installazione | [installazione](doc/it/installazione.md) | [installation](doc/en/installation.md) |
| Guida alle pagine | [guida](doc/it/guida.md) | [user guide](doc/en/user-guide.md) |
| Risoluzione dei problemi (email, movimento, backup…) | [problemi](doc/it/problemi.md) | [troubleshooting](doc/en/troubleshooting.md) |
| Sicurezza | [sicurezza](doc/it/sicurezza.md) | [security](doc/en/security.md) |
| Architettura | [architettura](doc/it/architettura.md) | [architecture](doc/en/architecture.md) |
| Sviluppo | [sviluppo](doc/it/sviluppo.md) | [development](doc/en/development.md) |
| Note ISAPI: cosa abbiamo scoperto sulla camera | [note ISAPI](doc/it/note-isapi.md) | [ISAPI notes](doc/en/isapi-notes.md) |

---

## Avvertenze

Progetto indipendente, non affiliato né approvato da Hikvision. "Hikvision" è un marchio del rispettivo
proprietario. Cambiare le impostazioni può rendere una camera irraggiungibile (per esempio con un indirizzo di rete
sbagliato): tieni un backup della configurazione e usa il pannello a tuo rischio.

## Licenza

[MIT](LICENSE) © 2026 Teo Basili
