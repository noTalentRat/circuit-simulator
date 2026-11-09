/**
 * Wiring case catalogue — every case reported during the wire spike, as an automated scenario.
 * Source of truth: the "Wiring case catalogue" section of the vision doc. Same IDs here and there.
 * Cases that need pointer and selection behaviour drive the editor (src/editor) the same way, with no screen.
 */
import { describe, expect, it } from 'vitest'
import { STUB, WiringSession, lampExample, terminalLabel, type Point } from '../../src/core'
import { setup } from '../editor/setup'
import { bodiesCrossed, foreignTerminalsTouched, gesture, label, nextTime, orthogonalOnGrid, pos, ref, sharedSteps, sheet } from './helpers'

describe('W01 — long wire run across the sheet (0.1)', () => {
  const doc = sheet([
    ['Q1', 'SUPPLY', 100, 60],
    ['H1', 'LAMP', 600, 400],
  ])

  it('click-click: no button held; corners lock where clicked; the run lands on a terminal', () => {
    const s = new WiringSession(doc, ref('Q1:L'), pos(doc, 'Q1:L'), 0)
    s.move({ x: 60, y: 200 }, 50)
    s.move({ x: 61, y: 300 }, 100)
    expect(s.click({ x: 61, y: 300 }, 120)).toEqual({ kind: 'continue' })
    expect(s.corners).toContainEqual({ x: 60, y: 300 })
    s.move({ x: 400, y: 300 }, 200)
    s.move({ x: 598, y: 358 }, 300)
    const out = s.click({ x: 598, y: 358 }, 320)
    expect(out.kind).toBe('wire')
    if (out.kind === 'wire') {
      expect(label(doc, out.b)).toBe('H1:X1')
      expect(out.via).toContainEqual({ x: 60, y: 300 })
    }
  })

  it('zooming mid-run keeps targets the same size on screen', () => {
    const s = new WiringSession(doc, ref('Q1:L'), pos(doc, 'Q1:L'), 0)
    s.move({ x: 60, y: 300 }, 50)
    s.setZoom(2)
    // 10 world units = 20 screen px at zoom 2: inside the notice zone (22 px), outside the attach zone (14 px).
    s.move({ x: 590, y: 360 }, 100)
    expect(s.attached).toBeNull()
    expect(label(doc, s.candidate?.terminal)).toBe('H1:X1')
    // 5 world units = 10 screen px: attaches.
    s.move({ x: 595, y: 360 }, 150)
    expect(label(doc, s.attached)).toBe('H1:X1')
  })

})

describe('W01 — long wire run: pan and auto-pan mid-run (0.1)', () => {
  it('during click-click wiring, dragging empty space pans and the run carries on', () => {
    const { ed, click, drag } = setup()
    click(260, 100) // Q1:L: quick press-release = click-click wiring
    expect(ed.sessionMode).toBe('click')
    drag({ x: 600, y: 500 }, { x: 500, y: 400 })
    expect(ed.view.ox).toBe(100)
    expect(ed.view.oy).toBe(100)
    expect(ed.session).not.toBeNull()
    expect(ed.session!.corners).toEqual([]) // a pan is not a click: no corner placed
  })

  it('near the canvas edge the view scrolls on its own, and the run follows', () => {
    const { ed, click, moveTo } = setup()
    click(260, 100)
    moveTo(795, 300)
    expect(ed.autoPanVelocity()!.x).toBeGreaterThan(0)
    const before = ed.view.ox
    ed.tick(100)
    expect(ed.view.ox).toBeGreaterThan(before)
    expect(ed.session!.cursor.x).toBeGreaterThan(795)
  })

  it('zooming mid-run keeps the run going', () => {
    const { ed, click } = setup()
    click(260, 100)
    ed.wheel({ x: 400, y: 300 }, -200, 1000)
    expect(ed.view.z).toBeGreaterThan(1)
    expect(ed.session).not.toBeNull()
  })
})


describe('W02 — aiming at a terminal from a distance (0.1)', () => {
  const doc = sheet([
    ['Q1', 'SUPPLY', 100, 60],
    ['H1', 'LAMP', 600, 400],
  ])

  it('no pixel-precise aiming: within the attach zone it attaches', () => {
    const { session } = gesture(doc, 'Q1:L', [{ x: 60, y: 360 }, { x: 588, y: 360 }])
    expect(label(doc, session.attached)).toBe('H1:X1')
  })

  it('a little further it suggests, and a click lands there', () => {
    const log = gesture(doc, 'Q1:L', [{ x: 60, y: 360 }, { x: 580, y: 360 }])
    expect(log.session.attached).toBeNull()
    expect(label(doc, log.session.candidate?.terminal)).toBe('H1:X1')
    const out = log.session.click({ x: 580, y: 360 }, nextTime(log))
    expect(out.kind === 'wire' && label(doc, out.b)).toBe('H1:X1')
  })
})

describe('W03 — drop straight down onto a lamp from a switch above (0.3, liked)', () => {
  const doc = sheet([
    ['S1', 'PB_NO', 260, 220],
    ['H1', 'LAMP', 260, 400],
  ])

  it('attaches early along the corridor', () => {
    const log = gesture(doc, 'S1:4', [{ x: 260, y: 300 }])
    expect(label(doc, log.session.attached)).toBe('H1:X1')
    expect(log.attachedTrace.every((a) => a === null || a === 'H1:X1')).toBe(true)
  })

  it('moving back up out of the corridor releases it', () => {
    const log = gesture(doc, 'S1:4', [{ x: 260, y: 300 }, { x: 260, y: 250 }])
    expect(log.session.attached).toBeNull()
  })
})

describe('W04 — run upward toward a terminal above (0.2)', () => {
  const doc = sheet([['H1', 'LAMP', 300, 300]])

  it('the preview goes vertical first, following the movement', () => {
    const { session } = gesture(doc, 'H1:X1', [{ x: 240, y: 140 }])
    expect(session.posture).toBe('v')
    const path = session.preview()
    expect(path[1]!.x).toBe(path[0]!.x)
  })

  it('a mostly sideways first movement turns the corner first', () => {
    const { session } = gesture(doc, 'H1:X1', [{ x: 180, y: 250 }, { x: 140, y: 140 }])
    expect(session.posture).toBe('h')
  })
})

describe('W05 — start at S1:3, move past S1’s body (0.3)', () => {
  const doc = sheet([['S1', 'PB_NO', 300, 200]])

  it('straight down through the body: never attaches to S1:4', () => {
    const log = gesture(doc, 'S1:3', [{ x: 300, y: 320 }])
    expect(log.attachedTrace).not.toContain('S1:4')
  })

  it('down alongside the body: never attaches to S1:4', () => {
    const log = gesture(doc, 'S1:3', [{ x: 240, y: 160 }, { x: 240, y: 300 }])
    expect(log.attachedTrace).not.toContain('S1:4')
  })

  it('leaving the part and coming back is clear intent: then S1:4 attaches', () => {
    const log = gesture(doc, 'S1:3', [{ x: 300, y: 320 }, { x: 300, y: 244 }])
    expect(label(doc, log.session.attached)).toBe('S1:4')
  })
})

describe('W06 — move sideways across S2:1’s corridor toward S6 (0.4 case 1)', () => {
  const doc = sheet([
    ['S1', 'PB_NO', 100, 60],
    ['S2', 'PB_NC', 300, 200],
    ['S6', 'PB_NC', 500, 200],
  ])

  it('a ring at most; never attaches to S2:1', () => {
    const log = gesture(doc, 'S1:4', [{ x: 100, y: 120 }, { x: 500, y: 120 }])
    expect(log.attachedTrace).not.toContain('S2:1')
  })
})

describe('W07 — move diagonally toward S6:1, passing near S2:1 (0.4 case 3)', () => {
  const doc = sheet([
    ['S1', 'PB_NO', 100, 60],
    ['S2', 'PB_NC', 300, 200],
    ['S6', 'PB_NC', 500, 220],
  ])

  it('passing just outside S2:1’s attach zone: no attach, and S6:1 attaches on arrival', () => {
    // A straight diagonal from S1:4 to S6:1 passes about 18 px above S2:1.
    const log = gesture(doc, 'S1:4', [{ x: 500, y: 180 }])
    expect(log.attachedTrace).not.toContain('S2:1')
    expect(label(doc, log.session.attached)).toBe('S6:1')
  })

  it('brushing through S2:1’s attach zone: lets go as soon as the cursor moves on', () => {
    const log = gesture(doc, 'S1:4', [{ x: 292, y: 154 }, { x: 330, y: 150 }, { x: 500, y: 180 }])
    const lastS2 = log.attachedTrace.lastIndexOf('S2:1')
    const release = log.attachedTrace.indexOf(null, lastS2)
    // Released within the notice zone's reach (about 22 px of travel at 4 px a step), not later.
    expect(release - lastS2).toBeLessThanOrEqual(8)
    expect(label(doc, log.session.attached)).toBe('S6:1')
  })
})

describe('W08 — target directly below another part: S6:1 under S2 (0.4 case 2)', () => {
  const doc = sheet([
    ['S1', 'PB_NO', 300, 40],
    ['S2', 'PB_NC', 300, 200],
    ['S6', 'PB_NC', 300, 400],
  ])

  it('routes around S2, never over S2’s terminals', () => {
    const { session } = gesture(doc, 'S1:4', [{ x: 380, y: 200 }, { x: 302, y: 358 }])
    expect(label(doc, session.attached)).toBe('S6:1')
    const path = session.preview()
    expect(bodiesCrossed(doc, path)).toEqual([])
    expect(foreignTerminalsTouched(doc, path, [ref('S1:4'), ref('S6:1')])).toEqual([])
    expect(orthogonalOnGrid(path)).toBe(true)
  })
})

describe('W09 — click a terminal where a selected wire ends (0.4)', () => {
  it('a click starts a new wire from that terminal; the selected wire is untouched', () => {
    const { ed, click, wires } = setup()
    click(260, 290) // on wire w2, S1:4 – H1:X1
    expect([...ed.selection.wires]).toEqual(['w2'])
    click(260, 320) // H1:X1, where w2 ends
    expect(ed.session).not.toBeNull()
    expect(ed.sessionMode).toBe('click')
    expect(ed.reconnecting).toBeNull()
    expect(terminalLabel(ed.doc, ed.session!.from)).toBe('H1:X1')
    expect(wires()).toHaveLength(3)
    expect(ed.doc.wires.w2).toEqual(lampExample().wires.w2)
  })

  it('only a drag from there moves the existing end, as one undo step', () => {
    const { ed, history, click, drag, wires } = setup()
    click(260, 290)
    drag({ x: 260, y: 320 }, { x: 460, y: 282 }) // H1:X1 end → S2:2
    expect(wires()).toHaveLength(3)
    const w2 = ed.doc.wires.w2!
    expect(terminalLabel(ed.doc, w2.a)).toBe('S1:4')
    expect(terminalLabel(ed.doc, w2.b)).toBe('S2:2')
    history.undo()
    expect(ed.doc.wires.w2).toEqual(lampExample().wires.w2)
  })

  it('dropping a dragged end on nothing puts it back', () => {
    const { ed, click, drag } = setup()
    click(260, 290)
    drag({ x: 260, y: 320 }, { x: 640, y: 520 })
    expect(ed.doc.wires.w2).toEqual(lampExample().wires.w2)
    expect(ed.session).toBeNull()
  })
})

describe('W10 — over H4, nearer X1, X1 already wired (0.6 case 1)', () => {
  const doc = sheet(
    [
      ['Q1', 'SUPPLY', 500, 60],
      ['S1', 'PB_NO', 200, 100],
      ['H4', 'LAMP', 400, 300],
    ],
    ['H4:X1 Q1:L'],
  )

  it('suggests X1, the terminal of the half you’re in', () => {
    const { session } = gesture(doc, 'S1:4', [{ x: 200, y: 200 }, { x: 395, y: 285 }])
    expect(session.candidate?.why).toBe('part')
    expect(label(doc, session.candidate?.terminal)).toBe('H4:X1')
  })

  it('and X2 in the bottom half', () => {
    const { session } = gesture(doc, 'S1:4', [{ x: 200, y: 200 }, { x: 395, y: 315 }])
    expect(label(doc, session.candidate?.terminal)).toBe('H4:X2')
  })
})

describe('W11 — new wire’s path runs along a same-net wire (0.6 case 2)', () => {
  const doc = sheet(
    [
      ['S1', 'PB_NO', 200, 100],
      ['H1', 'LAMP', 200, 300],
      ['H2', 'LAMP', 300, 300],
    ],
    ['S1:4 H1:X1'],
  )

  it('no overlap: the new wire routes beside the existing one', () => {
    const { session } = gesture(doc, 'S1:4', [{ x: 200, y: 200 }, { x: 298, y: 256 }])
    expect(label(doc, session.attached)).toBe('H2:X1')
    const path = session.preview()
    expect(sharedSteps(doc, path, [ref('S1:4'), ref('H2:X1')])).toBe(0)
    expect(orthogonalOnGrid(path)).toBe(true)
  })
})

describe('W12 — detour into a bottom terminal from the left (0.6 case 3)', () => {
  const doc = sheet([
    ['S1', 'PB_NO', 100, 160],
    ['H1', 'LAMP', 300, 300],
    ['H9', 'LAMP', 200, 360],
  ])

  it('a short straight entry, with no overshoot below the terminal', () => {
    const { session } = gesture(doc, 'S1:4', [{ x: 100, y: 380 }, { x: 296, y: 346 }])
    expect(label(doc, session.attached)).toBe('H1:X2')
    const path = session.preview()
    const T = pos(doc, 'H1:X2')
    expect(Math.max(...path.map((p: Point) => p.y))).toBeLessThanOrEqual(T.y + STUB)
    const [beforeLast, last] = path.slice(-2)
    expect(beforeLast!.x).toBe(T.x)
    expect(last).toEqual(T)
    expect(bodiesCrossed(doc, path)).toEqual([])
    expect(foreignTerminalsTouched(doc, path, [ref('S1:4'), ref('H1:X2')])).toEqual([])
  })
})

describe('W13 — detour passes the N wire (0.6 case 3)', () => {
  const doc = sheet([
    ['S1', 'PB_NO', 100, 160],
    ['H1', 'LAMP', 300, 300],
    ['H9', 'LAMP', 200, 360],
    ['H7', 'LAMP', 40, 220],
  ])
  // A different-net wire along row 300, right where the W12 detour runs.
  doc.wires.n = {
    id: 'n',
    a: ref('H7:X2'),
    b: ref('H1:X1'),
    via: [
      { x: 40, y: 300 },
      { x: 260, y: 300 },
      { x: 260, y: 240 },
      { x: 300, y: 240 },
    ],
  }

  it('never runs along a different-net wire; crossing at a right angle is fine', () => {
    const { session } = gesture(doc, 'S1:4', [{ x: 100, y: 380 }, { x: 296, y: 346 }])
    expect(label(doc, session.attached)).toBe('H1:X2')
    const path = session.preview()
    expect(sharedSteps(doc, path, [ref('S1:4'), ref('H1:X2')])).toBe(0)
    expect(bodiesCrossed(doc, path)).toEqual([])
    expect(orthogonalOnGrid(path)).toBe(true)
  })
})

describe('W14 — bridge a row of aligned terminals (0.5 idea)', () => {
  it.todo('fewer than two clicks per terminal; drawn as one line with drops — wiring v1.1 (chain mode)')
})

describe('Spec rules that hold for every run', () => {
  const doc = sheet([
    ['S1', 'PB_NO', 100, 100],
    ['H1', 'LAMP', 300, 300],
  ])

  it('Alt turns all noticing and attaching off', () => {
    const s = new WiringSession(doc, ref('S1:4'), pos(doc, 'S1:4'), 0)
    s.move({ x: 300, y: 262 }, 50, { alt: true })
    expect(s.attached).toBeNull()
    expect(s.candidate).toBeNull()
  })

  it('releasing a drag on empty space cancels: a miss never leaves a loose wire', () => {
    const log = gesture(doc, 'S1:4', [{ x: 500, y: 500 }])
    expect(log.session.release({ x: 500, y: 500 }, nextTime(log))).toEqual({ kind: 'cancel' })
  })

  it('Backspace removes a whole click, then cancels', () => {
    const s = new WiringSession(doc, ref('S1:4'), pos(doc, 'S1:4'), 0)
    s.click({ x: 100, y: 200 }, 50)
    s.click({ x: 200, y: 200 }, 100)
    const before = s.corners.length
    s.undoCorner()
    expect(s.corners.length).toBeLessThan(before)
    s.undoCorner()
    expect(s.corners).toEqual([])
    expect(s.undoCorner()).toEqual({ kind: 'cancel' })
  })

  it('Space flips the posture and keeps it', () => {
    const { session } = gesture(doc, 'S1:4', [{ x: 120, y: 260 }])
    expect(session.posture).toBe('v')
    session.flipPosture()
    session.move({ x: 124, y: 270 }, 1000)
    expect(session.posture).toBe('h')
  })

  it('what you see is what you get: the committed wire is exactly the preview', () => {
    const log = gesture(doc, 'S1:4', [{ x: 160, y: 200 }, { x: 298, y: 258 }])
    const preview = log.session.preview()
    const out = log.session.release({ x: 298, y: 258 }, nextTime(log))
    expect(out.kind).toBe('wire')
    if (out.kind === 'wire') expect([pos(doc, 'S1:4'), ...out.via, pos(doc, 'H1:X1')]).toEqual(preview)
  })
})
