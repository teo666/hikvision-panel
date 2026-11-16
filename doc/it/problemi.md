# Risoluzione dei problemi

## Il pannello non si apre o non trova le camere

- **"Impossibile caricare le camere"**: il server non è avviato o è una versione vecchia. Riavvia `pnpm start`.
  Dopo un aggiornamento le modifiche alle pagine si vedono ricaricando il browser, quelle al server solo dopo il riavvio.
- **"Camera non raggiungibile"**: la camera è spenta, ha cambiato indirizzo (DHCP) o il computer non è sulla
  stessa rete. Controlla l'indirizzo nella pagina *Camere*.
- **"Credenziali della camera rifiutate: nuovo tentativo tra poco"**: la password salvata è sbagliata. Il server
  si ferma per 60 s per non far bloccare l'account. Correggi la password nella pagina *Camere*.
- **"Host non ammesso" (421)**: stai aprendo il pannello con un nome diverso da `localhost`/`127.0.0.1` mentre
  ascolta solo in locale. Usa `http://127.0.0.1:8080` oppure imposta `HOST`.

## Un salvataggio non va a buon fine

Il messaggio in basso dice quale sezione la camera ha rifiutato e perché (`statusString` / `subStatusCode`).
Nella console del browser c'è anche l'XML esatto che è stato inviato.

- **`badXmlContent`** sul movimento: un'azione non supportata. Oggi il pannello mostra solo quelle che la camera
  dichiara (su questo modello: app/registro eventi, email, FTP).
- **"La camera va riavviata per applicare"**: salvato, ma la camera applica la modifica solo dopo un riavvio
  (pagina *Dispositivo*).

## Il rilevamento del movimento non scatta

1. Pagina *Movimento*: rilevamento attivo, area che copre la zona, pianificazione che include l'ora attuale.
2. *Avvisa le app e il registro eventi* deve essere attivo, altrimenti il registro "Eventi in tempo reale"
   resta vuoto anche se la camera rileva.
3. Con *Cosa rilevare* su persone/veicoli, una mano agitata davanti all'obiettivo può non bastare: passa a
   piedi dentro l'area.
4. Prova ad alzare la sensibilità (es. 80%) e attiva *Evidenzia il movimento nel video* per vedere cosa rileva.
5. La pianificazione usa l'ora della camera: controllala nella pagina *Data e ora*.

## Email

Usa **Invia email di prova** (pagina *Notifiche*): mostra il motivo che dà la camera.

| Messaggio | Cosa controllare |
|---|---|
| non riesce a collegarsi al server | indirizzo, porta, cifratura; firewall |
| non riesce a risolvere il nome | DNS nella pagina *Rete* |
| non ha un gateway | gateway nella pagina *Rete* |
| utente o password rifiutati | utente e password SMTP |
| invio rifiutato | mittente non autorizzato dal provider, oppure cifratura sbagliata |

### Brevo

| Campo | Valore |
|---|---|
| Server | `smtp-relay.brevo.com` |
| Porta | `587`, con *Connessione cifrata* e *Usa STARTTLS* attivi (in alternativa `465` senza STARTTLS) |
| Autenticazione | attiva |
| Utente | il **login SMTP** indicato in Brevo → *SMTP & API* → *SMTP* |
| Password | una **chiave SMTP** generata lì, non la password dell'account |
| Mittente | un mittente o dominio **verificato** in Brevo |

Controlla i valori con quelli mostrati nella pagina SMTP di Brevo.

### Mailpit (prove in locale con Docker)

Mailpit raccoglie le email senza consegnarle e le mostra in una pagina web: è utile per vedere cosa manda la camera.

```bash
docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
```

In *Notifiche → Email*: server = indirizzo IP del computer con Docker (es. `192.168.1.227`), porta `1025`,
cifratura e autenticazione spente. Le email si vedono su http://localhost:8025. Se la camera non si collega,
controlla che il firewall del computer non blocchi la porta 1025.

Un server SMTP fatto in casa per la consegna vera, senza dominio e senza SPF/DKIM, finisce quasi sempre nello
spam: per l'uso quotidiano meglio un servizio come Brevo.

## Backup e ripristino

- **"La camera ha rifiutato: … cfgFileSecretKeyError"**: manca la password del backup, oppure è più lunga di
  16 caratteri.
- Il ripristino richiede la **stessa password** usata per creare quel backup.
- Dopo il ripristino la camera si riavvia; se dopo 5 minuti non risponde ancora, controlla alimentazione e rete.

## Utenti

- **`loginPasswordError`**: la password dell'amministratore inserita per confermare è sbagliata.
- Hai cambiato la password dell'utente usato dal pannello e il pannello non è riuscito ad aggiornarla:
  inseriscila nella pagina *Camere* → *Modifica*.

## Live

- **Video MJPEG non disponibile**: lo stream secondario è in H.264. Impostalo su MJPEG nella pagina *Video*.
  Attenzione: un registratore (NVR) o un'app che usano lo stream secondario in H.264 smetterebbero di funzionare.
- Il live a snapshot arriva al massimo a 5 immagini al secondo, apposta per non caricare la camera.
