import { snap } from '../geometry'
import type { PartType } from '../library/definitions'
import { newId, nextTag, sameTerminal, type CircuitDoc, type Part, type TerminalRef, type Wire } from '../model/document'
import type { Change } from './history'

/**
 * Builders that turn an intention ("add a lamp here") into the list of changes a History commits.
 * They only read the document; History.commit is what changes it.
 */

export function addPart(doc: CircuitDoc, type: PartType, x: number, y: number, tag?: string): { changes: Change[]; part: Part } {
  const part: Part = { id: newId('p'), type, tag: tag ?? nextTag(doc, type), x: snap(x), y: snap(y) }
  return { part, changes: [{ coll: 'parts', id: part.id, before: null, after: part }] }
}

/** Deleting a part also deletes the wires on it, in the same undo step. */
export function deletePart(doc: CircuitDoc, id: string): Change[] {
  const part = doc.parts[id]
  if (!part) return []
  const changes: Change[] = [{ coll: 'parts', id, before: part, after: null }]
  for (const w of Object.values(doc.wires)) {
    if (w.a.part === id || w.b.part === id) changes.push({ coll: 'wires', id: w.id, before: w, after: null })
  }
  return changes
}

export function movePart(doc: CircuitDoc, id: string, x: number, y: number): Change[] {
  const part = doc.parts[id]
  if (!part) return []
  const after = { ...part, x: snap(x), y: snap(y) }
  if (after.x === part.x && after.y === part.y) return []
  return [{ coll: 'parts', id, before: part, after }]
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
