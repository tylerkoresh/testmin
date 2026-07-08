// camera.js — rear camera access, video element wiring, digital zoom via crop.

export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.zoom = 1.0; // digital zoom multiplier, 1.0 - 3.0
    this.supportsNativeFocusControl = false;
  }

  async start() {
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Fallback: some iPhones reject { exact } / very high ideal res combos
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment' } });
    }

    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();

    // Probe for native focus/exposure capability (iOS Safari: virtually always false)
    const track = stream.getVideoTracks()[0];
    if (track && track.getCapabilities) {
      const caps = track.getCapabilities();
      this.supportsNativeFocusControl = !!(caps.focusMode || caps.exposureMode);
    }

    // Pause camera when tab/app is backgrounded, resume on return (iOS suspends camera anyway)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.video.pause();
      } else {
        this.video.play().catch(() => {});
      }
    });

    return { width: this.video.videoWidth, height: this.video.videoHeight };
  }

  setZoom(z) {
    this.zoom = Math.min(3, Math.max(1, z));
  }

  /**
   * Draws the current video frame into destCtx, cropped/scaled to apply digital zoom.
   */
  drawInto(destCtx, destW, destH) {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return;

    const z = this.zoom;
    const cropW = vw / z;
    const cropH = vh / z;
    const sx = (vw - cropW) / 2;
    const sy = (vh - cropH) / 2;

    destCtx.drawImage(this.video, sx, sy, cropW, cropH, 0, 0, destW, destH);
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
    }
  }
}
