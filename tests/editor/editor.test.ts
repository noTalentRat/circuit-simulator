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

  it('dragging on empty space selects the parts in the box and the wires between them', () => {
    const { ed, drag } = setup()
    drag({ x: 200, y: 150 }, { x: 500, y: 420 })
    expect([...ed.selection.parts].sort()).toEqual(['h1', 's1', 's2'])
    expect([...ed.selection.wires]).toEqual(['w2'])
    expect(ed.view.ox).toBe(0) // the view did not move
  })

  it('a new box replaces the selection; with Shift it adds to it', () => {
    const { ed, drag } = setup()
    drag({ x: 200, y: 150 }, { x: 330, y: 280 }) // S1 only
    expect([...ed.selection.parts]).toEqual(['s1'])
    drag({ x: 420, y: 180 }, { x: 520, y: 300 }) // S2 only
    expect([...ed.selection.parts]).toEqual(['s2'])
    drag({ x: 200, y: 150 }, { x: 330, y: 280 }, { shift: true })
    expect([...ed.selection.parts].sort()).toEqual(['s1', 's2'])
  })

  it('a click on empty space clears the selection', () => {
    const { ed, click } = setup()
    click(270, 215)
    click(700, 500)
    expect(ed.selection.parts.size).toBe(0)
  })

  it('the middle button drags the view, even over a part', () => {
    const { ed, drag } = setup()
    drag({ x: 270, y: 215 }, { x: 170, y: 115 }, { pan: true })
    expect(ed.view.ox).toBe(100)
    expect(ed.view.oy).toBe(100)
    expect(ed.doc.parts.s1).toMatchObject({ x: 260, y: 220 }) // the part did not move
  })

  it('holding Space turns a drag into moving the view', () => {
    const { ed, drag } = setup()
    expect(ed.key(' ')).toBe(true)
    expect(ed.spaceHeld).toBe(true)
    drag({ x: 600, y: 500 }, { x: 500, y: 450 })
    expect(ed.view.ox).toBe(100)
    expect(ed.view.oy).toBe(50)
    ed.keyUp(' ')
    expect(ed.spaceHeld).toBe(false)
    drag({ x: 600, y: 500 }, { x: 500, y: 450 })
    expect(ed.view.ox).toBe(100) // back to selecting
  })

  it('scrolling moves the view; Ctrl + scroll zooms around the cursor', () => {
    const { ed } = setup()
    ed.wheel({ x: 400, y: 300 }, 30, 80, 0)
    expect(ed.view).toMatchObject({ ox: 30, oy: 80, z: 1 })
    ed.wheel({ x: 400, y: 300 }, 0, -100, 16, { ctrl: true })
    expect(ed.view.z).toBeGreaterThan(1)
    // The world point under the cursor stays under the cursor.
    expect(ed.toWorld({ x: 400, y: 300 })).toEqual({ x: 430, y: 380 })
  })

  it('Shift + scroll moves the view sideways', () => {
    const { ed } = setup()
    ed.wheel({ x: 400, y: 300 }, 0, 60, 0, { shift: true })
    expect(ed.view).toMatchObject({ ox: 60, oy: 0 })
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
