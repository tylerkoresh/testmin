// yolo.js — loads a YOLOv8n ONNX model once, and runs a SINGLE inference pass
// on demand (on CAPTURE / SNAP), never continuously — matching the original
// app's "runs once, then shuts off" design for battery/perf.
//
// Default model URL points at a public, CORS-enabled YOLOv8n ONNX export
// (COCO-trained, 80 classes) intended for browser demos. Swap MODEL_URL to
// host your own copy if you want full offline reliability from first load.

const MODEL_URL =
  'https://raw.githubusercontent.com/Hyuto/yolov8-onnxruntime-web/master/public/model/yolov8n.onnx';

const INPUT_SIZE = 640;

const COCO_CLASSES = [
  'person','bicycle','car','motorcycle','airplane','bus','train','truck','boat',
  'traffic light','fire hydrant','stop sign','parking meter','bench','bird','cat',
  'dog','horse','sheep','cow','elephant','bear','zebra','giraffe','backpack',
  'umbrella','handbag','tie','suitcase','frisbee','skis','snowboard','sports ball',
  'kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket',
  'bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple',
  'sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake','chair',
  'couch','potted plant','bed','dining table','toilet','tv','laptop','mouse',
  'remote','keyboard','cell phone','microwave','oven','toaster','sink',
  'refrigerator','book','clock','vase','scissors','teddy bear','hair drier',
  'toothbrush'
];

// Labels the SIGINT UI treats as "sky-relevant" and highlights distinctly.
const SKY_CLASSES = new Set(['airplane', 'bird', 'kite']);

export class YoloTagger {
  constructor() {
    this.session = null;
    this.loading = null;
    this.ready = false;
  }

  async load(onStatus = () => {}) {
    if (this.session) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      onStatus('LOADING MODEL…');
      // eslint-disable-next-line no-undef
      ort.env.wasm.numThreads = 1; // conservative default; iOS Safari WASM threading support varies
      // eslint-disable-next-line no-undef
      this.session = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm']
      });
      this.ready = true;
      onStatus('MODEL READY');
    })();

    return this.loading;
  }

  /**
   * Runs one inference pass on a cropped region of a source canvas.
   * box: {x,y,w,h} in source-canvas pixel coords, expanded a bit before calling.
   * Returns { label, confidence, sky } or null if nothing confident found.
   */
  async tagRegion(sourceCanvas, box) {
    if (!this.session) return null;

    const { canvas, scale, padX, padY, cropX, cropY, cropW, cropH } = this._letterboxCrop(sourceCanvas, box);

    const imgData = canvas.getContext('2d').getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
    const input = this._toCHWFloat(imgData);

    // eslint-disable-next-line no-undef
    const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const feeds = { [this.session.inputNames[0]]: tensor };
    const results = await this.session.run(feeds);
    const output = results[this.session.outputNames[0]];

    return this._decodeBest(output, { scale, padX, padY, cropX, cropY, cropW, cropH });
  }

  _letterboxCrop(sourceCanvas, box) {
    // Expand box by 40% margin so YOLO sees context around the locked target.
    const marginX = box.w * 0.4;
    const marginY = box.h * 0.4;
    const cropX = Math.max(0, box.x - marginX);
    const cropY = Math.max(0, box.y - marginY);
    const cropW = Math.min(sourceCanvas.width - cropX, box.w + marginX * 2);
    const cropH = Math.min(sourceCanvas.height - cropY, box.h + marginY * 2);

    const scale = Math.min(INPUT_SIZE / cropW, INPUT_SIZE / cropH);
    const drawW = cropW * scale;
    const drawH = cropH * scale;
    const padX = (INPUT_SIZE - drawW) / 2;
    const padY = (INPUT_SIZE - drawH) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = INPUT_SIZE;
    canvas.height = INPUT_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#727272';
    ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
    ctx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, padX, padY, drawW, drawH);

    return { canvas, scale, padX, padY, cropX, cropY, cropW, cropH };
  }

  _toCHWFloat(imgData) {
    const { data } = imgData;
    const n = INPUT_SIZE * INPUT_SIZE;
    const out = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      out[i] = data[i * 4] / 255;           // R
      out[n + i] = data[i * 4 + 1] / 255;   // G
      out[2 * n + i] = data[i * 4 + 2] / 255; // B
    }
    return out;
  }

  // YOLOv8 ONNX export output shape: [1, 84, 8400]
  // rows 0-3 = cx,cy,w,h (in 640-space), rows 4-83 = class scores.
  // We only need the single best-confidence detection near crop center,
  // since the crop is already framed on the locked target (no full-frame NMS needed).
  _decodeBest(output, geom) {
    const data = output.data;
    const dims = output.dims; // [1, 84, 8400]
    const numAttrs = dims[1];
    const numAnchors = dims[2];
    const numClasses = numAttrs - 4;

    let bestScore = 0.2; // score threshold
    let best = null;

    for (let a = 0; a < numAnchors; a++) {
      let maxCls = -1, maxScore = 0;
      for (let c = 0; c < numClasses; c++) {
        const s = data[(4 + c) * numAnchors + a];
        if (s > maxScore) { maxScore = s; maxCls = c; }
      }
      if (maxScore > bestScore) {
        bestScore = maxScore;
        const cx = data[0 * numAnchors + a];
        const cy = data[1 * numAnchors + a];
        best = { cls: maxCls, score: maxScore, cx, cy };
      }
    }

    if (!best) return null;

    const label = COCO_CLASSES[best.cls] || 'unknown';
    return {
      label,
      confidence: best.score,
      sky: SKY_CLASSES.has(label)
    };
  }
}
