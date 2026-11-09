import { buildBoardFile, parseBoardFile, withFreshIds, type BoardFile } from '../../src/lib/boardFile';
import { createPostit, createText } from '../../src/lib/elements';
import { createDefaultCatalog } from '../../src/stores/tagStore';

function sample(): BoardFile {
  const { categories, values } = createDefaultCatalog();
  const [first] = values;
  const postit = createPostit({ x: 10, y: 20 }, 1, { [first?.categoryId as string]: first?.id as string });
  const text = createText({ x: 0, y: 0 }, 2);
  return buildBoardFile('Roadmap', [postit, text], categories, values);
}

function mutated(change: (file: Record<string, any>) => void) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const file = JSON.parse(JSON.stringify(sample()));
  change(file);
  return parseBoardFile(JSON.stringify(file));
}

function expectRejected(result: ReturnType<typeof parseBoardFile>, message: RegExp) {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toMatch(message);
}

test('un export se relit à l’identique', () => {
  const file = sample();
  const result = parseBoardFile(JSON.stringify(file));
  expect(result).toEqual({ ok: true, file });
});

test('un tag disparu du catalogue n’est pas exporté', () => {
  const postit = createPostit({ x: 0, y: 0 }, 1, { fantome: 'absent' });
  const [element] = buildBoardFile('x', [postit], [], []).elements;
  expect(element).toMatchObject({ tags: {} });
});

test('refuse ce qui n’est pas un export valide', () => {
  expectRejected(parseBoardFile('pas du json'), /JSON valide/);
  expectRejected(parseBoardFile('[]'), /invalide/);
  expectRejected(parseBoardFile('{"format":"autre"}'), /export de tableau/);
});

test('refuse une version plus récente ou inconnue', () => {
  expectRejected(mutated((f) => (f.version = 2)), /version 2/);
  expectRejected(mutated((f) => (f.version = 0)), /version 0/);
  expectRejected(mutated((f) => (f.version = '1')), /version/);
});

test('refuse les données incohérentes ou dangereuses', () => {
  expectRejected(mutated((f) => (f.elements[0].type = 'script')), /type inconnu/);
  expectRejected(mutated((f) => (f.elements[0].x = 'abc')), /position/);
  expectRejected(mutated((f) => (f.elements[0].x = 1e12)), /position/);
  expectRejected(mutated((f) => (f.elements[0].style.color = 'url(x)')), /inconnue/);
  expectRejected(mutated((f) => (f.values[0].color = 'url(javascript:alert(1))')), /invalide/);
  expectRejected(mutated((f) => (f.elements[0].content.body = 'x'.repeat(5001))), /invalide/);
  expectRejected(mutated((f) => (f.elements[0].tags = { inconnue: 'valeur' })), /tag inconnu/);
  expectRejected(mutated((f) => (f.values[0].categoryId = 'absente')), /catégorie inconnue/);
  expectRejected(mutated((f) => (f.elements[1].id = f.elements[0].id)), /même identifiant/);
  expectRejected(mutated((f) => (f.categories[1].name = f.categories[0].name)), /double/);
  expectRejected(mutated((f) => (f.elements = new Array(2001).fill(f.elements[0]))), /limite/);
});

test('un import reçoit de nouveaux identifiants, avec des tags toujours cohérents', () => {
  const file = sample();
  const fresh = withFreshIds(file);
  expect(fresh.elements[0]?.id).not.toBe(file.elements[0]?.id);
  expect(fresh.categories[0]?.id).not.toBe(file.categories[0]?.id);

  const [postit] = fresh.elements;
  const [categoryId, valueId] = Object.entries(postit?.type === 'postit' ? postit.tags : {})[0] ?? [];
  expect(fresh.values.find((v) => v.id === valueId)?.categoryId).toBe(categoryId);
  expect(parseBoardFile(JSON.stringify(fresh)).ok).toBe(true);
});
