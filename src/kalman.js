// kalman.js — minimal 2D constant-velocity Kalman filter.
// State: [x, y, vx, vy]. Tuned for ~30fps tracking of a small moving target.

export class Kalman2D {
  constructor(x, y, { processNoise = 2.0, measurementNoise = 4.0 } = {}) {
    // state vector
    this.x = [x, y, 0, 0];

    // state covariance (identity-ish start, moderately uncertain velocity)
    this.P = [
      [10, 0, 0, 0],
      [0, 10, 0, 0],
      [0, 0, 40, 0],
      [0, 0, 0, 40]
    ];

    this.q = processNoise;
    this.r = measurementNoise;
  }

  predict(dt = 1 / 30) {
    const [x, y, vx, vy] = this.x;
    // constant velocity motion model
    this.x = [x + vx * dt, y + vy * dt, vx, vy];

    // F = [[1,0,dt,0],[0,1,0,dt],[0,0,1,0],[0,0,0,1]]
    // P = F P F^T + Q  (expanded manually for a 4x4, dt applied)
    const P = this.P;
    const q = this.q;

    const newP = [
      [P[0][0] + dt * (P[2][0] + P[0][2]) + dt * dt * P[2][2] + q,
       P[0][1] + dt * (P[2][1] + P[0][3]) + dt * dt * P[2][3],
       P[0][2] + dt * P[2][2],
       P[0][3] + dt * P[2][3]],
      [P[1][0] + dt * (P[3][0] + P[1][2]) + dt * dt * P[3][2],
       P[1][1] + dt * (P[3][1] + P[1][3]) + dt * dt * P[3][3] + q,
       P[1][2] + dt * P[3][2],
       P[1][3] + dt * P[3][3]],
      [P[2][0] + dt * P[2][2], P[2][1] + dt * P[2][3], P[2][2] + q * 0.5, P[2][3]],
      [P[3][0] + dt * P[3][2], P[3][1] + dt * P[3][3], P[3][2], P[3][3] + q * 0.5]
    ];
    this.P = newP;

    return { x: this.x[0], y: this.x[1], vx: this.x[2], vy: this.x[3] };
  }

  update(zx, zy) {
    // Measurement model H = [[1,0,0,0],[0,1,0,0]]
    const P = this.P;
    const r = this.r;

    // Innovation covariance S = H P H^T + R  (2x2)
    const S00 = P[0][0] + r;
    const S01 = P[0][1];
    const S10 = P[1][0];
    const S11 = P[1][1] + r;

    const det = S00 * S11 - S01 * S10 || 1e-6;
    const Sinv00 = S11 / det, Sinv01 = -S01 / det, Sinv10 = -S10 / det, Sinv11 = S00 / det;

    // Kalman gain K = P H^T Sinv (4x2)
    const K = [
      [P[0][0] * Sinv00 + P[0][1] * Sinv10, P[0][0] * Sinv01 + P[0][1] * Sinv11],
      [P[1][0] * Sinv00 + P[1][1] * Sinv10, P[1][0] * Sinv01 + P[1][1] * Sinv11],
      [P[2][0] * Sinv00 + P[2][1] * Sinv10, P[2][0] * Sinv01 + P[2][1] * Sinv11],
      [P[3][0] * Sinv00 + P[3][1] * Sinv10, P[3][0] * Sinv01 + P[3][1] * Sinv11]
    ];

    const yInnovX = zx - this.x[0];
    const yInnovY = zy - this.x[1];

    for (let i = 0; i < 4; i++) {
      this.x[i] = this.x[i] + K[i][0] * yInnovX + K[i][1] * yInnovY;
    }

    // P = (I - K H) P
    const newP = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
    for (let i = 0; i < 4; i++) {
      newP[i][0] = P[i][0] - K[i][0] * P[0][0] - K[i][1] * P[1][0];
      newP[i][1] = P[i][1] - K[i][0] * P[0][1] - K[i][1] * P[1][1];
      newP[i][2] = P[i][2] - K[i][0] * P[0][2] - K[i][1] * P[1][2];
      newP[i][3] = P[i][3] - K[i][0] * P[0][3] - K[i][1] * P[1][3];
    }
    this.P = newP;

    return { x: this.x[0], y: this.x[1], vx: this.x[2], vy: this.x[3] };
  }

  get position() { return { x: this.x[0], y: this.x[1] }; }
  get velocity() { return { x: this.x[2], y: this.x[3] }; }
}
