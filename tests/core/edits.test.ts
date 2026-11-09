import { describe, expect, it } from 'vitest'
import {
  History,
  copyParts,
  deleteSelection,
  emptyDoc,
  lampExample,
  loadSheet,
  moveParts,
  pasteClip,
  renameTag,
  startStopExample,
  terminalPos,
  wirePath,
  type CircuitDoc,
  type Point,
} from '../../src/core'
import { bodiesCrossed, foreignTerminalsTouched, orthogonalOnGrid } from '../wiring/helpers'

const wireIsClean = (doc: CircuitDoc, id: string) => {
  const w = doc.wires[id]!
  const path = wirePath(doc, w)!
  expect(orthogonalOnGrid(path)).toBe(true)
  expect(bodiesCrossed(doc, path)).toEqual([])
  expect(foreignTerminalsTouched(doc, path, [w.a, w.b])).toEqual([])
  // Leaves and enters along each terminal's axis.
  const a = terminalPos(doc, w.a)!
  const b = terminalPos(doc, w.b)!
  expect(path[1]!.x).toBe(a.x)
  expect(path[path.length - 2]!.x).toBe(b.x)
}

describe('Moving parts: wires follow', () => {
  it('a moved part keeps its wires, rerouted cleanly', () => {
    const h = new History(lampExample())
    h.commit('Move H1', moveParts(h.doc, ['h1'], 200, 40))
    expect(h.doc.parts.h1).toMatchObject({ x: 460, y: 400 })
    for (const id of ['w2', 'w3']) wireIsClean(h.doc, id)
  })

  it('is one undo step, and undo puts every wire back as it was', () => {
    const h = new History(lampExample())
    const before = structuredClone(h.doc)
    h.commit('Move H1', moveParts(h.doc, ['h1'], 200, 40))
    h.undo()
    expect(h.doc).toEqual(before)
  })

  it('moving parts together keeps the wires between them as drawn (shifted)', () => {
    const doc = startStopExample()
    const h = new History(doc)
    const w8via = doc.wires.w8!.via!.map((p: Point) => ({ ...p }))
    h.commit('Move all', moveParts(h.doc, Object.keys(doc.parts), 100, 60))
    expect(h.doc.wires.w8!.via).toEqual(w8via.map((p) => ({ x: p.x + 100, y: p.y + 60 })))
  })

  it('a part with several cornered wires moves cleanly (bug: stale corners crashed the router)', () => {
    const h = new History(startStopExample())
    expect(() => h.commit('Move H1', moveParts(h.doc, ['h1'], 200, 0))).not.toThrow()
    for (const id of ['w6', 'w7', 'w8']) wireIsClean(h.doc, id)
  })

  it('wires rerouted together don’t dodge each other’s old paths', () => {
    // Moving H1 right: A2–X2 should stay a simple U under the parts, not loop around the N wire's old route.
    const h = new History(startStopExample())
    h.commit('Move H1', moveParts(h.doc, ['h1'], 200, 0))
    const w7 = wirePath(h.doc, h.doc.wires.w7!)!
    expect(w7.length).toBeLessThanOrEqual(4)
  })

  it('snaps the move to the grid and ignores a zero move', () => {
    const doc = lampExample()
    expect(moveParts(doc, ['h1'], 0, 0)).toEqual([])
    const changes = moveParts(doc, ['h1'], 13, 27)
    expect(changes[0]).toMatchObject({ after: { x: 280, y: 380 } })
  })
})

describe('Deleting a selection', () => {
  it('removes the parts, their wires and the selected wires in one step', () => {
    const h = new History(lampExample())
    h.commit('Delete', deleteSelection(h.doc, ['s2'], ['w3']))
    expect(h.doc.parts.s2).toBeUndefined()
    expect(h.doc.wires.w3).toBeUndefined()
    expect(Object.keys(h.doc.wires)).toEqual(['w1', 'w2'])
    h.undo()
    expect(h.doc).toEqual(lampExample())
  })

  it('a wire listed twice (selected and on a deleted part) is deleted once', () => {
    const changes = deleteSelection(lampExample(), ['h1'], ['w2'])
    expect(changes.filter((c) => c.id === 'w2')).toHaveLength(1)
  })
})

describe('Copy and paste', () => {
  it('pastes parts centred on the cursor, with new tags and the wires between them', () => {
    const doc = lampExample()
    const clip = copyParts(doc, ['s1', 'h1'])
    expect(clip.wires).toHaveLength(1) // S1:4–H1:X1 only: the others leave the selection
    const { changes, partIds } = pasteClip(doc, clip, { x: 700, y: 300 })
    const h = new History(doc)
    h.commit('Paste', changes)
    const pasted = partIds.map((id) => h.doc.parts[id]!)
    expect(pasted.map((p) => p.tag).sort()).toEqual(['H2', 'S3'])
    const cx = (Math.min(...pasted.map((p) => p.x)) + Math.max(...pasted.map((p) => p.x))) / 2
    expect(cx).toBe(700)
    expect(Object.values(h.doc.wires).filter((w) => partIds.includes(w.a.part) && partIds.includes(w.b.part))).toHaveLength(1)
  })

  it('a pasted contactor keeps its coil and contacts linked under one new tag', () => {
    const doc = startStopExample()
    const clip = copyParts(doc, ['km1', 'km1a'])
    const { changes, partIds } = pasteClip(doc, clip, { x: 800, y: 400 })
    const h = new History(doc)
    h.commit('Paste', changes)
    const tags = partIds.map((id) => h.doc.parts[id]!.tag)
    expect(tags).toEqual(['KM2', 'KM2'])
  })

  it('a contact pasted without its coil stays a contact of the same contactor', () => {
    const doc = startStopExample()
    const { changes, partIds } = pasteClip(doc, copyParts(doc, ['km1a']), { x: 800, y: 400 })
    const h = new History(doc)
    h.commit('Paste', changes)
    expect(h.doc.parts[partIds[0]!]!.tag).toBe('KM1')
  })

  it('pasting twice gives different tags each time', () => {
    const h = new History(lampExample())
    const clip = copyParts(h.doc, ['s1'])
    h.commit('Paste', pasteClip(h.doc, clip, { x: 700, y: 300 }).changes)
    h.commit('Paste', pasteClip(h.doc, clip, { x: 800, y: 300 }).changes)
    const tags = Object.values(h.doc.parts).map((p) => p.tag).sort()
    expect(tags).toEqual(['H1', 'Q1', 'S1', 'S2', 'S3', 'S4'])
  })
})

describe('Renaming a tag', () => {
  it('renames, upper-cased', () => {
    const r = renameTag(lampExample(), 'h1', 'h5')
    expect(r.error).toBeNull()
    expect(r.changes[0]).toMatchObject({ after: { tag: 'H5' } })
  })

  it('refuses an empty or malformed tag', () => {
    expect(renameTag(lampExample(), 'h1', '').error).toBe('tag.invalid')
    expect(renameTag(lampExample(), 'h1', '5H').error).toBe('tag.invalid')
  })

  it('refuses a tag another part already uses', () => {
    expect(renameTag(lampExample(), 'h1', 'S1').error).toBe('tag.taken')
  })

  it('lets a contactor contact share its coil’s tag (that is how they link), but not two coils', () => {
    const doc = startStopExample()
    expect(renameTag(doc, 'km1a', 'KM1').error).toBeNull()
    const h = new History(doc)
    const extra = { id: 'km2', type: 'KM_COIL' as const, tag: 'KM2', x: 600, y: 400 }
    h.commit('add', [{ coll: 'parts', id: 'km2', before: null, after: extra }])
    expect(renameTag(h.doc, 'km2', 'KM1').error).toBe('tag.taken')
  })
})

describe('Loading a sheet', () => {
  it('replaces everything in one undoable step', () => {
    const h = new History(lampExample())
    h.commit('Load', loadSheet(h.doc, startStopExample()))
    expect(h.doc).toEqual(startStopExample())
    h.undo()
    expect(h.doc).toEqual(lampExample())
  })

  it('loading an empty sheet clears it', () => {
    const h = new History(lampExample())
    h.commit('New', loadSheet(h.doc, emptyDoc()))
    expect(Object.keys(h.doc.parts)).toEqual([])
  })
})

describe('Reading a saved sheet', () => {
  it('accepts a real sheet unchanged', async () => {
    const { parseDoc } = await import('../../src/core')
    expect(parseDoc(JSON.parse(JSON.stringify(startStopExample())))).toEqual(startStopExample())
  })

  it('rejects something that is not a sheet', async () => {
    const { parseDoc } = await import('../../src/core')
    expect(parseDoc(null)).toBeNull()
    expect(parseDoc({ version: 2, parts: {}, wires: {} })).toBeNull()
    expect(parseDoc({ version: 1, parts: { a: { id: 'a', type: 'ROCKET', tag: 'R1', x: 0, y: 0 } }, wires: {} })).toBeNull()
  })

  it('drops wires whose terminal no longer exists', async () => {
    const { parseDoc } = await import('../../src/core')
    const raw = JSON.parse(JSON.stringify(lampExample()))
    raw.wires.w9 = { id: 'w9', a: { part: 'gone', pin: '1' }, b: { part: 'h1', pin: 'X1' } }
    expect(Object.keys(parseDoc(raw)!.wires)).toEqual(['w1', 'w2', 'w3'])
  })
})
