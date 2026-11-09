import type { LucideIcon } from 'lucide-react';
import type { MouseEvent } from 'react';

interface Props {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  tooltipSide?: 'right' | 'top' | 'bottom';
}

const SIDES = {
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
};

export function IconButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  active = false,
  disabled = false,
  tooltipSide = 'right',
}: Props) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick();
    // Après un clic souris, la barre d'espace doit rester dédiée au déplacement du tableau.
    if (event.detail > 0) event.currentTarget.blur();
  };

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={handleClick}
      className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors disabled:opacity-40 ${
        active ? 'bg-accent text-white' : 'text-ink hover:bg-paper'
      }`}
    >
      <Icon size={20} aria-hidden="true" />
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-30 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${SIDES[tooltipSide]}`}
      >
        {label}
        {shortcut && <span className="ml-1.5 opacity-70">{shortcut}</span>}
      </span>
    </button>
  );
}
