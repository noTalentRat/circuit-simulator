import {
  History,
  Simulator,
  addWire,
  lampExample,
  setLocale,
  startStopExample,
  terminalLabel,
  type CircuitDoc,
  type HistoryEntry,
  type Locale,
  type SimResult,
  type TerminalRef,
  type Point,
} from '../core'

export const EXAMPLES = {
  lamp: { labelKey: 'example.lamp', make: lampExample },
  startStop: { labelKey: 'example.startStop', make: startStopExample },
} as const
export type ExampleId = keyof typeof EXAMPLES

/**
 * The UI's view of the app: one History (the only way to change the circuit) and one Simulator.
 * `rev` ticks after every change so Svelte knows to redraw; the document itself is plain data.
 */
class AppState {
  history: History
  sim: Simulator
  rev = $state(0)
  result = $state.raw<SimResult>(null as unknown as SimResult)
  entries = $state.raw<HistoryEntry[]>([])
  selected = $state<{ kind: 'part' | 'wire'; id: string } | null>(null)
  locale = $state<Locale>('en')
  example = $state<ExampleId>('startStop')

  constructor() {
    this.history = new History(EXAMPLES[this.example].make())
    this.sim = new Simulator(this.history.doc)
    this.wire()
  }

  get doc(): CircuitDoc {
    return this.history.doc
  }

  private wire(): void {
    this.history.onChange(() => this.refresh())
    this.refresh()
  }

  /** Re-solve and redraw. Call after anything the engine or the canvas depends on changes. */
  refresh(result: SimResult = this.sim.update()): void {
    this.result = result
    this.entries = this.history.entries()
    if (this.selected && !(this.selected.kind === 'part' ? this.doc.parts[this.selected.id] : this.doc.wires[this.selected.id])) this.selected = null
    this.rev++
  }

  loadExample(id: ExampleId): void {
    this.example = id
    this.history = new History(EXAMPLES[id].make())
    this.sim = new Simulator(this.history.doc)
    this.selected = null
    this.wire()
  }

  setLocale(l: Locale): void {
    setLocale(l)
    this.locale = l
    this.rev++
  }

  press(id: string): void {
    this.refresh(this.sim.press(id))
  }
  release(id: string): void {
    this.refresh(this.sim.release(id))
  }

  connect(a: TerminalRef, b: TerminalRef, via: Point[]): boolean {
    const { changes } = addWire(this.doc, a, b, via)
    if (!changes.length) return false
    this.history.commit(`Wire ${terminalLabel(this.doc, a)} – ${terminalLabel(this.doc, b)}`, changes)
    return true
  }

  undo(): void {
    this.history.undo()
  }
  redo(): void {
    this.history.redo()
  }
}

export const app = new AppState()
