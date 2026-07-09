import { Camera } from './camera.js';
import { MotionDetector } from './motion.js';
import { Tracker } from './tracker.js';
import { YoloTagger } from './yolo.js';
import { Hud } from './hud.js';
import { setupUI, setStats } from './ui.js';

const videoEl = document.getElementById('video');
const viewCanvas = document.getElementById('viewCanvas');
const hudCanvas = document.getElementById('hudCanvas');
const viewCtx = viewCanvas.getContext('2d');

const camera = new Camera(videoEl);
const motion = new MotionDetector({ width: 320, height: 240 });
const yolo = new YoloTagger();
const tracker = new Tracker(yolo);
const hud = new Hud(hudCanvas);

let running = false;
let lastFrameTime = performance.now();
let fpsSmoothed = 30;

function resizeCanvases() {
  const w = window.innerWidth, h = window.innerHeight;
  viewCanvas.width = w; viewCanvas.height = h;
  hud.resize(w, h);
}
window.addEventListener('resize', resizeCanvases);

// --- UI wiring -------------------------------------------------------

setupUI({
  onCapture: () => doCapture(),
  onUnlock: () => { tracker.unlock(); setStats({ lockState: 'SCANNING' }); },
  onSnap: () => doSnapYolo(),
  onFlowToggle: (on) => tracker.setFlowEnabled(on),
  onRadarToggle: (on) => { hud.radarOn = on; },
  onModeChange: (m) => { hud.mode = m; },
  onZoom: (v) => camera.setZoom(v),
  onThreshold: (v) => motion.setThreshold(v),
  onMaxPoints: (v) => motion.setMaxPoints(v),
  onLockRadius: (v) => tracker.setLockRadius(v),
  onMaxBlobSize: (v) => tracker.setMaxBlobArea(v)
});

// --- boot --------------------------------------------------------------

document.getElementById('startBtn').addEventListener('click', boot);

async function boot() {
  const status = document.getElementById('bootStatus');
  try {
    status.textContent = 'REQUESTING CAMERA…';
    await camera.start();

    resizeCanvases();

    document.getElementById('bootScreen').classList.add('hidden');
    document.getElementById('topBar').classList.remove('hidden');
    document.getElementById('controls').classList.remove('hidden');

    if (!camera.supportsNativeFocusControl) {
      document.getElementById('unsupportedNote').classList.remove('hidden');
    }

    // Load YOLO model in the background — tracking/motion works immediately
    // even before this resolves; tagging just won't be available yet.
    yolo.load((msg) => setStats({ lockState: msg })).catch(() => {
      setStats({ lockState: 'MODEL LOAD FAILED (offline?)' });
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }

    running = true;
    requestAnimationFrame(loop);
  } catch (err) {
    status.textContent = 'CAMERA ACCESS DENIED OR UNAVAILABLE: ' + (err && err.message ? err.message : err);
  }
}

// --- capture / tag actions ----------------------------------------------

function currentGrayFrame() {
  // motion.js keeps its own downscaled buffer; expose last processed gray via a
  // fresh process() call is wasteful twice per frame, so we reuse the same
  // motion result object computed in loop() — see below.
  return lastMotionResult;
}

let lastMotionResult = { blobs: [], points: [], scaleX: 1, scaleY: 1 };
let lastGray = null;

function doCapture() {
  if (!lastGray) return;
  const res = tracker.capture(lastMotionResult, lastGray, motion.w, motion.h);
  if (res.locked) {
    setStats({ lockState: 'LOCKED' });
    tagCurrentBox();
  } else {
    setStats({ lockState: res.reason || 'NO LOCK' });
  }
}

function doSnapYolo() {
  if (tracker.state === 'idle') return;
  tagCurrentBox();
}

function tagCurrentBox() {
  if (!tracker.box) return;
  const sx = lastMotionResult.scaleX, sy = lastMotionResult.scaleY;
  const fullBox = {
    x: tracker.box.x * sx, y: tracker.box.y * sy,
    w: tracker.box.w * sx, h: tracker.box.h * sy
  };
  tracker.tag(viewCanvas, fullBox);
}

// --- main render/tracking loop ------------------------------------------

function loop(now) {
  if (!running) return;

  const dt = now - lastFrameTime;
  lastFrameTime = now;
  fpsSmoothed = fpsSmoothed * 0.9 + (1000 / Math.max(dt, 1)) * 0.1;

  camera.drawInto(viewCtx, viewCanvas.width, viewCanvas.height);

  lastMotionResult = motion.process(viewCanvas);
  lastGray = motion.prevGray;

  hud.clear();
  hud.drawMotionPoints(lastMotionResult.points, lastMotionResult.scaleX, lastMotionResult.scaleY);

  if (tracker.state !== 'idle') {
    const upd = tracker.update(lastMotionResult, lastGray, motion.w, motion.h);
    if (upd && !upd.dropped) {
      hud.drawTarget({
        box: tracker.box,
        label: tracker.label,
        confidence: tracker.confidence,
        sky: tracker.sky,
        state: tracker.state,
        scaleX: lastMotionResult.scaleX,
        scaleY: lastMotionResult.scaleY
      });
      hud.drawInspector(viewCanvas, tracker.box, lastMotionResult.scaleX, lastMotionResult.scaleY);
      setStats({ lockState: tracker.state === 'searching' ? 'REACQUIRING' : 'LOCKED' });
    } else if (upd && upd.dropped) {
      setStats({ lockState: 'TARGET LOST' });
    }
  } else {
    setStats({ lockState: 'SCANNING' });
  }

  hud.drawReticle();
  hud.drawRadar();

  setStats({ fps: Math.round(fpsSmoothed), motionPts: lastMotionResult.points.length });

  requestAnimationFrame(loop);
}
