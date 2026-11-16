// Detection areas as polygons. Pure, so it runs in Node tests too.
//
// The camera stores points on a 0–1000 grid with the origin at the BOTTOM-left
// (positionY grows upwards); the editor works in screen fractions (0–1, Y down).

export const SCALE = 1000;

/** Camera point {x, y} → screen fractions [fx, fy]. */
export const toScreen = ({ x, y }) => [x / SCALE, 1 - y / SCALE];

/** Screen fractions → camera point, rounded and clamped to the grid. */
export function fromScreen(fx, fy) {
  const c = (v) => Math.min(SCALE, Math.max(0, Math.round(v * SCALE)));
  return { x: c(fx), y: c(1 - fy) };
}

/** A new rectangular area covering the middle of the picture. */
export const defaultArea = () => [
  { x: 250, y: 750 },
  { x: 750, y: 750 },
  { x: 750, y: 250 },
  { x: 250, y: 250 },
];

/** Insert a point in the middle of the longest edge (more control over the shape). */
export function addPoint(points) {
  let best = 0;
  let bestLen = -1;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  });
  const p = points[best];
  const q = points[(best + 1) % points.length];
  const mid = { x: Math.round((p.x + q.x) / 2), y: Math.round((p.y + q.y) / 2) };
  return [...points.slice(0, best + 1), mid, ...points.slice(best + 1)];
}

/** Remove a point, keeping at least `min` of them. */
export const removePoint = (points, index, min = 4) =>
  points.length > min ? points.filter((_, i) => i !== index) : points;

/** Shoelace area on the 0–1000 grid; 0 for degenerate shapes. */
export function polygonArea(points) {
  let a = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  });
  return Math.abs(a) / 2;
}

/** Whether two segments properly cross (shared endpoints don't count). */
function crosses(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** A polygon whose edges cross itself (the camera rejects or misreads these). */
export function selfIntersects(points) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing edge
      if (crosses(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}
