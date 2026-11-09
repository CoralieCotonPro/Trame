import { Check } from 'lucide-react';
import { readableTextColor } from '../../lib/tags';

interface Props {
  label: string;
  color: string;
  selected: boolean;
  onClick: () => void;
  ariaLabel: string;
}

/** Valeur de tag cliquable : l'état choisi se lit aussi à la coche, pas seulement à la couleur. */
export function TagChip({ label, color, selected, onClick, ariaLabel }: Props) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`inline-flex h-7 max-w-full items-center gap-1 rounded-md px-2 text-xs font-semibold ${
        selected ? 'ring-2 ring-ink ring-offset-1' : 'hover:brightness-95'
      }`}
      style={{
        background: color,
        color: readableTextColor(color),
        boxShadow: selected ? undefined : 'inset 0 0 0 1px rgba(22, 22, 22, 0.25)',
      }}
    >
      {selected && <Check size={12} strokeWidth={3} aria-hidden="true" />}
      <span className="truncate">{label}</span>
    </button>
  );
}
