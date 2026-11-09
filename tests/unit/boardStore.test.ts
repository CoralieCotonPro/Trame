import { createPostit, createText } from '../../src/lib/elements';
import { useBoardStore } from '../../src/stores/boardStore';

const store = () => useBoardStore.getState();

beforeEach(() => {
  useBoardStore.setState({ elements: {}, past: [], future: [] });
});

test('une modification ne touche que les champs demandés', () => {
  const postit = createPostit({ x: 10, y: 20 }, 1);
  store().addElements([postit]);
  store().patchElements({ [postit.id]: { content: { body: 'Bonjour' } } });

  const updated = store().elements[postit.id];
  expect(updated?.content).toEqual({ body: 'Bonjour' });
  expect(updated?.x).toBe(10);
});

test('annuler puis rétablir restitue chaque état', () => {
  const postit = createPostit({ x: 0, y: 0 }, 1);
  store().addElements([postit]);
  store().patchElements({ [postit.id]: { x: 300 } });

  store().undo();
  expect(store().elements[postit.id]?.x).toBe(0);
  store().undo();
  expect(store().elements[postit.id]).toBeUndefined();
  store().redo();
  store().redo();
  expect(store().elements[postit.id]?.x).toBe(300);
});

test('une suppression peut être annulée, avec tout son contenu', () => {
  const text = createText({ x: 5, y: 5 }, 1);
  store().addElements([text]);
  store().patchElements({ [text.id]: { content: { text: 'Roadmap' }, style: { level: 'h1' } } });
  store().removeElements([text.id]);
  expect(store().elements[text.id]).toBeUndefined();

  store().undo();
  const restored = store().elements[text.id];
  expect(restored?.type === 'text' && restored.content.text).toBe('Roadmap');
  expect(restored?.type === 'text' && restored.style.level).toBe('h1');
});

test('une nouvelle action efface les rétablissements possibles', () => {
  const postit = createPostit({ x: 0, y: 0 }, 1);
  store().addElements([postit]);
  store().undo();
  store().addElements([createPostit({ x: 1, y: 1 }, 2)]);
  expect(store().future).toHaveLength(0);
});

test('un déplacement groupé forme une seule étape d’annulation', () => {
  const a = createPostit({ x: 0, y: 0 }, 1);
  const b = createPostit({ x: 100, y: 0 }, 2);
  store().addElements([a, b]);
  store().patchElements({ [a.id]: { x: 50 }, [b.id]: { x: 150 } });
  store().undo();
  expect(store().elements[a.id]?.x).toBe(0);
  expect(store().elements[b.id]?.x).toBe(100);
});
