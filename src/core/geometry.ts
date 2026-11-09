/** World coordinates. One grid step is GRID units; at zoom 1, one unit is one screen pixel. */
export interface Point {
  x: number
  y: number
}

/**
 * Which way a terminal faces: -1 = up (wire leaves upward), 1 = down, 0 = no axis (a free point or corner).
 * Only vertical terminals exist for now; IEC control schematics run top (supply) to bottom (neutral).
 */
export type Facing = -1 | 0 | 1

/** A point that a wire leaves from or enters along an axis. */
export interface Anchor extends Point {
  dir: Facing
}

export const GRID = 20

export const snap = (v: number): number => Math.round(v / GRID) * GRID
export const snapPoint = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) })
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)
export const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y

/** Axis-aligned rectangle in world units. */
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export const inRect = (p: Point, r: Rect, margin = 0): boolean =>
  p.x >= r.left - margin && p.x <= r.right + margin && p.y >= r.top - margin && p.y <= r.bottom + margin

/** Shortest distance from p to the segment a–b. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Drops repeated points and the middle point of any three in a straight line. */
export function simplify(pts: readonly Point[]): Point[] {
  const unique: Point[] = []
  for (const p of pts) {
    const last = unique[unique.length - 1]
    if (!last || !samePoint(last, p)) unique.push({ x: p.x, y: p.y })
  }
  const out: Point[] = []
  for (let i = 0; i < unique.length; i++) {
    const prev = out[out.length - 1]
    const q = unique[i]!
    const next = unique[i + 1]
    if (prev && next && ((prev.x === q.x && q.x === next.x) || (prev.y === q.y && q.y === next.y))) continue
    out.push(q)
  }
  return out
}

/** SVG path data for a polyline. */
export const pathData = (pts: readonly Point[]): string =>
  'M' + simplify(pts).map((p) => `${p.x} ${p.y}`).join(' L ')
