import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { BoardFile } from '../../lib/boardFile';
import { replaceBoardContent } from '../../services/boardTransfer';
import { useBoardStore } from '../../stores/boardStore';
import { useUiStore } from '../../stores/uiStore';

function Confirmation({ file }: { file: BoardFile }) {
  const setUi = useUiStore((state) => state.set);
  const current = useBoardStore((state) => Object.keys(state.elements).length);
  const ref = useRef<HTMLButtonElement>(null);
  const close = () => setUi({ importFile: null });

  useEffect(() => ref.current?.focus(), []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Remplacer le contenu du tableau"
        data-shortcuts-off
        onKeyDown={onKeyDown}
        className="w-full max-w-md rounded-panel bg-surface p-5 shadow-panel"
      >
        <h2 className="text-lg font-semibold">Remplacer le contenu du tableau ?</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Les {current} éléments actuels et leurs tags seront définitivement remplacés par les{' '}
          {file.elements.length} éléments du fichier « {file.board.name || 'Sans titre'} ». Cette
          action ne peut pas être annulée, et s'applique à tous les participants.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={ref}
            type="button"
            onClick={close}
            className="h-9 rounded-md px-3 text-sm hover:bg-paper"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              replaceBoardContent(file);
              close();
            }}
            className="h-9 rounded-md bg-danger px-3 text-sm font-medium text-white"
          >
            Remplacer
          </button>
        </div>
      </div>
    </div>
  );
}

export function ImportDialog() {
  const file = useUiStore((state) => state.importFile);
  return file ? <Confirmation file={file} /> : null;
}
