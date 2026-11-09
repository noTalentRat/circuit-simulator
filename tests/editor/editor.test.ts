import { describe, expect, it } from 'vitest'
import { lampExample } from '../../src/core'
import { setup } from './setup'

describe('Editing on the sheet', () => {
  it('dragging a part moves it in one undo step; nothing changes until the drop', () => {
    const { ed, history } = setup()
    ed.down({ x: 470, y: 265 }, 0)
    for (let i = 1; i <= 10; i++) ed.move({ x: 470 + i * 10, y: 265 }, i * 16)
    expect(history.doc.parts.s2!.x).toBe(460) // still in place: only the preview moved
    expect(ed.displayDoc.parts.s2!.x).toBe(560)
    ed.up({ x: 570, y: 265 }, 200)
    expect(history.doc.parts.s2!.x).toBe(560)
    expect(history.entries()).toHaveLength(1)
  })

  it('wires follow a dragged part', () => {
    const { ed, drag } = setup()
    drag({ x: 272, y: 370 }, { x: 472, y: 410 }) // H1 body
    const w2 = ed.doc.wires.w2!
    expect(w2.via?.length).toBeGreaterThan(0)
    expect(ed.doc.parts.h1).toMatchObject({ x: 460, y: 400 })
  })

  it('a click that does not move a part only selects it', () => {
    const { ed, history, click } = setup()
    click(270, 215)
    expect([...ed.selection.parts]).toEqual(['s1'])
    expect(history.entries()).toHaveLength(0)
  })

  it('Shift-drag on empty space selects the parts in the box and the wires between them', () => {
    const { ed, drag } = setup()
    drag({ x: 200, y: 150 }, { x: 500, y: 420 }, { shift: true })
    expect([...ed.selection.parts].sort()).toEqual(['h1', 's1', 's2'])
    expect([...ed.selection.wires]).toEqual(['w2'])
  })

  it('Delete removes the selection; undo brings it back', () => {
    const { ed, history, click } = setup()
    click(270, 215)
    ed.key('Delete')
    expect(history.doc.parts.s1).toBeUndefined()
    expect(Object.keys(history.doc.wires)).toEqual(['w3'])
    ed.key('z', { ctrl: true })
    expect(history.doc).toEqual(lampExample())
  })

  it('Copy, then Paste lands at the cursor, selected, with a new tag', () => {
    const { ed, history, click, moveTo } = setup()
    click(270, 215)
    ed.key('c', { ctrl: true })
    moveTo(700, 400)
    ed.key('v', { ctrl: true })
    const [id] = [...ed.selection.parts]
    expect(history.doc.parts[id!]).toMatchObject({ tag: 'S3', x: 700, y: 400 })
  })

  it('holding a pushbutton head presses it; releasing lets go', () => {
    const { ed } = setup()
    ed.down({ x: 238, y: 220 }, 0)
    expect(ed.sim.result.energized('h1')).toBe(true)
    ed.up({ x: 238, y: 220 }, 100)
    expect(ed.sim.result.energized('h1')).toBe(false)
  })

  it('a drag-wired connection is one undo step', () => {
    const { history, drag } = setup()
    drag({ x: 460, y: 280 }, { x: 262, y: 318 }) // S2:2 → H1:X1
    expect(Object.keys(history.doc.wires)).toHaveLength(4)
    history.undo()
    expect(Object.keys(history.doc.wires)).toHaveLength(3)
  })

  it('a new part lands in the middle of the view, clear of others, selected', () => {
    const { ed, history } = setup()
    const id = ed.addPart('LAMP')
    expect(history.doc.parts[id]!.tag).toBe('H2')
    expect([...ed.selection.parts]).toEqual([id])
  })

  it('Escape clears the selection', () => {
    const { ed, click } = setup()
    click(270, 215)
    ed.key('Escape')
    expect(ed.selection.parts.size).toBe(0)
  })
})
