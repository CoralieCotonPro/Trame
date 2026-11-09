import { create } from 'zustand';

export type SyncState = 'saved' | 'saving' | 'offline' | 'error';

interface SyncStoreState {
  state: SyncState;
  pending: number;
  notice: string | null;
  set: (partial: Partial<Omit<SyncStoreState, 'set'>>) => void;
}

/** « saved » ne vaut que lorsque le serveur a confirmé toutes les opérations. */
export const useSyncStore = create<SyncStoreState>((set) => ({
  state: 'saved',
  pending: 0,
  notice: null,
  set,
}));
