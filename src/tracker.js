// tracker.js — orchestrates the reticle-capture -> lock -> Kalman predict ->
// patch-flow correct -> reacquire-on-loss flow, plus the one-shot YOLO tag.

import { Kalman2D } from './kalman.js';
import { PatchTracker } from './opticalFlow.js';

const LOST_FRAMES_BEFORE_DROP = 45; // ~1.5s at 30fps before giving up entirely

export class Tracker {
  constructor(yoloTagger) {
    this.yolo = yoloTagger;
    this.state = 'idle'; // idle | locked | searching
    this.kalman = null;
    this.patch = new PatchTracker({ patchSize: 16, searchRadius: 26 });
    this.box = null;         // {x,y,w,h} in downscaled motion-space coords
    this.memory = null;      // {avgColor, lastSeenFrame, velocity, boxSize}
    this.label = null;
    this.confidence = 0;
    this.lostFrames = 0;
    this.flowEnabled = true;
    this.lockRadius = 70;    // in downscaled px
  }

  setFlowEnabled(v) { this.flowEnabled = v; }
  setLockRadius(r) { this.lockRadius = r; }

  /**
   * Attempt to lock onto the strongest motion blob near the reticle (frame center).
   * motionResult: output of MotionDetector.process()
   * grayFrame/dims: for initializing the patch template
   */
  capture(motionResult, gray, gw, gh) {
    const cx = gw / 2;
    const cy = gh / 2;

    let candidate = null;
    let bestScore = -1;

    for (const blob of motionResult.blobs) {
      const dx = blob.cx - cx;
      const dy = blob.cy - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > this.lockRadius) continue;

      // score favors larger, closer blobs
      const score = blob.area - dist * 1.5;
      if (score > bestScore) {
        bestScore = score;
        candidate = blob;
      }
    }

    if (!candidate) {
      return { locked: false, reason: 'NO MOTION NEAR RETICLE' };
    }

    this.kalman = new Kalman2D(candidate.cx, candidate.cy);
    this.box = {
      x: candidate.x, y: candidate.y,
      w: Math.max(candidate.w, 6), h: Math.max(candidate.h, 6)
    };
    this.patch.reset();
    this.patch.initTemplate(gray, gw, gh, candidate.cx, candidate.cy);

    this.memory = { velocity: { x: 0, y: 0 }, boxSize: { w: this.box.w, h: this.box.h } };
    this.state = 'locked';
    this.lostFrames = 0;
    this.label = null;
    this.confidence = 0;

    return { locked: true };
  }

  unlock() {
    this.state = 'idle';
    this.kalman = null;
    this.box = null;
    this.memory = null;
    this.patch.reset();
    this.label = null;
  }

  /**
   * Per-frame update while locked. motionResult + gray frame from the same tick.
   */
  update(motionResult, gray, gw, gh) {
    if (this.state === 'idle' || !this.kalman) return null;

    const pred = this.kalman.predict();

    let measured = null;

    // 1) prefer a motion blob near the prediction
    let bestBlob = null, bestDist = Infinity;
    for (const blob of motionResult.blobs) {
      const dx = blob.cx - pred.x, dy = blob.cy - pred.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const searchR = this.state === 'searching' ? this.lockRadius * 1.8 : this.lockRadius;
      if (dist < searchR && dist < bestDist) {
        bestDist = dist;
        bestBlob = blob;
      }
    }
    if (bestBlob) {
      measured = { x: bestBlob.cx, y: bestBlob.cy };
      this.box = { x: bestBlob.x, y: bestBlob.y, w: Math.max(bestBlob.w, 6), h: Math.max(bestBlob.h, 6) };
    }

    // 2) patch-flow correction/backup
    if (this.flowEnabled) {
      const flow = this.patch.track(gray, gw, gh, pred.x, pred.y);
      if (flow && flow.score < 0.15) {
        measured = measured
          ? { x: (measured.x + flow.x) / 2, y: (measured.y + flow.y) / 2 } // blend
          : { x: flow.x, y: flow.y };
      }
    }

    if (measured) {
      const upd = this.kalman.update(measured.x, measured.y);
      this.memory.velocity = { x: upd.vx, y: upd.vy };
      this.lostFrames = 0;
      this.state = 'locked';
    } else {
      this.lostFrames++;
      this.state = 'searching';
      // keep box centered on prediction while searching
      this.box = {
        x: pred.x - this.memory.boxSize.w / 2, y: pred.y - this.memory.boxSize.h / 2,
        w: this.memory.boxSize.w, h: this.memory.boxSize.h
      };
      if (this.lostFrames > LOST_FRAMES_BEFORE_DROP) {
        this.unlock();
        return { dropped: true };
      }
    }

    return {
      state: this.state,
      pos: this.kalman.position,
      box: this.box,
      lostFrames: this.lostFrames
    };
  }

  /**
   * Fire a single YOLO pass on the current lock box (call on CAPTURE, or SNAP).
   * fullResBox / fullResScale: caller converts downscaled box -> source canvas coords.
   */
  async tag(sourceCanvas, fullResBox) {
    if (!this.yolo || !this.yolo.ready) return;
    try {
      const result = await this.yolo.tagRegion(sourceCanvas, fullResBox);
      if (result) {
        this.label = result.label.toUpperCase();
        this.confidence = result.confidence;
        this.sky = result.sky;
      } else {
        this.label = 'UNKNOWN';
        this.confidence = 0;
        this.sky = false;
      }
    } catch (e) {
      this.label = 'TAG ERROR';
      this.confidence = 0;
    }
  }
}
