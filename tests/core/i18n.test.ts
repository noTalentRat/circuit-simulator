import { describe, expect, it } from 'vitest'
import { LOCALES, PARTS, t, type MessageKey } from '../../src/core'

describe('Translations', () => {
  it('fills placeholders', () => {
    expect(t('sim.time', { seconds: '1.50' }, 'en')).toBe('Sim time 1.50 s')
    expect(t('sim.time', { seconds: '1.50' }, 'es')).toBe('Tiempo de simulación 1.50 s')
  })

  it('every part has a name in every language', () => {
    for (const def of Object.values(PARTS)) {
      for (const locale of Object.keys(LOCALES) as Array<keyof typeof LOCALES>) {
        const table: Partial<Record<MessageKey, string>> = LOCALES[locale]
        expect(table[def.nameKey as MessageKey], `${locale}: ${def.nameKey}`).toBeTruthy()
      }
    }
  })

  it('Spanish covers every English key (Spanish ships from the first public version)', () => {
    const missing = Object.keys(LOCALES.en).filter((k) => !(k in LOCALES.es))
    expect(missing).toEqual([])
  })
})
