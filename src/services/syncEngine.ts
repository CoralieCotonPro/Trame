import { enqueue, type Op, type OpResult, type PatchOp } from '../lib/ops';
import { useSyncStore } from '../stores/syncStore';
import { applyOps, NetworkOrServerError } from './boardApi';
import { outboxStorage } from './outboxStorage';

const SEND_DELAY = 150;
const BATCH_SIZE = 100;
const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000];

export interface SyncCallbacks {
  /** Le serveur a refusé un texte : quelqu'un l'a modifié entre-temps. */
  onConflict: (op: PatchOp, serverContent: Record<string, string>) => void;
  /** L'élément visé n'existe plus sur le serveur. */
  onMissing: (elementId: string) => void;
  /** Une opération a été refusée : l'état local peut différer du serveur. */
  onRejected: () => void;
}

/**
 * Envoie les modifications dans l'ordre, un lot à la fois. La file est écrite
 * dans IndexedDB avant tout envoi et n'est vidée qu'après réponse du serveur.
 */
export class SyncEngine {
  private queue: Op[];
  private inFlight = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private stopped = false;
  private writing: Promise<unknown> = Promise.resolve();
  private readonly editBases = new Map<string, number>();
  /** Nombre de réponses reçues : sert à détecter un rechargement devenu obsolète. */
  acknowledged = 0;

  constructor(
    private readonly boardId: string,
    private readonly storageKey: string,
    initialQueue: Op[],
    private readonly contentRevisions: Map<string, number>,
    private readonly revisions: Map<string, number>,
    private readonly clientId: string,
    private readonly callbacks: SyncCallbacks,
  ) {
    this.queue = initialQueue;
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    this.publish();
    if (this.queue.length > 0) this.schedule(0);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
  }

  isIdle(): boolean {
    return this.queue.length === 0;
  }

  pending(): Op[] {
    return this.queue;
  }

  /** Une édition s'appuie sur la version du texte au moment où elle a commencé. */
  beginEdit(elementId: string) {
    const revision = this.contentRevisions.get(elementId);
    if (revision !== undefined) this.editBases.set(elementId, revision);
  }

  endEdit(elementId: string) {
    this.editBases.delete(elementId);
  }

  add(ops: Op[]) {
    if (ops.length === 0) return;
    for (const op of ops) {
      const prepared = this.withBaseRevision(op);
      this.queue = enqueue(this.queue, prepared, this.inFlight);
    }
    this.persist();
    this.publish();
    this.schedule(SEND_DELAY);
  }

  private withBaseRevision(op: Op): Op {
    if (op.kind !== 'element.patch' || !op.content) return op;
    const base = this.editBases.get(op.element_id) ?? this.contentRevisions.get(op.element_id);
    return base === undefined ? op : { ...op, base_content_revision: base };
  }

  private readonly onOnline = () => {
    this.retries = 0;
    this.schedule(0);
  };

  private readonly onOffline = () => {
    useSyncStore.getState().set({ state: 'offline' });
  };

  private persist() {
    const snapshot = this.queue;
    this.writing = this.writing
      .then(() => outboxStorage.write(this.storageKey, snapshot))
      .catch(() => undefined);
  }

  private publish() {
    const { set, state } = useSyncStore.getState();
    const pending = this.queue.length;
    if (pending === 0) set({ state: 'saved', pending });
    else if (state === 'offline' || state === 'error') set({ pending });
    else set({ state: 'saving', pending });
  }

  private schedule(delay: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  private async flush() {
    this.timer = null;
    if (this.stopped || this.inFlight > 0 || this.queue.length === 0) return;

    this.inFlight = Math.min(this.queue.length, BATCH_SIZE);
    const batch = this.queue.slice(0, this.inFlight);
    await this.writing;

    try {
      const results = await applyOps(this.boardId, batch, this.clientId);
      this.acknowledge(batch, results);
      this.retries = 0;
      useSyncStore.getState().set({ state: 'saving' });
      this.persist();
      this.publish();
      if (this.queue.length > 0) this.schedule(0);
    } catch (error) {
      this.inFlight = 0;
      const transient = !(error instanceof NetworkOrServerError) || error.transient;
      useSyncStore.getState().set({ state: transient ? 'offline' : 'error' });
      const delay = RETRY_DELAYS[Math.min(this.retries, RETRY_DELAYS.length - 1)] as number;
      this.retries += 1;
      this.schedule(delay);
    }
  }

  private acknowledge(batch: Op[], results: OpResult[]) {
    this.queue = this.queue.slice(batch.length);
    this.inFlight = 0;
    this.acknowledged += 1;

    batch.forEach((op, index) => {
      const result = results[index];
      if (!result) return;
      const elementId =
        op.kind === 'element.create'
          ? op.element.id
          : op.kind === 'element.patch'
            ? op.element_id
            : null;

      if (elementId && result.revision !== undefined) {
        this.revisions.set(elementId, result.revision);
      }
      if (elementId && result.content_revision !== undefined) {
        this.contentRevisions.set(elementId, result.content_revision);
        this.rebaseQueued(elementId, result.content_revision);
      }

      if (result.status === 'conflict' && op.kind === 'element.patch' && result.server_content) {
        this.callbacks.onConflict(op, result.server_content);
      } else if (result.status === 'missing' && elementId) {
        this.callbacks.onMissing(elementId);
      } else if (result.status === 'rejected') {
        this.callbacks.onRejected();
      }
    });
  }

  /** Les éditions enchaînées s'appuient sur la révision que l'on vient d'obtenir. */
  private rebaseQueued(elementId: string, revision: number) {
    this.queue = this.queue.map((op) =>
      op.kind === 'element.patch' && op.element_id === elementId && op.content
        ? { ...op, base_content_revision: revision }
        : op,
    );
  }
}
