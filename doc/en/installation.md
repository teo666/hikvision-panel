# Installation and startup

## Requirements

- **Node.js 21 or newer** (developed with Node 24). The server only uses modules that ship with Node.
- **pnpm**, only to run the scripts. There are no packages to download: `pnpm install` just writes the lockfile.
- A recent browser (Chrome, Firefox, Safari, Edge).
- The computer running the panel must reach the cameras on the network (HTTP, port 80 by default).

## Starting it

```bash
cd hikvision-panel
pnpm start
```

The panel is at **http://127.0.0.1:8080**. On first start, with no cameras yet, the *Cameras* page opens.

## Adding a camera

1. **Cameras** page → *Add camera*.
2. Fill in **Name** (anything), **Address** (`192.168.1.229` or `http://192.168.1.229:8080`), **User** and **Password**.
3. *Test connection* checks without saving; *Add* tests the connection anyway before saving, and shows the
   model and firmware.
4. With a wrong password nothing is saved. Careful: after a few wrong attempts the camera locks the account
   for a while.
5. If the camera is off or unreachable right now, *Save anyway* appears.

With several cameras, the selector at the top left picks the one every page works on. The browser remembers
the choice.

**Tip**: create an **Operator** account on the camera just for the panel (*Users* page) instead of using `admin`.

## Where the credentials live

Cameras are stored in **`data/cameras.json`**:

- the `data/` folder and the file are readable by your user only (permissions `700` / `600`);
- `data/` is in `.gitignore`;
- passwords are never sent to the browser: the list the page receives has only name, address and user.

Passwords are in clear text in that file, because the server needs them to authenticate with the cameras.
Protect the computer accordingly (see [Security](security.md)).

## Server settings

Optional, in a `.env` file in the project folder (see `.env.example`) or as environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `HOST` | `127.0.0.1` | address to listen on. `127.0.0.1` = this computer only |
| `PORT` | `8080` | panel port |
| `CAMERAS_FILE` | `data/cameras.json` | cameras file |
| `CAM_URL`, `CAM_USER`, `CAM_PASS` | — | compatibility: if the cameras file doesn't exist yet (and `CAMERAS_FILE` isn't set), this camera is imported once as "Camera 1" |

After the import you can remove `CAM_USER` and `CAM_PASS` from `.env`, so the password lives in one place only.

### Using it from other computers

With `HOST=0.0.0.0` the panel is reachable from the local network. **The panel has no login of its own**:
anyone who reaches it controls the cameras. The server warns about it on startup. Do it only on a trusted
network, or put it behind a reverse proxy with authentication.

## Updating

The panel is a set of files: update the folder (for example with `git pull`) and restart `pnpm start`.
Changes to the pages only (`public/`) show up on a browser reload; server changes need a restart.
