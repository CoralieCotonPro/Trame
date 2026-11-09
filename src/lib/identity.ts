const NAME_KEY = 'trame:display-name';
const COLORS = ['#000091', '#c9191e', '#18753c', '#0063cb', '#b34000', '#3a3a3a'];

/** Identifie cet onglet : un compte peut être ouvert à plusieurs endroits. */
export const clientId = crypto.randomUUID();

export function storedDisplayName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function storeDisplayName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Confort seulement : le prénom sera simplement redemandé.
  }
}

export function colorFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length] as string;
}
