import { describe, expect, it } from 'vitest'
import { History, Simulator, addPart, addWire, lampExample, settle, startStopExample, type CircuitDoc } from '../../src/core'

const none = { pressed: new Set<string>() }

describe('Engine: connectivity', () => {
  it('lamp is off until S1 is pressed', () => {
    const doc = lampExample()
    expect(settle(doc, none).energized('h1')).toBe(false)
    expect(settle(doc, { pressed: new Set(['s1']) }).energized('h1')).toBe(true)
  })

  it('reports live and neutral on the right nets', () => {
    const r = settle(lampExample(), { pressed: new Set(['s1']) })
    expect(r.potential('s1:3')).toBe('L')
    expect(r.potential('h1:X1')).toBe('L')
    expect(r.potential('h1:X2')).toBe('N')
    expect(r.potential('s2:1')).toBe(null)
    expect(r.netOf('s1:4')).toBe(r.netOf('h1:X1'))
  })

  it('a pressed NC pushbutton opens', () => {
    const r = settle(lampExample(), { pressed: new Set(['s2']) })
    expect(r.closed('s2')).toBe(false)
    expect(settle(lampExample(), none).closed('s2')).toBe(true)
  })

  it('detects a short circuit and powers nothing', () => {
    const h = new History(lampExample())
    h.commit('Short', addWire(h.doc, { part: 's1', pin: '4' }, { part: 'q1', pin: 'N' }).changes)
    const r = settle(h.doc, { pressed: new Set(['s1']) })
    expect(r.short).toBe(true)
    expect(r.potential('s1:3')).toBe('X')
    expect(r.energized('h1')).toBe(false)
  })

  it('a wire whose part was deleted is ignored', () => {
    const doc: CircuitDoc = lampExample()
    delete doc.parts.h1
    expect(() => settle(doc, none)).not.toThrow()
  })
})

describe('Engine: contactors and self-holding (version 1 test circuit: start/stop)', () => {
  it('start pulls KM1 in, and it holds after start is released', () => {
    const sim = new Simulator(startStopExample())
    expect(sim.result.coils.get('KM1') ?? false).toBe(false)
    sim.press('s1')
    expect(sim.result.coils.get('KM1')).toBe(true)
    expect(sim.result.energized('h1')).toBe(true)
    sim.release('s1')
    expect(sim.result.coils.get('KM1')).toBe(true)
    expect(sim.result.closed('km1a')).toBe(true)
  })

  it('stop drops KM1 out, and it stays out after stop is released', () => {
    const sim = new Simulator(startStopExample())
    sim.press('s1')
    sim.release('s1')
    sim.press('s2')
    expect(sim.result.coils.get('KM1')).toBe(false)
    sim.release('s2')
    expect(sim.result.coils.get('KM1')).toBe(false)
    expect(sim.result.energized('h1')).toBe(false)
  })

  it('stop wins when both are held', () => {
    const sim = new Simulator(startStopExample())
    sim.press('s2')
    sim.press('s1')
    expect(sim.result.coils.get('KM1')).toBe(false)
  })

  it('flags a relay that switches itself off (coil through its own NC contact)', () => {
    const h = new History({ version: 1, parts: {}, wires: {} })
    const q = addPart(h.doc, 'SUPPLY', 200, 60)
    h.commit('q', q.changes)
    const nc = addPart(h.doc, 'KM_NC', 160, 180, 'KM1')
    h.commit('nc', nc.changes)
    const coil = addPart(h.doc, 'KM_COIL', 160, 300, 'KM1')
    h.commit('coil', coil.changes)
    h.commit('w', addWire(h.doc, { part: q.part.id, pin: 'L' }, { part: nc.part.id, pin: '21' }).changes)
    h.commit('w', addWire(h.doc, { part: nc.part.id, pin: '22' }, { part: coil.part.id, pin: 'A1' }).changes)
    h.commit('w', addWire(h.doc, { part: coil.part.id, pin: 'A2' }, { part: q.part.id, pin: 'N' }).changes)
    expect(settle(h.doc, none).oscillating).toBe(true)
  })

  it('the clock advances in fixed steps', () => {
    const sim = new Simulator(startStopExample())
    sim.advance(105)
    expect(sim.time).toBe(100)
  })

  it('reset drops every coil', () => {
    const sim = new Simulator(startStopExample())
    sim.press('s1')
    sim.release('s1')
    sim.reset()
    expect(sim.result.coils.get('KM1') ?? false).toBe(false)
  })
})
