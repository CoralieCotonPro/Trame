import { createPostit, createText } from '../../src/lib/elements';
import { contrastRatio } from '../../src/lib/palette';
import {
  flowBadges,
  isHexColor,
  matchesFilters,
  normalizeLabel,
  readableTextColor,
  resolveTags,
  sortCategories,
  valuesOf,
} from '../../src/lib/tags';
import { useBoardStore } from '../../src/stores/boardStore';
import { createDefaultCatalog, useTagStore } from '../../src/stores/tagStore';

const tags = () => useTagStore.getState();
const board = () => useBoardStore.getState();

function value(categoryName: string, label: string) {
  const category = tags().categories.find((c) => c.name === categoryName);
  const found = tags().values.find((v) => v.categoryId === category?.id && v.label === label);
  if (!category || !found) throw new Error(`Tag introuvable : ${categoryName}/${label}`);
  return { categoryId: category.id, valueId: found.id };
}

beforeEach(() => {
  useTagStore.setState(createDefaultCatalog());
  useBoardStore.setState({ elements: {}, past: [], future: [] });
});

describe('catalogue par défaut', () => {
  test('contient les trois catégories demandées, dans l’ordre', () => {
    const summary = sortCategories(tags().categories).map((category) => [
      category.name,
      valuesOf(tags().values, category.id).map((v) => v.label),
    ]);
    expect(summary).toEqual([
      ['Sizing', ['XS', 'S', 'M', 'L', 'XL']],
      ['Statut', ['À lancer', 'En conception', 'À rédiger', 'Affiné', 'En dev', 'En prod']],
      ['Thématique', ['Avis réglementaire', 'Simulateur', 'Admin/data']],
    ]);
  });
});

describe('personnalisation', () => {
  test('crée, renomme et supprime une catégorie avec ses valeurs', () => {
    expect(tags().addCategory('  Équipe   produit ')).toBe(true);
    const category = tags().categories.at(-1);
    expect(category?.name).toBe('Équipe produit');
    tags().addValue(category?.id as string, 'Design');
    expect(tags().renameCategory(category?.id as string, 'Équipe')).toBe(true);

    tags().removeCategory(category?.id as string);
    expect(tags().categories).toHaveLength(3);
    expect(tags().values.some((v) => v.label === 'Design')).toBe(false);
  });

  test('refuse un nom vide ou déjà pris, sans tenir compte de la casse', () => {
    expect(tags().addCategory('   ')).toBe(false);
    expect(tags().addCategory('statut')).toBe(false);
    const { categoryId, valueId } = value('Sizing', 'XS');
    expect(tags().addValue(categoryId, 'm')).toBe(false);
    expect(tags().renameValue(valueId, 'M')).toBe(false);
  });

  test('le même libellé est permis dans deux catégories différentes', () => {
    expect(tags().addValue(value('Sizing', 'XS').categoryId, 'Simulateur')).toBe(true);
  });

  test('réordonne les catégories', () => {
    tags().moveCategory(value('Statut', 'À lancer').categoryId, -1);
    expect(sortCategories(tags().categories).map((c) => c.name)).toEqual([
      'Statut',
      'Sizing',
      'Thématique',
    ]);
  });

  test('ignore une couleur invalide', () => {
    const { valueId } = value('Sizing', 'M');
    const before = tags().values.find((v) => v.id === valueId)?.color;
    tags().setValueColor(valueId, 'url(javascript:alert(1))');
    expect(tags().values.find((v) => v.id === valueId)?.color).toBe(before);
  });
});

describe('tags sur un post-it', () => {
  test('une seule valeur par catégorie : la nouvelle remplace l’ancienne', () => {
    const postit = createPostit({ x: 0, y: 0 }, 1);
    board().addElements([postit]);
    const small = value('Sizing', 'S');
    const large = value('Sizing', 'L');
    board().patchElements({ [postit.id]: { tags: { [small.categoryId]: small.valueId } } });
    board().patchElements({ [postit.id]: { tags: { [large.categoryId]: large.valueId } } });
    const updated = board().elements[postit.id];
    expect(updated?.type === 'postit' && updated.tags).toEqual({
      [large.categoryId]: large.valueId,
    });
  });

  test('retirer un tag et annuler ce retrait', () => {
    const postit = createPostit({ x: 0, y: 0 }, 1);
    board().addElements([postit]);
    const { categoryId, valueId } = value('Statut', 'Affiné');
    board().patchElements({ [postit.id]: { tags: { [categoryId]: valueId } } });
    board().patchElements({ [postit.id]: { tags: { [categoryId]: null } } });
    expect(board().elements[postit.id]).toMatchObject({ tags: {} });
    board().undo();
    expect(board().elements[postit.id]).toMatchObject({ tags: { [categoryId]: valueId } });
  });

  test('un texte ne reçoit jamais de tags', () => {
    const text = createText({ x: 0, y: 0 }, 1);
    board().addElements([text]);
    board().patchElements({ [text.id]: { tags: { any: 'value' } } });
    expect(board().elements[text.id]).not.toHaveProperty('tags');
  });

  test('renommer ou recolorer se répercute sans copie sur le post-it', () => {
    const { categoryId, valueId } = value('Sizing', 'M');
    const postitTags = { [categoryId]: valueId };
    tags().renameValue(valueId, 'Moyen');
    tags().setValueColor(valueId, '#123456');
    expect(resolveTags(postitTags, tags().categories, tags().values)).toMatchObject([
      { label: 'Moyen', color: '#123456', categoryName: 'Sizing' },
    ]);
  });

  test('les tags suivent l’ordre des catégories et ignorent les valeurs disparues', () => {
    const size = value('Sizing', 'M');
    const status = value('Statut', 'À lancer');
    const postitTags = { [status.categoryId]: status.valueId, [size.categoryId]: size.valueId };
    const resolved = resolveTags(postitTags, sortCategories(tags().categories), tags().values);
    expect(resolved.map((tag) => tag.label)).toEqual(['M', 'À lancer']);

    tags().removeValue(size.valueId);
    expect(
      resolveTags(postitTags, sortCategories(tags().categories), tags().values).map((t) => t.label),
    ).toEqual(['À lancer']);
  });

  test('purger une valeur la retire des post-it concernés', () => {
    const { categoryId, valueId } = value('Sizing', 'M');
    const postit = createPostit({ x: 0, y: 0 }, 1, { [categoryId]: valueId });
    board().addElements([postit]);
    board().purgeTags(new Set([valueId]));
    expect(board().elements[postit.id]).toMatchObject({ tags: {} });
  });
});

describe('filtres', () => {
  const sized = (...entries: [string, string][]) =>
    createPostit({ x: 0, y: 0 }, 1, Object.fromEntries(entries));

  test('OU dans une catégorie, ET entre catégories', () => {
    const filters = { size: ['M', 'L'], status: ['todo'] };
    expect(matchesFilters(sized(['size', 'M'], ['status', 'todo']), filters)).toBe(true);
    expect(matchesFilters(sized(['size', 'L'], ['status', 'todo']), filters)).toBe(true);
    expect(matchesFilters(sized(['size', 'S'], ['status', 'todo']), filters)).toBe(false);
    expect(matchesFilters(sized(['size', 'M'], ['status', 'done']), filters)).toBe(false);
  });

  test('un post-it sans tag est exclu d’une catégorie filtrée', () => {
    expect(matchesFilters(sized(), { size: ['M'] })).toBe(false);
  });

  test('un filtre vide ne masque rien et les textes restent visibles', () => {
    expect(matchesFilters(sized(), { size: [] })).toBe(true);
    expect(matchesFilters(createText({ x: 0, y: 0 }, 1), { size: ['M'] })).toBe(true);
  });
});

describe('affichage', () => {
  test.each(['#000000', '#ffffff', '#808080', '#767676', '#f2d96b', '#1f5fae', '#b3261e', '#777777'])(
    'le texte d’un badge sur %s atteint le contraste AA',
    (background) => {
      expect(contrastRatio(readableTextColor(background), background)).toBeGreaterThanOrEqual(4.5);
    },
  );

  test('les badges passent à la ligne quand la largeur manque', () => {
    const { positions, totalHeight } = flowBadges([60, 60, 60], 130, { gap: 4, height: 20 });
    expect(positions).toEqual([
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 0, y: 24 },
    ]);
    expect(totalHeight).toBe(44);
  });

  test('aucun badge : aucune hauteur réservée', () => {
    expect(flowBadges([], 100, { gap: 4, height: 20 }).totalHeight).toBe(0);
  });

  test('un badge trop large occupe sa propre ligne sans ligne vide avant', () => {
    expect(flowBadges([300], 100, { gap: 4, height: 20 }).positions[0]).toEqual({ x: 0, y: 0 });
  });

  test('normalise les libellés et valide les couleurs', () => {
    expect(normalizeLabel('  À   faire ')).toBe('À faire');
    expect(normalizeLabel('x'.repeat(100))).toHaveLength(40);
    expect(isHexColor('#AbCdEf')).toBe(true);
    expect(isHexColor('red')).toBe(false);
  });
});
