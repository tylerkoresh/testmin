// opticalFlow.js — lightweight patch-based tracking used as a stand-in for
// Lucas-Kanade optical flow. Instead of pulling in the full OpenCV.js WASM
// build (large download, occasionally flaky init on iOS Safari), this takes
// a small grayscale patch around the last known target position and does a
// local SSD (sum of squared differences) search in the next frame within a
// bounded radius. It plays the same role in the tracker: a per-frame
// "where did the target's texture actually go" correction that's independent
// of the coarse motion-blob detector, fed into the Kalman filter as a
// measurement.

export class PatchTracker {
  constructor({ patchSize = 16, searchRadius = 24 } = {}) {
    this.patchSize = patchSize;
    this.searchRadius = searchRadius;
    this.template = null; // Float32Array patchSize*patchSize
  }

  reset() { this.template = null; }

  _extractPatch(gray, w, h, cx, cy) {
    const ps = this.patchSize;
    const half = ps >> 1;
    const patch = new Float32Array(ps * ps);
    let i = 0;
    for (let dy = -half; dy < ps - half; dy++) {
      for (let dx = -half; dx < ps - half; dx++) {
        const x = Math.min(w - 1, Math.max(0, Math.round(cx + dx)));
        const y = Math.min(h - 1, Math.max(0, Math.round(cy + dy)));
        patch[i++] = gray[y * w + x];
      }
    }
    return patch;
  }

  initTemplate(gray, w, h, cx, cy) {
    this.template = this._extractPatch(gray, w, h, cx, cy);
  }

  /**
   * Search a window around (predCx, predCy) in the new grayscale frame for the
   * best match to the stored template. Returns { x, y, score } in same coords,
   * or null if no template set yet. score is normalized SSD (lower = better match).
   */
  track(gray, w, h, predCx, predCy) {
    if (!this.template) return null;

    const ps = this.patchSize;
    const r = this.searchRadius;
    let best = null;
    let bestScore = Infinity;

    // coarse-to-fine-ish: step 2px first pass for speed on mobile CPUs
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        const cx = predCx + dx;
        const cy = predCy + dy;
        if (cx < ps || cy < ps || cx > w - ps || cy > h - ps) continue;

        const candidate = this._extractPatch(gray, w, h, cx, cy);
        let ssd = 0;
        for (let i = 0; i < candidate.length; i++) {
          const diff = candidate[i] - this.template[i];
          ssd += diff * diff;
        }
        if (ssd < bestScore) {
          bestScore = ssd;
          best = { x: cx, y: cy };
        }
      }
    }

    if (!best) return null;

    // refine template gradually (allows slow appearance drift, e.g. angle change)
    const fresh = this._extractPatch(gray, w, h, best.x, best.y);
    for (let i = 0; i < this.template.length; i++) {
      this.template[i] = this.template[i] * 0.85 + fresh[i] * 0.15;
    }

    const normalizedScore = bestScore / (ps * ps * 255 * 255);
    return { x: best.x, y: best.y, score: normalizedScore };
  }
}
