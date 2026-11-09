import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { usePresenceStore, type Participant } from '../stores/presenceStore';
import type { Point } from '../types/board';

const DRAG_INTERVAL = 100;
const MIN_CURSOR_INTERVAL = 100;
// Calculé pour le pire cas (tout le monde bouge), sous la limite gratuite de 100 messages/s.
const MESSAGES_PER_SECOND_BUDGET = 80;
const STALE_DRAG_MS = 10_000;
const EASING = 0.35;

export interface DbChange {
  c: string | null;
  t: 'boards' | 'elements' | 'element_tags' | 'tag_categories' | 'tag_values';
  o: 'I' | 'U' | 'D';
  r: Record<string, unknown>;
}

interface Handlers {
  onDbChange: (change: DbChange) => void;
  onAccessChanged: () => void;
  onSubscribed: () => void;
}

interface Connection {
  data: RealtimeChannel;
  presence: RealtimeChannel;
  clientId: string;
  me: Pick<Participant, 'name' | 'color'>;
  editing: string | null;
}

let connection: Connection | null = null;
let cursorTimer: ReturnType<typeof setTimeout> | null = null;
let pendingCursor: Point | null | undefined;
let dragTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDrag: { ids: string[]; delta: Point } | null = null;
let animationFrame: number | null = null;

const presence = () => usePresenceStore.getState();
const isJoined = (channel: RealtimeChannel) => channel.state === 'joined';

function animateDrags() {
  animationFrame = null;
  const now = Date.now();
  const drags = Object.fromEntries(
    Object.entries(presence().drags)
      .filter(([, drag]) => now - drag.updatedAt < STALE_DRAG_MS)
      .map(([id, drag]) => [
        id,
        {
          ...drag,
          offset: {
            x: drag.offset.x + (drag.target.x - drag.offset.x) * EASING,
            y: drag.offset.y + (drag.target.y - drag.offset.y) * EASING,
          },
        },
      ]),
  );
  presence().set({ drags });
  if (Object.keys(drags).length > 0) animationFrame = requestAnimationFrame(animateDrags);
}

function receiveDrag(payload: { c: string; ids: string[]; x: number; y: number }) {
  const existing = presence().drags[payload.c];
  presence().set({
    drags: {
      ...presence().drags,
      [payload.c]: {
        ids: payload.ids,
        offset: existing?.offset ?? { x: 0, y: 0 },
        target: { x: payload.x, y: payload.y },
        updatedAt: Date.now(),
      },
    },
  });
  animationFrame ??= requestAnimationFrame(animateDrags);
}

/** La position définitive est arrivée : l'aperçu de cet élément n'a plus lieu d'être. */
export function clearRemoteDrag(elementId: string) {
  const drags = Object.entries(presence().drags).flatMap(([id, drag]) => {
    if (!drag.ids.includes(elementId)) return [[id, drag] as const];
    const ids = drag.ids.filter((item) => item !== elementId);
    return ids.length > 0 ? [[id, { ...drag, ids }] as const] : [];
  });
  if (drags.length !== Object.keys(presence().drags).length || drags.some(([id, d]) => d !== presence().drags[id])) {
    presence().set({ drags: Object.fromEntries(drags) });
  }
}

function syncParticipants(channel: RealtimeChannel) {
  const state = channel.presenceState<Pick<Participant, 'name' | 'color'>>();
  const known = new Map(presence().participants.map((item) => [item.clientId, item.editing]));
  const participants = Object.entries(state).flatMap(([id, metas]) => {
    const [meta] = metas;
    return meta
      ? [{ clientId: id, name: meta.name, color: meta.color, editing: known.get(id) ?? null }]
      : [];
  });
  participants.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const present = new Set(participants.map((participant) => participant.clientId));
  const cursors = Object.fromEntries(
    Object.entries(presence().cursors).filter(([id]) => present.has(id)),
  );
  presence().set({ participants, cursors });
}

/**
 * Une seule annonce par connexion : Supabase ferme le canal au-delà de 5 mises à jour
 * de présence en 30 secondes. Ce qui change souvent passe par Broadcast.
 */
function trackSelf() {
  if (!connection || !isJoined(connection.presence)) return;
  void connection.presence.track({ ...connection.me });
}

function sendEditing() {
  if (!connection || !isJoined(connection.presence)) return;
  void connection.presence.send({
    type: 'broadcast',
    event: 'editing',
    payload: { c: connection.clientId, id: connection.editing },
  });
}

function receiveEditing({ c, id }: { c: string; id: string | null }) {
  presence().set({
    participants: presence().participants.map((item) =>
      item.clientId === c ? { ...item, editing: id } : item,
    ),
  });
}

export async function connect(
  boardId: string,
  realtimeKey: string,
  clientId: string,
  me: Connection['me'],
  handlers: Handlers,
) {
  await supabase.realtime.setAuth();

  const data = supabase
    .channel(`board:${boardId}:${realtimeKey}`, {
      config: { private: true, broadcast: { self: false } },
    })
    .on('broadcast', { event: 'db' }, ({ payload }) => handlers.onDbChange(payload as DbChange))
    .on('broadcast', { event: 'access_changed' }, () => handlers.onAccessChanged())
    .on('broadcast', { event: 'drag' }, ({ payload }) => receiveDrag(payload as Parameters<typeof receiveDrag>[0]));

  const presenceChannel = supabase
    .channel(`board:${boardId}:${realtimeKey}:presence`, {
      config: { private: true, broadcast: { self: false }, presence: { key: clientId } },
    })
    .on('presence', { event: 'sync' }, () => syncParticipants(presenceChannel))
    // Un nouvel arrivant doit savoir qui est déjà en train d'écrire.
    .on('presence', { event: 'join' }, () => {
      if (connection?.editing) sendEditing();
    })
    .on('broadcast', { event: 'editing' }, ({ payload }) =>
      receiveEditing(payload as { c: string; id: string | null }),
    )
    .on('broadcast', { event: 'cursor' }, ({ payload }) => {
      const { c, x, y } = payload as { c: string; x: number | null; y: number | null };
      const cursors = { ...presence().cursors };
      if (x === null || y === null) delete cursors[c];
      else cursors[c] = { x, y };
      presence().set({ cursors });
    });

  connection = { data, presence: presenceChannel, clientId, me, editing: null };

  data.subscribe((status) => {
    if (status === 'SUBSCRIBED') handlers.onSubscribed();
    // Refus d'accès : la clé a peut-être changé pendant une coupure.
    if (status === 'CHANNEL_ERROR') handlers.onAccessChanged();
  });
  presenceChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') trackSelf();
  });
}

export function disconnect() {
  if (cursorTimer) clearTimeout(cursorTimer);
  if (dragTimer) clearTimeout(dragTimer);
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  cursorTimer = null;
  dragTimer = null;
  animationFrame = null;
  pendingDrag = null;
  pendingCursor = undefined;
  if (connection) {
    void supabase.removeChannel(connection.data);
    void supabase.removeChannel(connection.presence);
    connection = null;
  }
  presence().set({ participants: [], cursors: {}, drags: {} });
}

export function setEditing(elementId: string | null) {
  if (!connection || connection.editing === elementId) return;
  connection.editing = elementId;
  sendEditing();
}

/** Plus il y a de monde, moins chacun émet : chaque message est multiplié par les destinataires. */
function cursorInterval(): number {
  const count = presence().participants.length;
  const needed = (count * (count - 1) * 1000) / MESSAGES_PER_SECOND_BUDGET;
  return Math.max(MIN_CURSOR_INTERVAL, needed);
}

function flushCursor() {
  cursorTimer = null;
  if (!connection || pendingCursor === undefined || !isJoined(connection.presence)) return;
  const point = pendingCursor;
  pendingCursor = undefined;
  void connection.presence.send({
    type: 'broadcast',
    event: 'cursor',
    payload: { c: connection.clientId, x: point?.x ?? null, y: point?.y ?? null },
  });
}

export function sendCursor(point: Point | null) {
  if (!connection || presence().participants.length < 2) return;
  pendingCursor = point;
  cursorTimer ??= setTimeout(flushCursor, cursorInterval());
}

function flushDrag() {
  dragTimer = null;
  if (!connection || !pendingDrag || !isJoined(connection.data)) return;
  const { ids, delta } = pendingDrag;
  pendingDrag = null;
  void connection.data.send({
    type: 'broadcast',
    event: 'drag',
    payload: { c: connection.clientId, ids, x: delta.x, y: delta.y },
  });
}

export function sendDrag(ids: string[], delta: Point) {
  if (!connection || presence().participants.length < 2) return;
  pendingDrag = { ids, delta };
  dragTimer ??= setTimeout(flushDrag, DRAG_INTERVAL);
}

/** Évite qu'un dernier aperçu n'arrive après la position définitive. */
export function endDrag() {
  if (dragTimer) clearTimeout(dragTimer);
  dragTimer = null;
  pendingDrag = null;
}
