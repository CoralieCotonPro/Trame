import { createPostit } from '../../src/lib/elements';
import {
  diffCatalog,
  diffElements,
  enqueue,
  replayOps,
  type Op,
  type PatchOp,
} from '../../src/lib/ops';

const none = new Set<string>();

function patch(elementId: string, extra: Partial<PatchOp>): PatchOp {
  return { id: crypto.randomUUID(), kind: 'element.patch', element_id: elementId, ...extra };
}

describe('diffElements', () => {
  const postit = createPostit({ x: 10, y: 20 }, 1);

  test('n’envoie que le champ modifié', () => {
    const ops = diffElements({ [postit.id]: postit }, { [postit.id]: { ...postit, x: 99 } }, none);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'element.patch', fields: { x: 99 } });
    expect(ops[0]).not.toHaveProperty('content');
  });

  test('ignore les éléments inchangés', () => {
    expect(diffElements({ [postit.id]: postit }, { [postit.id]: postit }, none)).toEqual([]);
    expect(
      diffElements({ [postit.id]: postit }, { [postit.id]: { ...postit, updatedAt: 'x' } }, none),
    ).toEqual([]);
  });

  test('crée et supprime', () => {
    expect(diffElements({}, { [postit.id]: postit }, none)[0]?.kind).toBe('element.create');
    expect(diffElements({ [postit.id]: postit }, {}, none)[0]).toMatchObject({
      kind: 'element.delete',
      element_id: postit.id,
    });
  });

  test('un tag retiré est envoyé à null, une valeur disparue est ignorée', () => {
    const tagged = { ...postit, tags: { size: 'm' } };
    const removed = diffElements(
      { [postit.id]: tagged },
      { [postit.id]: { ...postit, tags: {} } },
      new Set(['m']),
    );
    expect(removed[0]).toMatchObject({ tags: { size: null } });

    const ghost = diffElements(
      { [postit.id]: postit },
      { [postit.id]: { ...postit, tags: { size: 'supprimee' } } },
      new Set(),
    );
    expect(ghost).toEqual([]);
  });
});

describe('diffCatalog', () => {
  test('crée les catégories avant leurs valeurs et supprime dans l’ordre inverse', () => {
    const category = { id: 'c', name: 'Équipe', sortOrder: 0 };
    const value = { id: 'v', categoryId: 'c', label: 'Design', color: '#ffffff', sortOrder: 0 };
    const empty = { categories: [], values: [] };
    const full = { categories: [category], values: [value] };
    expect(diffCatalog(empty, full).map((op) => op.kind)).toEqual([
      'category.upsert',
      'value.upsert',
    ]);
    expect(diffCatalog(full, empty).map((op) => op.kind)).toEqual([
      'value.delete',
      'category.delete',
    ]);
  });
});

describe('enqueue', () => {
  test('fusionne les déplacements successifs d’un même élément', () => {
    let queue: Op[] = [];
    queue = enqueue(queue, patch('a', { fields: { x: 1 } }), 0);
    queue = enqueue(queue, patch('a', { fields: { x: 2, y: 5 } }), 0);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ fields: { x: 2, y: 5 } });
  });

  test('deux éléments différents restent deux opérations', () => {
    let queue: Op[] = [];
    queue = enqueue(queue, patch('a', { fields: { x: 1 } }), 0);
    queue = enqueue(queue, patch('b', { fields: { x: 2 } }), 0);
    expect(queue).toHaveLength(2);
  });

  test('ne modifie jamais une opération en cours d’envoi', () => {
    const first = patch('a', { fields: { x: 1 } });
    const queue = enqueue([first], patch('a', { fields: { x: 2 } }), 1);
    expect(queue).toHaveLength(2);
    expect(queue[0]).toBe(first);
  });

  test('fusionne une modification dans une création encore en attente', () => {
    const element = {
      id: 'a',
      type: 'postit' as const,
      x: 0,
      y: 0,
      width: 200,
      height: 160,
      z_index: 1,
      content: { body: '' },
      style: { color: 'yellow' },
      tags: {},
    };
    const create: Op = { id: 'o', kind: 'element.create', element };
    const queue = enqueue([create], patch('a', { content: { body: 'Salut' }, tags: { s: 'm' } }), 0);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ element: { content: { body: 'Salut' }, tags: { s: 'm' } } });
  });

  test('ne remonte pas avant une valeur de tag créée entre-temps', () => {
    const value: Op = {
      id: 'v',
      kind: 'value.upsert',
      value: { id: 'x', category_id: 'c', label: 'L', color: '#000000', sort_order: 0 },
    };
    const queue = enqueue(
      [patch('a', { fields: { x: 1 } }), value],
      patch('a', { tags: { c: 'x' } }),
      0,
    );
    expect(queue.map((op) => op.kind)).toEqual(['element.patch', 'value.upsert', 'element.patch']);
  });

  test('ne fusionne pas avec une opération antérieure à une suppression', () => {
    const remove: Op = { id: 'd', kind: 'element.delete', element_id: 'a' };
    const queue = enqueue([patch('a', { fields: { x: 1 } }), remove], patch('a', { fields: { x: 2 } }), 0);
    expect(queue).toHaveLength(3);
  });

  test('garde seulement le dernier nom du tableau', () => {
    let queue: Op[] = [];
    queue = enqueue(queue, { id: '1', kind: 'board.rename', name: 'R' }, 0);
    queue = enqueue(queue, { id: '2', kind: 'board.rename', name: 'Ro' }, 0);
    expect(queue).toEqual([{ id: '1', kind: 'board.rename', name: 'Ro' }]);
  });
});

describe('replayOps', () => {
  test('applique les modifications en attente au-dessus de l’état serveur', () => {
    const a = createPostit({ x: 0, y: 0 }, 1);
    const b = createPostit({ x: 5, y: 5 }, 2);
    const result = replayOps(
      { name: 'Serveur', elements: { [a.id]: a, [b.id]: b }, categories: [], values: [] },
      [
        patch(a.id, { fields: { x: 42, z_index: 9 }, content: { body: 'Local' }, tags: { c: 'v' } }),
        { id: 'd', kind: 'element.delete', element_id: b.id },
        { id: 'r', kind: 'board.rename', name: 'Local' },
      ],
    );
    expect(result.name).toBe('Local');
    expect(result.elements[b.id]).toBeUndefined();
    expect(result.elements[a.id]).toMatchObject({
      x: 42,
      zIndex: 9,
      content: { body: 'Local' },
      tags: { c: 'v' },
    });
  });
});
