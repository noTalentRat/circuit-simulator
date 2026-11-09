import { describe, expect, it } from 'vitest'
import { History, addPart, addWire, deletePart, emptyDoc, lampExample, movePart } from '../../src/core'

describe('History: every change is reversible', () => {
  it('undoes and redoes adding a part', () => {
    const h = new History(emptyDoc())
    const { changes, part } = addPart(h.doc, 'LAMP', 100, 100)
    h.commit('Add H1', changes)
    expect(h.doc.parts[part.id]?.tag).toBe('H1')
    h.undo()
    expect(h.doc.parts[part.id]).toBeUndefined()
    h.redo()
    expect(h.doc.parts[part.id]?.tag).toBe('H1')
  })

  it('deleting a part removes its wires in the same step, and undo brings both back', () => {
    const h = new History(lampExample())
    h.commit('Delete S1', deletePart(h.doc, 's1'))
    expect(h.doc.parts.s1).toBeUndefined()
    expect(h.doc.wires.w1).toBeUndefined()
    expect(h.doc.wires.w2).toBeUndefined()
    expect(h.doc.wires.w3).toBeDefined()
    h.undo()
    expect(h.doc).toEqual(lampExample())
  })

  it('a new commit clears redo', () => {
    const h = new History(lampExample())
    h.commit('Move S2', movePart(h.doc, 's2', 500, 240))
    h.undo()
    expect(h.canRedo).toBe(true)
    h.commit('Move S2', movePart(h.doc, 's2', 520, 240))
    expect(h.canRedo).toBe(false)
  })

  it('stores copies, so later edits to an object never change history', () => {
    const h = new History(emptyDoc())
    const { changes, part } = addPart(h.doc, 'PB_NO', 0, 0)
    h.commit('Add S1', changes)
    h.doc.parts[part.id]!.x = 999
    h.undo()
    h.redo()
    expect(h.doc.parts[part.id]!.x).toBe(0)
  })

  it('lists entries oldest first, with undone ones after the current one', () => {
    const h = new History(lampExample())
    h.commit('Move S2', movePart(h.doc, 's2', 500, 240))
    h.commit('Move S2 again', movePart(h.doc, 's2', 540, 240))
    h.undo()
    expect(h.entries()).toEqual([
      { label: 'Move S2', state: 'done', current: true },
      { label: 'Move S2 again', state: 'undone', current: false },
    ])
  })

  it('ignores empty commands, duplicate wires and wires from a terminal to itself', () => {
    const h = new History(lampExample())
    h.commit('Nothing', [])
    h.commit('Dup', addWire(h.doc, { part: 's1', pin: '4' }, { part: 'h1', pin: 'X1' }).changes)
    h.commit('Reverse dup', addWire(h.doc, { part: 'h1', pin: 'X1' }, { part: 's1', pin: '4' }).changes)
    h.commit('Self', addWire(h.doc, { part: 'h1', pin: 'X1' }, { part: 'h1', pin: 'X1' }).changes)
    expect(h.canUndo).toBe(false)
  })

  it('gives new parts the next free tag per letter code', () => {
    const doc = lampExample()
    expect(addPart(doc, 'PB_NO', 0, 0).part.tag).toBe('S3')
    expect(addPart(doc, 'LAMP', 0, 0).part.tag).toBe('H2')
    expect(addPart(doc, 'KM_COIL', 0, 0).part.tag).toBe('KM1')
  })

  it('snaps new and moved parts to the grid', () => {
    const doc = lampExample()
    expect(addPart(doc, 'LAMP', 103, 118).part).toMatchObject({ x: 100, y: 120 })
    expect(movePart(doc, 's2', 471, 249)[0]).toMatchObject({ after: { x: 480, y: 240 } })
  })
})
