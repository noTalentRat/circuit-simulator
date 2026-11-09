<script lang="ts">
  import { t, type MessageKey } from './core'
  import { app, EXAMPLES } from './ui/app.svelte'
  import Inspector from './ui/Inspector.svelte'
  import Palette from './ui/Palette.svelte'
  import Sheet from './ui/Sheet.svelte'

  const ed = app.editor
  // Reading app.rev / app.locale makes every t() below re-run when the language or the circuit changes.
  const tr = (key: MessageKey, params?: Record<string, string | number>) => (void app.locale, void app.rev, t(key, params))

  const canUndo = $derived((void app.rev, app.history.canUndo))
  const canRedo = $derived((void app.rev, app.history.canRedo))
  const counts = $derived((void app.rev, { parts: Object.keys(ed.doc.parts).length, wires: Object.keys(ed.doc.wires).length }))
  const zoom = $derived((void app.rev, Math.round(ed.view.z * 100)))

  const saveText = $derived.by(() => {
    const s = app.saveState
    if (s.kind === 'saved') return tr('save.saved', { time: s.at.toLocaleTimeString(app.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })
    if (s.kind === 'saving') return tr('save.saving')
    if (s.kind === 'error') return tr('save.error')
    if (s.kind === 'restored') return tr('save.restored')
    return tr('save.fresh')
  })

  let examplesMenu: HTMLDetailsElement
  function pickExample(id: string) {
    app.loadExample(id)
    examplesMenu.open = false
  }
</script>

<div class="app">
  <header class="top">
    <div class="brand">
      <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="6" cy="14" r="3.2" fill="none" stroke="var(--ink)" stroke-width="1.6" />
        <path d="M9.2 14H18.8" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" />
        <circle cx="22" cy="14" r="3.2" fill="var(--ink)" />
      </svg>
      <b>{tr('app.name')}</b><span class="sub">0.2.1</span>
    </div>

    <div class="tools">
      <button class="btn" type="button" onclick={() => app.newSheet()}>{tr('sheet.new')}</button>
      <details class="menu" bind:this={examplesMenu}>
        <summary class="btn">{tr('sheet.examples')} <span aria-hidden="true">▾</span></summary>
        <div class="menu-list" role="menu">
          {#each EXAMPLES as ex (ex.id)}
            <button type="button" role="menuitem" onclick={() => pickExample(ex.id)}>{tr(ex.labelKey)}</button>
          {/each}
        </div>
      </details>
      <span class="sep"></span>
      <button class="btn" type="button" disabled={!canUndo} onclick={() => ed.undo()}>{tr('toolbar.undo')} <kbd>Ctrl Z</kbd></button>
      <button class="btn" type="button" disabled={!canRedo} onclick={() => ed.redo()}>{tr('toolbar.redo')}</button>
      <span class="sep"></span>
      <div class="group" role="group" aria-label="Language">
        <button class="seg" class:on={app.locale === 'en'} type="button" onclick={() => app.setLocale('en')}>EN</button>
        <button class="seg" class:on={app.locale === 'es'} type="button" onclick={() => app.setLocale('es')}>ES</button>
      </div>
    </div>
  </header>

  <aside class="panel palette"><Palette /></aside>

  <main class="panel stagewrap">
    <Sheet />
    {#if app.result.short}
      <div class="banner bad">{tr('sim.short')}</div>
    {:else if app.result.oscillating}
      <div class="banner bad">{tr('sim.oscillating')}</div>
    {/if}
    <div class="zoom">
      <button class="btn" type="button" aria-label="Zoom out" onclick={() => ed.zoomBy(1 / 1.25)}>−</button>
      <output>{zoom}%</output>
      <button class="btn" type="button" aria-label="Zoom in" onclick={() => ed.zoomBy(1.25)}>+</button>
      <button class="btn" type="button" onclick={() => ed.fit()}>{tr('toolbar.fit')}</button>
    </div>
  </main>

  <aside class="panel insp">
    <Inspector />
    <section>
      <h2>{tr('panel.history')}</h2>
      <ol class="hist">
        {#each app.entries.slice(-40) as e, i (i)}
          <li class:cur={e.current} class:undone={e.state === 'undone'}>{e.label}</li>
        {/each}
      </ol>
    </section>
  </aside>

  <footer class="status">
    <span class="save" class:unsaved={app.saveState.kind === 'saving'} class:bad={app.saveState.kind === 'error'}>{saveText}</span>
    <span>{tr('status.counts', counts)}</span>
  </footer>
</div>

<style>
  .app {
    height: 100%;
    display: grid;
    gap: 10px;
    grid-template-columns: 220px minmax(0, 1fr) 272px;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas: 'top top top' 'pal stage insp' 'status status status';
    padding: 10px max(16px, env(safe-area-inset-right, 0px)) 8px max(16px, env(safe-area-inset-left, 0px));
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
    flex-wrap: wrap;
  }
  .sep {
    width: 1px;
    height: 20px;
    background: var(--line);
    margin: 0 4px;
  }
  .menu {
    position: relative;
  }
  .menu summary {
    list-style: none;
  }
  .menu summary::-webkit-details-marker {
    display: none;
  }
  .menu-list {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 10;
    min-width: 180px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
  }
  .menu-list button {
    font: 13px var(--sans);
    color: var(--ink);
    background: transparent;
    border: 0;
    border-radius: 6px;
    padding: 7px 10px;
    text-align: left;
    cursor: pointer;
  }
  .menu-list button:hover {
    background: var(--accent-soft);
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
  .palette {
    grid-area: pal;
    overflow: hidden;
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
    align-items: center;
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
  .zoom output {
    font: 12px var(--mono);
    color: var(--ink-2);
    min-width: 42px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .insp {
    grid-area: insp;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    overflow: auto;
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
  .status {
    grid-area: status;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    font: 12px var(--mono);
    color: var(--ink-2);
    padding: 0 2px;
  }
  .save::before {
    content: '';
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    margin-right: 7px;
    vertical-align: 1px;
  }
  .save.unsaved::before {
    background: var(--ink-2);
  }
  .save.bad::before {
    background: var(--danger);
  }
  @media (max-width: 980px) {
    .app {
      height: auto;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: none;
      grid-template-areas: 'top' 'pal' 'stage' 'insp' 'status';
    }
    .stagewrap {
      height: 62vh;
      min-height: 360px;
    }
  }
</style>
