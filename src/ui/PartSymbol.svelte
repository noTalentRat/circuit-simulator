<script lang="ts">
  import { PARTS, type Part } from '../core'

  interface Props {
    part: Part
    /** Pushbutton held / contactor contact moved by its coil. */
    actuated: boolean
    /** Lamp lit / coil energised. */
    powered: boolean
    selected: boolean
  }
  let { part, actuated, powered, selected }: Props = $props()

  const def = $derived(PARTS[part.type])
  const x = $derived(part.x)
  const y = $derived(part.y)
  const pins = $derived(Object.keys(def.pins))
  const isPush = $derived(part.type === 'PB_NO' || part.type === 'PB_NC')
  const isContact = $derived(isPush || part.type === 'KM_NO' || part.type === 'KM_NC')
  const normallyOpen = $derived(part.type === 'PB_NO' || part.type === 'KM_NO')
  /** Where the moving blade ends. IEC: NO blade leans away from the fixed contact; NC blade rests on its bar. */
  const tip = $derived.by((): [number, number] => {
    if (normallyOpen) return actuated ? [x, y - 14] : [x - 12, y - 12]
    return actuated ? [x - 11, y - 12] : [x + 12, y - 17]
  })
  const mid = $derived<[number, number]>([(x + tip[0]) / 2, (y + 14 + tip[1]) / 2])
  const headX = $derived(actuated ? x - 18 : x - 24)
</script>

{#if selected}
  <rect class="selbox" x={x + def.box[0] - 6} y={y + def.box[1] - 6} width={def.box[2] + 12} height={def.box[3] + 12} rx="8" />
{/if}

{#if isContact}
  <path class="sym" d="M{x} {y - 40}V{y - 14}M{x} {y + 40}V{y + 14}" />
  {#if !normallyOpen}<path class="sym" d="M{x} {y - 14}H{x + 10}" />{/if}
  <path class="sym" d="M{x} {y + 14}L{tip[0]} {tip[1]}" />
  {#if isPush}
    <path class="sym dash" d="M{mid[0]} {mid[1]}H{headX}" />
    <path class="sym head" class:pressed={actuated} d="M{headX + 4} {mid[1] - 7}H{headX}V{mid[1] + 7}H{headX + 4}" />
  {/if}
  <text class="num" x={x + 6} y={y - 27}>{pins[0]}</text>
  <text class="num" x={x + 6} y={y + 34}>{pins[1]}</text>
  <text class="lbl" x={x + 18} y={y + 4}>{part.tag}</text>
{:else if part.type === 'LAMP'}
  {#if powered}<circle class="lamp-halo" cx={x} cy={y} r="25" />{/if}
  <path class="sym" d="M{x} {y - 40}V{y - 14}M{x} {y + 40}V{y + 14}" />
  <circle class="lamp-body" class:on={powered} cx={x} cy={y} r="14" />
  <path class="sym" d="M{x - 9.9} {y - 9.9}L{x + 9.9} {y + 9.9}M{x + 9.9} {y - 9.9}L{x - 9.9} {y + 9.9}" />
  <text class="num" x={x + 6} y={y - 27}>X1</text>
  <text class="num" x={x + 6} y={y + 34}>X2</text>
  <text class="lbl" x={x + 22} y={y + 4}>{part.tag}</text>
{:else if part.type === 'KM_COIL'}
  <path class="sym" d="M{x} {y - 40}V{y - 10}M{x} {y + 40}V{y + 10}" />
  <rect class="coil" class:on={powered} x={x - 18} y={y - 10} width="36" height="20" rx="1.5" />
  <text class="num" x={x + 6} y={y - 27}>A1</text>
  <text class="num" x={x + 6} y={y + 34}>A2</text>
  <text class="lbl" x={x + 24} y={y + 4}>{part.tag}</text>
{:else if part.type === 'SUPPLY'}
  <rect class="supplybox" x={x - 60} y={y - 24} width="120" height="44" rx="6" />
  <text class="lbl" x={x} y={y - 6} text-anchor="middle">{part.tag} · 230 V~</text>
  <text class="lbl" x={x - 40} y={y + 13} text-anchor="middle">L</text>
  <text class="lbl" x={x + 40} y={y + 13} text-anchor="middle">N</text>
{/if}

<style>
  .sym {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .dash {
    stroke-dasharray: 3 3;
  }
  .head.pressed {
    stroke: var(--accent);
  }
  .selbox {
    fill: var(--accent-soft);
    stroke: var(--accent);
    stroke-width: 1;
    stroke-dasharray: 4 3;
  }
  .lamp-body {
    fill: var(--canvas);
    stroke: var(--ink);
    stroke-width: 1.6;
    transition: fill var(--t-fast) ease-out;
  }
  .lamp-body.on {
    fill: var(--lamp);
    stroke: var(--live);
  }
  .lamp-halo {
    fill: var(--lamp);
    opacity: 0.24;
  }
  .coil {
    fill: var(--canvas);
    stroke: var(--ink);
    stroke-width: 1.6;
    transition: fill var(--t-fast) ease-out;
  }
  .coil.on {
    fill: color-mix(in srgb, var(--live) 30%, var(--canvas));
    stroke: var(--live);
  }
  .supplybox {
    fill: var(--panel);
    stroke: var(--ink);
    stroke-width: 1.4;
  }
  .lbl {
    font: 500 11px var(--mono);
    fill: var(--ink);
  }
  .num {
    font: 10px var(--mono);
    fill: var(--ink-2);
  }
</style>
