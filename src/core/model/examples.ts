import type { CircuitDoc } from './document'

/** The wire spike's example: S1 (NO) lights H1; S2 (NC) sits unwired beside it. */
export function lampExample(): CircuitDoc {
  return {
    version: 1,
    parts: {
      q1: { id: 'q1', type: 'SUPPLY', tag: 'Q1', x: 300, y: 80 },
      s1: { id: 's1', type: 'PB_NO', tag: 'S1', x: 260, y: 220 },
      h1: { id: 'h1', type: 'LAMP', tag: 'H1', x: 260, y: 360 },
      s2: { id: 's2', type: 'PB_NC', tag: 'S2', x: 460, y: 240 },
    },
    wires: {
      w1: { id: 'w1', a: { part: 'q1', pin: 'L' }, b: { part: 's1', pin: '3' } },
      w2: { id: 'w2', a: { part: 's1', pin: '4' }, b: { part: 'h1', pin: 'X1' } },
      w3: { id: 'w3', a: { part: 'h1', pin: 'X2' }, b: { part: 'q1', pin: 'N' } },
    },
  }
}

/**
 * Start/stop with self-holding, the first version 1 test circuit:
 * S2 (stop, NC) → S1 (start, NO) in parallel with KM1 13-14 → KM1 coil, with H1 showing KM1 is on.
 * Wires carry explicit corners so the sheet reads like a textbook schematic.
 */
export function startStopExample(): CircuitDoc {
  return {
    version: 1,
    parts: {
      q1: { id: 'q1', type: 'SUPPLY', tag: 'Q1', x: 240, y: 60 },
      s2: { id: 's2', type: 'PB_NC', tag: 'S2', x: 200, y: 180 },
      s1: { id: 's1', type: 'PB_NO', tag: 'S1', x: 200, y: 300 },
      km1a: { id: 'km1a', type: 'KM_NO', tag: 'KM1', x: 300, y: 300 },
      km1: { id: 'km1', type: 'KM_COIL', tag: 'KM1', x: 200, y: 440 },
      h1: { id: 'h1', type: 'LAMP', tag: 'H1', x: 400, y: 440 },
    },
    wires: {
      w1: { id: 'w1', a: { part: 'q1', pin: 'L' }, b: { part: 's2', pin: '1' } },
      w2: { id: 'w2', a: { part: 's2', pin: '2' }, b: { part: 's1', pin: '3' } },
      w3: { id: 'w3', a: { part: 's2', pin: '2' }, b: { part: 'km1a', pin: '13' } },
      w4: { id: 'w4', a: { part: 's1', pin: '4' }, b: { part: 'km1', pin: 'A1' } },
      w5: { id: 'w5', a: { part: 'km1a', pin: '14' }, b: { part: 'km1', pin: 'A1' }, via: [{ x: 300, y: 380 }, { x: 200, y: 380 }] },
      w6: { id: 'w6', a: { part: 'km1a', pin: '14' }, b: { part: 'h1', pin: 'X1' }, via: [{ x: 300, y: 360 }, { x: 400, y: 360 }] },
      w7: { id: 'w7', a: { part: 'km1', pin: 'A2' }, b: { part: 'h1', pin: 'X2' }, via: [{ x: 200, y: 500 }, { x: 400, y: 500 }] },
      w8: {
        id: 'w8',
        a: { part: 'h1', pin: 'X2' },
        b: { part: 'q1', pin: 'N' },
        via: [{ x: 400, y: 520 }, { x: 480, y: 520 }, { x: 480, y: 100 }, { x: 280, y: 100 }],
      },
    },
  }
}
