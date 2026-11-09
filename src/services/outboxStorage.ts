import type { Op } from '../lib/ops';

const DB_NAME = 'envergo-tableau-blanc';
const STORE = 'outbox';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let database: Promise<IDBDatabase> | null = null;

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  database ??= openDatabase();
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** File locale des modifications pas encore confirmées par le serveur. */
export const outboxStorage = {
  read: async (key: string): Promise<Op[]> => (await run('readonly', (s) => s.get(key))) ?? [],
  write: async (key: string, ops: Op[]): Promise<void> => {
    await run<unknown>('readwrite', (s) => (ops.length > 0 ? s.put(ops, key) : s.delete(key)) as IDBRequest<unknown>);
  },
};
