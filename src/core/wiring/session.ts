import { dist, inRect, simplify, snapPoint, type Anchor, type Point } from '../geometry'
import { PARTS } from '../library/definitions'
import { allTerminals, partRect, sameTerminal, terminalKey, terminalPos, wireCount, type CircuitDoc, type TerminalRef } from '../model/document'
import { WIRING } from './constants'
import { obstacles, smartTail, type Obstacles, type Posture } from './route'

/** Why the run noticed a terminal. The reason sets how strong the evidence is. */
export type NoticeReason = 'zone' | 'corridor' | 'part'

export interface Candidate {
  terminal: TerminalRef
  why: NoticeReason
}

export interface Modifiers {
  /** Alt held: all noticing and attaching off. */
  alt?: boolean
}

/** What a click or release did. */
export type Outcome =
  | { kind: 'continue' }
  | { kind: 'cancel' }
  | { kind: 'wire'; a: TerminalRef; b: TerminalRef; via: Point[] }

/**
 * One wire run, from pressing a terminal to connecting or cancelling, with no DOM in it:
 * the canvas feeds it pointer positions (world coordinates) and timestamps, and draws what it reports.
 * That is what lets every case in the catalogue run as an automated test.
 *
 * Evidence ladder (Wiring spec v1, section 3):
 *   strong — within the attach zone, or moving along a corridor toward its terminal → attaches
 *   medium — within the notice zone, in a corridor without moving toward it, or over a part → suggests; a click lands there
 *   weak   — direction of movement alone → nothing
 */
export class WiringSession {
  /** Corners locked so far, in order. */
  readonly corners: Point[] = []
  /** How many points each click added, so Backspace removes a whole click. */
  private steps: number[] = []
  cursor: Point
  /** The attached terminal (strong evidence), if any. */
  attached: TerminalRef | null = null
  private attachedWhy: NoticeReason | null = null
  /** What the run has noticed near the cursor (shown as a dashed ring). */
  candidate: Candidate | null = null
  posture: Posture | null = null
  private postureLocked = false
  private noSnap = false
  private leftOwnPart = false
  private trail: Array<Point & { t: number }> = []
  private obstacleCache = new Map<string, Obstacles>()

  constructor(
    readonly doc: CircuitDoc,
    readonly from: TerminalRef,
    start: Point,
    time: number,
    private zoom = 1,
  ) {
    this.cursor = start
    this.trail.push({ ...start, t: time })
  }

  /** Screen pixels → world units at the current zoom. */
  private px(n: number): number {
    return n / this.zoom
  }

  setZoom(zoom: number): void {
    this.zoom = zoom
  }

  /** The last fixed point of the run: the start terminal, or the last corner. */
  anchor(): Anchor {
    const last = this.corners[this.corners.length - 1]
    if (last) return { x: last.x, y: last.y, dir: 0 }
    const pos = terminalPos(this.doc, this.from)
    if (!pos) throw new Error('Wire run started on a terminal that no longer exists')
    return pos
  }

  move(p: Point, time: number, mods: Modifiers = {}): void {
    this.cursor = p
    this.noSnap = !!mods.alt
    this.updatePosture()
    this.updateOwnPart()
    this.trail.push({ ...p, t: time })
    while (this.trail.length > 2 && time - this.trail[0]!.t > WIRING.motionWindowMs) this.trail.shift()

    if (this.noSnap) {
      this.attached = null
      this.candidate = null
      return
    }
    const motion = this.motion()

    // Keep an attachment only while its evidence still holds; let go the moment it doesn't.
    if (this.attached) {
      const T = terminalPos(this.doc, this.attached)
      let keep = !!T && dist(T, p) < this.px(WIRING.noticeZone)
      if (T && !keep && this.attachedWhy === 'corridor') {
        const along = (p.y - T.y) * T.dir
        const away = !!motion && motion.y * T.dir > WIRING.corridorReleaseAlignment
        keep = Math.abs(p.x - T.x) < this.px(WIRING.corridorKeepHalfWidth) && along > 0 && along < this.px(WIRING.corridorKeepLength) && !away
      }
      if (!keep) {
        this.attached = null
        this.attachedWhy = null
      }
    }

    const cand = this.notice(p)
    if (cand) {
      const T = terminalPos(this.doc, cand.terminal)!
      let why: NoticeReason | null = null
      if (dist(T, p) < this.px(WIRING.attachZone)) why = 'zone'
      else if (cand.why === 'corridor' && motion && motion.y * -T.dir > WIRING.corridorAttachAlignment) why = 'corridor'
      if (why && !sameTerminal(this.attached, cand.terminal)) {
        this.attached = cand.terminal
        this.attachedWhy = why
      }
    }
    this.candidate = cand
  }

  /** Where a click or release would land right now: the attached terminal, else the suggested one. */
  landing(): TerminalRef | null {
    return this.attached ?? this.candidate?.terminal ?? null
  }

  /** The whole wire as it would be if you clicked now: what you see is what you get. */
  preview(target: TerminalRef | null = this.attached): Point[] {
    const start = terminalPos(this.doc, this.from)!
    const A = this.anchor()
    const T = target ? terminalPos(this.doc, target) : null
    const obs = this.obstaclesFor(target)
    const tail = T ? smartTail(obs, A, { terminal: T }, this.posture ?? 'v') : smartTail(obs, A, { point: snapPoint(this.cursor) }, this.posture ?? 'v')
    return simplify([start, ...this.corners, ...tail])
  }

  /** Click-click wiring: land on the landing terminal, or lock a corner. */
  click(p: Point, time: number, mods: Modifiers = {}): Outcome {
    this.move(p, time, mods)
    const land = this.landing()
    if (land) return this.finish(land)
    const A = this.anchor()
    const C = snapPoint(p)
    if (C.x === A.x && C.y === A.y) return this.corners.length ? { kind: 'continue' } : { kind: 'cancel' }
    const added = smartTail(this.obstaclesFor(null), A, { point: C }, this.posture ?? 'v')
    this.corners.push(...added)
    this.steps.push(added.length)
    this.posture = null
    this.postureLocked = false
    return { kind: 'continue' }
  }

  /** Drag wiring: releasing on a landing connects; releasing on empty space cancels (a miss never leaves junk). */
  release(p: Point, time: number, mods: Modifiers = {}): Outcome {
    this.move(p, time, mods)
    const land = this.landing()
    return land ? this.finish(land) : { kind: 'cancel' }
  }

  /** Backspace: remove the last click's corners. Returns 'cancel' when there was nothing left to remove. */
  undoCorner(): Outcome {
    const n = this.steps.pop()
    if (n === undefined) return { kind: 'cancel' }
    this.corners.splice(this.corners.length - n, n)
    this.posture = null
    this.postureLocked = false
    return { kind: 'continue' }
  }

  /** Space: flip which leg comes first, and keep it until the next corner. */
  flipPosture(): void {
    this.posture = this.posture === 'h' ? 'v' : 'h'
    this.postureLocked = true
  }

  private finish(land: TerminalRef): Outcome {
    if (sameTerminal(land, this.from)) return { kind: 'cancel' }
    const path = this.preview(land)
    return { kind: 'wire', a: { ...this.from }, b: { ...land }, via: path.slice(1, -1) }
  }

  private obstaclesFor(target: TerminalRef | null): Obstacles {
    const k = target ? terminalKey(target) : ''
    let obs = this.obstacleCache.get(k)
    if (!obs) {
      obs = obstacles(this.doc, target ? [this.from, target] : [this.from])
      this.obstacleCache.set(k, obs)
    }
    return obs
  }

  /** Posture follows the first clear movement away from the anchor; coming back near the anchor lets it re-decide. */
  private updatePosture(): void {
    if (this.postureLocked) return
    const A = this.anchor()
    const dx = this.cursor.x - A.x
    const dy = this.cursor.y - A.y
    if (Math.hypot(dx, dy) < this.px(WIRING.postureDecide)) this.posture = null
    else if (!this.posture) this.posture = Math.abs(dy) >= Math.abs(dx) ? 'v' : 'h'
  }

  /**
   * Own-part rule: the part a run starts on never grabs the wire by accident.
   * Its terminals only count once the cursor has clearly left it (beyond the notice zone) and come back.
   */
  private updateOwnPart(): void {
    if (this.leftOwnPart) return
    const part = this.doc.parts[this.from.part]
    if (part && !inRect(this.cursor, partRect(part), this.px(WIRING.noticeZone))) this.leftOwnPart = true
  }

  /** Direction of the last ~120 ms of movement, or null if the pointer has barely moved. */
  private motion(): Point | null {
    const a = this.trail[0]
    const b = this.trail[this.trail.length - 1]
    if (!a || !b) return null
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    return d < this.px(WIRING.motionMinDistance) ? null : { x: (b.x - a.x) / d, y: (b.y - a.y) / d }
  }

  /** What the run notices near p, strongest reason first. */
  private notice(p: Point): Candidate | null {
    const ownId = this.from.part
    const isFrom = (t: TerminalRef) => sameTerminal(t, this.from)

    let best: Candidate | null = null
    let bestD = this.px(WIRING.noticeZone)
    for (const t of allTerminals(this.doc)) {
      if (isFrom(t.ref) || (t.ref.part === ownId && !this.leftOwnPart)) continue
      const d = dist(t.pos, p)
      if (d < bestD) {
        bestD = d
        best = { terminal: t.ref, why: 'zone' }
      }
    }
    if (best) return best

    let nearest = Infinity
    for (const t of allTerminals(this.doc)) {
      if (t.ref.part === ownId || t.pos.dir === 0) continue
      const along = (p.y - t.pos.y) * t.pos.dir
      if (Math.abs(p.x - t.pos.x) < this.px(WIRING.corridorHalfWidth) && along > 0 && along < this.px(WIRING.corridorLength) && along < nearest) {
        nearest = along
        best = { terminal: t.ref, why: 'corridor' }
      }
    }
    if (best) return best

    const parts = Object.values(this.doc.parts).reverse()
    for (const part of parts) {
      if (part.id === ownId) continue
      const box = partRect(part)
      if (!inRect(p, box, this.px(WIRING.partTargetMargin))) continue
      const pick = this.partTarget(part.id, p, (box.top + box.bottom) / 2)
      if (pick) return { terminal: pick, why: 'part' }
    }
    return null
  }

  /**
   * Over a part, suggest the terminal of the half you're in: top half → a terminal facing up.
   * No preference for free terminals: where you point is the evidence, not what is already wired.
   */
  private partTarget(partId: string, p: Point, midY: number): TerminalRef | null {
    const part = this.doc.parts[partId]!
    const wantDir = p.y < midY ? -1 : 1
    const pins = Object.entries(PARTS[part.type].pins)
      .map(([pin, def]) => ({ ref: { part: partId, pin }, pos: { x: part.x + def.dx, y: part.y + def.dy }, dir: def.dir }))
      .filter((c) => !sameTerminal(c.ref, this.from))
    const inHalf = pins.filter((c) => c.dir === wantDir)
    const pool = inHalf.length ? inHalf : pins
    let pick: TerminalRef | null = null
    let pd = Infinity
    for (const c of pool) {
      const d = dist(c.pos, p)
      if (d < pd) {
        pd = d
        pick = c.ref
      }
    }
    return pick
  }

  /** For the canvas: how many wires already end on the landing terminal (shown in the landing label). */
  landingWireCount(): number {
    const land = this.landing()
    return land ? wireCount(this.doc, land) : 0
  }
}

