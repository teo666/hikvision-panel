# Development and tests

## Commands

```bash
pnpm start                                   # panel on :8080 with data/cameras.json
pnpm test                                    # every test (node:test)
pnpm fake-camera                             # fake camera on :8081 (user test / password test-pass)
FAKE_PORT=8082 pnpm fake-camera              # a second fake camera
CAMERAS_FILE=/tmp/cams-dev.json PORT=8090 pnpm start   # dev panel with a separate camera list
```

With `CAMERAS_FILE` set, the server does **not** import the camera from `.env`, so a test list never receives
real credentials. Then add the fake camera from the *Cameras* page (address `127.0.0.1:8081`).

## The fake camera (`tools/fake-camera.js`)

A server that behaves like the real camera, to develop and test without touching it:

- Digest auth with real nonces and response checks;
- answers with the XML in `test/fixtures/`, taken from the real camera with serial, MAC and IPv6 address
  removed; PUTs are kept in memory;
- SVG snapshots with the time, to see the live view refreshing;
- refuses PUTs containing `REJECT` and, like the real camera, the HTTP action on motion;
- event stream (`alertStream`) with a motion event every 6 s plus heartbeats;
- users (with the administrator password check), reboot, email test;
- backup and restore only with a correctly encrypted `secretkey`.

## Tests

| File | Covers |
|---|---|
| `digest.test.js` | Digest auth against the RFC 2617 and 7616 examples |
| `policy.test.js` | allowed and refused calls |
| `cameras.test.js` | camera file, permissions, `.env` import, API |
| `proxy.test.js` | server + fake camera: proxy, errors, security checks, events, backup, users, email test |
| `hik-security.test.js` | key derivation and backup password encryption |
| `events.test.js` | areas, schedules, event stream parser, password rules |
| `helpers.test.js`, `osd-format.test.js` | IPv4, time zones, OSD date preview |
| `i18n.test.js` | translations: placeholders, plurals, every language has the same keys, every error code is translated |

Browser components have no automated tests: they are tried in the browser against the fake camera.

## Adding a settings page

1. Fetch the XML and capabilities from the camera (read only):
   `curl http://127.0.0.1:8080/isapi/<id>/ISAPI/...`, and put copies without identifying data in `test/fixtures/`.
2. Create `public/js/components/cam-name.js` extending `ConfigPage` (see [Architecture](architecture.md#configpage)).
3. Register it in `public/js/app.js` (import and an entry in `ROUTES`).
4. Add the text keys to **every** file in `public/js/locales/`, including `nav.<hash>` for the menu.
5. If it writes, check that the path is allowed in `lib/policy.js`.
6. Add the document to the fake camera and try saving in the browser.

## Adding a language

1. Copy `public/js/locales/it.js` to `public/js/locales/<code>.js` and translate the texts, keeping keys and
   `{…}` placeholders unchanged.
2. In `public/js/i18n.js` import it and add it to `LANGUAGES`: `de: { name: 'Deutsch', messages: de }`.
3. `pnpm test` checks it has the same keys and placeholders as Italian.

## Conventions

- No dependencies: if something is needed, write it (with tests) on Node's modules or browser standards.
- Pure logic in separate DOM-free modules, so it can be tested in Node.
- Code comments and names in English; user-facing text in the dictionaries; commit messages in Italian.
