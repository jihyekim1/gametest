/**
 * Heart where `size` = outer radius (same scale convention as paintStar).
 * Spans roughly ±size in x and y so both shapes have the same bounding circle.
 */
export function paintHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  ctx.fillStyle = color;
  const s = size;
  ctx.beginPath();
  ctx.moveTo(x, y + s);                                             // bottom tip
  ctx.bezierCurveTo(x - s * 0.1, y + s * 0.6, x - s, y + s * 0.4, x - s, y);
  ctx.bezierCurveTo(x - s, y - s * 0.8, x, y - s * 0.6, x, y - s * 0.2);
  ctx.bezierCurveTo(x, y - s * 0.6, x + s, y - s * 0.8, x + s, y);
  ctx.bezierCurveTo(x + s, y + s * 0.4, x + s * 0.1, y + s * 0.6, x, y + s);
  ctx.fill();
}

export function paintStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  ctx.fillStyle = color;
  const spikes = 5;
  const inner = size * 0.4;
  ctx.beginPath();
  for (let i = 0; i < spikes; i++) {
    const outerAngle = (Math.PI * 2 * i) / spikes - Math.PI / 2;
    const innerAngle = outerAngle + Math.PI / spikes;
    if (i === 0) ctx.moveTo(x + Math.cos(outerAngle) * size, y + Math.sin(outerAngle) * size);
    else ctx.lineTo(x + Math.cos(outerAngle) * size, y + Math.sin(outerAngle) * size);
    ctx.lineTo(x + Math.cos(innerAngle) * inner, y + Math.sin(innerAngle) * inner);
  }
  ctx.closePath();
  ctx.fill();
}

/** Returns fraction of canvas pixels that have been painted (alpha > 64) */
export function getCoverage(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) return 0;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let painted = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 64) painted++;
  }
  return painted / (canvas.width * canvas.height);
}
