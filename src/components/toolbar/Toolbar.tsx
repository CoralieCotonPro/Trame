import { Hand, ListFilter, MousePointer2, StickyNote, Type } from 'lucide-react';
import { activeFilterCount } from '../../lib/tags';
import { addPostit, addText } from '../../stores/actions';
import { useUiStore } from '../../stores/uiStore';
import { IconButton } from './IconButton';

export function Toolbar() {
  const tool = useUiStore((state) => state.tool);
  const setUi = useUiStore((state) => state.set);
  const filtersOpen = useUiStore((state) => state.filtersOpen);
  const activeCount = useUiStore((state) => activeFilterCount(state.filters));

  return (
    <nav
      aria-label="Outils"
      className="absolute top-1/2 left-4 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-panel border border-line bg-surface p-1.5 shadow-panel"
    >
      <IconButton
        icon={MousePointer2}
        label="Sélection"
        shortcut="V"
        active={tool === 'select'}
        onClick={() => setUi({ tool: 'select' })}
      />
      <IconButton
        icon={Hand}
        label="Main : déplacer le tableau"
        shortcut="H"
        active={tool === 'hand'}
        onClick={() => setUi({ tool: 'hand' })}
      />
      <div className="mx-2 my-1 h-px bg-line" />
      <IconButton icon={Type} label="Ajouter un texte" shortcut="T" onClick={addText} />
      <IconButton icon={StickyNote} label="Ajouter un post-it" shortcut="N" onClick={() => addPostit()} />
      <div className="mx-2 my-1 h-px bg-line" />
      <div className="relative">
        <IconButton
          icon={ListFilter}
          label={activeCount > 0 ? `Filtres (${activeCount} actifs)` : 'Filtres'}
          active={filtersOpen}
          onClick={() => setUi({ filtersOpen: !filtersOpen })}
        />
        {activeCount > 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold text-white"
          >
            {activeCount}
          </span>
        )}
      </div>
    </nav>
  );
}
