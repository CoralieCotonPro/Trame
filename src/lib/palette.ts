import type { TextLevel } from '../types/board';
import { readableTextColor } from './tags';

// Couleurs issues du Système de Design de l'État (DSFR 1.15.4).
export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const LINE_HEIGHT = 1.3;
export const INK = '#161616';
export const INK_MUTED = '#666666';

export const POSTIT_COLORS = [
  { id: 'yellow', label: 'Jaune', fill: '#fde39c' },
  { id: 'red', label: 'Rouge clair', fill: '#fcbfbf' },
  { id: 'gray', label: 'Gris clair', fill: '#e5e5e5' },
  { id: 'green', label: 'Vert', fill: '#c9fcac' },
  { id: 'blue', label: 'Bleu', fill: '#e3e3fd' },
  { id: 'pink', label: 'Rose', fill: '#fddbfa' },
] as const;

export const TEXT_COLORS = [
  { id: INK, label: 'Encre' },
  { id: '#666666', label: 'Gris' }, // grey-425
  { id: '#c9191e', label: 'Rouge' }, // red-marianne-425
  { id: '#b34000', label: 'Orange' }, // warning-425
  { id: '#18753c', label: 'Vert' }, // success-425
  { id: '#0063cb', label: 'Bleu' }, // info-425
  { id: '#000091', label: 'Bleu France' }, // blue-france-sun-113
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

/** Noir ou blanc selon la couleur du post-it : les teintes vives l'exigent. */
export function postitInk(colorId: string): string {
  return readableTextColor(postitFill(colorId));
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
