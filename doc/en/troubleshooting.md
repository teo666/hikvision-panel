# Troubleshooting

## The panel doesn't open or can't find the cameras

- **"Could not load the cameras"**: the server isn't running or is an old version. Restart `pnpm start`.
  After an update, page changes show up on a browser reload, server changes only after a restart.
- **"Camera unreachable"**: the camera is off, changed address (DHCP), or the computer is on another network.
  Check the address on the *Cameras* page.
- **"Camera credentials rejected: retrying shortly"**: the stored password is wrong. The server pauses for 60 s
  so the account doesn't get locked. Fix the password on the *Cameras* page.
- **421 "Host non ammesso"** (the server answers in plain text): you opened the panel with a name other than `localhost`/`127.0.0.1` while it
  listens locally only. Use `http://127.0.0.1:8080` or set `HOST`.

## A save fails

The message at the bottom says which section the camera refused and why (`statusString` / `subStatusCode`).
The browser console also has the exact XML that was sent.

- **`badXmlContent`** on motion: an unsupported action. The panel now shows only the ones the camera reports
  (on this model: apps/event log, email, FTP).
- **"Saved. The camera must be restarted to apply it."**: saved, but the camera applies it only after a reboot (*Device* page).

## Motion detection doesn't trigger

1. *Motion* page: detection on, an area covering the spot, a schedule that includes the current time.
2. *Notify apps and the event log* must be on, or the "Live events" log stays empty even if the camera detects.
3. With *What to detect* set to people/vehicles, waving a hand in front of the lens may not be enough: walk
   through the area.
4. Try a higher sensitivity (e.g. 80%) and turn on *Highlight motion in the video* to see what it detects.
5. The schedule uses the camera's clock: check it on the *Date and time* page.

## Email

Use **Send a test email** (*Notifications* page): it shows the reason the camera gives.

| Message | What to check |
|---|---|
| cannot connect to the server | address, port, encryption; firewall |
| cannot resolve the server name | DNS on the *Network* page |
| has no gateway | gateway on the *Network* page |
| user or password rejected | SMTP user and password |
| refused to send | sender not allowed by the provider, or wrong encryption |

### Brevo

| Field | Value |
|---|---|
| Server | `smtp-relay.brevo.com` |
| Port | `587`, with *Encrypted connection* and *Use STARTTLS* on (alternatively `465` without STARTTLS) |
| Authentication | on |
| User | the **SMTP login** shown in Brevo → *SMTP & API* → *SMTP* |
| Password | an **SMTP key** generated there, not the account password |
| Sender | a sender or domain **verified** in Brevo |

Compare these values with the ones on Brevo's SMTP page.

### Mailpit (local tests with Docker)

Mailpit catches emails without delivering them and shows them on a web page: handy to see what the camera sends.

```bash
docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
```

In *Notifications → Email*: server = IP address of the computer running Docker (e.g. `192.168.1.227`),
port `1025`, encryption and authentication off. Emails show up at http://localhost:8025. If the camera can't
connect, check that the computer's firewall doesn't block port 1025.

A home-made SMTP server for real delivery, without a domain and SPF/DKIM, almost always ends up in spam:
for everyday use a service like Brevo works better.

## Backup and restore

- **"The camera refused: … cfgFileSecretKeyError"**: the backup password is missing or longer than 16 characters.
- Restoring needs the **same password** used to create that backup.
- After a restore the camera reboots; if it still doesn't answer after 5 minutes, check power and network.

## Users

- **`loginPasswordError`**: the administrator password entered to confirm is wrong.
- You changed the password of the account the panel uses and the panel couldn't update it: enter it on the
  *Cameras* page → *Edit*.

## Live

- **MJPEG video not available**: the sub-stream is H.264. Set it to MJPEG on the *Video* page. Careful: a
  recorder (NVR) or an app that uses the sub-stream as H.264 would stop working.
- The snapshot live view tops out at 5 pictures per second, on purpose, to spare the camera.
