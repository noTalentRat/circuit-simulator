import { History, Simulator, lampExample, type CircuitDoc, type Point } from '../../src/core'
import { Editor } from '../../src/editor/editor'

/** An editor at zoom 1 with the view's corner at (0, 0), so screen pixels = world units. */
export function setup(doc: CircuitDoc = lampExample()) {
  const history = new History(doc)
  const ed = new Editor(history, new Simulator(history.doc))
  ed.view = { ox: 0, oy: 0, z: 1, width: 800, height: 600 }
  let t = 0
  const at = (x: number, y: number): Point => ({ x, y })
  const click = (x: number, y: number, mods = {}) => {
    ed.down(at(x, y), (t += 16), mods)
    ed.up(at(x, y), (t += 16), mods)
  }
  const drag = (from: Point, to: Point, mods = {}) => {
    ed.down(from, (t += 16), mods)
    const n = 12
    for (let i = 1; i <= n; i++) ed.move(at(from.x + ((to.x - from.x) * i) / n, from.y + ((to.y - from.y) * i) / n), (t += 16), mods)
    ed.up(to, (t += 16), mods)
  }
  const moveTo = (x: number, y: number) => ed.move(at(x, y), (t += 16))
  return { ed, history, click, drag, moveTo, wires: () => Object.values(history.doc.wires) }
}

