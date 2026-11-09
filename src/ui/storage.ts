import { parseDoc, type CircuitDoc } from '../core'

/**
 * Autosave in the browser's IndexedDB: one sheet, saved after every change.
 * IndexedDB rather than localStorage because sheets will grow (several pages, annotations) past localStorage's few MB.
 */

const DB_NAME = 'circuit-simulator'
const STORE = 'sheets'
const KEY = 'current'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => {
          db.close()
          resolve(req.result)
        }
        tx.onerror = tx.onabort = () => {
          db.close()
          reject(tx.error ?? req.error)
        }
      }),
  )
}

/** The last saved sheet, or null if there is none (or it can't be read). */
export async function loadSaved(): Promise<CircuitDoc | null> {
  try {
    return parseDoc(await run('readonly', (s) => s.get(KEY)))
  } catch {
    return null
  }
}

export async function save(doc: CircuitDoc): Promise<void> {
  await run('readwrite', (s) => s.put(structuredClone(doc), KEY))
}
