# MINOS-WEB — SIGINT Sky Tracker

A browser-based reimplementation of the "MINOS SIGINT UFO Scanner" concept, built to run
on iPhone as an installable web app (no App Store, no jailbreak).

Local camera analysis only. Nothing is transmitted anywhere. No aircraft, drone, or radio
signal is interfaced with — it's a computer-vision visualization tool styled like a SIGINT
terminal.

## What it does

- Live rear-camera feed with a terminal-green sci-fi HUD (reticle, radar sweep, stats)
- Frame-differencing motion detection, tunable via on-screen sliders
- Tap **CAPTURE RETICLE** to lock onto the strongest motion near the center reticle
- Locked target is tracked every frame using a Kalman filter (constant-velocity model)
  blended with a lightweight patch-matching "optical flow" corrector, with automatic
  reacquire-search if the target briefly drops out of the motion mask
- One-shot YOLOv8n object tagging on capture (airplane / bird / car / person / etc.),
  which then turns itself off until the next capture — same performance philosophy as
  the original app
- Installable to your iPhone home screen and works offline after first load

## Deploy it to your iPhone (step by step)

You need to host these files somewhere with HTTPS — iOS Safari will not grant camera
access to a plain `http://` page (except `localhost`). The easiest free option is
**GitHub Pages**:

1. Create a new **public** GitHub repo (e.g. `minos-web`).
2. Upload every file in this folder, keeping the folder structure exactly as-is
   (`index.html`, `manifest.json`, `service-worker.js`, `styles.css`, `src/`, `icons/`).
3. In the repo, go to **Settings → Pages**, set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`. Save.
4. Wait ~1 minute, then GitHub gives you a URL like
   `https://yourusername.github.io/minos-web/`.
5. On your iPhone, open that URL in **Safari** (must be Safari, not Chrome, for the
   "Add to Home Screen" install to work as a full-screen app).
6. Tap the **Share** icon → **Add to Home Screen** → **Add**.
7. Open it from the home screen icon like any other app. Tap **START SCANNER**, allow
   camera access when prompted.

Alternative hosts that work the same way: Netlify (drag-and-drop the folder onto
netlify.com/drop), Vercel, or Cloudflare Pages — any static HTTPS host is fine.

### Testing locally first (optional, on a Mac)

```
cd minos-web
python3 -m http.server 8000
```
Then visit `https://<your-Mac's-LAN-IP>:8000` from your iPhone — note plain `http://`
over LAN will *not* get camera permission on iOS; for real local testing over HTTPS,
use a tool like `ngrok` or just deploy to GitHub Pages, which is simpler.

## Notes on what's simplified vs. the original Android app

- **Optical flow**: instead of OpenCV's Lucas-Kanade (which needs the large OpenCV.js
  WASM build), this uses a small hand-written patch-matching tracker
  (`src/opticalFlow.js`) that searches a local window for the best-matching texture
  patch each frame. It plays the same role — a texture-based correction independent of
  the motion-blob detector — with a much smaller footprint and no WASM-init risk on
  Safari.
- **YOLO model source**: `src/yolo.js` points at a public, CORS-enabled `yolov8n.onnx`
  export by default so it works out of the box. For guaranteed offline reliability,
  download your own copy (`yolo.export(format="onnx")` via Ultralytics, or grab a
  pre-exported one) and change `MODEL_URL` in `src/yolo.js` to `./models/yolov8n.onnx`,
  placing the file in a `models/` folder you add to the repo and to the
  `service-worker.js` cache list.
- **Manual focus / exposure lock**: iOS Safari doesn't expose these camera controls to
  web pages at all (this is a Safari/WebKit limitation, not something fixable in this
  app). The app detects this and shows a note rather than pretending to support it.

## Tuning

All the tunable parameters from the original app are exposed as sliders in the control
panel: motion threshold, max tracked points, and lock radius. Zoom is a digital crop-zoom
(1x–3x) applied before motion analysis. If tracking feels jittery, lower the motion
threshold and increase lock radius; if it's grabbing background clutter, raise the
threshold.

## File structure

```
minos-web/
├── index.html
├── manifest.json
├── service-worker.js
├── styles.css
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── src/
    ├── main.js         — bootstrap + render loop
    ├── camera.js        — getUserMedia + digital zoom
    ├── motion.js         — frame-diff motion + blob extraction
    ├── kalman.js          — 2D constant-velocity Kalman filter
    ├── opticalFlow.js      — patch-matching tracker
    ├── tracker.js           — lock/predict/reacquire state machine
    ├── yolo.js               — one-shot YOLOv8n ONNX inference
    ├── hud.js                 — reticle/radar/box/inspector rendering
    └── ui.js                   — button/slider wiring
```
