/** Projets d'un tableau. La liste doit rester alignée sur la table `projects`. */
export const PROJECTS = [
  { id: 'envergo', name: 'Envergo' },
  { id: 'guh', name: 'GUH' },
] as const;

export type ProjectId = (typeof PROJECTS)[number]['id'];

export function isProjectId(value: unknown): value is ProjectId {
  return PROJECTS.some((project) => project.id === value);
}

export function projectName(id: string): string {
  return PROJECTS.find((project) => project.id === id)?.name ?? id;
}

export interface BoardFilters {
  project: ProjectId | null;
  creator: string | null;
}

interface Filterable {
  project_id: string;
  owner_id: string;
}

export function filterBoards<T extends Filterable>(boards: T[], filters: BoardFilters): T[] {
  return boards.filter(
    (board) =>
      (filters.project === null || board.project_id === filters.project) &&
      (filters.creator === null || board.owner_id === filters.creator),
  );
}

/** Filtres lus dans l'URL de la liste (`?projet=guh&createur=<id>`). */
export function readFilters(search: string): BoardFilters {
  const params = new URLSearchParams(search);
  const project = params.get('projet');
  return {
    project: isProjectId(project) ? project : null,
    creator: params.get('createur') || null,
  };
}

export function writeFilters(filters: BoardFilters): string {
  const params = new URLSearchParams();
  if (filters.project) params.set('projet', filters.project);
  if (filters.creator) params.set('createur', filters.creator);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export interface Creator {
  id: string;
  email: string;
}

/** Créateurs distincts de la liste, triés par e-mail. Ceux sans e-mail visible sont ignorés. */
export function listCreators(boards: { owner_id: string; owner_email: string | null }[]): Creator[] {
  const byId = new Map<string, string>();
  for (const board of boards) {
    if (board.owner_email) byId.set(board.owner_id, board.owner_email);
  }
  return [...byId]
    .map(([id, email]) => ({ id, email }))
    .sort((a, b) => a.email.localeCompare(b.email, 'fr'));
}
