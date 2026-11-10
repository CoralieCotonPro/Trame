import { describe, expect, it } from 'vitest';
import { filterBoards, listCreators, readFilters, writeFilters } from '../../src/lib/projects';

const boards = [
  { id: '1', project_id: 'guh', owner_id: 'a', owner_email: 'a@x.fr' },
  { id: '2', project_id: 'envergo', owner_id: 'a', owner_email: 'a@x.fr' },
  { id: '3', project_id: 'guh', owner_id: 'b', owner_email: 'b@x.fr' },
  { id: '4', project_id: 'guh', owner_id: 'c', owner_email: null },
];

describe('filtres de la liste des tableaux', () => {
  it('combine projet et créateur', () => {
    const ids = (project: 'guh' | 'envergo' | null, creator: string | null) =>
      filterBoards(boards, { project, creator }).map((board) => board.id);
    expect(ids(null, null)).toEqual(['1', '2', '3', '4']);
    expect(ids('guh', null)).toEqual(['1', '3', '4']);
    expect(ids(null, 'a')).toEqual(['1', '2']);
    expect(ids('guh', 'a')).toEqual(['1']);
  });

  it('lit et écrit les filtres dans l’URL, en ignorant un projet inconnu', () => {
    expect(readFilters('?projet=guh&createur=a')).toEqual({ project: 'guh', creator: 'a' });
    expect(readFilters('?projet=autre')).toEqual({ project: null, creator: null });
    expect(writeFilters({ project: 'envergo', creator: null })).toBe('?projet=envergo');
    expect(writeFilters({ project: null, creator: null })).toBe('');
  });

  it('liste les créateurs distincts ayant un e-mail visible, triés', () => {
    expect(listCreators([...boards].reverse())).toEqual([
      { id: 'a', email: 'a@x.fr' },
      { id: 'b', email: 'b@x.fr' },
    ]);
  });
});
