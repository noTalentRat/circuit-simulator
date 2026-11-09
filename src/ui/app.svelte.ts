import { History, Simulator, emptyDoc, lampExample, setLocale, startStopExample, type CircuitDoc, type HistoryEntry, type Locale, type MessageKey, type SimResult } from '../core'
import { Editor } from '../editor/editor'
import { save } from './storage'

export const EXAMPLES: Array<{ id: string; labelKey: MessageKey; make: () => CircuitDoc }> = [
  { id: 'startStop', labelKey: 'example.startStop', make: startStopExample },
  { id: 'lamp', labelKey: 'example.lamp', make: lampExample },
]

export type SaveState = { kind: 'restored' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'error' } | { kind: 'fresh' }

const SAVE_DELAY_MS = 400
const LOCALE_KEY = 'circuit-simulator-locale'

/**
 * The UI's view of the app: one History (the only way the circuit changes), one Simulator,
 * one Editor (pointer and keyboard behaviour), and autosave. `rev` ticks whenever anything
 * the screen shows has changed, so Svelte redraws.
 */
export class AppState {
  readonly history: History
  readonly sim: Simulator
  readonly editor: Editor
  rev = $state(0)
  result = $state.raw<SimResult>(null as unknown as SimResult)
  entries = $state.raw<HistoryEntry[]>([])
  locale = $state<Locale>('en')
  saveState = $state<SaveState>({ kind: 'fresh' })
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(doc: CircuitDoc, restored: boolean) {
    this.history = new History(doc)
    this.sim = new Simulator(this.history.doc)
    this.editor = new Editor(this.history, this.sim)
    if (restored) this.saveState = { kind: 'restored' }
    this.history.onChange(() => {
      this.sim.update()
      this.scheduleSave()
      this.refresh()
    })
    this.editor.onChange(() => this.refresh())
    try {
      const l = localStorage.getItem(LOCALE_KEY)
      if (l === 'en' || l === 'es') this.setLocale(l)
    } catch {
      /* storage blocked: stay in English */
    }
    this.refresh()
  }

  refresh(): void {
    this.result = this.sim.result
    this.entries = this.history.entries()
    this.rev++
  }

  setLocale(l: Locale): void {
    setLocale(l)
    this.locale = l
    document.documentElement.lang = l
    try {
      localStorage.setItem(LOCALE_KEY, l)
    } catch {
      /* not remembered, fine */
    }
    this.rev++
  }

  newSheet(): void {
    this.editor.loadSheet(emptyDoc(), 'New sheet')
  }

  loadExample(id: string): void {
    const ex = EXAMPLES.find((e) => e.id === id)
    if (ex) this.editor.loadSheet(ex.make(), `Open example: ${id}`)
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveState = { kind: 'saving' }
    this.saveTimer = setTimeout(() => void this.saveNow(), SAVE_DELAY_MS)
  }

  /** Save right away (also called when the tab is hidden or closed). */
  async saveNow(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    try {
      await save(this.history.doc)
      this.saveState = { kind: 'saved', at: new Date() }
    } catch {
      this.saveState = { kind: 'error' }
    }
  }

  get unsaved(): boolean {
    return this.saveState.kind === 'saving'
  }
}

/** Set once in main.ts, after the saved sheet has been read. */
export let app: AppState

export function initApp(doc: CircuitDoc, restored: boolean): AppState {
  app = new AppState(doc, restored)
  return app
}
