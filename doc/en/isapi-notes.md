# ISAPI notes

Things found out about the camera (DS-2CD1043G2-LIU, firmware V5.8.42) during development. Many are poorly
documented or not documented at all. Where needed, the behaviour was worked out from the original web UI's code.

## Authentication

- The camera uses **Digest auth** (`qop="auth"`, MD5) over HTTP. A nonce stays valid for several requests:
  the panel reuses it with an increasing `nc` and retries once when the camera sends a new one.
- The original web UI doesn't use Digest: it logs in and then sends a `SessionTag` header with every request.
- After a few wrong passwords the camera **locks the account** for a while.

## Answers and saving

- Writes answer with a `ResponseStatus`: `statusCode` 1 = ok, 7 = ok but a reboot is needed, other values =
  error with `statusString` and `subStatusCode` (e.g. `badXmlContent`).
- Sending back the whole document read with GET, changed only in the touched fields, works on every section
  tried: OSD, image, streams, NTP, hybrid light, motion, schedules, actions, email.
- `Content-Type: application/xml` is fine.
- Documents sometimes repeat `xmlns` on inner elements: keep them as they are.

## Capabilities

- Almost every resource has a `/capabilities` with `opt="a,b,c"`, `min` and `max`. The panel builds its forms from them.
- **Resolutions**: widths and heights come as two parallel lists (`videoResolutionWidth opt="640,640,1280"`,
  `videoResolutionHeight opt="360,480,720"`) to pair by position.
- **Frame rate**: `maxFrameRate` is in hundredths (`2000` = 20 fps); below 1 fps the values are 50, 25, 12, 6
  (1/2, 1/4, 1/8, 1/16).
- Some `/capabilities` answer 500 (`Event/triggers/VMD-1/capabilities`). The actions each event supports are in
  **`/ISAPI/Event/triggersCap`** instead.

## OSD

- Coordinates are on a **704 × 576** reference screen with the origin at the **bottom left**: `positionY`
  grows upwards and marks the top edge of the text. Verified by moving the date and comparing with the snapshot.
- Positions go in steps of `minOSDMoveValue` (16).
- Free texts live in `…/overlays/text` (`TextOverlayList`), saved separately from the rest.

## Motion

- With `regionType opt="grid,region"` this model uses **polygon areas** (`RegionList`), not the `gridMap` grid,
  which stays all zeros. The original web UI does the same.
- Area coordinates are on **0–1000** with the origin at the **bottom left**. Up to 4 areas, with 4–10 points
  (`regionEdgesNum`).
- `targetType`: `human`, `vehicle` (detection with people and vehicle recognition).
- Schedule in `…/Event/schedules/motionDetections/VMD_video1`: one `TimeBlock` per range per day
  (1 = Monday … 7 = Sunday), with `24:00` as the end of the day.
- **Actions** in `…/Event/triggers/VMD-1`. On this model motion supports only `center`, `email` and `FTP`
  (`triggersCap`). Asking for `HTTP` makes the camera refuse **the whole document** with `badXmlContent`.
  The camera uses the method name as each action's `id` (`center`).
- Events reach `alertStream` only when the `center` action is on.

## Event stream

- `GET /ISAPI/Event/notification/alertStream`: `multipart/mixed`, one `EventNotificationAlert` part per event,
  and every few seconds a `videoloss` / `inactive` heartbeat to ignore.

## Email

- The camera stores the SMTP server in `<hostName>` or, **when it's an IP address, in `<ipAddress>`**, with
  `addressingFormatType` saying which. The same goes for FTP and the HTTP server.
- Passwords are not returned: to keep them, just don't send `<password>`.
- **Test**: `POST /ISAPI/System/Network/mailing/test` with a `<mailingTestDescription>` (sender, server, port,
  TLS, authentication, recipients). The answer is 200 with the outcome in `<errorDescription>`:
  `ok`, `connect server fail`, `password error`, `no dns`, `no gateway`, …

## MJPEG video

- The sub-stream supports `MJPEG`; with it, `…/Streaming/channels/102/httpPreview` returns a
  `multipart/x-mixed-replace` that an `<img>` shows directly. With H.264 the same request answers 403.

## Configuration backup

- `GET /ISAPI/System/configurationData` on its own answers 400 `cfgFileSecretKeyError` ("secretkey is necessary"):
  the camera exports only with a **backup password** of **1 to 16 characters** (more than 16 gives the same error).
- The password must be sent encrypted: `?secretkey=<hex>&security=1&iv=<hex>`.
  - `GET /ISAPI/Security/capabilities?username=<user>` gives `keyIterateNum` (100), `isIrreversible` (true) and `salt`;
  - key = SHA-256 of `sha256(user + salt + password) + "AaBbCcDd1234!@#$"`, chained `keyIterateNum` times,
    first 32 hex characters → AES-128;
  - `secretkey` = AES-128-CBC (PKCS7) of the base64 of the backup password, as hex; `iv` = 16 random bytes.
- The web UI uses the same scheme (`security=1&iv=`) for other sensitive parameters.
- **Restore** uses the same `secretkey` with a `PUT` of the file. It works with the fake camera; on the real
  camera it **hasn't been tried yet**.

## Users

- `POST /ISAPI/Security/users`, and `PUT` / `DELETE` on `/ISAPI/Security/users/<id>`, need `<loginPassword>`:
  the password of the administrator making the change.
- Password rules: 8–16 characters, at least two kinds of characters, not containing the user name.
- Creating and deleting users has only been tried on the fake camera.

## The original web UI

- Many pages fail because the frontend asks for features the model doesn't have (403/404 answers) and depends
  on a plug-in. For example, on the OSD page saving sent no request at all.
- Its scripts are served compressed (gzip): reading them needs `curl --compressed`.
