import { PARTS, type PartType } from '../library/definitions'
import type { CircuitDoc } from './document'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0

/**
 * Checks that something read from storage or a file really is a circuit this version understands,
 * so a damaged or foreign save can never break the app. Wires whose part or pin is missing are dropped.
 */
export function parseDoc(raw: unknown): CircuitDoc | null {
  if (!isObj(raw) || raw.version !== 1 || !isObj(raw.parts) || !isObj(raw.wires)) return null
  const doc: CircuitDoc = { version: 1, parts: {}, wires: {} }
  for (const [id, p] of Object.entries(raw.parts)) {
    if (!isObj(p) || p.id !== id || !isStr(p.tag) || !isNum(p.x) || !isNum(p.y)) return null
    if (typeof p.type !== 'string' || !(p.type in PARTS)) return null
    doc.parts[id] = { id, type: p.type as PartType, tag: p.tag, x: p.x, y: p.y }
  }
  const pinOk = (t: unknown): t is { part: string; pin: string } => {
    if (!isObj(t) || !isStr(t.part) || !isStr(t.pin)) return false
    const part = doc.parts[t.part]
    return !!part && t.pin in PARTS[part.type].pins
  }
  for (const [id, w] of Object.entries(raw.wires)) {
    if (!isObj(w) || w.id !== id) return null
    if (!pinOk(w.a) || !pinOk(w.b)) continue
    const via = Array.isArray(w.via) && w.via.every((p) => isObj(p) && isNum(p.x) && isNum(p.y)) ? (w.via as Array<{ x: number; y: number }>).map((p) => ({ x: p.x, y: p.y })) : undefined
    doc.wires[id] = { id, a: { part: w.a.part, pin: w.a.pin }, b: { part: w.b.part, pin: w.b.pin }, ...(via?.length ? { via } : {}) }
  }
  return doc
}
