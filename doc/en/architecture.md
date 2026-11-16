# Architecture

```
┌──────────────── browser ────────────────┐        ┌──────────── server.js (Node) ────────────┐        ┌─ cameras ─┐
│ Web Components (public/js/components/)  │  JSON  │ /api/cameras        camera list, tests    │        │           │
│ ConfigPage: forms from capabilities     │◀──────▶│ /api/cameras/:id/backup|restore           │ Digest │  ISAPI    │
│ isapi.js: GET/PUT of XML (DOMParser)    │  XML   │ /isapi/:id/ISAPI/…  proxy with rules      │◀──────▶│  (HTTP)   │
│ i18n.js: Italian / English              │        │ static files from public/                 │        │           │
└─────────────────────────────────────────┘        └───────────────────────────────────────────┘        └───────────┘
                                                              │
                                                     data/cameras.json (600)
```

## Principles

- **Zero dependencies**: the server uses Node's own modules only (`http`, `crypto`, `fs`, `fetch`); the browser
  only web standards (Custom Elements, ES modules, `DOMParser`). No build: the files in `public/` are what's served.
- **The camera's XML is the source of truth.** The panel has no data model of its own: it reads the ISAPI
  document, changes only the touched fields and sends it back whole (*read-modify-write*). Fields the panel
  doesn't know stay intact, and the element order is the one the camera expects.
- **Credentials never reach the browser**: only the server talks to the cameras.
- **Every error is shown**, with the camera's reason.

## Server

| File | Role |
|---|---|
| `server.js` | HTTP server: static files, `/api/cameras`, backup/restore, `/isapi/` proxy |
| `lib/digest.js` | client-side Digest auth (RFC 7616, MD5 and SHA-256, `qop=auth`) |
| `lib/camera.js` | one camera's client: caches the Digest challenge, retries once with a fresh nonce; after rejected credentials it pauses for 60 s |
| `lib/cameras.js` | camera list in `data/cameras.json` (atomic writes, mode 600), validation, `probe()` to test a connection |
| `lib/policy.js` | which ISAPI calls the proxy may forward (read, write, never) |
| `lib/hik-security.js` | "security=1" parameter encryption, used for the backup password |

### Proxy `/isapi/<id>/ISAPI/…`

1. Checks `Host` (only `localhost` when listening locally, against DNS rebinding) and, for writes,
   `Origin` (the panel's own pages only).
2. Finds camera `<id>` and checks path and method with `lib/policy.js`.
3. Reads the body (1 MB at most), forwards it with Digest auth and streams the answer back as it is.
4. 15 s timeout, except for never-ending streams (`alertStream`, `httpPreview`).
5. A camera 401 becomes a 502, so the browser doesn't show its own login box.

### Rules (`lib/policy.js`)

- **Read**: `System`, `Image`, `Streaming`, `Event`, `Smart`, `ContentMgmt`, `Security/users`, `Security/capabilities`.
- **Write**: video inputs and OSD, time, network, audio, image, streams, events, `System/reboot`, `Security/users`.
- **Never**: factory reset, firmware, activation, and writing `configurationData` (restore uses the dedicated endpoint).

### Camera API

| Method and path | What it does |
|---|---|
| `GET /api/cameras` | list, without passwords |
| `POST /api/cameras` | add (tests the connection first; `force: true` saves a camera that's off) |
| `POST /api/cameras/test` | test new settings or a stored camera (`id`) |
| `PUT /api/cameras/:id` | edit; empty password = unchanged |
| `DELETE /api/cameras/:id` | remove |
| `POST /api/cameras/:id/backup` | `{ password }` → backup file |
| `POST /api/cameras/:id/restore` | body = file, `X-Backup-Password` header |

Errors are JSON `{ error, code, params? }`: `error` is Italian, `code` is stable and the browser translates it.

## Frontend

| File | Role |
|---|---|
| `public/js/app.js` | top bar (camera, menu, language) and hash router (`#/osd`) |
| `public/js/isapi.js` | `get()`, `put()`, `update()` on the selected camera's XML; helpers `val`, `setVal`, `el`, `addChild`, `capOf` |
| `public/js/config-page.js` | `ConfigPage`, base of the settings pages |
| `public/js/cameras.js` | camera list and selected camera |
| `public/js/i18n.js`, `locales/` | translations |
| `public/js/components/` | one page = one Custom Element (`<cam-osd>`, `<cam-motion>`, …) |
| `regions.js`, `schedule.js`, `alerts.js`, `password.js`, `net.js`, `timezone.js`, `osd-format.js` | pure logic, tested in Node |

### `ConfigPage`

A settings page declares:

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

- `sel` is a CSS selector on the XML (element names match in any namespace).
- Field types are `bool`, `select`, `range`, `number`, `text`, `ipv4` and `custom` (with `render` and `bind`,
  for editors like the motion areas). Options and limits come from the capabilities' `opt`, `min` and `max`.
- `when(doc)` shows a field only when it applies; `validate` adds checks; `confirmSave` asks before saving.
- Saving sends back only the changed documents, one after the other. If one is refused, the message says
  which section and which ones were already saved.

### A save, step by step

1. The page loads `GET /isapi/<id>/ISAPI/Image/channels/1` and the capabilities, and builds the form.
2. Moving a slider writes the new value straight into the in-memory XML document (`setVal`) and marks the
   resource as changed.
3. *Save*: browser-side checks, then a `PUT` of the whole serialized document. Empty elements are written as
   `<a></a>`, like the camera does.
4. The camera answers with a `ResponseStatus`: `statusCode` 1 = ok, 7 = ok but a reboot is needed, anything
   else = error with `statusString` and `subStatusCode`, which are shown.
5. The page reloads the values from the camera, so it shows what the camera actually stored.

## Continuous streams

- **Events** (`<cam-event-log>`): `GET …/Event/notification/alertStream` is a multipart answer that never
  ends. The browser reads it in chunks with `fetch`; `alerts.js` pulls out complete `<EventNotificationAlert>`
  parts and drops the heartbeats (`videoloss inactive`). It reconnects 5 s after a drop.
- **MJPEG video**: `…/Streaming/channels/102/httpPreview` inside an `<img>`; the browser handles
  `multipart/x-mixed-replace` on its own.
