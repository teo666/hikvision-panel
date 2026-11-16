# Sviluppo e test

## Comandi

```bash
pnpm start                                   # pannello su :8080 con data/cameras.json
pnpm test                                    # tutti i test (node:test)
pnpm fake-camera                             # camera finta su :8081 (utente test / password test-pass)
FAKE_PORT=8082 pnpm fake-camera              # una seconda camera finta
CAMERAS_FILE=/tmp/cams-dev.json PORT=8090 pnpm start   # pannello di sviluppo con un elenco camere separato
```

Con `CAMERAS_FILE` impostato il server **non** importa la camera dal `.env`, così un elenco di prova non
riceve credenziali vere. Poi aggiungi la camera finta dalla pagina *Camere* (indirizzo `127.0.0.1:8081`).

## La camera finta (`tools/fake-camera.js`)

Un server che si comporta come la camera vera, per sviluppare e testare senza toccarla:

- Digest auth con nonce veri e verifica della risposta;
- risponde con gli XML di `test/fixtures/`, presi dalla camera reale senza seriale, MAC e indirizzo IPv6;
  i PUT vengono tenuti in memoria;
- snapshot SVG con l'ora, per vedere che il live si aggiorna;
- rifiuta i PUT che contengono `REJECT` e, come la camera vera, l'azione HTTP sul movimento;
- flusso eventi (`alertStream`) con un movimento ogni 6 s e i "battiti";
- utenti (con richiesta della password dell'amministratore), riavvio, prova email;
- backup e ripristino solo con la `secretkey` cifrata correttamente.

## Test

| File | Cosa copre |
|---|---|
| `digest.test.js` | Digest auth con gli esempi delle RFC 2617 e 7616 |
| `policy.test.js` | chiamate ammesse e rifiutate |
| `cameras.test.js` | elenco camere su file, permessi, import dal `.env`, API |
| `proxy.test.js` | server + camera finta: proxy, errori, blocchi di sicurezza, eventi, backup, utenti, prova email |
| `hik-security.test.js` | derivazione della chiave e cifratura della password del backup |
| `events.test.js` | aree, pianificazioni, parser del flusso eventi, regole delle password |
| `helpers.test.js`, `osd-format.test.js` | IPv4, fusi orari, anteprima della data OSD |
| `i18n.test.js` | traduzioni: segnaposto, plurali, ogni lingua ha le stesse chiavi, ogni codice d'errore è tradotto |

I componenti del browser non hanno test automatici: si provano nel browser contro la camera finta.

## Aggiungere una pagina di impostazioni

1. Scarica l'XML e le capabilities dalla camera (in sola lettura):
   `curl http://127.0.0.1:8080/isapi/<id>/ISAPI/...`, poi metti in `test/fixtures/` le copie senza dati
   identificativi.
2. Crea `public/js/components/cam-nome.js` che estende `ConfigPage` (vedi [Architettura](architettura.md#configpage)).
3. Registrala in `public/js/app.js` (import e voce in `ROUTES`).
4. Aggiungi le chiavi di testo in **tutti** i file di `public/js/locales/`, compresa `nav.<hash>` per il menu.
5. Se serve scrivere, controlla che il percorso sia ammesso in `lib/policy.js`.
6. Aggiungi il documento alla camera finta e prova il salvataggio nel browser.

## Aggiungere una lingua

1. Copia `public/js/locales/it.js` in `public/js/locales/<codice>.js` e traduci i testi, lasciando uguali
   le chiavi e i segnaposto `{…}`.
2. In `public/js/i18n.js` importala e aggiungila a `LANGUAGES`: `de: { name: 'Deutsch', messages: de }`.
3. `pnpm test` controlla che abbia le stesse chiavi e gli stessi segnaposto dell'italiano.

## Convenzioni

- Nessuna dipendenza: se serve qualcosa, si scrive (con test) usando i moduli di Node o gli standard del browser.
- Logica pura in moduli separati senza DOM, così si testa in Node.
- Commenti e nomi in inglese nel codice; testi per l'utente nei dizionari; commit in italiano.
