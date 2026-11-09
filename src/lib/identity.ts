const NAME_KEY = 'envergo:display-name';
const COLORS = ['#b4532a', '#1f5fae', '#2e7d32', '#6b3fa0', '#b3261e', '#00695c', '#8a5a00', '#ad1457'];

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
