# Hikvision Camera Panel

A clean, fast web panel to configure **Hikvision IP cameras** through their ISAPI — a replacement for the
camera's built-in web UI, which on some models fails to save several settings and depends on a browser plug-in.

- **Zero dependencies.** A small Node.js server (built-in modules only) and plain JavaScript Web Components.
  No `npm install` of packages, no build step, no framework.
- **Several cameras** in one panel, added from the browser. Credentials stay on the server and never reach the page.
- **Every save tells you what happened.** If the camera refuses a setting, you see its own reason and which section failed.
- **Italian and English** interface.

*🇮🇹 Versione italiana: [README.it.md](README.it.md)*

---

## Features

| Page | What you can do |
|---|---|
| **Live** | JPEG snapshot view (up to 5 fps), or real **MJPEG video** when the sub-stream is set to MJPEG — no plug-in |
| **Image** | brightness, contrast, saturation, sharpness, **hybrid light** (IR / white light / smart mode), day/night, WDR, BLC, HLC, white balance, noise reduction |
| **Video** | codec, resolution, frame rate, bitrate, quality, GOP, H.264+/H.265+, audio — for main and sub stream |
| **OSD** | date/time, channel name and up to 4 texts, **dragged into place** over a live preview |
| **Date and time** | NTP or manual, time zone, European daylight saving |
| **Network** | DHCP or static IPv4, DNS, MTU, with validation and a warning before changing the address |
| **Motion** | detection **areas drawn as polygons** on the picture, people/vehicle filter, sensitivity, weekly schedule, linked actions, and a **live event log** |
| **Notifications** | email (with a **send test email** button), FTP, HTTP host |
| **Users** | add, edit and delete camera accounts |
| **Device** | info, **reboot**, encrypted **configuration backup and restore** |
| **Cameras** | add, test, edit and remove cameras |

Forms are built from the **capabilities** each camera reports, so they only offer values the camera accepts.
Factory reset, firmware updates and device activation are deliberately **not** available.

**Tested on:** DS-2CD1043G2-LIU, firmware V5.8.42. Other Hikvision cameras with ISAPI should largely work,
but haven't been tested — reports are welcome.

---

## Quick start

### Requirements

- **Node.js 21 or newer** ([nodejs.org](https://nodejs.org)) — check with `node --version`
- A camera reachable from your computer over HTTP, and its user name and password
- Optional: [pnpm](https://pnpm.io) to run the scripts (plain `node` works too)

### Run it

```bash
git clone https://github.com/teo666/hikvision-panel.git
cd hikvision-panel
pnpm start            # or: node server.js
```

Open **http://127.0.0.1:8080**. The first time, the **Cameras** page opens:

1. Click **Add camera**.
2. Enter a name, the camera address (e.g. `192.168.1.64`), user and password.
3. Click **Add**: the panel tests the connection first and shows the camera model.

That's it — pick a page from the top menu. With several cameras, switch between them from the selector at the top left.

> **Tip:** create an *Operator* account on the camera just for the panel (page **Users**) instead of using `admin`.

### Settings (optional)

Copy `.env.example` to `.env` in the project folder and edit it, or set environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `HOST` | `127.0.0.1` | address the panel listens on — `127.0.0.1` means this computer only |
| `PORT` | `8080` | port of the panel |
| `CAMERAS_FILE` | `data/cameras.json` | where cameras and their credentials are stored |

Camera credentials are saved in `data/cameras.json`, readable only by your user and ignored by git.

### Use it from other devices on your network

```bash
HOST=0.0.0.0 pnpm start
```

⚠️ **The panel has no login of its own**: anyone who can reach it controls your cameras. Only do this on a
trusted network, or put it behind a reverse proxy with authentication. See [Security](doc/en/security.md).

### Keep it running

The panel is a plain Node process, so any process manager works. For example, on a Linux box with systemd:

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

### Update

```bash
git pull
pnpm start            # restart the server
```

---

## Development

No camera at hand? The repository includes a **fake camera** that behaves like the real one (Digest auth,
real XML taken from a camera, event stream, users, backup…):

```bash
pnpm fake-camera                                        # fake camera on :8081 — user "test", password "test-pass"
CAMERAS_FILE=/tmp/cams-dev.json PORT=8090 pnpm start    # panel with a separate camera list
```

Then add the camera `127.0.0.1:8081` from the panel at http://127.0.0.1:8090.

```bash
pnpm test             # node:test, no dependencies
```

### How it works

```
browser (Web Components)  ──JSON / XML──▶  server.js (Node)  ──Digest auth──▶  cameras (ISAPI)
```

The server serves the pages, stores the cameras and proxies ISAPI calls, adding authentication and enforcing an
allow-list of operations. The browser reads the camera's XML, changes only the touched fields and sends the whole
document back, so settings the panel doesn't know about are left untouched.

| Path | Purpose |
|---|---|
| `server.js` | HTTP server: static files, camera API, backup/restore, ISAPI proxy |
| `lib/` | Digest auth, camera client, camera store, proxy rules, parameter encryption |
| `public/js/components/` | one page = one Web Component |
| `public/js/config-page.js` | base class that builds settings forms from the camera's capabilities |
| `public/js/locales/` | Italian and English texts |
| `tools/fake-camera.js` | fake camera for development and tests |
| `test/` | tests, with XML fixtures from a real camera |

---

## Documentation

| | English | Italiano |
|---|---|---|
| Overview | [doc/en](doc/en/README.md) | [doc/it](doc/it/README.md) |
| Installation | [installation](doc/en/installation.md) | [installazione](doc/it/installazione.md) |
| Page guide | [user guide](doc/en/user-guide.md) | [guida](doc/it/guida.md) |
| Troubleshooting (email, motion, backup…) | [troubleshooting](doc/en/troubleshooting.md) | [problemi](doc/it/problemi.md) |
| Security | [security](doc/en/security.md) | [sicurezza](doc/it/sicurezza.md) |
| Architecture | [architecture](doc/en/architecture.md) | [architettura](doc/it/architettura.md) |
| Development | [development](doc/en/development.md) | [sviluppo](doc/it/sviluppo.md) |
| ISAPI notes — what we learned about the camera | [ISAPI notes](doc/en/isapi-notes.md) | [note ISAPI](doc/it/note-isapi.md) |

---

## Disclaimer

This is an independent project, not affiliated with or endorsed by Hikvision. "Hikvision" is a trademark of its
owner. Changing camera settings can make a camera unreachable (for example a wrong network address): keep a
configuration backup, and use the panel at your own risk.

## License

[MIT](LICENSE) © 2026 Teo Basili
