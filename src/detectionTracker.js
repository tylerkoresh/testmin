// detectionTracker.js — gives the continuous AUTO-SCAN overlay object
// permanence and smoothness. Without this, every detection pass (every
// ~600ms) draws a completely independent set of boxes with no relation to
// the previous pass, which is what made the overlay look "spazzy" — boxes
// snapping to slightly different positions/sizes and confidence jumping
// around on every update.
//
// This layer:
//  - matches new detections to existing tracked objects via box overlap (IoU)
//  - smoothly interpolates box position/size toward the latest match every
//    render frame, instead of snapping instantly
//  - smooths the displayed confidence % so it doesn't flicker
//  - keeps a track alive for a few missed passes (grace period) instead of
//    instantly vanishing if one scan pass happens to miss it — so it holds
//    still until the object actually leaves the frame, as intended

let nextId = 1;

function iou(a, b) {
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;
  const ix1 = Math.max(a.x, b.x), iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = a.w * a.h, areaB = b.w * b.h;
  return inter / (areaA + areaB - inter || 1e-6);
}

export class DetectionTracker {
  constructor({ iouMatchThreshold = 0.25, maxMisses = 3, smoothAlpha = 0.25, confidenceAlpha = 0.3 } = {}) {
    this.iouMatchThreshold = iouMatchThreshold;
    this.maxMisses = maxMisses;
    this.smoothAlpha = smoothAlpha;
    this.confidenceAlpha = confidenceAlpha;
    this.tracks = []; // { id, box (displayed), target (latest matched raw box), label, confidence, missCount }
  }

  reset() {
    this.tracks = [];
  }

  /** Call whenever a new YOLO detection pass finishes. */
  onNewPass(rawDetections) {
    const unmatchedDetIdx = new Set(rawDetections.map((_, i) => i));

    for (const track of this.tracks) {
      let bestIdx = -1, bestIou = this.iouMatchThreshold;
      for (const i of unmatchedDetIdx) {
        const score = iou(track.target, rawDetections[i]);
        if (score > bestIou) { bestIou = score; bestIdx = i; }
      }

      if (bestIdx >= 0) {
        const det = rawDetections[bestIdx];
        track.target = { x: det.x, y: det.y, w: det.w, h: det.h };
        track.label = det.label;
        track.sky = det.sky;
        track.confidence = track.confidence * (1 - this.confidenceAlpha) + det.confidence * this.confidenceAlpha;
        track.missCount = 0;
        unmatchedDetIdx.delete(bestIdx);
      } else {
        track.missCount++;
        // target stays frozen at last known position while missing —
        // this is what keeps the box "holding still" instead of vanishing
        // on a single missed pass.
      }
    }

    this.tracks = this.tracks.filter((t) => t.missCount <= this.maxMisses);

    for (const i of unmatchedDetIdx) {
      const det = rawDetections[i];
      this.tracks.push({
        id: nextId++,
        box: { x: det.x, y: det.y, w: det.w, h: det.h },
        target: { x: det.x, y: det.y, w: det.w, h: det.h },
        label: det.label,
        sky: det.sky,
        confidence: det.confidence,
        missCount: 0
      });
    }
  }

  /** Call every render frame. Returns the smoothed list ready for hud.drawDetections(). */
  tick() {
    const a = this.smoothAlpha;
    for (const t of this.tracks) {
      t.box.x += (t.target.x - t.box.x) * a;
      t.box.y += (t.target.y - t.box.y) * a;
      t.box.w += (t.target.w - t.box.w) * a;
      t.box.h += (t.target.h - t.box.h) * a;
    }
    return this.tracks.map((t) => ({
      label: t.label, confidence: t.confidence, sky: t.sky,
      x: t.box.x, y: t.box.y, w: t.box.w, h: t.box.h,
      stale: t.missCount > 0
    }));
  }
}
