// motion.js — downscaled frame-differencing motion detection with simple
// connected-component blob extraction (no external CV dependency, keeps
// this reliable across iOS Safari without a WASM CV library).

export class MotionDetector {
  constructor({ width = 320, height = 240 } = {}) {
    this.w = width;
    this.h = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    this.prevGray = null; // Uint8ClampedArray
    this.threshold = 8;
    this.minBlobArea = 2;    // in downscaled px
    this.maxPoints = 180;
  }

  setThreshold(t) { this.threshold = t; }
  setMaxPoints(n) { this.maxPoints = n; }

  /**
   * sourceCanvas: full-res canvas holding the current camera frame.
   * Returns { blobs: [{x,y,w,h,area,cx,cy}], points: [{x,y}] } in downscaled coords,
   * plus scaleX/scaleY to convert back to source-canvas coords.
   */
  process(sourceCanvas) {
    this.ctx.drawImage(sourceCanvas, 0, 0, this.w, this.h);
    const frame = this.ctx.getImageData(0, 0, this.w, this.h);
    const data = frame.data;
    const n = this.w * this.h;
    const gray = new Uint8ClampedArray(n);

    for (let i = 0, p = 0; i < n; i++, p += 4) {
      // luminance
      gray[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0;
    }

    let mask = null;
    if (this.prevGray) {
      mask = new Uint8Array(n);
      const thr = this.threshold;
      for (let i = 0; i < n; i++) {
        const d = gray[i] - this.prevGray[i];
        mask[i] = (d > thr || d < -thr) ? 1 : 0;
      }
    }

    this.prevGray = gray;

    if (!mask) {
      return { blobs: [], points: [], scaleX: sourceCanvas.width / this.w, scaleY: sourceCanvas.height / this.h };
    }

    const blobs = this._extractBlobs(mask);
    const points = this._blobsToPoints(blobs);

    return {
      blobs,
      points,
      scaleX: sourceCanvas.width / this.w,
      scaleY: sourceCanvas.height / this.h
    };
  }

  // Simple 4-connectivity flood fill to group motion pixels into blobs.
  _extractBlobs(mask) {
    const w = this.w, h = this.h;
    const visited = new Uint8Array(w * h);
    const blobs = [];
    const stack = new Int32Array(w * h);

    for (let y = 0; y < h; y += 2) {       // step 2 for speed
      for (let x = 0; x < w; x += 2) {
        const idx = y * w + x;
        if (!mask[idx] || visited[idx]) continue;

        let sp = 0;
        stack[sp++] = idx;
        visited[idx] = 1;

        let minX = x, maxX = x, minY = y, maxY = y, count = 0;
        let sumX = 0, sumY = 0;

        while (sp > 0) {
          const cur = stack[--sp];
          const cx = cur % w, cy = (cur / w) | 0;
          count++;
          sumX += cx; sumY += cy;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          const neighbors = [
            [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
          ];
          for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const nIdx = ny * w + nx;
            if (mask[nIdx] && !visited[nIdx]) {
              visited[nIdx] = 1;
              if (sp < stack.length) stack[sp++] = nIdx;
            }
          }
          if (count > 4000) break; // safety cap for huge blobs (e.g. lighting flicker)
        }

        if (count >= this.minBlobArea) {
          blobs.push({
            x: minX, y: minY, w: (maxX - minX) || 1, h: (maxY - minY) || 1,
            area: count, cx: sumX / count, cy: sumY / count
          });
        }
      }
    }

    blobs.sort((a, b) => b.area - a.area);
    return blobs.slice(0, 60);
  }

  _blobsToPoints(blobs) {
    const pts = [];
    for (const b of blobs) {
      pts.push({ x: b.cx, y: b.cy, area: b.area });
      if (pts.length >= this.maxPoints) break;
    }
    return pts;
  }
}
