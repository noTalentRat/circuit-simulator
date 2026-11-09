import { describe, expect, it } from 'vitest'
import { defaultShape, gridSearch, lampExample, obstacles, pathBlocked, unitEdges, wirePath } from '../../src/core'
import { ref, sheet } from './helpers'

describe('Router building blocks', () => {
  it('splits a path into one-grid-step edges', () => {
    expect(unitEdges([{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 20, y: 40 }])).toHaveLength(3)
  })

  it('default shape leaves and enters terminals along their axis', () => {
    const path = defaultShape({ x: 0, y: 0, dir: 1 }, { x: 100, y: 200, dir: -1 })
    expect(path[1]).toEqual({ x: 0, y: 100 })
    expect(path[path.length - 2]).toEqual({ x: 100, y: 100 })
  })

  it('every wire in the example has a path', () => {
    const doc = lampExample()
    for (const w of Object.values(doc.wires)) expect(wirePath(doc, w)).not.toBeNull()
  })

  it('grid search enters a terminal only from the side it faces', () => {
    const doc = sheet([['H1', 'LAMP', 300, 300]])
    const obs = obstacles(doc, [ref('H1:X1')])
    const path = gridSearch(obs, { x: 100, y: 400, dir: 0 }, { x: 300, y: 260, dir: -1 })!
    const [beforeLast, last] = path.slice(-2)
    expect(last).toEqual({ x: 300, y: 260 })
    expect(beforeLast!.x).toBe(300)
    expect(beforeLast!.y).toBeLessThan(260)
  })

  it('a corner on another wire is blocked: it would look like a junction', () => {
    const doc = sheet(
      [
        ['H1', 'LAMP', 100, 100],
        ['H2', 'LAMP', 300, 100],
      ],
      ['H1:X2 H2:X2'],
    )
    // H1:X2–H2:X2 drops from (100,140) to (100,160), then runs right along row 160.
    // A path coming up from below and turning left at (100,160) shares no step with it, but would meet it at its corner:
    const obs = obstacles(doc, [])
    expect(pathBlocked(obs, [{ x: 100, y: 300 }, { x: 100, y: 160 }, { x: 0, y: 160 }])).toBe(true)
    // Crossing it straight is fine.
    expect(pathBlocked(obs, [{ x: 200, y: 300 }, { x: 200, y: 60 }])).toBe(false)
  })
})
