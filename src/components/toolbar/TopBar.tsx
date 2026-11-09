import { ArrowLeft, Menu } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../hooks/useRoute';
import { MAX_FILE_BYTES, parseBoardFile } from '../../lib/boardFile';
import { exportJson, exportPng } from '../../services/boardTransfer';
import { useBoardStore } from '../../stores/boardStore';
import { useSyncStore } from '../../stores/syncStore';
import { useUiStore } from '../../stores/uiStore';
import { Participants } from '../collaboration/Participants';
import { IconButton } from './IconButton';
import { SaveStatus } from './SaveStatus';

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-2 text-sm hover:bg-paper">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-accent"
      />
    </label>
  );
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-paper"
    >
      {label}
    </button>
  );
}

async function readImport(file: File) {
  const { set } = useSyncStore.getState();
  if (file.size > MAX_FILE_BYTES) {
    set({ notice: 'Ce fichier est trop volumineux (10 Mo au maximum).' });
    return;
  }
  const result = parseBoardFile(await file.text());
  if (result.ok) useUiStore.getState().set({ importFile: result.file });
  else set({ notice: `Import impossible : ${result.error}` });
}

function MainMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const gridVisible = useUiStore((state) => state.gridVisible);
  const doubleClickCreates = useUiStore((state) => state.doubleClickCreates);
  const role = useUiStore((state) => state.role);
  const setUi = useUiStore((state) => state.set);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        icon={Menu}
        label="Menu principal"
        tooltipSide="bottom"
        active={open}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div className="absolute top-full right-0 z-30 mt-2 w-72 rounded-panel border border-line bg-surface p-1.5 shadow-panel">
          <Toggle
            label="Afficher la grille"
            checked={gridVisible}
            onChange={(checked) => setUi({ gridVisible: checked })}
          />
          <Toggle
            label="Double-clic : créer un post-it"
            checked={doubleClickCreates}
            onChange={(checked) => setUi({ doubleClickCreates: checked })}
          />
          {role !== 'viewer' && (
            <>
              <div className="mx-2 my-1 h-px bg-line" />
              <MenuButton
                label="Gérer les tags"
                onClick={() => {
                  setOpen(false);
                  setUi({ tagManagerOpen: true });
                }}
              />
            </>
          )}
          <div className="mx-2 my-1 h-px bg-line" />
          <MenuButton
            label="Exporter en JSON"
            onClick={() => {
              setOpen(false);
              exportJson();
            }}
          />
          <MenuButton
            label="Exporter en image PNG"
            onClick={() => {
              setOpen(false);
              void exportPng();
            }}
          />
          {role !== 'viewer' && (
            <MenuButton label="Importer un fichier JSON" onClick={() => fileRef.current?.click()} />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            aria-label="Fichier JSON à importer"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void readImport(file).then(() => setOpen(false));
            }}
          />
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const name = useBoardStore((state) => state.name);
  const rename = useBoardStore((state) => state.rename);
  const role = useUiStore((state) => state.role);
  const setUi = useUiStore((state) => state.set);

  return (
    <header className="pointer-events-none absolute inset-x-4 top-4 z-30 flex items-start justify-between gap-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-panel border border-line bg-surface py-1 pr-3 pl-1 shadow-panel">
        <IconButton
          icon={ArrowLeft}
          label="Mes tableaux"
          tooltipSide="bottom"
          onClick={() => navigate('/')}
        />
        <input
          value={name}
          maxLength={120}
          readOnly={role === 'viewer'}
          onChange={(event) => rename(event.target.value)}
          aria-label="Nom du tableau"
          className="h-8 w-52 min-w-0 rounded-md bg-transparent px-1 font-semibold"
        />
        {role === 'viewer' ? (
          <span className="text-sm whitespace-nowrap text-ink-soft">Lecture seule</span>
        ) : (
          <SaveStatus />
        )}
      </div>
      <div className="pointer-events-auto flex items-center gap-2 rounded-panel border border-line bg-surface p-1 pl-2 shadow-panel">
        <Participants />
        {role === 'owner' && (
          <button
            type="button"
            onClick={() => setUi({ shareOpen: true })}
            className="h-10 rounded-lg bg-accent px-3 text-sm font-medium text-white"
          >
            Partager
          </button>
        )}
        <MainMenu />
      </div>
    </header>
  );
}
