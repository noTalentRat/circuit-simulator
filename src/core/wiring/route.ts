import { GRID, inRect, samePoint, simplify, type Anchor, type Point, type Rect } from '../geometry'
import { allTerminals, partRect, sameTerminal, terminalPos, type CircuitDoc, type TerminalRef, type Wire } from '../model/document'
import { BEND_COST, OUTSIDE_COST, PART_CLEARANCE, STUB } from './constants'

/** Which leg comes first from the anchor: vertical or horizontal. */
export type Posture = 'v' | 'h'

const key = (p: Point): string => `${p.x},${p.y}`
const edgeKey = (p: Point, q: Point): string => (p.x < q.x || (p.x === q.x && p.y < q.y) ? `${key(p)}|${key(q)}` : `${key(q)}|${key(p)}`)

/** Every one-grid-step edge along an orthogonal polyline, in order. */
export function unitEdges(pts: readonly Point[]): Array<[Point, Point]> {
  const out: Array<[Point, Point]> = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]!
    const q = pts[i + 1]!
    const sx = Math.sign(q.x - p.x) * GRID
    const sy = Math.sign(q.y - p.y) * GRID
    if (sx && sy) throw new Error('unitEdges: diagonal segment')
    let cur = p
    while (!samePoint(cur, q)) {
      const next = { x: cur.x + sx, y: cur.y + sy }
      out.push([cur, next])
      cur = next
    }
  }
  return out
}

/** Default shape for a wire with no stored corners: leaves each terminal along its axis. */
export function defaultShape(a: Anchor, b: Anchor): Point[] {
  if (a.x === b.x) return [a, b]
  const sa = { x: a.x, y: a.y + a.dir * STUB }
  const sb = { x: b.x, y: b.y + b.dir * STUB }
  if (a.dir !== 0 && a.dir === b.dir) {
    const y = a.dir > 0 ? Math.max(sa.y, sb.y) : Math.min(sa.y, sb.y)
    return [a, { x: a.x, y }, { x: b.x, y }, b]
  }
  const facing = (a.dir >= 0 && b.dir <= 0 && sa.y <= sb.y) || (a.dir <= 0 && b.dir >= 0 && sa.y >= sb.y)
  if (facing) {
    const m = Math.round((sa.y + sb.y) / 2 / GRID) * GRID
    return [a, { x: a.x, y: m }, { x: b.x, y: m }, b]
  }
  const mx = Math.round((a.x + b.x) / 2 / GRID) * GRID
  return [a, sa, { x: mx, y: sa.y }, { x: mx, y: sb.y }, sb, b]
}

/** A wire's full path on the sheet, or null if one of its terminals is gone. */
export function wirePath(doc: CircuitDoc, w: Wire): Point[] | null {
  const a = terminalPos(doc, w.a)
  const b = terminalPos(doc, w.b)
  if (!a || !b) return null
  return simplify(w.via?.length ? [a, ...w.via, b] : defaultShape(a, b))
}

/**
 * Everything a new wire has to keep clear of, for one wire run.
 * `ends` are the terminals the run connects (start, and landing if any): their own pins are fine to touch,
 * and the first grid step of another wire on the same terminal is shared ground (both must leave along the axis).
 */
export interface Obstacles {
  bodies: Rect[]
  /** Padded bodies the router's grid search avoids. */
  padded: Rect[]
  /** Terminals the run must not pass over. */
  foreignPins: Point[]
  /** Unit edges of existing wires: a new wire never runs along them (crossing at a right angle is fine). */
  wireEdges: Set<string>
  /** Grid points on existing wires: a new wire never turns a corner on one, which would look like a junction. */
  wirePoints: Set<string>
}

export function obstacles(doc: CircuitDoc, ends: readonly TerminalRef[], ignoreWire?: string): Obstacles {
  const bodies: Rect[] = []
  const padded: Rect[] = []
  for (const part of Object.values(doc.parts)) {
    bodies.push(partRect(part))
    padded.push(partRect(part, PART_CLEARANCE))
  }
  const foreignPins: Point[] = []
  for (const t of allTerminals(doc)) if (!ends.some((e) => sameTerminal(e, t.ref))) foreignPins.push(t.pos)

  const wireEdges = new Set<string>()
  const wirePoints = new Set<string>()
  for (const w of Object.values(doc.wires)) {
    if (w.id === ignoreWire) continue
    const pts = wirePath(doc, w)
    if (!pts) continue
    const edges = unitEdges(pts)
    const sharesA = ends.some((e) => sameTerminal(e, w.a))
    const sharesB = ends.some((e) => sameTerminal(e, w.b))
    edges.forEach(([p, q], i) => {
      const sharedStub = (i === 0 && sharesA) || (i === edges.length - 1 && sharesB)
      if (sharedStub) return
      wireEdges.add(edgeKey(p, q))
    })
    for (const [p, q] of edges) {
      wirePoints.add(key(p))
      wirePoints.add(key(q))
    }
    // The shared stub's points stay free too, so the new wire can turn at the end of the shared step.
    if (sharesA && edges[0]) wirePoints.delete(key(edges[0][1]))
    if (sharesB && edges.length) wirePoints.delete(key(edges[edges.length - 1]![0]))
    // A wire's own terminal ends are not "on the wire" for corner purposes; terminals are handled separately.
    if (pts[0]) wirePoints.delete(key(pts[0]))
    if (pts.length) wirePoints.delete(key(pts[pts.length - 1]!))
  }
  return { bodies, padded, foreignPins, wireEdges, wirePoints }
}

/**
 * Is this path not allowed? It is blocked if it runs through a part's body, passes over a terminal it doesn't connect to,
 * runs along an existing wire, or turns a corner on one.
 */
export function pathBlocked(obs: Obstacles, pts: readonly Point[]): boolean {
  const path = simplify(pts)
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i]!
    const q = path[i + 1]!
    const x1 = Math.min(p.x, q.x)
    const x2 = Math.max(p.x, q.x)
    const y1 = Math.min(p.y, q.y)
    const y2 = Math.max(p.y, q.y)
    for (const r of obs.bodies) {
      const through =
        x1 === x2
          ? x1 > r.left && x1 < r.right && Math.max(y1, r.top) < Math.min(y2, r.bottom)
          : y1 > r.top && y1 < r.bottom && Math.max(x1, r.left) < Math.min(x2, r.right)
      if (through) return true
    }
    for (const t of obs.foreignPins) if (t.x >= x1 && t.x <= x2 && t.y >= y1 && t.y <= y2) return true
  }
  for (const [p, q] of unitEdges(path)) if (obs.wireEdges.has(edgeKey(p, q))) return true
  for (let i = 1; i < path.length - 1; i++) if (obs.wirePoints.has(key(path[i]!))) return true
  return false
}

/** From anchor A toward point C, posture deciding which leg comes first. A terminal is always left along its axis. */
export function tailTo(A: Anchor, C: Point, posture: Posture): Point[] {
  if (A.dir) {
    const back = (C.y - A.y) * A.dir < STUB
    if (posture === 'h' || back) {
      const S = { x: A.x, y: A.y + A.dir * STUB }
      return [S, { x: C.x, y: S.y }, C]
    }
  }
  return posture === 'h' ? [{ x: C.x, y: A.y }, C] : [{ x: A.x, y: C.y }, C]
}

/** Into terminal T: the last grid step is always straight along T's axis. */
export function tailToTerminal(A: Anchor, T: Anchor, posture: Posture): Point[] {
  const Ts = { x: T.x, y: T.y + T.dir * STUB }
  const fromFacingSide = (A.y - T.y) * T.dir >= STUB
  return [...tailTo(A, Ts, fromFacingSide ? posture : 'v'), { x: T.x, y: T.y }]
}

type Axis = 'h' | 'v'
interface Node {
  x: number
  y: number
  ax: Axis | null
  g: number
  f: number
  prev: Node | null
}

/**
 * Grid search for an orthogonal path from A to the goal that keeps clear of every obstacle, paying for each bend.
 * It aims at the goal itself: when the goal is a terminal, the last step must enter along the terminal's axis,
 * so the entry is short and straight, with no overshoot past it.
 */
export function gridSearch(obs: Obstacles, A: Anchor, goal: Anchor, maxNodes = 20000): Point[] | null {
  const pad = 320
  const minX = Math.min(A.x, goal.x) - pad
  const maxX = Math.max(A.x, goal.x) + pad
  const minY = Math.min(A.y, goal.y) - pad
  const maxY = Math.max(A.y, goal.y) + pad
  const isA = (x: number, y: number) => x === A.x && y === A.y
  const isGoal = (x: number, y: number) => x === goal.x && y === goal.y
  const free = (x: number, y: number) => isA(x, y) || isGoal(x, y) || !obs.padded.some((r) => inRect({ x, y }, r))
  const h = (x: number, y: number) => (Math.abs(x - goal.x) + Math.abs(y - goal.y)) / GRID
  // Prefer staying between the two ends: a step outside the box spanned by A and the goal's stub costs extra,
  // so a detour doesn't wander past the target and come back (the "overshoot" in case W12).
  const goalStub = { x: goal.x, y: goal.y + goal.dir * STUB }
  const span = {
    left: Math.min(A.x, goalStub.x),
    right: Math.max(A.x, goalStub.x),
    top: Math.min(A.y, goalStub.y, goal.y),
    bottom: Math.max(A.y, goalStub.y, goal.y),
  }

  const heap: Node[] = []
  const push = (n: Node) => {
    heap.push(n)
    let i = heap.length - 1
    while (i > 0) {
      const j = (i - 1) >> 1
      if (heap[j]!.f <= heap[i]!.f) break
      ;[heap[i], heap[j]] = [heap[j]!, heap[i]!]
      i = j
    }
  }
  const pop = (): Node => {
    const top = heap[0]!
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l]!.f < heap[m]!.f) m = l
        if (r < heap.length && heap[r]!.f < heap[m]!.f) m = r
        if (m === i) break
        ;[heap[i], heap[m]] = [heap[m]!, heap[i]!]
        i = m
      }
    }
    return top
  }

  const steps: Array<[number, number, Axis]> = [
    [GRID, 0, 'h'],
    [-GRID, 0, 'h'],
    [0, GRID, 'v'],
    [0, -GRID, 'v'],
  ]
  const best = new Map<string, number>()
  push({ x: A.x, y: A.y, ax: null, g: 0, f: h(A.x, A.y), prev: null })
  let visited = 0
  while (heap.length && visited++ < maxNodes) {
    const cur = pop()
    const k = `${cur.x},${cur.y},${cur.ax}`
    if ((best.get(k) ?? Infinity) <= cur.g) continue
    best.set(k, cur.g)
    if (isGoal(cur.x, cur.y)) {
      const pts: Point[] = []
      for (let n: Node | null = cur; n; n = n.prev) pts.push({ x: n.x, y: n.y })
      return simplify(pts.reverse())
    }
    const atA = isA(cur.x, cur.y)
    for (const [dx, dy, ax] of steps) {
      // Leave a terminal only along its axis, outward.
      if (atA && A.dir !== 0 && !(dx === 0 && Math.sign(dy) === A.dir)) continue
      const x = cur.x + dx
      const y = cur.y + dy
      if (x < minX || x > maxX || y < minY || y > maxY || !free(x, y)) continue
      // Enter a terminal only along its axis, from the side it faces.
      if (isGoal(x, y) && goal.dir !== 0 && !(dx === 0 && Math.sign(dy) === -goal.dir)) continue
      if (obs.wireEdges.has(edgeKey(cur, { x, y }))) continue
      const bend = cur.ax !== null && ax !== cur.ax
      if (bend && obs.wirePoints.has(key(cur))) continue
      const outside = inRect({ x, y }, span) ? 0 : OUTSIDE_COST
      const g = cur.g + 1 + (bend ? BEND_COST : 0) + outside
      push({ x, y, ax, g, f: g + h(x, y), prev: cur })
    }
  }
  return null
}

/**
 * The tail of a wire run from anchor A (everything after A): the simple shape when it is clear,
 * the flipped shape if that is clear, a grid-search detour otherwise.
 * `target` is the landing terminal when the run has one, or the cursor point when it doesn't.
 */
export function smartTail(obs: Obstacles, A: Anchor, target: { terminal: Anchor } | { point: Point }, posture: Posture): Point[] {
  const make = (p: Posture) => ('terminal' in target ? tailToTerminal(A, target.terminal, p) : tailTo(A, target.point, p))
  const first = make(posture)
  if (!pathBlocked(obs, [A, ...first])) return first
  const flipped = make(posture === 'h' ? 'v' : 'h')
  if (!pathBlocked(obs, [A, ...flipped])) return flipped
  const goal: Anchor = 'terminal' in target ? target.terminal : { ...target.point, dir: 0 }
  const found = gridSearch(obs, A, goal)
  return found ? found.slice(1) : first
}

