import type { Region, ColorSlot, Pt } from "./types";

export function dist(a: Pt, b: Pt) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function pointInPoly(p: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function tracePoly(c: CanvasRenderingContext2D, pts: Pt[]) {
  c.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]);
  c.closePath();
}

// Paint one region: multiply the color over the photo within the region's
// polygon, clipped OUT of any front paint regions and all occluders so the
// underlying pixels (columns, lamps) show through.
export function paintRegion(
  c: CanvasRenderingContext2D,
  regions: Region[],
  slots: ColorSlot[],
  idx: number,
  W: number,
  H: number
) {
  const rg = regions[idx];
  const slot = slots[idx];
  if (!rg || rg.occ || !slot || !slot.color || rg.pts.length < 3) return;

  c.save();
  c.beginPath();
  tracePoly(c, rg.pts);
  c.clip();

  c.globalCompositeOperation = "multiply";
  c.globalAlpha = slot.strength;
  c.fillStyle = slot.color;
  c.fillRect(0, 0, W, H);

  c.globalCompositeOperation = "source-over";
  c.globalAlpha = slot.strength * 0.12;
  c.fillStyle = slot.color;
  c.fillRect(0, 0, W, H);

  // Punch out anything covered by regions stacked in front, and all
  // occluders, so overlapping surfaces (columns, lamps) show what's on top
  // instead of this region's color bleeding through.
  c.globalCompositeOperation = "destination-out";
  c.globalAlpha = 1;
  for (let f = idx + 1; f < regions.length; f++) {
    if (!regions[f].occ && regions[f].pts.length > 2) {
      c.beginPath();
      tracePoly(c, regions[f].pts);
      c.fill();
    }
  }
  for (const o of regions) {
    if (o.occ && o.pts.length > 2) {
      c.beginPath();
      tracePoly(c, o.pts);
      c.fill();
    }
  }
  c.restore();
}

export function renderScene(
  c: CanvasRenderingContext2D,
  img: HTMLImageElement,
  regions: Region[],
  slots: ColorSlot[],
  W: number,
  H: number
) {
  c.clearRect(0, 0, W, H);
  c.drawImage(img, 0, 0, W, H);
  regions.forEach((_, i) => paintRegion(c, regions, slots, i, W, H));
}

export function emptySlots(regions: Region[]): ColorSlot[] {
  return regions.map(() => ({ color: null, strength: 0.8 }));
}

export const PALETTE = [
  "#e7e2d6", "#c9d4d0", "#8fa39b", "#3f5852", "#d8c3a5", "#b5502e",
  "#e0b04a", "#6a7fa8", "#2f3a4a", "#7c5a4a", "#9a9a92", "#1c1a17",
];
