// ui.js — wires DOM controls to app callbacks. Kept free of tracking/camera
// logic so main.js can own state and this stays a thin view layer.

export function setupUI(handlers) {
  const $ = (id) => document.getElementById(id);

  $('btnCapture').addEventListener('click', () => handlers.onCapture());
  $('btnUnlock').addEventListener('click', () => handlers.onUnlock());
  $('btnSnap').addEventListener('click', () => handlers.onSnap());

  const flowBtn = $('btnFlow');
  flowBtn.addEventListener('click', () => {
    const on = !flowBtn.classList.contains('on');
    flowBtn.classList.toggle('on', on);
    flowBtn.textContent = `FLOW: ${on ? 'ON' : 'OFF'}`;
    handlers.onFlowToggle(on);
  });

  const radarBtn = $('btnRadar');
  radarBtn.addEventListener('click', () => {
    const on = !radarBtn.classList.contains('on');
    radarBtn.classList.toggle('on', on);
    radarBtn.textContent = `RADAR: ${on ? 'ON' : 'OFF'}`;
    handlers.onRadarToggle(on);
  });

  const modeBtn = $('btnMode');
  const modes = ['LINE', 'GLOW'];
  let modeIdx = 0;
  modeBtn.addEventListener('click', () => {
    modeIdx = (modeIdx + 1) % modes.length;
    modeBtn.textContent = `MODE: ${modes[modeIdx]}`;
    handlers.onModeChange(modes[modeIdx]);
  });

  const compactBtn = $('btnCompact');
  compactBtn.addEventListener('click', () => {
    $('controls').classList.toggle('compact');
  });

  const zoomSlider = $('zoomSlider');
  zoomSlider.addEventListener('input', () => {
    const v = parseFloat(zoomSlider.value);
    $('zoomVal').textContent = v.toFixed(1) + 'x';
    $('statZoom').textContent = v.toFixed(1) + 'x';
    handlers.onZoom(v);
  });

  const threshSlider = $('threshSlider');
  threshSlider.addEventListener('input', () => {
    const v = parseInt(threshSlider.value, 10);
    $('threshVal').textContent = v;
    handlers.onThreshold(v);
  });

  const maxPtsSlider = $('maxPtsSlider');
  maxPtsSlider.addEventListener('input', () => {
    const v = parseInt(maxPtsSlider.value, 10);
    $('maxPtsVal').textContent = v;
    handlers.onMaxPoints(v);
  });

  const lockRadSlider = $('lockRadSlider');
  lockRadSlider.addEventListener('input', () => {
    const v = parseInt(lockRadSlider.value, 10);
    $('lockRadVal').textContent = v;
    handlers.onLockRadius(v);
  });
}

export function setStats({ fps, motionPts, lockState, zoom }) {
  const $ = (id) => document.getElementById(id);
  if (fps != null) $('statFps').textContent = `FPS ${fps}`;
  if (motionPts != null) $('statMotion').textContent = `PTS ${motionPts}`;
  if (lockState != null) $('statLock').textContent = lockState;
  if (zoom != null) $('statZoom').textContent = zoom.toFixed(1) + 'x';
}
