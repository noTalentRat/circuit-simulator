<script lang="ts">
  import {
    PARTS,
    WiringSession,
    allTerminals,
    dist,
    distToSegment,
    inRect,
    partRect,
    pathData,
    snapPoint,
    t,
    terminalKey,
    terminalLabel,
    terminalPos,
    wirePath,
    type Outcome,
    type Point,
    type Potential,
    type TerminalRef,
  } from '../core'
  import { app } from './app.svelte'
  import PartSymbol from './PartSymbol.svelte'

  let svgEl: SVGSVGElement
  let width = $state(800)
  let height = $state(500)
  let view = $state({ ox: 0, oy: 0, z: 1 })
  let fitted = false

  // Wiring and pointer state
  let session = $state.raw<WiringSession | null>(null)
  let mode: 'drag' | 'click' = 'drag'
  let startScreen = { x: 0, y: 0 }
  let moved = false
  let tick = $state(0)
  let pan: { sx: number; sy: number; ox: number; oy: number; panned: boolean; wiringClick: boolean } | null = null
  let pressing: string | null = null
  let hoverNet = $state<string | null>(null)
  let pulses = $state<Array<{ id: number; x: number; y: number }>>([])
  let pulseSeq = 0

  const px = (n: number) => n / view.z

  // ---------- view ----------
  function toWorld(e: { clientX: number; clientY: number }): Point {
    const r = svgEl.getBoundingClientRect()
    return { x: view.ox + (e.clientX - r.left) / view.z, y: view.oy + (e.clientY - r.top) / view.z }
  }
  function zoomAt(sx: number, sy: number, z: number) {
    const nz = Math.min(4, Math.max(0.25, z))
    const wx = view.ox + sx / view.z
    const wy = view.oy + sy / view.z
    view = { z: nz, ox: wx - sx / nz, oy: wy - sy / nz }
    session?.setZoom(nz)
  }
  export function fit() {
    const parts = Object.values(app.doc.parts)
    if (!parts.length) return
    const rects = parts.map((p) => partRect(p))
    const left = Math.min(...rects.map((r) => r.left)) - 60
    const right = Math.max(...rects.map((r) => r.right)) + 60
    const top = Math.min(...rects.map((r) => r.top)) - 60
    const bottom = Math.max(...rects.map((r) => r.bottom)) + 60
    const z = Math.min(2, Math.max(0.25, Math.min(width / (right - left), height / (bottom - top))))
    view = { z, ox: (left + right) / 2 - width / (2 * z), oy: (top + bottom) / 2 - height / (2 * z) }
  }
  export function zoomBy(f: number) {
    zoomAt(width / 2, height / 2, view.z * f)
  }
  export const zoom = () => view.z

  $effect(() => {
    const ro = new ResizeObserver(() => {
      width = svgEl.clientWidth
      height = svgEl.clientHeight
      if (!fitted && width) {
        fitted = true
        fit()
      }
    })
    ro.observe(svgEl)
    return () => ro.disconnect()
  })

  // Refit when a different example loads.
  let lastExample = app.example
  $effect(() => {
    if (app.example !== lastExample) {
      lastExample = app.example
      session = null
      fit()
    }
  })

  // ---------- hit testing ----------
  type Hit = { kind: 'pin'; ref: TerminalRef } | { kind: 'act'; id: string } | { kind: 'part'; id: string } | { kind: 'wire'; id: string } | null
  function hitTest(w: Point): Hit {
    const doc = app.doc
    let best: TerminalRef | null = null
    let bd = px(14)
    for (const term of allTerminals(doc)) {
      const d = dist(term.pos, w)
      if (d < bd) {
        bd = d
        best = term.ref
      }
    }
    if (best) return { kind: 'pin', ref: best }
    const parts = Object.values(doc.parts).reverse()
    for (const p of parts) {
      const a = PARTS[p.type].actuator
      if (a && inRect(w, { left: p.x + a[0], top: p.y + a[1], right: p.x + a[0] + a[2], bottom: p.y + a[1] + a[3] })) return { kind: 'act', id: p.id }
    }
    for (const p of parts) if (inRect(w, partRect(p, 4))) return { kind: 'part', id: p.id }
    for (const wire of Object.values(doc.wires)) {
      const pts = wirePath(doc, wire)
      if (!pts) continue
      for (let i = 0; i < pts.length - 1; i++) if (distToSegment(w, pts[i]!, pts[i + 1]!) < px(7)) return { kind: 'wire', id: wire.id }
    }
    return null
  }

  // ---------- wiring ----------
  function pulse(p: Point | null) {
    if (!p || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = pulseSeq++
    pulses = [...pulses, { id, x: p.x, y: p.y }]
    setTimeout(() => (pulses = pulses.filter((q) => q.id !== id)), 500)
  }
  function handle(out: Outcome) {
    if (out.kind === 'continue') {
      tick++
      return
    }
    session = null
    if (out.kind === 'wire' && app.connect(out.a, out.b, out.via)) {
      pulse(terminalPos(app.doc, out.a))
      pulse(terminalPos(app.doc, out.b))
    }
  }

  // ---------- pointer ----------
  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    svgEl.setPointerCapture(e.pointerId)
    if (session && mode === 'click') {
      pan = { sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy, panned: false, wiringClick: true }
      return
    }
    const w = toWorld(e)
    const hit = hitTest(w)
    hoverNet = null
    if (!hit) {
      app.selected = null
      pan = { sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy, panned: false, wiringClick: false }
    } else if (hit.kind === 'pin') {
      app.selected = null
      session = new WiringSession(app.doc, hit.ref, w, e.timeStamp, view.z)
      mode = 'drag'
      startScreen = { x: e.clientX, y: e.clientY }
      moved = false
    } else if (hit.kind === 'act') {
      pressing = hit.id
      app.press(hit.id)
    } else {
      app.selected = { kind: hit.kind, id: hit.id }
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (pan) {
      if (Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) > 5) pan.panned = true
      if (pan.panned || !pan.wiringClick) view = { ...view, ox: pan.ox - (e.clientX - pan.sx) / view.z, oy: pan.oy - (e.clientY - pan.sy) / view.z }
    }
    if (session) {
      if (mode === 'drag' && Math.hypot(e.clientX - startScreen.x, e.clientY - startScreen.y) > 6) moved = true
      session.move(toWorld(e), e.timeStamp, { alt: e.altKey })
      tick++
      return
    }
    if (!pan && !pressing) {
      const hit = hitTest(toWorld(e))
      svgEl.style.cursor = !hit ? 'default' : hit.kind === 'pin' ? 'crosshair' : 'pointer'
      let net: string | null = null
      if (hit?.kind === 'pin') net = app.result.netOf(terminalKey(hit.ref))
      else if (hit?.kind === 'wire') {
        const wire = app.doc.wires[hit.id]
        if (wire) net = app.result.netOf(terminalKey(wire.a))
      }
      hoverNet = net
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (pan?.wiringClick) {
      const wasPan = pan.panned
      pan = null
      if (!wasPan && session) handle(session.click(toWorld(e), e.timeStamp, { alt: e.altKey }))
      return
    }
    pan = null
    if (session && mode === 'drag') {
      // A quick press-and-release on a terminal starts click-click wiring: no button held for long runs.
      if (!moved) {
        mode = 'click'
        tick++
        return
      }
      handle(session.release(toWorld(e), e.timeStamp, { alt: e.altKey }))
    }
    if (pressing) {
      app.release(pressing)
      pressing = null
    }
  }

  function onPointerCancel() {
    if (session && mode === 'drag') session = null
    if (pressing) app.release(pressing)
    pressing = null
    pan = null
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const r = svgEl.getBoundingClientRect()
    zoomAt(e.clientX - r.left, e.clientY - r.top, view.z * Math.exp(-e.deltaY * 0.0015))
    if (session) {
      session.move(toWorld(e), e.timeStamp, { alt: e.altKey })
      tick++
    }
  }

  function onKey(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (session) {
      if (e.key === 'Escape') session = null
      else if (e.key === 'Backspace' || e.key === 'Delete') handle(session.undoCorner())
      else if (e.key === ' ') {
        session.flipPosture()
        tick++
      } else return
      e.preventDefault()
      return
    }
    if (mod && k === 'z') {
      e.preventDefault()
      if (e.shiftKey) app.redo()
      else app.undo()
    } else if (mod && k === 'y') {
      e.preventDefault()
      app.redo()
    } else if (e.key === 'Escape') app.selected = null
  }

  // ---------- what to draw ----------
  const colorOf = (p: Potential) => (p === 'X' ? 'var(--danger)' : p === 'L' ? 'var(--live)' : p === 'N' ? 'var(--neutral)' : 'var(--wire)')

  const scene = $derived.by(() => {
    void app.rev
    const doc = app.doc
    const r = app.result
    const counts = new Map<string, number>()
    const wires = Object.values(doc.wires).flatMap((w) => {
      const pts = wirePath(doc, w)
      if (!pts) return []
      for (const end of [w.a, w.b]) counts.set(terminalKey(end), (counts.get(terminalKey(end)) ?? 0) + 1)
      const net = r.netOf(terminalKey(w.a))
      const potential = r.potential(terminalKey(w.a))
      return [{ id: w.id, d: pathData(pts), net, potential }]
    })
    const terminals = [...allTerminals(doc)].map((term) => {
      const k = terminalKey(term.ref)
      return { key: k, x: term.pos.x, y: term.pos.y, joined: (counts.get(k) ?? 0) >= 2, net: r.netOf(k) }
    })
    const parts = Object.values(doc.parts).map((p) => {
      const def = PARTS[p.type]
      const isDeviceContact = def.elements.some((el) => el.kind === 'contact' && el.actuator === 'device')
      const actuated = isDeviceContact ? r.coils.get(p.tag) === true : app.sim.isPressed(p.id)
      return { part: p, actuated, powered: r.energized(p.id) }
    })
    return { wires, terminals, parts }
  })

  const wiringView = $derived.by(() => {
    void tick
    void app.rev
    const s = session
    if (!s) return null
    const doc = app.doc
    const C = snapPoint(s.cursor)
    const land = s.landing()
    const cand = !s.attached && s.candidate ? terminalPos(doc, s.candidate.terminal) : null
    const glow = s.attached
      ? []
      : [...allTerminals(doc)].filter((term) => !(term.ref.part === s.from.part && term.ref.pin === s.from.pin) && (term.pos.x === C.x || term.pos.y === C.y)).map((term) => term.pos)
    return {
      d: pathData(s.preview()),
      ghost: s.candidate && !s.attached ? pathData(s.preview(s.candidate.terminal)) : null,
      attached: s.attached ? terminalPos(doc, s.attached) : null,
      cand,
      corners: s.corners,
      cursor: s.cursor,
      cross: s.attached ? null : C,
      glow,
      label: land ? (s.attached ? t('wiring.landing', { terminal: terminalLabel(doc, land) }) : t('wiring.clickToLand', { terminal: terminalLabel(doc, land) })) : null,
      hint: mode === 'drag' ? t('wiring.hintDrag') : t('wiring.hintClick'),
    }
  })
</script>

<svelte:window onkeydown={onKey} />

<div class="stage">
  <svg
    bind:this={svgEl}
    role="application"
    aria-label="Schematic"
    viewBox="{view.ox} {view.oy} {width / view.z} {height / view.z}"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerCancel}
    onpointerleave={() => (hoverNet = null)}
    onwheel={onWheel}
    oncontextmenu={(e) => {
      if (session) {
        e.preventDefault()
        session = null
      }
    }}
  >
    <defs>
      <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="0" cy="0" r="1" fill="var(--grid)" />
      </pattern>
    </defs>
    <rect x={view.ox - 20} y={view.oy - 20} width={width / view.z + 40} height={height / view.z + 40} fill="url(#dots)" />

    {#if wiringView?.cross}
      <path class="cross" d="M{view.ox} {wiringView.cross.y}H{view.ox + width / view.z}M{wiringView.cross.x} {view.oy}V{view.oy + height / view.z}" />
      {#each wiringView.glow as g (g.x + ',' + g.y)}
        <circle class="alignglow" cx={g.x} cy={g.y} r={px(7)} />
      {/each}
    {/if}

    {#each scene.wires as w (w.id)}
      {#if hoverNet && w.net === hoverNet}<path class="nethl" d={w.d} />{/if}
      {#if app.selected?.kind === 'wire' && app.selected.id === w.id}<path class="halo" d={w.d} />{/if}
      <path class="wire" class:energized={!!w.potential} class:dim={hoverNet && w.net !== hoverNet} d={w.d} style:stroke={colorOf(w.potential)} />
    {/each}

    {#each scene.parts as p (p.part.id)}
      <PartSymbol part={p.part} actuated={p.actuated} powered={p.powered} selected={app.selected?.kind === 'part' && app.selected.id === p.part.id} />
    {/each}

    {#each scene.terminals as term (term.key)}
      <circle class="term" class:joined={term.joined} class:hl={hoverNet && term.net === hoverNet} cx={term.x} cy={term.y} r={term.joined ? 3.6 : 3.2} />
    {/each}

    {#if wiringView}
      {#if wiringView.ghost}<path class="ghost" d={wiringView.ghost} />{/if}
      {#if wiringView.cand}<circle class="candring" cx={wiringView.cand.x} cy={wiringView.cand.y} r={px(9)} />{/if}
      <path class="rubber" class:ok={!!wiringView.attached} d={wiringView.d} />
      {#each wiringView.corners as c, i (i)}
        <circle class="viadot" cx={c.x} cy={c.y} r={px(2.6)} />
      {/each}
      {#if wiringView.attached}
        <circle class="snapring" cx={wiringView.attached.x} cy={wiringView.attached.y} r={px(11)} />
        <circle class="snaptarget" cx={wiringView.attached.x} cy={wiringView.attached.y} r={px(5)} />
      {/if}
      {#if wiringView.label}
        <g transform="translate({wiringView.cursor.x + px(14)} {wiringView.cursor.y - px(26)}) scale({1 / view.z})">
          <rect class="landbg" class:soft={!wiringView.attached} width={wiringView.label.length * 7.2 + 12} height="20" rx="5" />
          <text class="landlbl" class:soft={!wiringView.attached} x="6" y="14">{wiringView.label}</text>
        </g>
      {/if}
    {/if}

    {#each pulses as p (p.id)}
      <circle class="pulse" cx={p.x} cy={p.y} r="7" />
    {/each}
  </svg>

  {#if wiringView}
    <div class="wirehint">{wiringView.hint}</div>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--canvas);
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .wire {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
    transition: stroke var(--t-fast) ease-out;
  }
  .wire.energized {
    stroke-width: 2.6;
  }
  .wire.dim {
    opacity: 0.25;
  }
  .halo {
    fill: none;
    stroke: var(--accent);
    stroke-width: 10;
    opacity: 0.22;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .nethl {
    fill: none;
    stroke: var(--accent);
    stroke-width: 7;
    opacity: 0.2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .term {
    fill: var(--canvas);
    stroke: var(--ink);
    stroke-width: 1.4;
  }
  .term.joined {
    fill: var(--ink);
  }
  .term.hl {
    stroke: var(--accent);
    stroke-width: 2.4;
  }
  .rubber {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-dasharray: 5 4;
    stroke-linejoin: round;
  }
  .rubber.ok {
    stroke-dasharray: none;
    stroke-width: 2.4;
  }
  .ghost {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.5;
    opacity: 0.35;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .cross {
    fill: none;
    stroke: var(--ink-2);
    stroke-width: 1;
    opacity: 0.18;
    vector-effect: non-scaling-stroke;
  }
  .alignglow {
    fill: var(--accent-soft);
    stroke: var(--accent);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  .candring {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
    vector-effect: non-scaling-stroke;
  }
  .snapring {
    fill: var(--accent-soft);
    stroke: var(--accent);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  .snaptarget,
  .viadot {
    fill: var(--accent);
  }
  .landbg {
    fill: var(--panel);
    stroke: var(--accent);
    stroke-width: 1;
  }
  .landbg.soft {
    stroke-dasharray: 3 3;
  }
  .landlbl {
    font: 500 11.5px var(--mono);
    fill: var(--ink);
  }
  .landlbl.soft {
    fill: var(--ink-2);
    font-weight: 400;
  }
  .pulse {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    transform-box: fill-box;
    transform-origin: center;
    animation: pulse 0.42s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
    pointer-events: none;
  }
  @keyframes pulse {
    from {
      transform: scale(0.5);
      opacity: 0.9;
    }
    to {
      transform: scale(2.6);
      opacity: 0;
    }
  }
  .wirehint {
    position: absolute;
    top: 12px;
    left: 12px;
    max-width: calc(100% - 24px);
    background: var(--panel);
    border: 1px solid var(--accent);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 12.5px;
    color: var(--ink);
    pointer-events: none;
  }
</style>
