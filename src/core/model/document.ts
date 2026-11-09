import { type Anchor, type Point, type Rect } from '../geometry'
import { PARTS, type PartType } from '../library/definitions'

/**
 * The circuit itself. Everything else (canvas, engine, autosave, export) reads this;
 * nothing but commands changes it. Connections are data, never pixel coincidence:
 * a wire end says "I am on KM1:13", and that is the whole truth about the connection.
 */
export interface CircuitDoc {
  version: 1
  parts: Record<string, Part>
  wires: Record<string, Wire>
}

export interface Part {
  id: string
  type: PartType
  /** Reference designation shown on the sheet (S1, H1, KM1). Contacts share their coil's tag. */
  tag: string
  /** Origin on the sheet, always on the grid. */
  x: number
  y: number
}

/** A wire end sits on a terminal: part id + pin name. */
export interface TerminalRef {
  part: string
  pin: string
}

export interface Wire {
  id: string
  a: TerminalRef
  b: TerminalRef
  /** The corners between a and b, in order. Missing = draw the default shape. */
  via?: Point[]
}

export type Collection = 'parts' | 'wires'

export const emptyDoc = (): CircuitDoc => ({ version: 1, parts: {}, wires: {} })

/** Stable string key for a terminal, used by the engine and for lookups: "partId:pin". */
export const terminalKey = (t: TerminalRef): string => `${t.part}:${t.pin}`
export const sameTerminal = (a: TerminalRef | null | undefined, b: TerminalRef | null | undefined): boolean =>
  !!a && !!b && a.part === b.part && a.pin === b.pin

/** Where a terminal sits on the sheet and which way it faces, or null if the part or pin is gone. */
export function terminalPos(doc: CircuitDoc, t: TerminalRef): Anchor | null {
  const part = doc.parts[t.part]
  if (!part) return null
  const pin = PARTS[part.type].pins[t.pin]
  if (!pin) return null
  return { x: part.x + pin.dx, y: part.y + pin.dy, dir: pin.dir }
}

/** The part's body on the sheet. */
export function partRect(part: Part, margin = 0): Rect {
  const [bx, by, bw, bh] = PARTS[part.type].box
  return { left: part.x + bx - margin, top: part.y + by - margin, right: part.x + bx + bw + margin, bottom: part.y + by + bh + margin }
}

/** Every terminal on the sheet, with its position. */
export function* allTerminals(doc: CircuitDoc): Generator<{ ref: TerminalRef; pos: Anchor; part: Part }> {
  for (const part of Object.values(doc.parts)) {
    for (const [pin, def] of Object.entries(PARTS[part.type].pins)) {
      yield { ref: { part: part.id, pin }, pos: { x: part.x + def.dx, y: part.y + def.dy, dir: def.dir }, part }
    }
  }
}

/** How many wires end on this terminal. */
export function wireCount(doc: CircuitDoc, t: TerminalRef): number {
  let n = 0
  for (const w of Object.values(doc.wires)) {
    if (sameTerminal(w.a, t)) n++
    if (sameTerminal(w.b, t)) n++
  }
  return n
}

/** "S1:4" — how a person names a terminal. */
export function terminalLabel(doc: CircuitDoc, t: TerminalRef): string {
  const part = doc.parts[t.part]
  return part ? `${part.tag}:${t.pin}` : '?'
}

/** The next free tag for a new part: S3 if S1 and S2 exist. */
export function nextTag(doc: CircuitDoc, type: PartType): string {
  const prefix = PARTS[type].prefix
  let n = 0
  for (const p of Object.values(doc.parts)) {
    const m = /^([A-Z]+)(\d+)$/.exec(p.tag)
    if (m && m[1] === prefix) n = Math.max(n, Number(m[2]))
  }
  return prefix + (n + 1)
}

let seq = 0
/** Short unique id with a readable prefix: p_lq3x9a0, w_lq3x9a1. */
export const newId = (prefix: 'p' | 'w'): string => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`
