<script lang="ts">
  import { PARTS, t, terminalKey, terminalLabel, type MessageKey, type Potential } from './core'
  import { app, EXAMPLES, type ExampleId } from './ui/app.svelte'
  import Sheet from './ui/Sheet.svelte'

  let sheet: ReturnType<typeof Sheet>

  // Reading app.rev / app.locale makes every t() below re-run when the language or the circuit changes.
  const tr = (key: MessageKey, params?: Record<string, string | number>) => {
    void app.locale
    void app.rev
    return t(key, params)
  }

  const canUndo = $derived((void app.rev, app.history.canUndo))
  const canRedo = $derived((void app.rev, app.history.canRedo))

  const potentialKey: Record<Exclude<Potential, null>, MessageKey> = { L: 'net.live', N: 'net.neutral', X: 'net.short' }

  const inspected = $derived.by(() => {
    void app.rev
    const sel = app.selected
    if (!sel) return null
    const doc = app.doc
    const r = app.result
    if (sel.kind === 'wire') {
      const w = doc.wires[sel.id]
      if (!w) return null
      return { kind: 'wire' as const, title: `${terminalLabel(doc, w.a)} – ${terminalLabel(doc, w.b)}`, potential: r.potential(terminalKey(w.a)) }
    }
    const part = doc.parts[sel.id]
    if (!part) return null
    const def = PARTS[part.type]
    const els = def.elements
    let state: MessageKey | null = null
    let active = false
    if (els.some((e) => e.kind === 'load')) [state, active] = r.energized(part.id) ? ['state.on', true] : ['state.off', false]
    else if (els.some((e) => e.kind === 'coil')) [state, active] = r.coils.get(part.tag) ? ['state.coilOn', true] : ['state.coilOff', false]
    else if (els.some((e) => e.kind === 'contact')) [state, active] = r.closed(part.id) ? ['state.closed', true] : ['state.open', false]
    const terminals = Object.keys(def.pins).map((pin) => ({ pin, potential: r.potential(terminalKey({ part: part.id, pin })) }))
    return { kind: 'part' as const, tag: part.tag, nameKey: def.nameKey as MessageKey, state, active, terminals }
  })
</script>

<div class="app">
  <header class="top">
    <div class="brand">
      <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="6" cy="14" r="3.2" fill="none" stroke="var(--ink)" stroke-width="1.6" />
        <path d="M9.2 14H18.8" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" />
        <circle cx="22" cy="14" r="3.2" fill="var(--ink)" />
      </svg>
      <b>{tr('app.name')}</b><span class="sub">0.1</span>
    </div>

    <div class="group" role="group" aria-label={tr('panel.example')}>
      {#each Object.entries(EXAMPLES) as [id, ex] (id)}
        <button class="seg" class:on={app.example === id} type="button" onclick={() => app.loadExample(id as ExampleId)}>{tr(ex.labelKey)}</button>
      {/each}
    </div>

    <div class="tools">
      <button class="btn" type="button" disabled={!canUndo} onclick={() => app.undo()}>{tr('toolbar.undo')} <kbd>Ctrl Z</kbd></button>
      <button class="btn" type="button" disabled={!canRedo} onclick={() => app.redo()}>{tr('toolbar.redo')}</button>
      <div class="group" role="group" aria-label="Language">
        <button class="seg" class:on={app.locale === 'en'} type="button" onclick={() => app.setLocale('en')}>EN</button>
        <button class="seg" class:on={app.locale === 'es'} type="button" onclick={() => app.setLocale('es')}>ES</button>
      </div>
    </div>
  </header>

  <main class="panel stagewrap">
    <Sheet bind:this={sheet} />
    {#if app.result.short}
      <div class="banner bad">{tr('sim.short')}</div>
    {:else if app.result.oscillating}
      <div class="banner bad">{tr('sim.oscillating')}</div>
    {/if}
    <div class="zoom">
      <button class="btn" type="button" aria-label="Zoom out" onclick={() => sheet.zoomBy(1 / 1.25)}>−</button>
      <button class="btn" type="button" aria-label="Zoom in" onclick={() => sheet.zoomBy(1.25)}>+</button>
      <button class="btn" type="button" onclick={() => sheet.fit()}>{tr('toolbar.fit')}</button>
    </div>
  </main>

  <aside class="panel insp">
    <section>
      {#if inspected?.kind === 'part'}
        <div class="ihead"><span class="itag">{inspected.tag}</span><span class="itype">{tr(inspected.nameKey)}</span></div>
        {#if inspected.state}<div class="istate" class:on={inspected.active}>{tr(inspected.state)}</div>{/if}
        <h2>{tr('inspector.terminals')}</h2>
        <dl class="terms">
          {#each inspected.terminals as term (term.pin)}
            <dt>{term.pin}</dt>
            <dd><span class="chip {term.potential ?? ''}">{tr(term.potential ? potentialKey[term.potential] : 'net.none')}</span></dd>
          {/each}
        </dl>
      {:else if inspected?.kind === 'wire'}
        <div class="ihead"><span class="itype">{tr('wire.title')}</span></div>
        <div class="itag small">{inspected.title}</div>
        <p><span class="chip {inspected.potential ?? ''}">{tr(inspected.potential ? potentialKey[inspected.potential] : 'net.none')}</span></p>
      {:else}
        <p class="note">{tr('inspector.empty')}</p>
        <p class="note">{tr('hint.press')}</p>
        <p class="note">{tr('hint.wire')}</p>
      {/if}
    </section>
    <section>
      <h2>{tr('panel.history')}</h2>
      <ol class="hist">
        {#each app.entries as e, i (i)}
          <li class:cur={e.current} class:undone={e.state === 'undone'}>{e.label}</li>
        {/each}
      </ol>
    </section>
  </aside>
</div>

<style>
  .app {
    height: 100%;
    display: grid;
    gap: 10px;
    grid-template-columns: minmax(0, 1fr) 272px;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'top top' 'stage insp';
    padding: 10px max(16px, env(safe-area-inset-right, 0px)) 10px max(16px, env(safe-area-inset-left, 0px));
  }
  .top {
    grid-area: top;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-right: auto;
  }
  .brand b {
    font-weight: 600;
    font-size: 15px;
  }
  .sub {
    font: 12px var(--mono);
    color: var(--ink-2);
  }
  .tools {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .group {
    display: inline-flex;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 2px;
  }
  .seg {
    font: 500 13px var(--sans);
    color: var(--ink-2);
    background: transparent;
    border: 0;
    border-radius: 6px;
    height: 26px;
    padding: 0 10px;
    cursor: pointer;
  }
  .seg.on {
    background: var(--canvas);
    color: var(--ink);
    box-shadow: 0 0 0 1px var(--line);
  }
  .panel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    min-width: 0;
    min-height: 0;
  }
  .stagewrap {
    grid-area: stage;
    position: relative;
    overflow: hidden;
  }
  .banner {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    max-width: calc(100% - 24px);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
  }
  .banner.bad {
    background: color-mix(in srgb, var(--danger) 12%, var(--panel));
    border: 1px solid var(--danger);
  }
  .zoom {
    position: absolute;
    right: 10px;
    bottom: 10px;
    display: flex;
    gap: 2px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 3px;
  }
  .zoom .btn {
    height: 26px;
    padding: 0 9px;
    border: 0;
    background: transparent;
  }
  .insp {
    grid-area: insp;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    overflow: auto;
  }
  .ihead {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .itag {
    font: 600 18px var(--mono);
  }
  .itag.small {
    font-size: 14px;
    margin-top: 4px;
  }
  .itype {
    color: var(--ink-2);
    font-size: 13px;
  }
  .istate {
    margin: 8px 0 12px;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 13px;
    border: 1px solid var(--line);
    background: var(--canvas);
  }
  .istate.on {
    border-color: var(--live);
    background: color-mix(in srgb, var(--live) 9%, var(--canvas));
  }
  .terms {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 12px;
    margin: 0;
    align-items: center;
  }
  .terms dt {
    font: 500 12px var(--mono);
  }
  .terms dd {
    margin: 0;
  }
  .chip {
    display: inline-block;
    font: 11.5px var(--mono);
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: var(--ink-2);
  }
  .chip.L {
    color: var(--live);
    border-color: color-mix(in srgb, var(--live) 55%, transparent);
    background: color-mix(in srgb, var(--live) 10%, transparent);
  }
  .chip.N {
    color: var(--neutral);
    border-color: color-mix(in srgb, var(--neutral) 55%, transparent);
    background: color-mix(in srgb, var(--neutral) 10%, transparent);
  }
  .chip.X {
    color: var(--danger);
    border-color: var(--danger);
  }
  .note {
    font-size: 13px;
    color: var(--ink-2);
    margin: 0 0 8px;
  }
  .hist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12.5px;
  }
  .hist li {
    padding: 4px 8px;
    border-radius: 6px;
  }
  .hist li.cur {
    background: var(--accent-soft);
    font-weight: 500;
  }
  .hist li.undone {
    color: var(--ink-2);
    text-decoration: line-through;
  }
  @media (max-width: 820px) {
    .app {
      height: auto;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: none;
      grid-template-areas: 'top' 'stage' 'insp';
    }
    .stagewrap {
      height: 62vh;
      min-height: 360px;
    }
  }
</style>
