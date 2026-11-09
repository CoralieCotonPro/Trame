import { create } from 'zustand';
import type { Point } from '../types/board';

export interface Participant {
  clientId: string;
  name: string;
  color: string;
  editing: string | null;
}

export interface RemoteDrag {
  ids: string[];
  /** Position affichée, qui rejoint progressivement `target`. */
  offset: Point;
  target: Point;
  updatedAt: number;
}

interface PresenceState {
  participants: Participant[];
  cursors: Record<string, Point>;
  drags: Record<string, RemoteDrag>;
  set: (partial: Partial<Omit<PresenceState, 'set'>>) => void;
}

/** Données éphémères : elles ne sont jamais écrites en base. */
export const usePresenceStore = create<PresenceState>((set) => ({
  participants: [],
  cursors: {},
  drags: {},
  set,
}));
