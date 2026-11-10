import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { insertLink, normalizeUrl } from '../../lib/richText';
import { useBoardStore } from '../../stores/boardStore';
import { useSyncStore } from '../../stores/syncStore';
import { useUiStore } from '../../stores/uiStore';

type Request = NonNullable<ReturnType<typeof useUiStore.getState>['linkRequest']>;

function LinkForm({ request }: { request: Request }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = () => useUiStore.getState().set({ linkRequest: null });
  const words = request.value.slice(request.start, request.end);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const href = normalizeUrl(url);
    if (!href) {
      setError('Adresse invalide. Exemple : https://trello.com/c/…');
      return;
    }
    const { elements, patchElements } = useBoardStore.getState();
    const element = elements[request.elementId];
    const current = element ? (element.content as Record<string, string>)[request.field] : undefined;
    if (current !== request.value) {
      useSyncStore.getState().set({ notice: 'Le texte a changé entre-temps : sélectionnez à nouveau les mots.' });
      close();
      return;
    }
    patchElements({
      [request.elementId]: {
        content: { [request.field]: insertLink(request.value, request.start, request.end, href) },
      },
    });
    close();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Ajouter un lien"
        data-shortcuts-off
        onKeyDown={onKeyDown}
        onSubmit={submit}
        className="w-full max-w-md rounded-panel bg-surface p-5 shadow-panel"
      >
        <h2 className="text-lg font-semibold">Ajouter un lien</h2>
        <p className="mt-1 truncate text-sm text-ink-soft">Sur : « {words} »</p>
        <label htmlFor="link-url" className="mt-3 block text-sm text-ink-soft">
          Adresse du lien
        </label>
        <input
          id="link-url"
          autoFocus
          inputMode="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setError(null);
          }}
          placeholder="https://trello.com/c/…"
          className="mt-1 h-10 w-full rounded-lg border border-line px-3"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} className="h-9 rounded-md px-3 text-sm hover:bg-paper">
            Annuler
          </button>
          <button type="submit" className="h-9 rounded-md bg-accent px-3 text-sm font-medium text-white">
            Ajouter le lien
          </button>
        </div>
      </form>
    </div>
  );
}

export function LinkDialog() {
  const request = useUiStore((state) => state.linkRequest);
  return request ? <LinkForm request={request} /> : null;
}
