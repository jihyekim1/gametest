import type { Landmark } from '@/types';

// Upper-body key landmarks for pose comparison
const KEY = [11, 12, 13, 14, 15, 16, 23, 24]; // shoulders, elbows, wrists, hips

// Skeleton connections for drawing (pairs of landmark indices)
export const SKELETON_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

/**
 * Normalize pose relative to hip midpoint and shoulder width.
 * flipX: flip x-axis for mirror comparison (P2's left = P1's right).
 */
export function normalizePose(landmarks: Landmark[], flipX = false): number[] {
  const lHip = landmarks[23], rHip = landmarks[24];
  const lShoulder = landmarks[11], rShoulder = landmarks[12];

  const cx = (lHip.x + rHip.x) / 2;
  const cy = (lHip.y + rHip.y) / 2;
  const scale = Math.hypot(rShoulder.x - lShoulder.x, rShoulder.y - lShoulder.y) || 0.1;

  return KEY.flatMap((idx) => {
    const lm = landmarks[idx];
    const nx = ((lm.x - cx) / scale) * (flipX ? -1 : 1);
    const ny = (lm.y - cy) / scale;
    return [nx, ny];
  });
}

/**
 * Compute similarity (0–100) between two normalized pose vectors.
 * Smaller average landmark distance → higher similarity.
 */
export function computeSimilarity(norm1: number[], norm2: number[]): number {
  const n = norm1.length / 2;
  let sumDist = 0;
  for (let i = 0; i < norm1.length; i += 2) {
    sumDist += Math.hypot(norm1[i] - norm2[i], norm1[i + 1] - norm2[i + 1]);
  }
  const avgDist = sumDist / n;
  return Math.max(0, Math.min(100, Math.round(100 - avgDist * 55)));
}

/** Draw one person's skeleton on canvas. landmarks in normalized [0,1] coords. */
export function drawPersonSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number,
  color: string,
  mirrorX = true,
): void {
  const px = (lm: Landmark) => (mirrorX ? 1 - lm.x : lm.x) * w;
  const py = (lm: Landmark) => lm.y * h;

  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';

  SKELETON_CONNECTIONS.forEach(([a, b]) => {
    const la = landmarks[a], lb = landmarks[b];
    if (!la || !lb) return;
    if ((la.visibility ?? 1) < 0.4 || (lb.visibility ?? 1) < 0.4) return;
    ctx.beginPath();
    ctx.moveTo(px(la), py(la));
    ctx.lineTo(px(lb), py(lb));
    ctx.stroke();
  });

  // Joints
  [11, 12, 13, 14, 15, 16, 23, 24].forEach((idx) => {
    const lm = landmarks[idx];
    if (!lm || (lm.visibility ?? 1) < 0.4) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px(lm), py(lm), 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}
