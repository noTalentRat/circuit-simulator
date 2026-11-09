<script lang="ts">
  import { PARTS, t, terminalKey, terminalLabel, type MessageKey, type Potential, type TagError } from '../core'
  import { app } from './app.svelte'

  const ed = app.editor
  const tr = (key: MessageKey, params?: Record<string, string | number>) => (void app.locale, void app.rev, t(key, params))
  const potentialKey: Record<Exclude<Potential, null>, MessageKey> = { L: 'net.live', N: 'net.neutral', X: 'net.short' }
  const chipText = (p: Potential) => tr(p ? potentialKey[p] : 'net.none')

  let tagError = $state<TagError | null>(null)

  const info = $derived.by(() => {
    void app.rev
    const doc = ed.doc
    const r = app.result
    const parts = [...ed.selection.parts]
    const wires = [...ed.selection.wires]
    if (parts.length === 1 && wires.length === 0) {
      const part = doc.parts[parts[0]!]
      if (!part) return null
      const def = PARTS[part.type]
      const els = def.elements
      let state: MessageKey | null = null
      let active = false
      if (els.some((e) => e.kind === 'load')) [state, active] = r.energized(part.id) ? ['state.on', true] : ['state.off', false]
      else if (els.some((e) => e.kind === 'coil')) [state, active] = r.coils.get(part.tag) ? ['state.coilOn', true] : ['state.coilOff', false]
      else if (els.some((e) => e.kind === 'contact')) [state, active] = r.closed(part.id) ? ['state.closed', true] : ['state.open', false]
      const isDeviceContact = els.some((e) => e.kind === 'contact' && e.actuator === 'device')
      const terminals = Object.keys(def.pins).map((pin) => ({ pin, potential: r.potential(terminalKey({ part: part.id, pin })) }))
      return { kind: 'part' as const, id: part.id, tag: part.tag, nameKey: def.nameKey as MessageKey, state, active, terminals, isDeviceContact }
    }
    if (parts.length === 0 && wires.length === 1) {
      const w = doc.wires[wires[0]!]
      if (!w) return null
      return { kind: 'wire' as const, title: `${terminalLabel(doc, w.a)} – ${terminalLabel(doc, w.b)}`, potential: r.potential(terminalKey(w.a)) }
    }
    if (parts.length + wires.length > 1) return { kind: 'many' as const, parts: parts.length, wires: wires.length }
    return null
  })

  // Clear a stale tag error when the selection changes.
  let lastId: string | null = null
  $effect(() => {
    const id = info?.kind === 'part' ? info.id : null
    if (id !== lastId) {
      lastId = id
      tagError = null
    }
  })

  function commitTag(e: Event & { currentTarget: HTMLInputElement }) {
    if (info?.kind !== 'part') return
    const input = e.currentTarget
    tagError = ed.renameTag(info.id, input.value)
    if (tagError) input.value = info.tag
  }
</script>

<section>
  {#if info?.kind === 'part'}
    <div class="ihead">
      <input
        class="itag"
        aria-label={tr('inspector.tag')}
        value={info.tag}
        spellcheck="false"
        autocomplete="off"
        onchange={commitTag}
        onkeydown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            e.currentTarget.value = info.tag
            e.currentTarget.blur()
          }
        }}
      />
      <span class="itype">{tr(info.nameKey)}</span>
    </div>
    {#if tagError}<p class="err">{tr(tagError)}</p>{/if}
    {#if info.isDeviceContact}<p class="note">{tr('inspector.contactHint')}</p>{/if}
    {#if info.state}<div class="istate" class:on={info.active}>{tr(info.state)}</div>{/if}
    <h2>{tr('inspector.terminals')}</h2>
    <dl class="terms">
      {#each info.terminals as term (term.pin)}
        <dt>{term.pin}</dt>
        <dd><span class="chip {term.potential ?? ''}">{chipText(term.potential)}</span></dd>
      {/each}
    </dl>
    <div class="actions">
      <button class="btn" type="button" onclick={() => ed.duplicate()}>{tr('inspector.duplicate')} <kbd>Ctrl D</kbd></button>
      <button class="btn danger" type="button" onclick={() => ed.deleteSelected()}>{tr('inspector.delete')}</button>
    </div>
  {:else if info?.kind === 'wire'}
    <div class="ihead"><span class="itype">{tr('wire.title')}</span></div>
    <div class="wtitle">{info.title}</div>
    <p><span class="chip {info.potential ?? ''}">{chipText(info.potential)}</span></p>
    <div class="actions">
      <button class="btn danger" type="button" onclick={() => ed.deleteSelected()}>{tr('inspector.delete')}</button>
    </div>
  {:else if info?.kind === 'many'}
    <p class="note">{tr('inspector.selected', { parts: info.parts, wires: info.wires })}</p>
    <div class="actions">
      <button class="btn" type="button" onclick={() => ed.duplicate()}>{tr('inspector.duplicate')} <kbd>Ctrl D</kbd></button>
      <button class="btn danger" type="button" onclick={() => ed.deleteSelected()}>{tr('inspector.delete')}</button>
    </div>
  {:else}
    <p class="note">{tr('inspector.empty')}</p>
    <p class="note">{tr('hint.press')}</p>
    <p class="note">{tr('hint.wire')}</p>
    <h2>{tr('shortcuts.title')}</h2>
    <ul class="keys">
      <li>{tr('shortcuts.pan')}</li>
      <li>{tr('shortcuts.select')}</li>
      <li>{tr('shortcuts.clipboard')}</li>
      <li>{tr('shortcuts.delete')}</li>
    </ul>
  {/if}
</section>

<style>
  .ihead {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .itag {
    font: 600 18px var(--mono);
    color: var(--ink);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 1px 4px;
    margin-left: -5px;
    width: 6ch;
  }
  .itag:hover {
    border-color: var(--line);
  }
  .itag:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--canvas);
  }
  .itype {
    color: var(--ink-2);
    font-size: 13px;
  }
  .wtitle {
    font: 600 14px var(--mono);
    margin-top: 4px;
  }
  .err {
    color: var(--danger);
    font-size: 12.5px;
    margin: 4px 0;
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
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 14px;
  }
  .btn.danger {
    color: var(--danger);
  }
  .note {
    font-size: 13px;
    color: var(--ink-2);
    margin: 0 0 8px;
  }
  .keys {
    margin: 0;
    padding-left: 18px;
    font-size: 12.5px;
    color: var(--ink-2);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
