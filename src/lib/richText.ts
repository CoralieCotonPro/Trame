/**
 * Liens dans les textes, notés [mots](https://adresse). Seules les adresses http et https
 * deviennent des liens : toute autre notation reste du texte ordinaire.
 */
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

export interface TextLink {
  /** Position dans le texte affiché, sans la notation. */
  start: number;
  end: number;
  href: string;
}

export function parseLinks(raw: string): { display: string; links: TextLink[] } {
  let display = '';
  let last = 0;
  const links: TextLink[] = [];
  for (const match of raw.matchAll(LINK)) {
    display += raw.slice(last, match.index);
    const start = display.length;
    display += match[1];
    links.push({ start, end: display.length, href: match[2] as string });
    last = (match.index ?? 0) + match[0].length;
  }
  display += raw.slice(last);
  return { display, links };
}

export function displayText(raw: string): string {
  return parseLinks(raw).display;
}

/** Adresse saisie par la personne : complétée en https://, refusée si ce n'est pas un site. */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href.replace(/\(/g, '%28').replace(/\)/g, '%29');
  } catch {
    return null;
  }
}

/** Transforme la sélection [start, end) en lien. */
export function insertLink(value: string, start: number, end: number, href: string): string {
  const label = value.slice(start, end).replace(/[[\]\n]/g, ' ').trim();
  if (!label) return value;
  return `${value.slice(0, start)}[${label}](${href})${value.slice(end)}`;
}
