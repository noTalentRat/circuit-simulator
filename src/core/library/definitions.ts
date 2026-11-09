import type { Facing } from '../geometry'

/** One connection point on a part, relative to the part's origin. */
export interface PinDef {
  dx: number
  dy: number
  dir: Facing
}

/**
 * What a part does electrically, as a list of elements. A part can hold several
 * (a motor protection switch, later, has three poles and an auxiliary contact).
 *
 * - source:  a supply; `live` and `neutral` are its pins.
 * - contact: joins pins a and b when closed. A pushbutton contact is moved by the part itself
 *            (actuator 'self'); a contactor's auxiliary contact is moved by the coil that shares its tag ('device').
 * - load:    consumes power between a and b (a lamp). It is on when one side is live and the other neutral.
 * - coil:    like a load, and when energised it moves every 'device' contact with the same tag.
 */
export type Element =
  | { kind: 'source'; live: string; neutral: string }
  | { kind: 'contact'; a: string; b: string; normally: 'open' | 'closed'; actuator: 'self' | 'device' }
  | { kind: 'load'; a: string; b: string }
  | { kind: 'coil'; a: string; b: string }

export interface PartDef {
  type: PartType
  /** Translation key for the part's name. */
  nameKey: string
  /** IEC 81346 letter code used for new tags: S1, H1, KM1. */
  prefix: string
  pins: Record<string, PinDef>
  /** Body outline relative to the origin: [x, y, width, height]. Wires never run through it. */
  box: [number, number, number, number]
  /** Where a click presses the part (pushbutton heads), relative to the origin. */
  actuator?: [number, number, number, number]
  elements: Element[]
}

export type PartType = 'SUPPLY' | 'PB_NO' | 'PB_NC' | 'LAMP' | 'KM_COIL' | 'KM_NO' | 'KM_NC'

const up = (dx: number, dy: number): PinDef => ({ dx, dy, dir: -1 })
const down = (dx: number, dy: number): PinDef => ({ dx, dy, dir: 1 })

export const PARTS: Record<PartType, PartDef> = {
  SUPPLY: {
    type: 'SUPPLY',
    nameKey: 'part.supply',
    prefix: 'Q',
    pins: { L: down(-40, 20), N: down(40, 20) },
    box: [-60, -24, 120, 44],
    elements: [{ kind: 'source', live: 'L', neutral: 'N' }],
  },
  PB_NO: {
    type: 'PB_NO',
    nameKey: 'part.pbNo',
    prefix: 'S',
    pins: { '3': up(0, -40), '4': down(0, 40) },
    box: [-32, -40, 52, 80],
    actuator: [-34, -13, 24, 26],
    elements: [{ kind: 'contact', a: '3', b: '4', normally: 'open', actuator: 'self' }],
  },
  PB_NC: {
    type: 'PB_NC',
    nameKey: 'part.pbNc',
    prefix: 'S',
    pins: { '1': up(0, -40), '2': down(0, 40) },
    box: [-32, -40, 52, 80],
    actuator: [-34, -13, 24, 26],
    elements: [{ kind: 'contact', a: '1', b: '2', normally: 'closed', actuator: 'self' }],
  },
  LAMP: {
    type: 'LAMP',
    nameKey: 'part.lamp',
    prefix: 'H',
    pins: { X1: up(0, -40), X2: down(0, 40) },
    box: [-20, -40, 40, 80],
    elements: [{ kind: 'load', a: 'X1', b: 'X2' }],
  },
  KM_COIL: {
    type: 'KM_COIL',
    nameKey: 'part.kmCoil',
    prefix: 'KM',
    pins: { A1: up(0, -40), A2: down(0, 40) },
    box: [-24, -40, 48, 80],
    elements: [{ kind: 'coil', a: 'A1', b: 'A2' }],
  },
  KM_NO: {
    type: 'KM_NO',
    nameKey: 'part.kmNo',
    prefix: 'KM',
    pins: { '13': up(0, -40), '14': down(0, 40) },
    box: [-20, -40, 40, 80],
    elements: [{ kind: 'contact', a: '13', b: '14', normally: 'open', actuator: 'device' }],
  },
  KM_NC: {
    type: 'KM_NC',
    nameKey: 'part.kmNc',
    prefix: 'KM',
    pins: { '21': up(0, -40), '22': down(0, 40) },
    box: [-20, -40, 40, 80],
    elements: [{ kind: 'contact', a: '21', b: '22', normally: 'closed', actuator: 'device' }],
  },
}

export const partDef = (type: PartType): PartDef => PARTS[type]
