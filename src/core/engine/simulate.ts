import { PARTS } from '../library/definitions'
import { terminalKey, type CircuitDoc } from '../model/document'

/** What a net carries: live, neutral, short circuit (live and neutral joined), or nothing. */
export type Potential = 'L' | 'N' | 'X' | null

/** What the user is doing to the circuit: which pushbuttons are held down. */
export interface Inputs {
  pressed: ReadonlySet<string>
}

export interface SimResult {
  /** Representative terminal key of the net a terminal belongs to. Terminals in one net share it. */
  netOf(terminal: string): string
  potential(terminal: string): Potential
  /** Is this load or coil part powered? */
  energized(partId: string): boolean
  /** Is this contact part closed right now? */
  closed(partId: string): boolean
  /** Coil state per device tag (KM1 → pulled in). */
  coils: ReadonlyMap<string, boolean>
  /** Live and neutral touch somewhere without a load: the supply trips and nothing is powered. */
  short: boolean
  /** The circuit never settled: some relay keeps switching itself on and off. */
  oscillating: boolean
}

const SETTLE_LIMIT = 32

/** Union-find over terminal keys. */
class Nets {
  private parent = new Map<string, string>()
  find(k: string): string {
    if (!this.parent.has(k)) this.parent.set(k, k)
    let root = k
    while (this.parent.get(root) !== root) root = this.parent.get(root)!
    let n = k
    while (n !== root) {
      const next = this.parent.get(n)!
      this.parent.set(n, root)
      n = next
    }
    return root
  }
  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

/**
 * One pass at fixed coil states: which contacts are closed, which nets are live or neutral,
 * and which loads and coils would be powered.
 */
function solve(doc: CircuitDoc, inputs: Inputs, coils: ReadonlyMap<string, boolean>) {
  const nets = new Nets()
  const closedParts = new Set<string>()
  const lives: string[] = []
  const neutrals: string[] = []

  for (const part of Object.values(doc.parts)) {
    const def = PARTS[part.type]
    for (const pin of Object.keys(def.pins)) nets.find(terminalKey({ part: part.id, pin }))
    for (const el of def.elements) {
      if (el.kind === 'source') {
        lives.push(terminalKey({ part: part.id, pin: el.live }))
        neutrals.push(terminalKey({ part: part.id, pin: el.neutral }))
      } else if (el.kind === 'contact') {
        const actuated = el.actuator === 'self' ? inputs.pressed.has(part.id) : coils.get(part.tag) === true
        const closed = el.normally === 'open' ? actuated : !actuated
        if (closed) {
          closedParts.add(part.id)
          nets.union(terminalKey({ part: part.id, pin: el.a }), terminalKey({ part: part.id, pin: el.b }))
        }
      }
    }
  }
  for (const w of Object.values(doc.wires)) {
    if (doc.parts[w.a.part] && doc.parts[w.b.part]) nets.union(terminalKey(w.a), terminalKey(w.b))
  }

  const liveRoots = new Set(lives.map((k) => nets.find(k)))
  const neutralRoots = new Set(neutrals.map((k) => nets.find(k)))
  const shortRoots = new Set([...liveRoots].filter((r) => neutralRoots.has(r)))
  const short = shortRoots.size > 0

  const potential = (k: string): Potential => {
    const r = nets.find(k)
    if (shortRoots.has(r)) return 'X'
    if (short) return null
    if (liveRoots.has(r)) return 'L'
    if (neutralRoots.has(r)) return 'N'
    return null
  }

  const powered = new Set<string>()
  const wantCoils = new Map<string, boolean>()
  for (const part of Object.values(doc.parts)) {
    for (const el of PARTS[part.type].elements) {
      if (el.kind !== 'load' && el.kind !== 'coil') continue
      const a = potential(terminalKey({ part: part.id, pin: el.a }))
      const b = potential(terminalKey({ part: part.id, pin: el.b }))
      const on = (a === 'L' && b === 'N') || (a === 'N' && b === 'L')
      if (on) powered.add(part.id)
      if (el.kind === 'coil') wantCoils.set(part.tag, (wantCoils.get(part.tag) ?? false) || on)
    }
  }
  return { nets, closedParts, potential, powered, wantCoils, short }
}

const sameCoils = (a: ReadonlyMap<string, boolean>, b: ReadonlyMap<string, boolean>): boolean => {
  const keys = new Set([...a.keys(), ...b.keys()])
  for (const k of keys) if ((a.get(k) ?? false) !== (b.get(k) ?? false)) return false
  return true
}

/**
 * Finds the steady state from the current coil states: switch coils, recompute, repeat until nothing changes.
 * Self-holding works because the previous coil states are the starting point.
 */
export function settle(doc: CircuitDoc, inputs: Inputs, previousCoils: ReadonlyMap<string, boolean> = new Map()): SimResult {
  let coils = new Map(previousCoils)
  let pass = solve(doc, inputs, coils)
  let oscillating = true
  for (let i = 0; i < SETTLE_LIMIT; i++) {
    if (sameCoils(pass.wantCoils, coils)) {
      // Same states; take the solved map so every coil on the sheet is listed, off ones included.
      coils = new Map(pass.wantCoils)
      oscillating = false
      break
    }
    coils = new Map(pass.wantCoils)
    pass = solve(doc, inputs, coils)
  }
  const final = pass
  return {
    netOf: (k) => final.nets.find(k),
    potential: final.potential,
    energized: (id) => final.powered.has(id),
    closed: (id) => final.closedParts.has(id),
    coils,
    short: final.short,
    oscillating,
  }
}

/** Fixed simulation step. The clock advances in these steps whatever the computer's speed. */
export const STEP_MS = 10

/**
 * The running simulation: keeps coil states between steps and its own clock, separate from drawing.
 * Timers (later) read `time`, so they keep real time however big the circuit is.
 */
export class Simulator {
  time = 0
  private coils = new Map<string, boolean>()
  private pressed = new Set<string>()
  private last: SimResult

  constructor(private doc: CircuitDoc) {
    this.last = settle(doc, { pressed: this.pressed }, this.coils)
  }

  get result(): SimResult {
    return this.last
  }

  press(partId: string): SimResult {
    this.pressed.add(partId)
    return this.update()
  }
  release(partId: string): SimResult {
    this.pressed.delete(partId)
    return this.update()
  }
  isPressed(partId: string): boolean {
    return this.pressed.has(partId)
  }

  /** Run the clock forward in fixed steps. */
  advance(ms: number): SimResult {
    const steps = Math.floor(ms / STEP_MS)
    for (let i = 0; i < steps; i++) {
      this.time += STEP_MS
      this.update()
    }
    return this.last
  }

  /** Re-solve after the circuit or the inputs changed. */
  update(): SimResult {
    for (const id of this.pressed) if (!this.doc.parts[id]) this.pressed.delete(id)
    this.last = settle(this.doc, { pressed: this.pressed }, this.coils)
    this.coils = new Map(this.last.coils)
    return this.last
  }

  /** Back to power-on: every coil dropped out, nothing pressed, clock at zero. */
  reset(): SimResult {
    this.coils.clear()
    this.pressed.clear()
    this.time = 0
    return this.update()
  }
}
