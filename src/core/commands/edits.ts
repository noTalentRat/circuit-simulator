import { snap, type Point } from '../geometry'
import { PARTS, type PartType } from '../library/definitions'
import { newId, nextTag, sameTerminal, type CircuitDoc, type Part, type TerminalRef, type Wire } from '../model/document'
import { reroute } from '../wiring/reroute'
import type { Change } from './history'

/**
 * Builders that turn an intention ("add a lamp here") into the list of changes a History commits.
 * They only read the document; History.commit is what changes it.
 */

export function addPart(doc: CircuitDoc, type: PartType, x: number, y: number, tag?: string): { changes: Change[]; part: Part } {
  const part: Part = { id: newId('p'), type, tag: tag ?? defaultTag(doc, type), x: snap(x), y: snap(y) }
  return { part, changes: [{ coll: 'parts', id: part.id, before: null, after: part }] }
}

/**
 * The tag a new part gets. A contactor contact joins the newest contactor already on the sheet
 * (that link is what makes the coil move it); everything else takes the next free number.
 */
function defaultTag(doc: CircuitDoc, type: PartType): string {
  if (isDeviceContact(type)) {
    const coils = Object.values(doc.parts).filter((p) => p.type === 'KM_COIL')
    const last = coils[coils.length - 1]
    if (last) return last.tag
  }
  return nextTag(doc, type)
}

const isDeviceContact = (type: PartType): boolean => PARTS[type].elements.some((e) => e.kind === 'contact' && e.actuator === 'device')
const isContactorPart = (type: PartType): boolean => type === 'KM_COIL' || isDeviceContact(type)

/** Deleting a part also deletes the wires on it, in the same undo step. */
export function deletePart(doc: CircuitDoc, id: string): Change[] {
  return deleteSelection(doc, [id], [])
}

/** Delete parts (with their wires) and wires, as one undo step. */
export function deleteSelection(doc: CircuitDoc, partIds: readonly string[], wireIds: readonly string[]): Change[] {
  const changes: Change[] = []
  const gone = new Set<string>()
  for (const id of partIds) {
    const part = doc.parts[id]
    if (part) changes.push({ coll: 'parts', id, before: part, after: null })
  }
  const parts = new Set(partIds)
  for (const w of Object.values(doc.wires)) {
    if ((parts.has(w.a.part) || parts.has(w.b.part) || wireIds.includes(w.id)) && !gone.has(w.id)) {
      gone.add(w.id)
      changes.push({ coll: 'wires', id: w.id, before: w, after: null })
    }
  }
  return changes
}

export function movePart(doc: CircuitDoc, id: string, x: number, y: number): Change[] {
  const part = doc.parts[id]
  if (!part) return []
  return moveParts(doc, [id], x - part.x, y - part.y)
}

/**
 * Move parts by a grid-snapped offset, and keep their wires connected:
 * a wire between two moved parts shifts with them, keeping its shape;
 * a wire with one moved end is rerouted, so it never runs through a part or along another wire.
 */
export function moveParts(doc: CircuitDoc, ids: readonly string[], dx: number, dy: number): Change[] {
  const sx = snap(dx)
  const sy = snap(dy)
  const moving = new Set(ids.filter((id) => doc.parts[id]))
  if ((sx === 0 && sy === 0) || moving.size === 0) return []

  const work = structuredClone(doc)
  for (const id of moving) {
    const p = work.parts[id]!
    p.x += sx
    p.y += sy
  }
  const touched: string[] = []
  const followers: string[] = []
  for (const w of Object.values(work.wires)) {
    const a = moving.has(w.a.part)
    const b = moving.has(w.b.part)
    if (a && b) {
      if (w.via) w.via = w.via.map((p) => ({ x: p.x + sx, y: p.y + sy }))
      touched.push(w.id)
    } else if (a || b) followers.push(w.id)
  }
  // Their old corners no longer reach the moved terminals: drop them first, so no wire is ever read
  // with a diagonal leg; then reroute one at a time, each keeping clear of the ones already placed.
  for (const id of followers) delete work.wires[id]!.via
  const pending = new Set(followers)
  for (const id of followers) {
    pending.delete(id)
    const w = work.wires[id]!
    const via = reroute(work, w, pending)
    if (via && via.length) w.via = via
    else delete w.via
    touched.push(id)
  }

  const changes: Change[] = []
  for (const id of moving) changes.push({ coll: 'parts', id, before: doc.parts[id]!, after: work.parts[id]! })
  for (const id of touched) changes.push({ coll: 'wires', id, before: doc.wires[id]!, after: work.wires[id]! })
  return changes
}

/** A wire between two terminals. Returns no changes for a duplicate or a wire from a terminal to itself. */
export function addWire(doc: CircuitDoc, a: TerminalRef, b: TerminalRef, via?: Wire['via']): { changes: Change[]; wire: Wire | null } {
  if (sameTerminal(a, b)) return { changes: [], wire: null }
  const dup = Object.values(doc.wires).some((w) => (sameTerminal(w.a, a) && sameTerminal(w.b, b)) || (sameTerminal(w.a, b) && sameTerminal(w.b, a)))
  if (dup) return { changes: [], wire: null }
  const wire: Wire = { id: newId('w'), a: { ...a }, b: { ...b }, ...(via && via.length ? { via: via.map((p) => ({ x: p.x, y: p.y })) } : {}) }
  return { wire, changes: [{ coll: 'wires', id: wire.id, before: null, after: wire }] }
}

export function deleteWire(doc: CircuitDoc, id: string): Change[] {
  const wire = doc.wires[id]
  return wire ? [{ coll: 'wires', id, before: wire, after: null }] : []
}

/**
 * Move one end of a wire to another terminal (dragging a wire end), as one undo step.
 * Refused (no changes) if it would duplicate a wire or loop a terminal to itself.
 */
export function reconnectWire(doc: CircuitDoc, id: string, end: 'a' | 'b', to: TerminalRef, via: Point[]): Change[] {
  const w = doc.wires[id]
  if (!w) return []
  const other = end === 'a' ? w.b : w.a
  if (sameTerminal(other, to)) return []
  const dup = Object.values(doc.wires).some((x) => x.id !== id && ((sameTerminal(x.a, other) && sameTerminal(x.b, to)) || (sameTerminal(x.a, to) && sameTerminal(x.b, other))))
  if (dup) return []
  // The new path runs from the fixed end to the new terminal; store it in the wire's a→b order.
  const after: Wire = end === 'b' ? { id, a: { ...w.a }, b: { ...to } } : { id, a: { ...to }, b: { ...w.b } }
  const ordered = end === 'b' ? via : [...via].reverse()
  if (ordered.length) after.via = ordered.map((p) => ({ x: p.x, y: p.y }))
  return [{ coll: 'wires', id, before: w, after }]
}

// ---------- clipboard ----------

/** What Copy keeps: the parts, and the wires that run between them. */
export interface Clip {
  parts: Part[]
  wires: Wire[]
  /** Middle of the copied parts, so Paste can centre them on the cursor. */
  center: Point
}

export function copyParts(doc: CircuitDoc, ids: readonly string[]): Clip {
  const parts = ids.map((id) => doc.parts[id]).filter((p): p is Part => !!p).map((p) => structuredClone(p))
  const set = new Set(parts.map((p) => p.id))
  const wires = Object.values(doc.wires).filter((w) => set.has(w.a.part) && set.has(w.b.part)).map((w) => structuredClone(w))
  const xs = parts.map((p) => p.x)
  const ys = parts.map((p) => p.y)
  const center = parts.length ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 } : { x: 0, y: 0 }
  return { parts, wires, center }
}

/**
 * Paste centred on a point. Every part gets a new id and, where it needs one, a new tag:
 * a pasted contactor (coil included) gets one new tag shared by its coil and contacts, so they stay linked;
 * a contact pasted without its coil keeps its tag — it is another contact of the same contactor.
 */
export function pasteClip(doc: CircuitDoc, clip: Clip, at: Point): { changes: Change[]; partIds: string[]; wireIds: string[] } {
  if (!clip.parts.length) return { changes: [], partIds: [], wireIds: [] }
  const dx = snap(at.x - clip.center.x)
  const dy = snap(at.y - clip.center.y)
  const work = structuredClone(doc)
  const idMap = new Map<string, string>()
  const groupTag = new Map<string, string>()
  const changes: Change[] = []

  for (const p of clip.parts) {
    let tag: string
    if (isContactorPart(p.type)) {
      const group = clip.parts.filter((q) => q.tag === p.tag && isContactorPart(q.type))
      if (group.some((q) => q.type === 'KM_COIL')) {
        if (!groupTag.has(p.tag)) groupTag.set(p.tag, nextTag(work, 'KM_COIL'))
        tag = groupTag.get(p.tag)!
      } else tag = p.tag
    } else tag = nextTag(work, p.type)
    const part: Part = { id: newId('p'), type: p.type, tag, x: p.x + dx, y: p.y + dy }
    idMap.set(p.id, part.id)
    work.parts[part.id] = part
    changes.push({ coll: 'parts', id: part.id, before: null, after: part })
  }
  const wireIds: string[] = []
  for (const w of clip.wires) {
    const a = idMap.get(w.a.part)
    const b = idMap.get(w.b.part)
    if (!a || !b) continue
    const wire: Wire = { id: newId('w'), a: { part: a, pin: w.a.pin }, b: { part: b, pin: w.b.pin } }
    if (w.via?.length) wire.via = w.via.map((p) => ({ x: p.x + dx, y: p.y + dy }))
    wireIds.push(wire.id)
    changes.push({ coll: 'wires', id: wire.id, before: null, after: wire })
  }
  return { changes, partIds: [...idMap.values()], wireIds }
}

// ---------- tags ----------

export type TagError = 'tag.invalid' | 'tag.taken'

/**
 * Rename a part's tag (upper-cased). Tags are unique, with one exception that is how contactors work:
 * a contactor's contacts share its coil's tag, and one tag can have at most one coil.
 */
export function renameTag(doc: CircuitDoc, id: string, raw: string): { changes: Change[]; error: TagError | null } {
  const part = doc.parts[id]
  if (!part) return { changes: [], error: null }
  const tag = raw.trim().toUpperCase()
  if (!/^[A-Z]+[0-9]*$/.test(tag)) return { changes: [], error: 'tag.invalid' }
  if (tag === part.tag) return { changes: [], error: null }
  const others = Object.values(doc.parts).filter((p) => p.id !== id && p.tag === tag)
  if (others.length) {
    const allContactor = isContactorPart(part.type) && others.every((p) => isContactorPart(p.type))
    const coils = [part, ...others].filter((p) => p.type === 'KM_COIL').length
    if (!allContactor || coils > 1) return { changes: [], error: 'tag.taken' }
  }
  return { changes: [{ coll: 'parts', id, before: part, after: { ...part, tag } }], error: null }
}

// ---------- whole sheet ----------

/** Replace the whole sheet with another (New, or an example) as one undo step: nothing is lost. */
export function loadSheet(doc: CircuitDoc, next: CircuitDoc): Change[] {
  const changes: Change[] = []
  for (const coll of ['parts', 'wires'] as const) {
    const ids = new Set([...Object.keys(doc[coll]), ...Object.keys(next[coll])])
    for (const id of ids) {
      const before = doc[coll][id] ?? null
      const after = next[coll][id] ?? null
      if (JSON.stringify(before) === JSON.stringify(after)) continue
      changes.push({ coll, id, before, after } as Change)
    }
  }
  return changes
}
