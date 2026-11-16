# Page guide

Rules shared by all settings pages:

- forms offer **only values the camera accepts** (read from its *capabilities*) and only relevant fields:
  for example the manual intensity shows up only in manual mode;
- the bar at the bottom always tells the state: *Unsaved changes*, *Saved*, or *Not saved* with the reason.
  When a page saves several parts, the message says which part the camera refused and which were already saved;
- *Discard changes* reloads the values from the camera;
- leaving a page with unsaved changes asks for confirmation.

## Live

- **Main stream** (high quality) or **sub-stream** (lighter), shown as **JPEG snapshots**, at most 5 per second
  (or 1 per second, or every 5 seconds).
- **MJPEG video**: when the sub-stream is set to MJPEG (*Video* page), the *MJPEG video* option appears and the
  browser plays real video, no plug-in. Otherwise a hint explains how to enable it.
- While the browser tab is hidden the live view pauses, to spare the camera.

## Image

- Brightness, contrast, saturation, sharpness.
- **Hybrid light**: *Smart* mode (infrared, white light when the camera sees people), *White light only*,
  *Infrared only*, *Off*; white light duration and intensity.
- Day/night (automatic, always day, always night) with sensitivity and delay.
- Maximum shutter, 50/60 Hz anti-flicker, WDR, BLC, HLC, white balance, noise reduction.
- A preview refreshes after every save.

## Video

For the main and the sub-stream: encoding (H.264, H.265, MJPEG on the sub-stream only), resolution, frame rate,
constant or variable bitrate, quality, key-frame interval, H.264 profile, smart encoding (H.264+/H.265+), audio.

Saving asks for confirmation: the camera restarts the changed stream and recordings and connected apps stop for
a few seconds.

## OSD

Texts overlaid on the video: date and time, channel name, up to 4 free texts.

- **Drag the texts** on the preview to move them, or select one and use the arrow keys (Shift: bigger steps).
- Positions are rounded to the camera's minimum step (16 on this model).
- Date and time format, weekday, font size and colour, alignment.

## Date and time

- **Synchronisation**: NTP (recommended) or manual. In manual mode, *Use this computer's time* sets the clock
  when you save.
- **Time zone** and **European daylight saving** (last Sunday of March → last Sunday of October). Without DST
  the camera is one hour behind in summer.
- NTP server, port and sync interval.

## Network

DHCP or static address (IP, mask, gateway), DNS, MTU. The panel checks addresses and mask and warns when the
gateway isn't in the same subnet. Changing the address or switching to DHCP asks for confirmation: afterwards
update the camera's address on the *Cameras* page. IPv6 is left untouched.

## Motion

- **Detection**: on/off, sensitivity, *What to detect* (people, vehicles: at least one),
  *Highlight motion in the video* (boxes over moving areas).
- **Detection areas**: up to 4 polygons with 4 to 10 points, drawn over the picture.
  - drag the **yellow points** to change the shape, drag the selected area to move it;
  - double-click a point, or press Delete, to remove it; *Add point* adds one on the longest side;
  - shapes whose sides cross, or that are too small, are reported before saving.
- **Schedule**: time ranges for each weekday (up to 8), *Always on*, *Copy Monday to every day*.
  A day with no ranges is off.
- **When motion is detected**: the actions the camera supports for this event (on this model:
  *Notify apps and the event log*, *Send an email*, *Upload pictures to FTP*).
- **Live events**: at the bottom of the page, what the camera detects right now. It needs
  *Notify apps and the event log* on. It's the easiest way to test the settings.

## Notifications

Where the camera sends alerts. Which events use them is chosen on the *Motion* page.

- **Email**: sender, SMTP server (name or IP), port, encryption (SSL/TLS, STARTTLS), authentication, up to
  3 recipients, attached picture.
  - **Send a test email** uses the values in the form, even unsaved ones, and shows why it failed
    (server unreachable, wrong password, DNS…).
- **FTP**: server, port, anonymous or user/password, folder, picture upload.
- **HTTP server**: the camera sends events as XML to an address (for example a home automation system).
  On this model motion can't use it as an action.

Passwords are never read back from the camera: an empty password field means "keep the stored one".
For Brevo settings and Mailpit see [Troubleshooting](troubleshooting.md#email).

## Users

- List of accounts, showing which one the panel uses.
- **Add** an *Operator* (views and configures, cannot manage users) or a *User* (view only).
- **Edit** password or level, **delete** a user (the administrator can't be deleted).
- The camera asks for the **current administrator password** to confirm every change; the panel doesn't store it.
- Hikvision password rules: 8–16 characters, at least two kinds among lowercase, uppercase, digits and symbols,
  not containing the user name.
- If you change the password of the account the panel uses, the panel updates its own copy too.

## Device

- Model, serial number, MAC, firmware, camera time.
- **Reboot the camera**: after confirmation the panel waits until it's back online and says so.
- **Download backup**: a file with every setting. The camera exports it only with a **backup password**
  (1 to 16 characters) that you choose: it encrypts the file and you'll need it to restore, so keep it with the file.
- **Restore**: pick a backup made by this camera or one of the same model and enter its password. It replaces
  every setting and reboots the camera; the panel waits until it's back online. Always download a backup first.

## Cameras

Add, edit (an empty password keeps the current one), test and remove cameras. Each camera shows whether it
answers and its model. See [Installation and startup](installation.md#adding-a-camera).

## Language

Menu at the top right: Italian or English. The browser remembers the choice; the first time, the browser
language is used. Switching language with unsaved changes asks for confirmation.
