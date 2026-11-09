import { create } from 'zustand';
import {
  DEFAULT_CATEGORIES,
  isHexColor,
  normalizeLabel,
  sortCategories,
  TAG_COLORS,
  valuesOf,
} from '../lib/tags';
import type { TagCategory, TagValue } from '../types/board';

interface TagState {
  categories: TagCategory[];
  values: TagValue[];
  addCategory: (name: string) => boolean;
  renameCategory: (id: string, name: string) => boolean;
  removeCategory: (id: string) => void;
  moveCategory: (id: string, direction: -1 | 1) => void;
  addValue: (categoryId: string, label: string) => boolean;
  renameValue: (id: string, label: string) => boolean;
  setValueColor: (id: string, color: string) => void;
  removeValue: (id: string) => void;
}

function isTaken(labels: { id: string; text: string }[], text: string, exceptId?: string) {
  const wanted = text.toLocaleLowerCase('fr');
  return labels.some((item) => item.id !== exceptId && item.text.toLocaleLowerCase('fr') === wanted);
}

export function createDefaultCatalog(): Pick<TagState, 'categories' | 'values'> {
  const categories: TagCategory[] = [];
  const values: TagValue[] = [];
  DEFAULT_CATEGORIES.forEach(({ name, values: defaults }, sortOrder) => {
    const id = crypto.randomUUID();
    categories.push({ id, name, sortOrder });
    defaults.forEach(([label, color], valueOrder) => {
      values.push({ id: crypto.randomUUID(), categoryId: id, label, color, sortOrder: valueOrder });
    });
  });
  return { categories, values };
}

export const useTagStore = create<TagState>((set, get) => {
  const categoryLabels = () => get().categories.map((c) => ({ id: c.id, text: c.name }));
  const valueLabels = (categoryId: string) =>
    valuesOf(get().values, categoryId).map((v) => ({ id: v.id, text: v.label }));

  return {
    ...createDefaultCatalog(),

    addCategory: (rawName) => {
      const name = normalizeLabel(rawName);
      if (!name || isTaken(categoryLabels(), name)) return false;
      set((state) => ({
        categories: [
          ...state.categories,
          {
            id: crypto.randomUUID(),
            name,
            sortOrder: Math.max(-1, ...state.categories.map((c) => c.sortOrder)) + 1,
          },
        ],
      }));
      return true;
    },

    renameCategory: (id, rawName) => {
      const name = normalizeLabel(rawName);
      if (!name || isTaken(categoryLabels(), name, id)) return false;
      set((state) => ({
        categories: state.categories.map((c) => (c.id === id ? { ...c, name } : c)),
      }));
      return true;
    },

    removeCategory: (id) =>
      set((state) => ({
        categories: state.categories.filter((c) => c.id !== id),
        values: state.values.filter((v) => v.categoryId !== id),
      })),

    moveCategory: (id, direction) => {
      const sorted = sortCategories(get().categories);
      const index = sorted.findIndex((c) => c.id === id);
      const other = sorted[index + direction];
      const current = sorted[index];
      if (!other || !current) return;
      sorted[index] = other;
      sorted[index + direction] = current;
      set({ categories: sorted.map((c, sortOrder) => ({ ...c, sortOrder })) });
    },

    addValue: (categoryId, rawLabel) => {
      const label = normalizeLabel(rawLabel);
      if (!label || isTaken(valueLabels(categoryId), label)) return false;
      set((state) => {
        const siblings = valuesOf(state.values, categoryId);
        const color = (TAG_COLORS[siblings.length % TAG_COLORS.length] as (typeof TAG_COLORS)[number]).id;
        return {
          values: [
            ...state.values,
            {
              id: crypto.randomUUID(),
              categoryId,
              label,
              color,
              sortOrder: Math.max(-1, ...siblings.map((v) => v.sortOrder)) + 1,
            },
          ],
        };
      });
      return true;
    },

    renameValue: (id, rawLabel) => {
      const label = normalizeLabel(rawLabel);
      const value = get().values.find((v) => v.id === id);
      if (!value || !label || isTaken(valueLabels(value.categoryId), label, id)) return false;
      set((state) => ({ values: state.values.map((v) => (v.id === id ? { ...v, label } : v)) }));
      return true;
    },

    setValueColor: (id, color) => {
      if (!isHexColor(color)) return;
      set((state) => ({ values: state.values.map((v) => (v.id === id ? { ...v, color } : v)) }));
    },

    removeValue: (id) =>
      set((state) => ({ values: state.values.filter((v) => v.id !== id) })),
  };
});
