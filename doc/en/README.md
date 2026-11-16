# Hikvision camera panel — documentation

A web panel to manage one or more Hikvision cameras through their ISAPI. It was built to replace the
camera's own web UI, which on this model fails to save several pages. It is plain JavaScript (Web
Components) with a small Node server, **no external dependencies** and no build step.

Tested on a **DS-2CD1043G2-LIU** (4 MP bullet camera with hybrid IR + white light), firmware
**V5.8.42 build 260827**. Other Hikvision cameras with ISAPI should largely work: the panel builds its forms
from the *capabilities* each camera reports.

*Versione italiana: [../it/README.md](../it/README.md)*

## Contents

| Document | For | What's inside |
|---|---|---|
| [Installation and startup](installation.md) | users | requirements, starting it, adding cameras, server settings |
| [Page guide](user-guide.md) | users | what each page does and how to use it |
| [Troubleshooting](troubleshooting.md) | users | email (Brevo, Mailpit), motion, credentials, unreachable camera |
| [Security](security.md) | everyone | what the panel protects and what it doesn't |
| [Architecture](architecture.md) | developers | server, proxy, rules, frontend, how a save works |
| [Development and tests](development.md) | developers | fake camera, tests, adding a page or a language |
| [ISAPI notes](isapi-notes.md) | developers | camera behaviour found along the way |

## In short

```
browser (Web Components)  ──JSON / XML──▶  server.js (Node, built-in modules only)  ──Digest auth──▶  cameras
```

- **Several cameras**, added from the *Cameras* page: credentials stay on the computer that runs the server.
- **Pages**: Live (snapshots or MJPEG video), Image and hybrid light, Video, OSD, Date and time, Network,
  Motion (areas, schedule, actions, live events), Notifications (email, FTP, HTTP), Users,
  Device (reboot, backup, restore), Cameras.
- **Every save reports its outcome**; when the camera refuses, you see its reason and which section failed.
- **Italian and English**, chosen from the menu at the top.
- **Left out on purpose**: factory reset, firmware update, camera activation.

## Project history

1. **Analysis**: the original web UI failed to save several pages. A request logger showed that the OSD page,
   for example, never sent a save request to the camera: its JavaScript stopped earlier, because that page
   depends on a plug-in that was not installed. Writing directly to the camera worked, so only the frontend
   was broken.
2. **Phase 1**: proxy with Digest auth, snapshot live view, OSD with draggable texts.
3. **Phase 2**: Image and hybrid light, Video, Date and time, Network, on a shared base (`ConfigPage`).
4. **Several cameras** managed in the panel, without `.env`; **Italian and English** (built in parallel on a branch).
5. **Phases 3 and 4**: Motion, Notifications, MJPEG video, Users, reboot, backup and restore.
6. **Fixes from field testing**: unsupported motion actions (HTTP), SMTP server stored as an IP address,
   the *Send a test email* button, encrypted backup password.
