import { simplify, type Point } from '../geometry'
import { terminalPos, type CircuitDoc, type Wire } from '../model/document'
import { obstacles, smartTail } from './route'

/**
 * A fresh path for an existing wire after its parts moved: the same router a wire run uses,
 * keeping clear of parts, other terminals and other wires. Returns the corners (via), or null if an end is gone.
 * `alsoIgnore`: other wires that are about to be rerouted too, so their old paths don't push this one around.
 */
export function reroute(doc: CircuitDoc, w: Wire, alsoIgnore: Iterable<string> = []): Point[] | null {
  const A = terminalPos(doc, w.a)
  const B = terminalPos(doc, w.b)
  if (!A || !B) return null
  const obs = obstacles(doc, [w.a, w.b], new Set([w.id, ...alsoIgnore]))
  const tail = smartTail(obs, A, { terminal: B }, 'v')
  return simplify([A, ...tail]).slice(1, -1)
}
