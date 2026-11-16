# Security

## What the panel does

- **Credentials on the server only**: camera passwords live in `data/cameras.json` (folder 700, file 600,
  ignored by git) and are never sent to the browser. The camera list the page receives has only name,
  address and user.
- **Listens locally** by default (`HOST=127.0.0.1`).
- **Against DNS rebinding**: when listening locally, the server accepts only requests whose `Host` is
  `localhost`, `127.0.0.1` or `[::1]`. A website pointing one of its names at 127.0.0.1 gets a 421.
- **Against cross-site requests**: writes (PUT, POST, DELETE) with an `Origin` other than the panel are refused.
  The JSON APIs require `Content-Type: application/json`, so another site's HTML form can't use them.
- **Rules on ISAPI calls** (`lib/policy.js`): factory reset, firmware update and activation never go through;
  unknown paths and `..` are refused too.
- **Account lock-out protection**: after rejected credentials the server stops calling that camera for 60 seconds,
  because Hikvision cameras lock the account after a few wrong attempts.
- **Passwords aren't read back**: SMTP, FTP and HTTP passwords are not read from the camera; an empty field
  means "keep the stored one".
- **Administrator password** for user management: the camera asks for it and the panel doesn't store it.

## What it doesn't do

- **The panel has no login of its own.** Whoever reaches the panel controls the cameras. With `HOST=0.0.0.0`
  the whole local network reaches it: do that only on a trusted network, or behind a reverse proxy with
  authentication and HTTPS.
- **Traffic to the cameras is HTTP.** Digest auth doesn't send the password in clear, but the content is
  plain, including new user passwords and SMTP/FTP passwords when you change them. Make those changes from
  a trusted network. The cameras support HTTPS: using it is a possible improvement.
- **`data/cameras.json` holds the passwords in clear text**, because the server needs them. Protect the
  computer (encrypted disk, personal account).
- **The backup** contains every camera setting; the camera encrypts it with the backup password you choose.
  Keep it, together with the password, somewhere safe.

## Advice

1. Create an **Operator** account on the camera just for the panel instead of using `admin` (*Users* page).
2. Keep `HOST=127.0.0.1` unless you need otherwise.
3. Keep the camera firmware up to date from Hikvision's website: the panel deliberately doesn't update it.
