import type { BoardElement, TagCategory, TagFilters, TagValue } from '../types/board';

export const TAG_LABEL_MAX = 40;

export const TAG_COLORS = [
  { id: '#d6d3cc', label: 'Gris' },
  { id: '#f2a69b', label: 'Corail' },
  { id: '#f5b971', label: 'Orange' },
  { id: '#f2d96b', label: 'Jaune' },
  { id: '#9fd8a0', label: 'Vert' },
  { id: '#8fd3c8', label: 'Turquoise' },
  { id: '#9cc7f0', label: 'Bleu' },
  { id: '#aab2f0', label: 'Indigo' },
  { id: '#c9a9ee', label: 'Violet' },
  { id: '#f2a7c8', label: 'Rose' },
  { id: '#4a4a48', label: 'Anthracite' },
  { id: '#b3261e', label: 'Rouge foncé' },
  { id: '#2e7d32', label: 'Vert foncé' },
  { id: '#1f5fae', label: 'Bleu foncé' },
] as const;

const color = (index: number) => (TAG_COLORS[index] as (typeof TAG_COLORS)[number]).id;

export const DEFAULT_CATEGORIES: { name: string; values: [string, string][] }[] = [
  {
    name: 'Sizing',
    values: [
      ['XS', color(5)],
      ['S', color(6)],
      ['M', color(7)],
      ['L', color(8)],
      ['XL', color(9)],
    ],
  },
  {
    name: 'Statut',
    values: [
      ['À lancer', color(0)],
      ['En conception', color(3)],
      ['Prêt à spec', color(2)],
      ['Affiné', color(6)],
      ['En dev', color(13)],
      ['En prod', color(12)],
    ],
  },
  {
    name: 'Thématique',
    values: [
      ['Avis réglementaire', color(4)],
      ['Simulateur', color(9)],
      ['Admin/data', color(10)],
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
