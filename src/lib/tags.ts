import type { BoardElement, TagCategory, TagFilters, TagValue } from '../types/board';

export const TAG_LABEL_MAX = 40;

/** Palette choisie pour le projet ; le texte des badges s'adapte à chaque fond. */
export const TAG_COLORS = [
  { id: '#ececfe', label: 'Bleu très pâle' },
  { id: '#e3e3fd', label: 'Bleu pâle' },
  { id: '#cacafb', label: 'Bleu clair' },
  { id: '#6a6af4', label: 'Bleu' },
  { id: '#000091', label: 'Bleu France' },
  { id: '#b6cffb', label: 'Bleu ciel' },
  { id: '#60e0eb', label: 'Turquoise' },
  { id: '#95e257', label: 'Vert' },
  { id: '#ffe552', label: 'Jaune' },
  { id: '#ff732c', label: 'Orange' },
  { id: '#f774ef', label: 'Rose' },
  { id: '#cecece', label: 'Gris clair' },
  { id: '#b3afb2', label: 'Gris' },
] as const;

export const DEFAULT_CATEGORIES: { name: string; values: [string, string][] }[] = [
  {
    name: 'Sizing',
    values: [
      ['XS', '#ececfe'],
      ['S', '#e3e3fd'],
      ['M', '#cacafb'],
      ['L', '#6a6af4'],
      ['XL', '#000091'],
    ],
  },
  {
    name: 'Statut',
    values: [
      ['À lancer', '#cecece'],
      ['En conception', '#ffe552'],
      ['À rédiger', '#ff732c'],
      ['Affiné', '#b6cffb'],
      ['En dev', '#60e0eb'],
      ['En prod', '#95e257'],
    ],
  },
  {
    name: 'Thématique',
    values: [
      ['Avis réglementaire', '#6a6af4'],
      ['Simulateur', '#f774ef'],
      ['Admin/data', '#b3afb2'],
    ],
  },
];

function luminance(hex: string): number {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Noir ou blanc, selon ce qui contraste le plus : au moins 4,58:1 sur tout fond. */
export function readableTextColor(background: string): '#000000' | '#ffffff' {
  const light = luminance(background);
  return (light + 0.05) / 0.05 >= 1.05 / (light + 0.05) ? '#000000' : '#ffffff';
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').slice(0, TAG_LABEL_MAX);
}

export interface ResolvedTag {
  categoryId: string;
  categoryName: string;
  valueId: string;
  label: string;
  color: string;
}

/** Tags du post-it, dans l'ordre des catégories. Les identifiants disparus sont ignorés. */
export function resolveTags(
  tags: Record<string, string>,
  categories: TagCategory[],
  values: TagValue[],
): ResolvedTag[] {
  return categories.flatMap((category) => {
    const valueId = tags[category.id];
    const value = values.find((item) => item.id === valueId && item.categoryId === category.id);
    return value
      ? [
          {
            categoryId: category.id,
            categoryName: category.name,
            valueId: value.id,
            label: value.label,
            color: value.color,
          },
        ]
      : [];
  });
}

export function sortCategories(categories: TagCategory[]): TagCategory[] {
  return [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function valuesOf(values: TagValue[], categoryId: string): TagValue[] {
  return values
    .filter((value) => value.categoryId === categoryId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** ET entre catégories, OU entre valeurs d'une même catégorie. Les textes restent visibles. */
export function matchesFilters(element: BoardElement, filters: TagFilters): boolean {
  if (element.type !== 'postit') return true;
  return Object.entries(filters).every(([categoryId, valueIds]) => {
    if (valueIds.length === 0) return true;
    const valueId = element.tags[categoryId];
    return valueId !== undefined && valueIds.includes(valueId);
  });
}

/** Un élément sélectionné reste affiché : le tagger ne doit pas le faire disparaître. */
export function isShown(
  element: BoardElement,
  filters: TagFilters,
  selectedIds: ReadonlySet<string>,
): boolean {
  return selectedIds.has(element.id) || matchesFilters(element, filters);
}

export function activeFilterCount(filters: TagFilters): number {
  return Object.values(filters).reduce((total, valueIds) => total + valueIds.length, 0);
}

export interface FlowBox {
  x: number;
  y: number;
}

/** Place des badges de gauche à droite, avec passage à la ligne. */
export function flowBadges(
  widths: number[],
  maxWidth: number,
  { gap, height }: { gap: number; height: number },
): { positions: FlowBox[]; totalHeight: number } {
  let x = 0;
  let y = 0;
  const positions = widths.map((width) => {
    if (x > 0 && x + width > maxWidth) {
      x = 0;
      y += height + gap;
    }
    const position = { x, y };
    x += width + gap;
    return position;
  });
  return { positions, totalHeight: widths.length > 0 ? y + height : 0 };
}
