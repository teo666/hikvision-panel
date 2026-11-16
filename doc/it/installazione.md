# Installazione e avvio

## Requisiti

- **Node.js 21 o più recente** (sviluppato con Node 24). Il server usa solo moduli inclusi in Node.
- **pnpm**, solo per lanciare gli script. Non ci sono pacchetti da scaricare: `pnpm install` crea solo il lockfile.
- Un browser recente (Chrome, Firefox, Safari, Edge).
- Il computer che fa girare il pannello deve raggiungere le camere in rete (HTTP, porta 80 di default).

## Avvio

```bash
cd hikvision-panel
pnpm start
```

Il pannello è su **http://127.0.0.1:8080**. Al primo avvio, senza camere, si apre la pagina *Camere*.

## Aggiungere una camera

1. Pagina **Camere** → *Aggiungi camera*.
2. Compila **Nome** (a piacere), **Indirizzo** (`192.168.1.229` o `http://192.168.1.229:8080`), **Utente** e **Password**.
3. *Prova connessione* per controllare senza salvare, oppure direttamente *Aggiungi*: il pannello prova comunque
   la connessione prima di salvare e mostra modello e firmware.
4. Se la password è sbagliata la camera non viene salvata. Attenzione: dopo alcuni tentativi sbagliati la camera
   blocca l'account per un po'.
5. Se la camera è spenta o irraggiungibile in quel momento, compare *Salva comunque*.

Con più camere, il selettore in alto a sinistra sceglie quella su cui lavorano tutte le pagine. La scelta viene
ricordata dal browser.

**Consiglio**: crea sulla camera un utente **Operatore** dedicato al pannello (pagina *Utenti*), invece di
usare `admin`.

## Dove stanno le credenziali

Le camere sono salvate in **`data/cameras.json`**:

- la cartella `data/` e il file sono leggibili solo dal tuo utente (permessi `700` / `600`);
- `data/` è in `.gitignore`;
- le password non vengono mai mandate al browser: l'elenco che arriva alla pagina contiene solo nome,
  indirizzo e utente.

Le password sono in chiaro in quel file, perché il server deve usarle per autenticarsi con le camere.
Proteggi il computer di conseguenza (vedi [Sicurezza](sicurezza.md)).

## Impostazioni del server

Facoltative, in un file `.env` nella cartella del progetto (vedi `.env.example`) o come variabili d'ambiente:

| Variabile | Default | Significato |
|---|---|---|
| `HOST` | `127.0.0.1` | indirizzo su cui ascolta. `127.0.0.1` = solo da questo computer |
| `PORT` | `8080` | porta del pannello |
| `CAMERAS_FILE` | `data/cameras.json` | file delle camere |
| `CAM_URL`, `CAM_USER`, `CAM_PASS` | — | compatibilità: se il file delle camere non esiste ancora (e `CAMERAS_FILE` non è impostato), questa camera viene importata una volta come "Camera 1" |

Dopo l'import puoi togliere `CAM_USER` e `CAM_PASS` dal `.env`, così la password resta in un solo posto.

### Usarlo da altri computer

Con `HOST=0.0.0.0` il pannello è raggiungibile dalla rete locale. **Il pannello non ha un login proprio**:
chiunque lo raggiunga può comandare le camere. Il server lo segnala all'avvio. Fallo solo su una rete fidata,
oppure mettilo dietro un reverse proxy con autenticazione.

## Aggiornare

Il pannello è un insieme di file: aggiorna la cartella (per esempio con `git pull`) e riavvia `pnpm start`.
Le modifiche alle sole pagine (`public/`) si vedono ricaricando il browser; quelle al server richiedono il riavvio.
