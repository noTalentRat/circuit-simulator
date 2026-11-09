<script lang="ts">
  import { PARTS, t, type MessageKey, type PartType } from '../core'
  import { app } from './app.svelte'
  import PartSymbol from './PartSymbol.svelte'

  /** Order follows a control circuit top to bottom: supply, commands, contactor, signalling. */
  const ORDER: PartType[] = ['SUPPLY', 'PB_NC', 'PB_NO', 'KM_COIL', 'KM_NO', 'KM_NC', 'LAMP']

  const tr = (key: MessageKey) => (void app.locale, t(key))

  const items = ORDER.map((type) => {
    const [bx, by, bw, bh] = PARTS[type].box
    const pad = 8
    return { type, viewBox: `${bx - pad} ${by - pad} ${bw + pad * 2 + 24} ${bh + pad * 2}`, prefix: PARTS[type].prefix }
  })
</script>

<div class="pal">
  <h2>{tr('palette.title')}</h2>
  <div class="items">
    {#each items as it (it.type)}
      <button class="part" type="button" onclick={() => app.editor.addPart(it.type)} title={tr(PARTS[it.type].nameKey as MessageKey)}>
        <svg viewBox={it.viewBox} aria-hidden="true">
          <PartSymbol part={{ id: 'pal', type: it.type, tag: it.type === 'SUPPLY' ? '' : it.prefix, x: 0, y: 0 }} actuated={false} powered={false} selected={false} />
        </svg>
        <span>{tr(PARTS[it.type].nameKey as MessageKey)}</span>
      </button>
    {/each}
  </div>
  <p class="note">{tr('palette.hint')}</p>
</div>

<style>
  .pal {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: auto;
    height: 100%;
  }
  .items {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .part {
    display: grid;
    grid-template-columns: 44px 1fr;
    align-items: center;
    gap: 8px;
    text-align: left;
    width: 100%;
    background: var(--canvas);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 4px 8px;
    cursor: pointer;
    color: var(--ink);
    font: 13px/1.25 var(--sans);
    transition: border-color var(--t-fast) ease-out;
  }
  .part:hover {
    border-color: var(--accent);
  }
  .part svg {
    width: 44px;
    height: 44px;
  }
  .part svg :global(.num) {
    display: none;
  }
  .note {
    font-size: 12.5px;
    color: var(--ink-2);
    margin: 4px 0 0;
  }
  @media (max-width: 820px) {
    .items {
      flex-direction: row;
      overflow-x: auto;
    }
    .part {
      min-width: 150px;
    }
  }
</style>
