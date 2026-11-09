import { ArrowLeft, Menu } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../hooks/useRoute';
import { useBoardStore } from '../../stores/boardStore';
import { useUiStore } from '../../stores/uiStore';
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

function MainMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const gridVisible = useUiStore((state) => state.gridVisible);
  const doubleClickCreates = useUiStore((state) => state.doubleClickCreates);
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
          <div className="mx-2 my-1 h-px bg-line" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setUi({ tagManagerOpen: true });
            }}
            className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-paper"
          >
            Gérer les tags
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const name = useBoardStore((state) => state.name);
  const rename = useBoardStore((state) => state.rename);

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
          onChange={(event) => rename(event.target.value)}
          aria-label="Nom du tableau"
          className="h-8 w-52 min-w-0 rounded-md bg-transparent px-1 font-semibold"
        />
        <SaveStatus />
      </div>
      <div className="pointer-events-auto rounded-panel border border-line bg-surface p-1 shadow-panel">
        <MainMenu />
      </div>
    </header>
  );
}
