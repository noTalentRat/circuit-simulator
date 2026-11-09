import {
  PARTS,
  WIRING,
  WiringSession,
  addPart,
  addWire,
  allTerminals,
  copyParts,
  deleteSelection,
  dist,
  distToSegment,
  inRect,
  loadSheet,
  moveParts,
  partRect,
  pasteClip,
  reconnectWire,
  renameTag,
  sameTerminal,
  snap,
  terminalKey,
  terminalLabel,
  wirePath,
  type Change,
  type CircuitDoc,
  type Clip,
  type History,
  type Outcome,
  type PartType,
  type Point,
  type Rect,
  type Simulator,
  type TagError,
  type TerminalRef,
} from '../core'

/**
 * The sheet editor's behaviour, with no screen in it: it takes pointer positions (canvas pixels),
 * timestamps and keys, changes the circuit only through History, and reports what to draw.
 * The Svelte canvas is a thin layer over this, and the tests drive it directly.
 */

export interface Mods {
  shift?: boolean
  alt?: boolean
  ctrl?: boolean
}

export interface Viewport {
  /** World point at the canvas's top-left corner. */
  ox: number
  oy: number
  /** Zoom: screen pixels per world unit. */
  z: number
  /** Canvas size in screen pixels. */
  width: number
  height: number
}

export type Hit =
  | { kind: 'pin'; ref: TerminalRef }
  | { kind: 'wireEnd'; wireId: string; end: 'a' | 'b'; ref: TerminalRef }
  | { kind: 'act'; id: string }
  | { kind: 'part'; id: string }
  | { kind: 'wire'; id: string }
  | null

type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number; panned: boolean; duringWiring: boolean }
  | { kind: 'box'; from: Point; to: Point; additive: boolean }
  | { kind: 'move'; start: Point; ids: string[]; dx: number; dy: number; moved: boolean; sx: number; sy: number }
  | { kind: 'endPending'; wireId: string; end: 'a' | 'b'; ref: TerminalRef; sx: number; sy: number; world: Point; t: number }
  | { kind: 'press'; id: string }

/** Screen pixels a pointer must travel before a press turns into a drag. */
const DRAG_SLOP = 5
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
/** Auto-pan speed at the very edge, in screen pixels per second. */
const AUTO_PAN_SPEED = 600

/** Shared by every editor in the page, so copy in one sheet pastes in another. */
let clipboard: Clip | null = null

export class Editor {
  view: Viewport = { ox: 0, oy: 0, z: 1, width: 800, height: 500 }
  readonly selection = { parts: new Set<string>(), wires: new Set<string>() }
  /** The wire run in progress, if any. */
  session: WiringSession | null = null
  sessionMode: 'drag' | 'click' = 'drag'
  /** Set when the run is moving an existing wire's end rather than drawing a new wire. */
  reconnecting: { wireId: string; end: 'a' | 'b' } | null = null
  /** Net under the pointer, for net highlighting. */
  hoverNet: string | null = null
  /** Last pointer position on the canvas, in world units; Paste lands here. */
  cursor: Point | null = null
  private drag: Drag | null = null
  private sessionStart = { x: 0, y: 0 }
  private sessionMoved = false
  private lastScreen: Point | null = null
  private lastTime = 0
  private altHeld = false
  private listeners = new Set<() => void>()
  private moveCache: { key: string; doc: CircuitDoc } | null = null

  constructor(
    readonly history: History,
    readonly sim: Simulator,
  ) {}

  get doc(): CircuitDoc {
    return this.history.doc
  }

  /** Called after anything that changes what the canvas shows. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private emit(): void {
    for (const fn of this.listeners) fn()
  }

  private commit(label: string, changes: Change[]): boolean {
    if (!changes.length) return false
    this.history.commit(label, changes)
    this.sim.update()
    this.pruneSelection()
    return true
  }

  // ---------- view ----------

  toWorld(s: Point): Point {
    return { x: this.view.ox + s.x / this.view.z, y: this.view.oy + s.y / this.view.z }
  }
  toScreen(w: Point): Point {
    return { x: (w.x - this.view.ox) * this.view.z, y: (w.y - this.view.oy) * this.view.z }
  }
  private px(n: number): number {
    return n / this.view.z
  }

  setSize(width: number, height: number): void {
    this.view = { ...this.view, width, height }
    this.emit()
  }

  zoomAt(s: Point, z: number): void {
    const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
    const w = this.toWorld(s)
    this.view = { ...this.view, z: nz, ox: w.x - s.x / nz, oy: w.y - s.y / nz }
    this.session?.setZoom(nz)
    this.emit()
  }

  zoomBy(factor: number): void {
    this.zoomAt({ x: this.view.width / 2, y: this.view.height / 2 }, this.view.z * factor)
  }

  /** Frame every part, with a margin. */
  fit(): void {
    const parts = Object.values(this.doc.parts)
    const { width, height } = this.view
    if (!parts.length) {
      this.view = { ...this.view, z: 1, ox: -width / 2, oy: -height / 2 }
      this.emit()
      return
    }
    const rects = parts.map((p) => partRect(p))
    const left = Math.min(...rects.map((r) => r.left)) - 60
    const right = Math.max(...rects.map((r) => r.right)) + 60
    const top = Math.min(...rects.map((r) => r.top)) - 60
    const bottom = Math.max(...rects.map((r) => r.bottom)) + 60
    const z = Math.min(2, Math.max(MIN_ZOOM, Math.min(width / (right - left), height / (bottom - top))))
    this.view = { ...this.view, z, ox: (left + right) / 2 - width / (2 * z), oy: (top + bottom) / 2 - height / (2 * z) }
    this.session?.setZoom(z)
    this.emit()
  }

  private panBy(dxScreen: number, dyScreen: number): void {
    this.view = { ...this.view, ox: this.view.ox + dxScreen / this.view.z, oy: this.view.oy + dyScreen / this.view.z }
  }

  // ---------- hit testing ----------

  hitTest(w: Point): Hit {
    const doc = this.doc
    let best: TerminalRef | null = null
    let bd = this.px(14)
    for (const t of allTerminals(doc)) {
      const d = dist(t.pos, w)
      if (d < bd) {
        bd = d
        best = t.ref
      }
    }
    if (best) {
      // A terminal where a selected wire ends: clicking starts a new wire, dragging moves that end (W09).
      for (const id of this.selection.wires) {
        const wire = doc.wires[id]
        if (!wire) continue
        if (sameTerminal(wire.a, best)) return { kind: 'wireEnd', wireId: id, end: 'a', ref: best }
        if (sameTerminal(wire.b, best)) return { kind: 'wireEnd', wireId: id, end: 'b', ref: best }
      }
      return { kind: 'pin', ref: best }
    }
    const parts = Object.values(doc.parts).reverse()
    for (const p of parts) {
      const a = PARTS[p.type].actuator
      if (a && inRect(w, { left: p.x + a[0], top: p.y + a[1], right: p.x + a[0] + a[2], bottom: p.y + a[1] + a[3] })) return { kind: 'act', id: p.id }
    }
    for (const p of parts) if (inRect(w, partRect(p, 4))) return { kind: 'part', id: p.id }
    for (const wire of Object.values(doc.wires)) {
      const pts = wirePath(doc, wire)
      if (!pts) continue
      for (let i = 0; i < pts.length - 1; i++) if (distToSegment(w, pts[i]!, pts[i + 1]!) < this.px(7)) return { kind: 'wire', id: wire.id }
    }
    return null
  }

  // ---------- pointer ----------

  down(s: Point, t: number, mods: Mods = {}): void {
    this.lastScreen = s
    this.lastTime = t
    const w = this.toWorld(s)
    this.cursor = w
    if (this.session && this.sessionMode === 'click') {
      // A press during click-click wiring: a click places a corner or lands; a drag pans (W01).
      this.drag = { kind: 'pan', sx: s.x, sy: s.y, ox: this.view.ox, oy: this.view.oy, panned: false, duringWiring: true }
      return
    }
    const hit = this.hitTest(w)
    this.hoverNet = null
    if (!hit) {
      if (mods.shift) this.drag = { kind: 'box', from: w, to: w, additive: true }
      else {
        this.clearSelection()
        this.drag = { kind: 'pan', sx: s.x, sy: s.y, ox: this.view.ox, oy: this.view.oy, panned: false, duringWiring: false }
      }
    } else if (hit.kind === 'pin') {
      this.clearSelection()
      this.startSession(hit.ref, w, t, s, 'drag')
    } else if (hit.kind === 'wireEnd') {
      this.drag = { kind: 'endPending', wireId: hit.wireId, end: hit.end, ref: hit.ref, sx: s.x, sy: s.y, world: w, t }
    } else if (hit.kind === 'act') {
      this.drag = { kind: 'press', id: hit.id }
      this.sim.press(hit.id)
    } else if (hit.kind === 'part') {
      if (mods.shift) this.toggle('parts', hit.id)
      else if (!this.selection.parts.has(hit.id)) this.selectOnly([hit.id], [])
      if (this.selection.parts.has(hit.id)) {
        this.drag = { kind: 'move', start: w, ids: [...this.selection.parts], dx: 0, dy: 0, moved: false, sx: s.x, sy: s.y }
      }
    } else if (hit.kind === 'wire') {
      if (mods.shift) this.toggle('wires', hit.id)
      else this.selectOnly([], [hit.id])
    }
    this.emit()
  }

  move(s: Point, t: number, mods: Mods = {}): void {
    this.lastScreen = s
    this.lastTime = t
    this.altHeld = !!mods.alt
    const w = this.toWorld(s)
    this.cursor = w
    const d = this.drag
    if (d?.kind === 'pan') {
      if (Math.hypot(s.x - d.sx, s.y - d.sy) > DRAG_SLOP) d.panned = true
      if (d.panned) this.view = { ...this.view, ox: d.ox - (s.x - d.sx) / this.view.z, oy: d.oy - (s.y - d.sy) / this.view.z }
      if (this.session) this.session.move(this.toWorld(s), t, { alt: mods.alt })
      this.emit()
      return
    }
    if (d?.kind === 'endPending' && Math.hypot(s.x - d.sx, s.y - d.sy) > DRAG_SLOP) {
      // Dragging from a selected wire's end: pick that end up and carry it, like a new run from the fixed end.
      this.drag = null
      this.startReconnect(d.wireId, d.end, d.world, d.t, { x: d.sx, y: d.sy })
    }
    if (this.session) {
      if (this.sessionMode === 'drag' && Math.hypot(s.x - this.sessionStart.x, s.y - this.sessionStart.y) > WIRING.dragThreshold) this.sessionMoved = true
      this.session.move(w, t, { alt: mods.alt })
      this.emit()
      return
    }
    if (d?.kind === 'move') {
      if (!d.moved && Math.hypot(s.x - d.sx, s.y - d.sy) > DRAG_SLOP) d.moved = true
      if (d.moved) {
        d.dx = snap(w.x - d.start.x)
        d.dy = snap(w.y - d.start.y)
      }
      this.emit()
      return
    }
    if (d?.kind === 'box') {
      d.to = w
      this.emit()
      return
    }
    if (!d) {
      const hit = this.hitTest(w)
      let net: string | null = null
      if (hit?.kind === 'pin' || hit?.kind === 'wireEnd') net = this.sim.result.netOf(terminalKey(hit.ref))
      else if (hit?.kind === 'wire') {
        const wire = this.doc.wires[hit.id]
        if (wire) net = this.sim.result.netOf(terminalKey(wire.a))
      }
      if (net !== this.hoverNet) {
        this.hoverNet = net
        this.emit()
      }
    }
  }

  up(s: Point, t: number, mods: Mods = {}): void {
    this.lastScreen = s
    this.lastTime = t
    const w = this.toWorld(s)
    const d = this.drag
    this.drag = null
    if (d?.kind === 'pan' && d.duringWiring) {
      if (!d.panned && this.session) this.finish(this.session.click(w, t, { alt: mods.alt }))
      this.emit()
      return
    }
    if (d?.kind === 'endPending') {
      // A click (no drag) on a selected wire's end starts a new wire from that terminal (W09).
      this.clearSelection()
      this.startSession(d.ref, d.world, d.t, { x: d.sx, y: d.sy }, 'click')
      this.emit()
      return
    }
    if (this.session && this.sessionMode === 'drag') {
      // A quick press-and-release on a terminal starts click-click wiring: no button held for long runs.
      if (!this.sessionMoved) this.sessionMode = 'click'
      else this.finish(this.session.release(w, t, { alt: mods.alt }))
      this.emit()
      return
    }
    if (d?.kind === 'move' && d.moved) {
      const label = d.ids.length === 1 ? `Move ${this.doc.parts[d.ids[0]!]?.tag ?? ''}` : `Move ${d.ids.length} parts`
      this.commit(label, moveParts(this.doc, d.ids, d.dx, d.dy))
    } else if (d?.kind === 'box') {
      this.selectBox(d.from, d.to, d.additive)
    } else if (d?.kind === 'press') {
      this.sim.release(d.id)
    }
    this.emit()
  }

  /** Pointer left or the browser took it away: drop anything half-done, keep click-click wiring alive. */
  cancelPointer(): void {
    const d = this.drag
    this.drag = null
    if (d?.kind === 'press') this.sim.release(d.id)
    if (this.session && this.sessionMode === 'drag') this.cancelSession()
    this.emit()
  }

  leave(): void {
    if (this.hoverNet) {
      this.hoverNet = null
      this.emit()
    }
  }

  wheel(s: Point, deltaY: number, t: number): void {
    this.zoomAt(s, this.view.z * Math.exp(-deltaY * 0.0015))
    if (this.session) this.session.move(this.toWorld(s), t, { alt: this.altHeld })
    this.emit()
  }

  // ---------- auto-pan ----------

  /** How fast the view should scroll right now (screen px/s), when a run or a move is near the canvas edge. */
  autoPanVelocity(): Point | null {
    const s = this.lastScreen
    const active = (this.session && !(this.drag?.kind === 'pan')) || (this.drag?.kind === 'move' && this.drag.moved)
    if (!s || !active) return null
    const edge = WIRING.autoPanEdge
    const axis = (v: number, size: number) => (v < edge ? -(edge - v) / edge : v > size - edge ? (v - (size - edge)) / edge : 0)
    const vx = axis(s.x, this.view.width)
    const vy = axis(s.y, this.view.height)
    if (!vx && !vy) return null
    const clamp = (v: number) => Math.max(-1, Math.min(1, v)) * AUTO_PAN_SPEED
    return { x: clamp(vx), y: clamp(vy) }
  }

  /** Advance auto-pan by dt milliseconds. The canvas calls this every frame while autoPanVelocity() is set. */
  tick(dtMs: number): void {
    const v = this.autoPanVelocity()
    if (!v || !this.lastScreen) return
    this.panBy((v.x * dtMs) / 1000, (v.y * dtMs) / 1000)
    this.lastTime += dtMs
    this.move(this.lastScreen, this.lastTime, { alt: this.altHeld })
  }

  // ---------- wiring ----------

  private startSession(from: TerminalRef, world: Point, t: number, s: Point, mode: 'drag' | 'click', doc: CircuitDoc = this.doc): void {
    this.session = new WiringSession(doc, from, world, t, this.view.z)
    this.sessionMode = mode
    this.sessionStart = s
    this.sessionMoved = false
  }

  private startReconnect(wireId: string, end: 'a' | 'b', world: Point, t: number, s: Point): void {
    const wire = this.doc.wires[wireId]
    if (!wire) return
    // The run starts from the end that stays; the router treats the wire being moved as gone.
    const without = structuredClone(this.doc)
    delete without.wires[wireId]
    const fixed = end === 'a' ? wire.b : wire.a
    this.startSession(fixed, world, t, s, 'drag', without)
    this.reconnecting = { wireId, end }
    this.sessionMoved = true
    this.session!.move(world, t)
  }

  private finish(out: Outcome): void {
    if (out.kind === 'continue') return
    const rc = this.reconnecting
    this.session = null
    this.reconnecting = null
    if (out.kind !== 'wire') return
    if (rc) {
      const label = `Reconnect wire to ${terminalLabel(this.doc, out.b)}`
      this.commit(label, reconnectWire(this.doc, rc.wireId, rc.end, out.b, out.via))
      this.selectOnly([], [rc.wireId])
      this.lastConnected = [out.a, out.b]
      return
    }
    const { changes, wire } = addWire(this.doc, out.a, out.b, out.via)
    if (wire && this.commit(`Wire ${terminalLabel(this.doc, out.a)} – ${terminalLabel(this.doc, out.b)}`, changes)) this.lastConnected = [out.a, out.b]
  }

  /** Terminals joined by the last wire made, for the canvas's connect pulse. Read and cleared by the canvas. */
  lastConnected: [TerminalRef, TerminalRef] | null = null

  cancelSession(): void {
    this.session = null
    this.reconnecting = null
    this.emit()
  }

  // ---------- selection ----------

  clearSelection(): void {
    this.selection.parts.clear()
    this.selection.wires.clear()
  }

  selectOnly(parts: string[], wires: string[]): void {
    this.clearSelection()
    for (const id of parts) this.selection.parts.add(id)
    for (const id of wires) this.selection.wires.add(id)
    this.emit()
  }

  private toggle(kind: 'parts' | 'wires', id: string): void {
    const set = this.selection[kind]
    if (set.has(id)) set.delete(id)
    else set.add(id)
  }

  selectAll(): void {
    this.selectOnly(Object.keys(this.doc.parts), Object.keys(this.doc.wires))
  }

  /** Parts touching the box are selected, and the wires between selected parts. */
  private selectBox(a: Point, b: Point, additive: boolean): void {
    const box: Rect = { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) }
    if (!additive) this.clearSelection()
    for (const p of Object.values(this.doc.parts)) {
      const r = partRect(p)
      if (r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top) this.selection.parts.add(p.id)
    }
    for (const w of Object.values(this.doc.wires)) if (this.selection.parts.has(w.a.part) && this.selection.parts.has(w.b.part)) this.selection.wires.add(w.id)
  }

  /** Drop selected ids that no longer exist (after undo, delete, a loaded sheet). */
  pruneSelection(): void {
    for (const id of this.selection.parts) if (!this.doc.parts[id]) this.selection.parts.delete(id)
    for (const id of this.selection.wires) if (!this.doc.wires[id]) this.selection.wires.delete(id)
  }

  /** The selection box being dragged, in world units, for the canvas to draw. */
  get box(): Rect | null {
    const d = this.drag
    if (d?.kind !== 'box') return null
    return { left: Math.min(d.from.x, d.to.x), right: Math.max(d.from.x, d.to.x), top: Math.min(d.from.y, d.to.y), bottom: Math.max(d.from.y, d.to.y) }
  }

  get isPanning(): boolean {
    return this.drag?.kind === 'pan' && this.drag.panned
  }

  /**
   * The circuit as it should look right now. While parts are being dragged this is a preview
   * with the parts moved and their wires rerouted; nothing is committed until the drop.
   */
  get displayDoc(): CircuitDoc {
    const d = this.drag
    if (d?.kind !== 'move' || !d.moved || (d.dx === 0 && d.dy === 0)) return this.doc
    const key = `${d.ids.join(',')}|${d.dx},${d.dy}|${this.history.entries().length}`
    if (this.moveCache?.key === key) return this.moveCache.doc
    const preview = structuredClone(this.doc)
    for (const ch of moveParts(this.doc, d.ids, d.dx, d.dy)) {
      ;(preview[ch.coll] as Record<string, unknown>)[ch.id] = structuredClone(ch.after)
    }
    this.moveCache = { key, doc: preview }
    return preview
  }

  // ---------- edits ----------

  /** Add a part in the middle of the view, nudged clear of other parts, and select it. */
  addPart(type: PartType): string {
    const c = this.toWorld({ x: this.view.width / 2, y: this.view.height / 2 })
    let x = snap(c.x)
    const y = snap(c.y)
    const overlaps = (px: number) => Object.values(this.doc.parts).some((p) => Math.abs(p.x - px) < 80 && Math.abs(p.y - y) < 100)
    for (let i = 0; i < 20 && overlaps(x); i++) x += 80
    const { changes, part } = addPart(this.doc, type, x, y)
    this.commit(`Add ${part.tag}`, changes)
    this.selectOnly([part.id], [])
    return part.id
  }

  deleteSelected(): void {
    const parts = [...this.selection.parts]
    const wires = [...this.selection.wires]
    const n = parts.length + wires.length
    if (!n) return
    const only = parts.length === 1 && !wires.length ? this.doc.parts[parts[0]!]?.tag : null
    this.commit(only ? `Delete ${only}` : `Delete ${n} items`, deleteSelection(this.doc, parts, wires))
    this.clearSelection()
    this.emit()
  }

  copy(): boolean {
    if (!this.selection.parts.size) return false
    clipboard = copyParts(this.doc, [...this.selection.parts])
    return true
  }

  cut(): void {
    if (this.copy()) this.deleteSelected()
  }

  /** Paste centred on the cursor (or the middle of the view), and select what was pasted. */
  paste(at: Point | null = this.cursor): void {
    if (!clipboard?.parts.length) return
    const target = at ?? this.toWorld({ x: this.view.width / 2, y: this.view.height / 2 })
    const { changes, partIds, wireIds } = pasteClip(this.doc, clipboard, target)
    this.commit(partIds.length === 1 ? `Paste ${this.tagAfter(changes, partIds[0]!)}` : `Paste ${partIds.length} parts`, changes)
    this.selectOnly(partIds, wireIds)
  }

  /** Copy and paste in one go, offset down-right. */
  duplicate(): void {
    if (!this.copy() || !clipboard) return
    this.paste({ x: clipboard.center.x + 40, y: clipboard.center.y + 40 })
  }

  private tagAfter(changes: Change[], id: string): string {
    const ch = changes.find((c) => c.id === id)
    return ch && ch.coll === 'parts' && ch.after ? ch.after.tag : ''
  }

  /** Rename a part's tag. Returns why it was refused, or null. */
  renameTag(id: string, raw: string): TagError | null {
    const before = this.doc.parts[id]?.tag
    const { changes, error } = renameTag(this.doc, id, raw)
    if (!error) this.commit(`Rename ${before} to ${raw.trim().toUpperCase()}`, changes)
    this.emit()
    return error
  }

  /** Replace the sheet (New, an example) as one undo step, then frame it. */
  loadSheet(next: CircuitDoc, label: string): void {
    this.cancelSession()
    this.sim.reset()
    this.commit(label, loadSheet(this.doc, next))
    this.clearSelection()
    this.fit()
  }

  undo(): void {
    this.cancelSession()
    if (this.history.undo()) {
      this.sim.update()
      this.pruneSelection()
    }
    this.emit()
  }

  redo(): void {
    this.cancelSession()
    if (this.history.redo()) {
      this.sim.update()
      this.pruneSelection()
    }
    this.emit()
  }

  // ---------- keyboard ----------

  /** Returns true when the key was used (the canvas then prevents the browser's default). */
  key(key: string, mods: Mods = {}): boolean {
    const k = key.toLowerCase()
    if (this.session) {
      if (key === 'Escape') this.cancelSession()
      else if (key === 'Backspace' || key === 'Delete') this.finish(this.session.undoCorner())
      else if (key === ' ') this.session.flipPosture()
      else if (key === 'Alt') {
        this.altHeld = true
        if (this.cursor) this.session.move(this.cursor, this.lastTime, { alt: true })
      } else return false
      this.emit()
      return true
    }
    if (mods.ctrl) {
      if (k === 'z' && mods.shift) this.redo()
      else if (k === 'z') this.undo()
      else if (k === 'y') this.redo()
      else if (k === 'c') this.copy()
      else if (k === 'x') this.cut()
      else if (k === 'v') this.paste()
      else if (k === 'd') this.duplicate()
      else if (k === 'a') this.selectAll()
      else return false
      this.emit()
      return true
    }
    if (key === 'Delete' || key === 'Backspace') {
      if (!this.selection.parts.size && !this.selection.wires.size) return false
      this.deleteSelected()
      return true
    }
    if (key === 'Escape') {
      this.drag = null
      this.clearSelection()
      this.emit()
      return true
    }
    return false
  }

  keyUp(key: string): void {
    if (key === 'Alt' && this.session) {
      this.altHeld = false
      if (this.cursor) this.session.move(this.cursor, this.lastTime, { alt: false })
      this.emit()
    }
  }
}
