<script lang="ts">
  import { PARTS, allTerminals, pathData, snapPoint, t, terminalKey, terminalLabel, terminalPos, wirePath, type Point, type Potential } from '../core'
  import { app } from './app.svelte'
  import PartSymbol from './PartSymbol.svelte'

  const ed = app.editor
  let svgEl: SVGSVGElement
  let fitted = false
  let pulses = $state<Array<{ id: number; x: number; y: number }>>([])
  let pulseSeq = 0
  let raf = 0

  /** Pointer position relative to the canvas, in screen pixels. */
  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = svgEl.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const mods = (e: PointerEvent | KeyboardEvent | WheelEvent) => ({ shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey })

  $effect(() => {
    const ro = new ResizeObserver(() => {
      ed.setSize(svgEl.clientWidth, svgEl.clientHeight)
      if (!fitted && svgEl.clientWidth) {
        fitted = true
        ed.fit()
      }
    })
    ro.observe(svgEl)
    return () => ro.disconnect()
  })

  function afterEvent() {
    // A connect pulse on both ends of a wire that was just made.
    const done = ed.lastConnected
    if (done) {
      ed.lastConnected = null
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        for (const ref of done) {
          const p = terminalPos(ed.doc, ref)
          if (!p) continue
          const id = pulseSeq++
          pulses = [...pulses, { id, x: p.x, y: p.y }]
          setTimeout(() => (pulses = pulses.filter((q) => q.id !== id)), 500)
        }
      }
    }
    // Auto-pan near the edge: keep ticking while the editor asks for it.
    if (ed.autoPanVelocity() && !raf) {
      let last = performance.now()
      const step = (now: number) => {
        ed.tick(now - last)
        last = now
        raf = ed.autoPanVelocity() ? requestAnimationFrame(step) : 0
      }
      raf = requestAnimationFrame(step)
    }
  }

  function onDown(e: PointerEvent) {
    if (e.button !== 0) return
    svgEl.setPointerCapture(e.pointerId)
    ed.down(local(e), e.timeStamp, mods(e))
    afterEvent()
  }
  function onMove(e: PointerEvent) {
    ed.move(local(e), e.timeStamp, mods(e))
    afterEvent()
  }
  function onUp(e: PointerEvent) {
    if (e.button !== 0) return
    ed.up(local(e), e.timeStamp, mods(e))
    afterEvent()
  }
  function onWheel(e: WheelEvent) {
    e.preventDefault()
    ed.wheel(local(e), e.deltaY, e.timeStamp)
  }
  function typing(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  }
  function onKey(e: KeyboardEvent) {
    if (typing(e)) return
    if (ed.key(e.key, mods(e))) e.preventDefault()
    afterEvent()
  }
  function onKeyUp(e: KeyboardEvent) {
    if (!typing(e)) ed.keyUp(e.key)
  }

  // ---------- what to draw ----------
  const colorOf = (p: Potential) => (p === 'X' ? 'var(--danger)' : p === 'L' ? 'var(--live)' : p === 'N' ? 'var(--neutral)' : 'var(--wire)')

  const view = $derived((void app.rev, ed.view))
  const vw = $derived(view.width / view.z)
  const vh = $derived(view.height / view.z)
  const px = (n: number) => n / view.z

  const scene = $derived.by(() => {
    void app.rev
    const doc = ed.displayDoc
    const r = app.result
    const counts = new Map<string, number>()
    const wires = Object.values(doc.wires).flatMap((w) => {
      const pts = wirePath(doc, w)
      if (!pts) return []
      for (const end of [w.a, w.b]) counts.set(terminalKey(end), (counts.get(terminalKey(end)) ?? 0) + 1)
      return [{ id: w.id, d: pathData(pts), net: r.netOf(terminalKey(w.a)), potential: r.potential(terminalKey(w.a)), selected: ed.selection.wires.has(w.id) }]
    })
    const terminals = [...allTerminals(doc)].map((term) => {
      const k = terminalKey(term.ref)
      return { key: k, x: term.pos.x, y: term.pos.y, joined: (counts.get(k) ?? 0) >= 2, net: r.netOf(k) }
    })
    const parts = Object.values(doc.parts).map((p) => {
      const def = PARTS[p.type]
      const deviceContact = def.elements.some((el) => el.kind === 'contact' && el.actuator === 'device')
      return {
        part: p,
        actuated: deviceContact ? r.coils.get(p.tag) === true : app.sim.isPressed(p.id),
        powered: r.energized(p.id),
        selected: ed.selection.parts.has(p.id),
      }
    })
    return { wires, terminals, parts, hoverNet: ed.hoverNet, box: ed.box }
  })

  const wiring = $derived.by(() => {
    void app.rev
    const s = ed.session
    if (!s) return null
    const doc = s.doc
    const C = snapPoint(s.cursor)
    const land = s.landing()
    const glow = s.attached ? [] : [...allTerminals(doc)].filter((term) => !(term.ref.part === s.from.part && term.ref.pin === s.from.pin) && (term.pos.x === C.x || term.pos.y === C.y)).map((term) => term.pos)
    return {
      d: pathData(s.preview()),
      ghost: s.candidate && !s.attached ? pathData(s.preview(s.candidate.terminal)) : null,
      attached: s.attached ? terminalPos(doc, s.attached) : null,
      cand: !s.attached && s.candidate ? terminalPos(doc, s.candidate.terminal) : null,
      corners: s.corners,
      cursor: s.cursor,
      cross: s.attached ? null : C,
      glow,
      label: land ? t(s.attached ? 'wiring.landing' : 'wiring.clickToLand', { terminal: terminalLabel(doc, land) }) : null,
      hint: t(ed.sessionMode === 'drag' ? 'wiring.hintDrag' : 'wiring.hintClick'),
    }
  })

  const cursorStyle = $derived((void app.rev, ed.isPanning ? 'grabbing' : ed.session ? 'crosshair' : 'default'))
</script>

<svelte:window onkeydown={onKey} onkeyup={onKeyUp} />

<div class="stage">
  <svg
    bind:this={svgEl}
    role="application"
    aria-label="Schematic"
    style:cursor={cursorStyle}
    viewBox="{view.ox} {view.oy} {vw} {vh}"
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={() => ed.cancelPointer()}
    onpointerleave={() => ed.leave()}
    onwheel={onWheel}
    oncontextmenu={(e) => {
      if (ed.session) {
        e.preventDefault()
        ed.cancelSession()
      }
    }}
  >
    <defs>
      <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="0" cy="0" r="1" fill="var(--grid)" />
      </pattern>
    </defs>
    <rect x={view.ox - 20} y={view.oy - 20} width={vw + 40} height={vh + 40} fill="url(#dots)" />

    {#if wiring?.cross}
      <path class="cross" d="M{view.ox} {wiring.cross.y}H{view.ox + vw}M{wiring.cross.x} {view.oy}V{view.oy + vh}" />
      {#each wiring.glow as g (g.x + ',' + g.y)}
        <circle class="alignglow" cx={g.x} cy={g.y} r={px(7)} />
      {/each}
    {/if}

    {#each scene.wires as w (w.id)}
      {#if scene.hoverNet && w.net === scene.hoverNet}<path class="nethl" d={w.d} />{/if}
      {#if w.selected}<path class="halo" d={w.d} />{/if}
      <path class="wire" class:energized={!!w.potential} class:dim={scene.hoverNet && w.net !== scene.hoverNet} d={w.d} style:stroke={colorOf(w.potential)} />
    {/each}

    {#each scene.parts as p (p.part.id)}
      <PartSymbol part={p.part} actuated={p.actuated} powered={p.powered} selected={p.selected} />
    {/each}

    {#each scene.terminals as term (term.key)}
      <circle class="term" class:joined={term.joined} class:hl={scene.hoverNet && term.net === scene.hoverNet} cx={term.x} cy={term.y} r={term.joined ? 3.6 : 3.2} />
    {/each}

    {#if scene.box}
      <rect class="selbox" x={scene.box.left} y={scene.box.top} width={scene.box.right - scene.box.left} height={scene.box.bottom - scene.box.top} />
    {/if}

    {#if wiring}
      {#if wiring.ghost}<path class="ghost" d={wiring.ghost} />{/if}
      {#if wiring.cand}<circle class="candring" cx={wiring.cand.x} cy={wiring.cand.y} r={px(9)} />{/if}
      <path class="rubber" class:ok={!!wiring.attached} d={wiring.d} />
      {#each wiring.corners as c, i (i)}
        <circle class="viadot" cx={c.x} cy={c.y} r={px(2.6)} />
      {/each}
      {#if wiring.attached}
        <circle class="snapring" cx={wiring.attached.x} cy={wiring.attached.y} r={px(11)} />
        <circle class="viadot" cx={wiring.attached.x} cy={wiring.attached.y} r={px(5)} />
      {/if}
      {#if wiring.label}
        <g transform="translate({wiring.cursor.x + px(14)} {wiring.cursor.y - px(26)}) scale({1 / view.z})">
          <rect class="landbg" class:soft={!wiring.attached} width={wiring.label.length * 7.2 + 12} height="20" rx="5" />
          <text class="landlbl" class:soft={!wiring.attached} x="6" y="14">{wiring.label}</text>
        </g>
      {/if}
    {/if}

    {#each pulses as p (p.id)}
      <circle class="pulse" cx={p.x} cy={p.y} r="7" />
    {/each}
  </svg>

  {#if wiring}
    <div class="wirehint">{wiring.hint}</div>
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
  .selbox {
    fill: var(--accent-soft);
    stroke: var(--accent);
    stroke-width: 1;
    stroke-dasharray: 4 3;
    vector-effect: non-scaling-stroke;
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
