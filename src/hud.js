// hud.js — draws all overlay graphics onto the transparent hud canvas.

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.radarAngle = 0;
    this.radarOn = true;
    this.mode = 'LINE'; // LINE | GLOW
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawReticle() {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    const cx = w / 2, cy = h / 2;
    const size = Math.min(w, h) * 0.09;

    ctx.save();
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.9;

    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - size * 1.6, cy); ctx.lineTo(cx - size * 0.5, cy);
    ctx.moveTo(cx + size * 0.5, cy); ctx.lineTo(cx + size * 1.6, cy);
    ctx.moveTo(cx, cy - size * 1.6); ctx.lineTo(cx, cy - size * 0.5);
    ctx.moveTo(cx, cy + size * 0.5); ctx.lineTo(cx, cy + size * 1.6);
    ctx.stroke();
    ctx.restore();
  }

  drawRadar() {
    if (!this.radarOn) return;
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    const cx = w * 0.16, cy = h * 0.86;
    const r = Math.min(w, h) * 0.11;

    ctx.save();
    ctx.strokeStyle = 'rgba(0,255,65,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.33, 0, Math.PI * 2); ctx.stroke();

    // sweep wedge
    this.radarAngle += 0.06;
    const grad = ctx.createConicGradient
      ? ctx.createConicGradient(this.radarAngle, cx, cy)
      : null;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, this.radarAngle, this.radarAngle + 0.6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,255,65,0.25)';
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  drawTarget({ box, label, confidence, sky, state, scaleX, scaleY, offX = 0, offY = 0 }) {
    if (!box) return;
    const ctx = this.ctx;
    const x = box.x * scaleX + offX;
    const y = box.y * scaleY + offY;
    const w = box.w * scaleX;
    const h = box.h * scaleY;

    const color = state === 'searching' ? '#ff9d00' : (sky ? '#00ffe1' : '#00ff41');

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = state === 'searching' ? 0.55 : 0.95;

    if (this.mode === 'GLOW') {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }

    const pad = Math.max(w, h) * 0.6 + 14;
    const bx = x - pad / 2, by = y - pad / 2, bw = pad, bh = pad;

    // corner-bracket box, sci-fi style rather than a plain rect
    const c = 10;
    ctx.beginPath();
    ctx.moveTo(bx, by + c); ctx.lineTo(bx, by); ctx.lineTo(bx + c, by);
    ctx.moveTo(bx + bw - c, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + c);
    ctx.moveTo(bx + bw, by + bh - c); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw - c, by + bh);
    ctx.moveTo(bx + c, by + bh); ctx.lineTo(bx, by + bh); ctx.lineTo(bx, by + bh - c);
    ctx.stroke();

    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.fillStyle = color;
    ctx.textBaseline = 'bottom';
    const text = label
      ? `${label}${confidence ? ' ' + Math.round(confidence * 100) + '%' : ''}`
      : (state === 'searching' ? 'REACQUIRING…' : 'TRACKING');
    ctx.fillText(text, bx, by - 4);

    ctx.restore();
  }

  drawInspector(sourceCanvas, box, scaleX, scaleY) {
    if (!box) return;
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    const pipW = w * 0.26, pipH = pipW;
    const px = w - pipW - 12, py = 12;

    const sx = box.x * scaleX, sy = box.y * scaleY;
    const sw = Math.max(box.w * scaleX, 20), sh = Math.max(box.h * scaleY, 20);
    const margin = Math.max(sw, sh) * 0.7;

    ctx.save();
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(0,10,3,0.6)';
    ctx.fillRect(px - 2, py - 2, pipW + 4, pipH + 4);

    try {
      ctx.drawImage(
        sourceCanvas,
        Math.max(0, sx - margin), Math.max(0, sy - margin), sw + margin * 2, sh + margin * 2,
        px, py, pipW, pipH
      );
    } catch (e) { /* crop out of bounds edge case, skip frame */ }

    ctx.strokeRect(px, py, pipW, pipH);
    ctx.font = '9px "Share Tech Mono", monospace';
    ctx.fillStyle = '#00ff41';
    ctx.fillText('TARGET INSPECTOR', px, py - 4);
    ctx.restore();
  }

  drawMotionPoints(points, scaleX, scaleY) {
    // Sparkle-style render: soft glowing dabs instead of flat squares,
    // sized a little by how big the underlying motion blob was.
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of points) {
      const x = p.x * scaleX, y = p.y * scaleY;
      const r = 2 + Math.min(6, Math.sqrt(p.area || 1) * 0.6);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(120,255,180,0.9)');
      grad.addColorStop(0.4, 'rgba(0,255,65,0.55)');
      grad.addColorStop(1, 'rgba(0,255,65,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Continuous multi-object detection overlay — a blue box + label/confidence
   * per detected object, drawn every frame from the latest full-frame YOLO pass.
   */
  drawDetections(detections, scaleX, scaleY) {
    if (!detections || !detections.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '10px "Share Tech Mono", monospace';

    for (const d of detections) {
      const x = d.x * scaleX, y = d.y * scaleY;
      const w = d.w * scaleX, h = d.h * scaleY;
      const color = d.sky ? '#00ffe1' : '#39c1ff';

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3;
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(x, y, w, h);

      const text = `${d.label.toUpperCase()} ${Math.round(d.confidence * 100)}%`;
      const textW = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(0,10,15,0.65)';
      ctx.fillRect(x, y - 13, textW + 6, 13);
      ctx.fillStyle = color;
      ctx.textBaseline = 'bottom';
      ctx.fillText(text, x + 3, y);
    }
    ctx.restore();
  }
}
