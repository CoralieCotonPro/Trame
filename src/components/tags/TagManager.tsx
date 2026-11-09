import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { readableTextColor, sortCategories, TAG_COLORS, TAG_LABEL_MAX, valuesOf } from '../../lib/tags';
import { deleteTagCategory, deleteTagValue, tagUsageCount } from '../../stores/actions';
import { useTagStore } from '../../stores/tagStore';
import { useUiStore } from '../../stores/uiStore';
import type { TagCategory, TagValue } from '../../types/board';
import { IconButton } from '../toolbar/IconButton';

const inputClass =
  'h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-line focus:border-line';

/** Champ qui valide à la sortie ; un nom vide ou déjà pris reprend sa valeur précédente. */
function NameInput({
  value,
  ariaLabel,
  onCommit,
  className = '',
}: {
  value: string;
  ariaLabel: string;
  onCommit: (next: string) => boolean;
  className?: string;
}) {
  const commit = (input: HTMLInputElement) => {
    if (input.value !== value && !onCommit(input.value)) input.value = value;
  };
  return (
    <input
      key={value}
      defaultValue={value}
      maxLength={TAG_LABEL_MAX}
      aria-label={ariaLabel}
      onBlur={(event) => commit(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className={`${inputClass} ${className}`}
    />
  );
}

function ConfirmDelete({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-paper p-2 text-sm">
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-md bg-[#b3261e] px-2 py-1 font-medium text-white"
      >
        Confirmer la suppression
      </button>
      <button type="button" onClick={onCancel} className="rounded-md px-2 py-1 hover:bg-line">
        Annuler
      </button>
    </div>
  );
}

function usageMessage(count: number, subject: string): string {
  if (count === 0) return `Supprimer ${subject} ?`;
  return `Supprimer ${subject} ? Le tag sera retiré de ${count} post-it.`;
}

function ValueRow({ value, category }: { value: TagValue; category: TagCategory }) {
  const renameValue = useTagStore((state) => state.renameValue);
  const setValueColor = useTagStore((state) => state.setValueColor);
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const remove = () => {
    if (tagUsageCount([value.id]) > 0) setConfirming(true);
    else deleteTagValue(value.id);
  };

  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Changer la couleur de ${value.label}`}
          aria-expanded={picking}
          onClick={() => setPicking(!picking)}
          className="flex h-7 w-12 shrink-0 items-center justify-center rounded-md border border-ink/15 text-xs font-semibold"
          style={{ background: value.color, color: readableTextColor(value.color) }}
        >
          Aa
        </button>
        <NameInput
          value={value.label}
          ariaLabel={`Libellé de ${value.label}`}
          onCommit={(next) => renameValue(value.id, next)}
        />
        <IconButton
          icon={Trash2}
          label={`Supprimer ${value.label}`}
          tooltipSide="top"
          onClick={remove}
        />
      </div>
      {picking && (
        <div className="mt-1 mb-2 flex flex-wrap items-center gap-1.5 pl-1" role="group" aria-label={`Couleurs pour ${value.label}`}>
          {TAG_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              aria-label={`Couleur ${color.label}`}
              aria-pressed={value.color === color.id}
              title={color.label}
              onClick={() => setValueColor(value.id, color.id)}
              className={`h-6 w-6 rounded-full border ${
                value.color === color.id ? 'border-ink ring-2 ring-ink/30' : 'border-ink/15'
              }`}
              style={{ background: color.id }}
            />
          ))}
          <label className="flex items-center gap-1 text-xs text-ink-soft">
            Autre
            <input
              type="color"
              value={value.color}
              aria-label={`Couleur libre pour ${value.label} dans ${category.name}`}
              onChange={(event) => setValueColor(value.id, event.target.value)}
              className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
            />
          </label>
        </div>
      )}
      {confirming && (
        <ConfirmDelete
          message={usageMessage(tagUsageCount([value.id]), `« ${value.label} »`)}
          onConfirm={() => deleteTagValue(value.id)}
          onCancel={() => setConfirming(false)}
        />
      )}
    </li>
  );
}

function AddForm({
  placeholder,
  ariaLabel,
  submitLabel,
  onAdd,
}: {
  placeholder: string;
  ariaLabel: string;
  submitLabel: string;
  onAdd: (name: string) => boolean;
}) {
  const [text, setText] = useState('');
  const [rejected, setRejected] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (onAdd(text)) {
      setText('');
      setRejected(false);
    } else {
      setRejected(true);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="flex items-center gap-1">
        <input
          value={text}
          maxLength={TAG_LABEL_MAX}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(event) => {
            setText(event.target.value);
            setRejected(false);
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-sm"
        />
        <button
          type="submit"
          aria-label={submitLabel}
          title={submitLabel}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-paper"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      {rejected && (
        <p role="alert" className="mt-1 text-xs text-[#b3261e]">
          Ce nom est vide ou déjà utilisé.
        </p>
      )}
    </form>
  );
}

function CategoryCard({
  category,
  isFirst,
  isLast,
}: {
  category: TagCategory;
  isFirst: boolean;
  isLast: boolean;
}) {
  const allValues = useTagStore((state) => state.values);
  const renameCategory = useTagStore((state) => state.renameCategory);
  const moveCategory = useTagStore((state) => state.moveCategory);
  const addValue = useTagStore((state) => state.addValue);
  const [confirming, setConfirming] = useState(false);
  const values = valuesOf(allValues, category.id);

  return (
    <section
      aria-label={`Catégorie ${category.name}`}
      className="rounded-lg border border-line p-3"
    >
      <div className="mb-2 flex items-center gap-1">
        <NameInput
          value={category.name}
          ariaLabel={`Nom de la catégorie ${category.name}`}
          onCommit={(next) => renameCategory(category.id, next)}
          className="font-semibold"
        />
        <IconButton
          icon={ArrowUp}
          label={`Monter ${category.name}`}
          tooltipSide="top"
          disabled={isFirst}
          onClick={() => moveCategory(category.id, -1)}
        />
        <IconButton
          icon={ArrowDown}
          label={`Descendre ${category.name}`}
          tooltipSide="top"
          disabled={isLast}
          onClick={() => moveCategory(category.id, 1)}
        />
        <IconButton
          icon={Trash2}
          label={`Supprimer la catégorie ${category.name}`}
          tooltipSide="top"
          onClick={() => setConfirming(true)}
        />
      </div>
      {confirming && (
        <div className="mb-2">
          <ConfirmDelete
            message={usageMessage(
              tagUsageCount(values.map((value) => value.id)),
              `la catégorie « ${category.name} » et ses valeurs`,
            )}
            onConfirm={() => deleteTagCategory(category.id)}
            onCancel={() => setConfirming(false)}
          />
        </div>
      )}
      <ul className="space-y-1">
        {values.map((value) => (
          <ValueRow key={value.id} value={value} category={category} />
        ))}
      </ul>
      <div className="mt-2">
        <AddForm
          placeholder="Nouvelle valeur"
          ariaLabel={`Nouvelle valeur pour ${category.name}`}
          submitLabel={`Ajouter la valeur à ${category.name}`}
          onAdd={(label) => addValue(category.id, label)}
        />
      </div>
    </section>
  );
}

function TagManagerContent() {
  const categories = useTagStore((state) => state.categories);
  const addCategory = useTagStore((state) => state.addCategory);
  const setUi = useUiStore((state) => state.set);
  const ref = useRef<HTMLDivElement>(null);
  const ordered = useMemo(() => sortCategories(categories), [categories]);
  const close = () => setUi({ tagManagerOpen: false });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus?.();
  }, []);

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
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Gérer les tags"
        tabIndex={-1}
        data-shortcuts-off
        onKeyDown={onKeyDown}
        className="flex max-h-full w-full max-w-lg flex-col rounded-panel bg-surface shadow-panel outline-none"
      >
        <header className="flex items-center justify-between py-2 pr-2 pl-5">
          <h2 className="text-lg font-semibold">Gérer les tags</h2>
          <IconButton icon={X} label="Fermer" tooltipSide="bottom" onClick={close} />
        </header>
        <div className="space-y-3 overflow-y-auto px-5 pb-3">
          {ordered.map((category, index) => (
            <CategoryCard
              key={category.id}
              category={category}
              isFirst={index === 0}
              isLast={index === ordered.length - 1}
            />
          ))}
        </div>
        <footer className="border-t border-line px-5 py-3">
          <AddForm
            placeholder="Nouvelle catégorie"
            ariaLabel="Nouvelle catégorie"
            submitLabel="Ajouter la catégorie"
            onAdd={addCategory}
          />
        </footer>
      </div>
    </div>
  );
}

export function TagManager() {
  const open = useUiStore((state) => state.tagManagerOpen);
  return open ? <TagManagerContent /> : null;
}
