# Pannello camera Hikvision — documentazione

Pannello web per gestire una o più camere Hikvision tramite le API ISAPI. Nasce per sostituire il
web UI della camera, che su questo modello non riesce a salvare diverse pagine. È scritto in JavaScript puro
(Web Components) con un piccolo server Node, **senza dipendenze esterne** e senza build.

Provato su **DS-2CD1043G2-LIU** (camera bullet 4 MP con luce ibrida IR + bianca), firmware
**V5.8.42 build 260827**. Altre camere Hikvision con ISAPI dovrebbero funzionare in buona parte: il
pannello costruisce i moduli dalle *capabilities* che ogni camera dichiara.

*English version: [../en/README.md](../en/README.md)*

## Indice

| Documento | Per chi | Contenuto |
|---|---|---|
| [Installazione e avvio](installazione.md) | chi lo usa | requisiti, avvio, aggiunta delle camere, impostazioni del server |
| [Guida alle pagine](guida.md) | chi lo usa | cosa fa ogni pagina del pannello e come usarla |
| [Risoluzione dei problemi](problemi.md) | chi lo usa | email (Brevo, Mailpit), movimento, credenziali, camera irraggiungibile |
| [Sicurezza](sicurezza.md) | tutti | cosa protegge il pannello e cosa no |
| [Architettura](architettura.md) | chi lo modifica | server, proxy, regole, frontend, flusso di un salvataggio |
| [Sviluppo e test](sviluppo.md) | chi lo modifica | camera finta, test, aggiungere una pagina o una lingua |
| [Note su ISAPI](note-isapi.md) | chi lo modifica | comportamenti della camera scoperti lungo la strada |

## In breve

```
browser (Web Components)  ──JSON / XML──▶  server.js (Node, solo moduli built-in)  ──Digest auth──▶  camere
```

- **Camere multiple**, aggiunte dalla pagina *Camere*: le credenziali restano sul computer che fa girare il server.
- **Pagine**: Live (snapshot o video MJPEG), Immagine e luce ibrida, Video, OSD, Data e ora, Rete,
  Movimento (aree, pianificazione, azioni, eventi in tempo reale), Notifiche (email, FTP, HTTP),
  Utenti, Dispositivo (riavvio, backup, ripristino), Camere.
- **Ogni salvataggio dice com'è andato**; se la camera rifiuta, mostra il suo messaggio e la sezione interessata.
- **Italiano e inglese**, con la lingua scelta dal menu in alto.
- **Escluso di proposito**: reset di fabbrica, aggiornamento firmware, attivazione della camera.

## Storia del progetto

1. **Analisi**: il web UI originale non salvava diverse pagine. Con il logger delle richieste si è visto che,
   per esempio, la pagina OSD non mandava alla camera nessuna richiesta di salvataggio. Il JavaScript si
   bloccava prima, perché quella pagina dipende da un plugin che non era installato. Le
   scritture fatte direttamente sulla camera invece funzionavano: il problema era solo il frontend.
2. **Fase 1**: proxy con Digest auth, live a snapshot, OSD con trascinamento delle scritte.
3. **Fase 2**: Immagine e luce ibrida, Video, Data e ora, Rete, con una base comune (`ConfigPage`).
4. **Più camere** gestite dal pannello, senza `.env`; **multilingua** (sviluppato in parallelo su un branch).
5. **Fasi 3 e 4**: Movimento, Notifiche, video MJPEG, Utenti, riavvio, backup e ripristino.
6. **Correzioni dalla prova sul campo**: azioni del movimento non supportate (HTTP), server SMTP salvato
   come IP, tasto *Invia email di prova*, password cifrata per il backup.
