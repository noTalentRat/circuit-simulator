import type { CircuitDoc, Collection, Part, Wire } from '../model/document'

/**
 * One reversible edit to one record: what it was before and what it is after.
 * null before = created; null after = deleted. Undo applies `before`, redo applies `after`.
 */
export type Change =
  | { coll: 'parts'; id: string; before: Part | null; after: Part | null }
  | { coll: 'wires'; id: string; before: Wire | null; after: Wire | null }

/** A user action, as one undo step. */
export interface Command {
  label: string
  changes: Change[]
}

export interface HistoryEntry {
  label: string
  /** 'done' = in the document; 'undone' = can be redone. */
  state: 'done' | 'undone'
  current: boolean
}

const MAX_STEPS = 500

const copy = <T>(v: T): T => structuredClone(v)

function apply(doc: CircuitDoc, changes: readonly Change[], side: 'before' | 'after'): void {
  const list = side === 'before' ? [...changes].reverse() : changes
  for (const ch of list) {
    const value = ch[side]
    const coll = doc[ch.coll as Collection] as Record<string, Part | Wire>
    if (value) coll[ch.id] = copy(value)
    else delete coll[ch.id]
  }
}

/**
 * Owns the document and every change to it. The only way to edit the circuit is `commit`,
 * so undo can never go out of step with what is on the sheet — undo isn't bolted on, it is the edit path.
 */
export class History {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  private listeners = new Set<(cmd: Command | null) => void>()

  constructor(readonly doc: CircuitDoc) {}

  /** Applies a command and makes it the newest undo step. Empty commands are ignored. */
  commit(label: string, changes: Change[]): void {
    if (!changes.length) return
    const cmd: Command = { label, changes: copy(changes) }
    apply(this.doc, cmd.changes, 'after')
    this.undoStack.push(cmd)
    if (this.undoStack.length > MAX_STEPS) this.undoStack.shift()
    this.redoStack = []
    this.emit(cmd)
  }

  undo(): boolean {
    const cmd = this.undoStack.pop()
    if (!cmd) return false
    apply(this.doc, cmd.changes, 'before')
    this.redoStack.push(cmd)
    this.emit(cmd)
    return true
  }

  redo(): boolean {
    const cmd = this.redoStack.pop()
    if (!cmd) return false
    apply(this.doc, cmd.changes, 'after')
    this.undoStack.push(cmd)
    this.emit(cmd)
    return true
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Oldest first; the last 'done' entry is current. */
  entries(): HistoryEntry[] {
    const done = this.undoStack.map((c, i, all) => ({ label: c.label, state: 'done' as const, current: i === all.length - 1 }))
    const undone = [...this.redoStack].reverse().map((c) => ({ label: c.label, state: 'undone' as const, current: false }))
    return [...done, ...undone]
  }

  /** Called after every commit, undo and redo. Returns an unsubscribe function. */
  onChange(fn: (cmd: Command | null) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(cmd: Command | null): void {
    for (const fn of this.listeners) fn(cmd)
  }
}
