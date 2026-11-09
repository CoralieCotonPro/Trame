import type { TextLevel } from '../types/board';

export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const LINE_HEIGHT = 1.3;
export const INK = '#2b2a27';
export const INK_MUTED = '#6b6860';

export const POSTIT_COLORS = [
  { id: 'yellow', label: 'Jaune', fill: '#fce588' },
  { id: 'pink', label: 'Rose', fill: '#f9c6d3' },
  { id: 'blue', label: 'Bleu', fill: '#bfddf5' },
  { id: 'green', label: 'Vert', fill: '#c5e8c0' },
  { id: 'orange', label: 'Orange', fill: '#fbd0a6' },
  { id: 'violet', label: 'Violet', fill: '#d9cbf2' },
  { id: 'gray', label: 'Gris clair', fill: '#e7e5e0' },
  { id: 'white', label: 'Blanc', fill: '#ffffff' },
] as const;

export const TEXT_COLORS = [
  { id: INK, label: 'Encre' },
  { id: '#625f58', label: 'Gris' },
  { id: '#b3261e', label: 'Rouge' },
  { id: '#b4532a', label: 'Terre cuite' },
  { id: '#2e7d32', label: 'Vert' },
  { id: '#1f5fae', label: 'Bleu' },
  { id: '#6b3fa0', label: 'Violet' },
] as const;

export const TEXT_LEVELS: Record<
  TextLevel,
  { label: string; short: string; fontSize: number; fontStyle: string }
> = {
  h1: { label: 'Titre 1', short: 'T1', fontSize: 36, fontStyle: 'bold' },
  h2: { label: 'Titre 2', short: 'T2', fontSize: 28, fontStyle: 'bold' },
  h3: { label: 'Titre 3', short: 'T3', fontSize: 22, fontStyle: '600' },
  body: { label: 'Texte normal', short: 'Aa', fontSize: 16, fontStyle: 'normal' },
  small: { label: 'Petit texte', short: 'Pt', fontSize: 13, fontStyle: 'normal' },
};

export const POSTIT_SIZES = [
  { id: 'S', label: 'Petit', width: 160, height: 120 },
  { id: 'M', label: 'Moyen', width: 200, height: 160 },
  { id: 'L', label: 'Grand', width: 280, height: 220 },
] as const;

export function postitFill(colorId: string): string {
  return POSTIT_COLORS.find((color) => color.id === colorId)?.fill ?? POSTIT_COLORS[0].fill;
}

function luminance(hex: string): number {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Rapport de contraste WCAG entre deux couleurs hexadécimales. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}
