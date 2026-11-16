# Sicurezza

## Cosa fa il pannello

- **Credenziali solo sul server**: le password delle camere stanno in `data/cameras.json` (cartella 700, file
  600, escluso da git) e non vengono mai mandate al browser. L'elenco delle camere che arriva alla pagina
  contiene solo nome, indirizzo e utente.
- **Ascolta solo in locale** per default (`HOST=127.0.0.1`).
- **Contro il DNS rebinding**: se ascolta in locale, il server accetta solo richieste con `Host` uguale a
  `localhost`, `127.0.0.1` o `[::1]`. Un sito esterno che faccia puntare un suo nome a 127.0.0.1 riceve 421.
- **Contro le richieste da altri siti**: le scritture (PUT, POST, DELETE) con un `Origin` diverso dal pannello
  vengono rifiutate. Le API JSON richiedono `Content-Type: application/json`, quindi un modulo HTML di un altro
  sito non può usarle.
- **Regole sulle chiamate ISAPI** (`lib/policy.js`): reset di fabbrica, aggiornamento firmware e attivazione
  non passano mai; anche percorsi sconosciuti e `..` vengono rifiutati.
- **Protezione dal blocco dell'account**: dopo credenziali rifiutate il server smette di chiamare quella camera
  per 60 secondi, perché le camere Hikvision bloccano l'account dopo pochi tentativi sbagliati.
- **Password non rilette**: le password di SMTP, FTP e HTTP non vengono lette dalla camera; un campo vuoto
  significa "lascia quella salvata".
- **Password dell'amministratore** per la gestione utenti: la chiede la camera e il pannello non la salva.

## Cosa non fa

- **Il pannello non ha un login proprio.** Chi raggiunge il pannello comanda le camere. Con `HOST=0.0.0.0`
  lo raggiunge tutta la rete locale: fallo solo su una rete fidata, oppure mettilo dietro un reverse proxy
  con autenticazione e HTTPS.
- **Il traffico verso le camere è HTTP.** La Digest auth non manda la password in chiaro, ma i contenuti sì,
  comprese le password nuove degli utenti e quelle di SMTP e FTP quando le cambi. Fai queste modifiche da una
  rete fidata. Le camere supportano HTTPS: usarlo è un possibile miglioramento.
- **`data/cameras.json` contiene le password in chiaro**, perché il server deve usarle. Proteggi il computer
  (disco cifrato, account personale).
- **Il backup** contiene tutte le impostazioni della camera; la camera lo cifra con la password del backup che
  scegli. Conservalo insieme alla password, in un posto sicuro.

## Consigli

1. Crea sulla camera un utente **Operatore** dedicato al pannello invece di usare `admin` (pagina *Utenti*).
2. Lascia `HOST=127.0.0.1` se non ti serve altro.
3. Tieni il firmware della camera aggiornato, dal sito Hikvision: il pannello di proposito non lo aggiorna.
