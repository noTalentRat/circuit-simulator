import {
  GRID,
  WiringSession,
  allTerminals,
  partRect,
  sameTerminal,
  terminalPos,
  unitEdges,
  wirePath,
  type CircuitDoc,
  type Part,
  type PartType,
  type Point,
  type TerminalRef,
  type Wire,
} from '../../src/core'

/** Build a sheet from a short list: parts by tag, wires as "S1:4 H1:X1". */
export function sheet(parts: Array<[tag: string, type: PartType, x: number, y: number]>, wires: string[] = []): CircuitDoc {
  const doc: CircuitDoc = { version: 1, parts: {}, wires: {} }
  for (const [tag, type, x, y] of parts) {
    const id = tag.toLowerCase()
    doc.parts[id] = { id, type, tag, x, y } satisfies Part
  }
  wires.forEach((spec, i) => {
    const [a, b] = spec.split(' ').map(ref)
    const id = `w${i + 1}`
    doc.wires[id] = { id, a: a!, b: b! } satisfies Wire
  })
  return doc
}

/** "S1:4" → { part: 's1', pin: '4' } */
export const ref = (s: string): TerminalRef => {
  const [tag, pin] = s.split(':')
  return { part: tag!.toLowerCase(), pin: pin! }
}

export const pos = (doc: CircuitDoc, s: string): Point => {
  const p = terminalPos(doc, ref(s))
  if (!p) throw new Error(`No terminal ${s}`)
  return { x: p.x, y: p.y }
}

/** Label of a terminal ref, or null: "S1:4". */
export const label = (doc: CircuitDoc, t: TerminalRef | null | undefined): string | null =>
  t ? `${doc.parts[t.part]?.tag}:${t.pin}` : null

export interface GestureLog {
  session: WiringSession
  /** Attached terminal after every pointer event, as labels. */
  attachedTrace: Array<string | null>
  /** Candidate after every pointer event, as labels. */
  candidateTrace: Array<string | null>
}

/**
 * Press a terminal and move the pointer through waypoints, like a hand would:
 * small steps (about 4 px) every 8 ms, so movement direction is real.
 */
export function gesture(doc: CircuitDoc, from: string, waypoints: Point[], opts: { zoom?: number; stepPx?: number; stepMs?: number } = {}): GestureLog {
  const stepPx = opts.stepPx ?? 4
  const stepMs = opts.stepMs ?? 8
  const start = pos(doc, from)
  let t = 0
  const session = new WiringSession(doc, ref(from), start, t, opts.zoom ?? 1)
  const attachedTrace: Array<string | null> = []
  const candidateTrace: Array<string | null> = []
  let cur = start
  for (const wp of waypoints) {
    const d = Math.hypot(wp.x - cur.x, wp.y - cur.y)
    const n = Math.max(1, Math.round(d / stepPx))
    for (let i = 1; i <= n; i++) {
      const p = { x: cur.x + ((wp.x - cur.x) * i) / n, y: cur.y + ((wp.y - cur.y) * i) / n }
      t += stepMs
      session.move(p, t)
      attachedTrace.push(label(doc, session.attached))
      candidateTrace.push(label(doc, session.candidate?.terminal))
    }
    cur = wp
  }
  return { session, attachedTrace, candidateTrace }
}

/** Time of the last event in a gesture, to continue it. */
export const nextTime = (log: GestureLog): number => log.attachedTrace.length * 8 + 8

// ---------- independent path checks (written separately from the router, so the router can't grade itself) ----------

/** Parts whose body a path runs through (touching the outline is fine). */
export function bodiesCrossed(doc: CircuitDoc, path: Point[]): string[] {
  const hit = new Set<string>()
  for (const [p, q] of unitEdges(path)) {
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
    for (const part of Object.values(doc.parts)) {
      const r = partRect(part)
      if (mid.x > r.left && mid.x < r.right && mid.y > r.top && mid.y < r.bottom) hit.add(part.tag)
    }
  }
  return [...hit]
}

/** Terminals the path passes over or touches, other than the ones it connects. */
export function foreignTerminalsTouched(doc: CircuitDoc, path: Point[], ends: TerminalRef[]): string[] {
  const out: string[] = []
  const onPath = (pt: Point) =>
    path.slice(0, -1).some((p, i) => {
      const q = path[i + 1]!
      return pt.x >= Math.min(p.x, q.x) && pt.x <= Math.max(p.x, q.x) && pt.y >= Math.min(p.y, q.y) && pt.y <= Math.max(p.y, q.y)
    })
  for (const t of allTerminals(doc)) {
    if (ends.some((e) => sameTerminal(e, t.ref))) continue
    if (onPath(t.pos)) out.push(`${t.part.tag}:${t.ref.pin}`)
  }
  return out
}

const ek = (p: Point, q: Point) => [`${p.x},${p.y}`, `${q.x},${q.y}`].sort().join('|')

/**
 * Grid steps a path shares with existing wires (running along them), ignoring the first step out of a terminal
 * that both wires leave from — two wires on one terminal must both leave along its axis.
 */
export function sharedSteps(doc: CircuitDoc, path: Point[], ends: TerminalRef[]): number {
  const newEdges = unitEdges(path).map(([p, q]) => ek(p, q))
  let shared = 0
  for (const w of Object.values(doc.wires)) {
    const pts = wirePath(doc, w)
    if (!pts) continue
    const edges = unitEdges(pts)
    edges.forEach(([p, q], i) => {
      const atSharedTerminal = (i === 0 && ends.some((e) => sameTerminal(e, w.a))) || (i === edges.length - 1 && ends.some((e) => sameTerminal(e, w.b)))
      if (!atSharedTerminal && newEdges.includes(ek(p, q))) shared++
    })
  }
  return shared
}

/** Is every leg horizontal or vertical, on the grid? */
export function orthogonalOnGrid(path: Point[]): boolean {
  return path.every((p, i) => {
    const q = path[i + 1]
    const onGrid = p.x % GRID === 0 && p.y % GRID === 0
    return onGrid && (!q || p.x === q.x || p.y === q.y)
  })
}
