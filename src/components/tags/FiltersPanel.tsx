import { X } from 'lucide-react';
import { useMemo } from 'react';
import { activeFilterCount, matchesFilters, sortCategories, valuesOf } from '../../lib/tags';
import { resetFilters, toggleFilter } from '../../stores/actions';
import { useBoardStore } from '../../stores/boardStore';
import { useTagStore } from '../../stores/tagStore';
import { useUiStore } from '../../stores/uiStore';
import { IconButton } from '../toolbar/IconButton';

function useFilterCounts() {
  const filters = useUiStore((state) => state.filters);
  const elements = useBoardStore((state) => state.elements);
  const postits = Object.values(elements).filter((element) => element.type === 'postit');
  return {
    total: postits.length,
    shown: postits.filter((element) => matchesFilters(element, filters)).length,
    active: activeFilterCount(filters) > 0,
  };
}

function ResetButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={resetFilters}
      className="rounded-md px-2 py-1 font-medium text-accent hover:bg-paper disabled:text-ink-soft disabled:opacity-60"
    >
      Réinitialiser
    </button>
  );
}

function FiltersContent() {
  const categories = useTagStore((state) => state.categories);
  const values = useTagStore((state) => state.values);
  const filters = useUiStore((state) => state.filters);
  const setUi = useUiStore((state) => state.set);
  const ordered = useMemo(() => sortCategories(categories), [categories]);
  const { shown, total, active } = useFilterCounts();

  return (
    <aside aria-label="Filtres" className="absolute top-20 bottom-20 left-20 z-20 flex w-64 flex-col">
      <div className="flex max-h-full flex-col rounded-panel border border-line bg-surface shadow-panel">
        <header className="flex items-start justify-between py-1.5 pr-1.5 pl-4">
          <div className="pt-2">
            <h2 className="font-semibold">Filtres</h2>
            <p className="text-xs text-ink-soft">Afficher uniquement les post-it…</p>
          </div>
          <IconButton
            icon={X}
            label="Fermer les filtres"
            tooltipSide="bottom"
            onClick={() => setUi({ filtersOpen: false })}
          />
        </header>
        <div className="space-y-3 overflow-y-auto px-4 pb-3">
          {ordered.map((category) => (
            <fieldset key={category.id}>
              <legend className="mb-1 text-xs font-semibold text-ink-soft">{category.name}</legend>
              {valuesOf(values, category.id).map((value) => (
                <label
                  key={value.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md py-1 text-sm hover:bg-paper"
                >
                  <input
                    type="checkbox"
                    checked={filters[category.id]?.includes(value.id) ?? false}
                    onChange={() => toggleFilter(category.id, value.id)}
                    aria-label={`Filtrer ${category.name} : ${value.label}`}
                    className="h-4 w-4 accent-accent"
                  />
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-ink/15"
                    style={{ background: value.color }}
                  />
                  <span className="truncate">{value.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <footer className="flex items-center justify-between border-t border-line px-4 py-2 text-sm">
          <span className="text-ink-soft" role="status">
            {shown} post-it sur {total}
          </span>
          <ResetButton disabled={!active} />
        </footer>
      </div>
    </aside>
  );
}

/** Rappelle qu'un filtre masque des post-it, même une fois le panneau fermé. */
function ActiveFilterNotice() {
  const { shown, total } = useFilterCounts();
  return (
    <div
      role="status"
      className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-panel border border-line bg-surface py-1.5 pr-1.5 pl-4 text-sm whitespace-nowrap shadow-panel"
    >
      Filtre actif : {shown} post-it affichés sur {total}
      <ResetButton />
    </div>
  );
}

export function FiltersPanel() {
  const open = useUiStore((state) => state.filtersOpen);
  const active = useUiStore((state) => activeFilterCount(state.filters) > 0);
  if (open) return <FiltersContent />;
  return active ? <ActiveFilterNotice /> : null;
}
