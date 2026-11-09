import { expect, test } from '@playwright/test';
import { admin, anonymous, apply, createBoardFor, createUser, ok, postitOp } from './backend';

/** Ces tests parlent directement à l'API, comme le ferait un navigateur malveillant. */

async function setup() {
  const owner = await createUser();
  const stranger = await createUser();
  const boardId = await createBoardFor(owner);
  const elementId = crypto.randomUUID();
  await ok(owner, boardId, [postitOp(elementId, 'Secret')]);
  return { owner, stranger, boardId, elementId };
}

const category = (id: string, name = 'Sizing') => ({
  id: crypto.randomUUID(),
  kind: 'category.upsert',
  category: { id, name, sort_order: 0 },
});

const value = (id: string, categoryId: string, label: string, color = '#ffffff') => ({
  id: crypto.randomUUID(),
  kind: 'value.upsert',
  value: { id, category_id: categoryId, label, color, sort_order: 0 },
});

test('un inconnu ne peut ni lire ni modifier le tableau d’un autre', async () => {
  const { stranger, boardId, elementId } = await setup();

  expect((await stranger.client.from('boards').select('*').eq('id', boardId)).data).toEqual([]);
  expect((await stranger.client.from('elements').select('*').eq('board_id', boardId)).data).toEqual([]);

  const write = await apply(stranger, boardId, [postitOp()]);
  expect(write.error?.code).toBe('42501');

  const direct = await stranger.client.from('elements').insert({
    id: crypto.randomUUID(),
    board_id: boardId,
    type: 'postit',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    z_index: 0,
    content: {},
    style: {},
  });
  expect(direct.error).not.toBeNull();

  await stranger.client.from('elements').update({ x: 999 }).eq('id', elementId);
  await stranger.client.from('elements').delete().eq('id', elementId);
  const { data } = await admin.from('elements').select('x').eq('id', elementId).single();
  expect(data?.x).toBe(0);
});

test('sans session, aucun accès', async () => {
  const { boardId } = await setup();
  const client = anonymous();
  const read = await client.from('boards').select('*').eq('id', boardId);
  expect(read.error ?? read.data).not.toEqual([{ id: boardId }]);
  expect(read.data ?? []).toEqual([]);
  const write = await client.rpc('apply_board_ops', { p_board: boardId, p_ops: [postitOp()] });
  expect(write.error).not.toBeNull();
});

test('personne ne peut s’attribuer un droit ou voler un tableau', async () => {
  const { owner, stranger, boardId } = await setup();

  const grant = await stranger.client
    .from('board_permissions')
    .insert({ board_id: boardId, user_id: stranger.id, role: 'editor' });
  expect(grant.error).not.toBeNull();

  const steal = await owner.client.from('boards').update({ owner_id: stranger.id }).eq('id', boardId);
  expect(steal.error).not.toBeNull();

  const fake = await stranger.client.from('boards').insert({ name: 'Faux', owner_id: owner.id });
  expect(fake.error).not.toBeNull();
});

test('un participant en lecture seule peut lire mais pas écrire', async () => {
  const { stranger: viewer, boardId, elementId } = await setup();
  await admin.from('board_permissions').insert({ board_id: boardId, user_id: viewer.id, role: 'viewer' });

  const read = await viewer.client.from('elements').select('id').eq('board_id', boardId);
  expect(read.data).toEqual([{ id: elementId }]);

  expect((await apply(viewer, boardId, [postitOp()])).error?.code).toBe('42501');
  await viewer.client.from('elements').delete().eq('id', elementId);
  const { count } = await admin
    .from('elements')
    .select('*', { count: 'exact', head: true })
    .eq('id', elementId);
  expect(count).toBe(1);
});

test('révision et auteur ne peuvent pas être falsifiés', async () => {
  const { owner, boardId, elementId } = await setup();
  await owner.client
    .from('elements')
    .update({ revision: 999, created_by: null, board_id: crypto.randomUUID() })
    .eq('id', elementId);
  const { data } = await admin.from('elements').select('*').eq('id', elementId).single();
  expect(data?.revision).toBe(2);
  expect(data?.created_by).toBe(owner.id);
  expect(data?.board_id).toBe(boardId);
});

test('un tag doit appartenir au même tableau, sans quoi il est refusé', async () => {
  const { owner, boardId, elementId } = await setup();
  const otherBoard = await createBoardFor(owner, 'Autre');
  const foreignCategory = crypto.randomUUID();
  const foreignValue = crypto.randomUUID();
  await ok(owner, otherBoard, [
    category(foreignCategory),
    value(foreignValue, foreignCategory, 'M'),
  ]);

  const results = await ok(owner, boardId, [
    {
      id: crypto.randomUUID(),
      kind: 'element.patch',
      element_id: elementId,
      tags: { [foreignCategory]: foreignValue },
    },
  ]);
  expect(results[0]?.status).toBe('rejected');
  const { count } = await admin
    .from('element_tags')
    .select('*', { count: 'exact', head: true })
    .eq('element_id', elementId);
  expect(count).toBe(0);
});

test('une valeur par catégorie et par post-it', async () => {
  const { owner, boardId, elementId } = await setup();
  const size = crypto.randomUUID();
  const small = crypto.randomUUID();
  const large = crypto.randomUUID();
  await ok(owner, boardId, [category(size), value(small, size, 'S'), value(large, size, 'L')]);

  const row = { element_id: elementId, board_id: boardId, category_id: size };
  expect((await owner.client.from('element_tags').insert({ ...row, tag_value_id: small })).error).toBeNull();
  const second = await owner.client.from('element_tags').insert({ ...row, tag_value_id: large });
  expect(second.error?.code).toBe('23505');
});

test('les valeurs invalides sont refusées par la base', async () => {
  const { owner, boardId } = await setup();
  const size = crypto.randomUUID();
  const results = await ok(owner, boardId, [
    postitOp(undefined, 'x'.repeat(5001)),
    category(size),
    value(crypto.randomUUID(), size, 'Rouge', 'url(javascript:alert(1))'),
    { id: crypto.randomUUID(), kind: 'inconnue' },
  ]);
  expect(results.map((result) => result.status)).toEqual(['rejected', 'ok', 'rejected', 'rejected']);
});

test('une opération refusée n’annule pas les autres du lot', async () => {
  const { owner, boardId } = await setup();
  const good = crypto.randomUUID();
  const results = await ok(owner, boardId, [postitOp(undefined, 'x'.repeat(5001)), postitOp(good)]);
  expect(results.map((result) => result.status)).toEqual(['rejected', 'ok']);
  const { count } = await admin
    .from('elements')
    .select('*', { count: 'exact', head: true })
    .eq('id', good);
  expect(count).toBe(1);
});

test('un lot trop grand est refusé', async () => {
  const { owner, boardId } = await setup();
  const ops = Array.from({ length: 201 }, () => postitOp());
  expect((await apply(owner, boardId, ops)).error).not.toBeNull();
});

test('écriture conditionnelle : deux textes concurrents ne s’écrasent pas', async () => {
  const { owner, boardId, elementId } = await setup();
  const edit = (body: string) => ({
    id: crypto.randomUUID(),
    kind: 'element.patch',
    element_id: elementId,
    content: { body },
    base_content_revision: 1,
  });

  const [first] = await ok(owner, boardId, [edit('Première')]);
  expect(first?.status).toBe('ok');
  const [second] = await ok(owner, boardId, [edit('Seconde')]);
  expect(second).toMatchObject({ status: 'conflict', server_content: { body: 'Première' } });

  const { data } = await admin.from('elements').select('content').eq('id', elementId).single();
  expect(data?.content).toEqual({ body: 'Première' });
});

test('un conflit de texte n’empêche pas un déplacement concurrent', async () => {
  const { owner, boardId, elementId } = await setup();
  const [result] = await ok(owner, boardId, [
    {
      id: crypto.randomUUID(),
      kind: 'element.patch',
      element_id: elementId,
      fields: { x: 300 },
      content: { body: 'Ancienne base' },
      base_content_revision: 0,
    },
  ]);
  expect(result?.status).toBe('conflict');
  const { data } = await admin.from('elements').select('x, content').eq('id', elementId).single();
  expect(data).toEqual({ x: 300, content: { body: 'Secret' } });
});

test('renvoyer une opération après une réponse perdue n’a pas d’effet de bord', async () => {
  const { owner, boardId, elementId } = await setup();
  const edit = {
    id: crypto.randomUUID(),
    kind: 'element.patch',
    element_id: elementId,
    content: { body: 'Une fois' },
    base_content_revision: 1,
  };
  await ok(owner, boardId, [edit]);
  const [retry] = await ok(owner, boardId, [edit]);
  expect(retry?.status).toBe('ok');

  const create = postitOp();
  await ok(owner, boardId, [create]);
  const [again] = await ok(owner, boardId, [create]);
  expect(again?.status).toBe('ok');
});

test('deux déplacements simultanés d’éléments distincts sont tous conservés', async () => {
  const { owner, boardId, elementId } = await setup();
  const other = crypto.randomUUID();
  await ok(owner, boardId, [postitOp(other)]);
  const move = (id: string, x: number) => ({
    id: crypto.randomUUID(),
    kind: 'element.patch',
    element_id: id,
    fields: { x },
  });
  await Promise.all([ok(owner, boardId, [move(elementId, 111)]), ok(owner, boardId, [move(other, 222)])]);

  const { data } = await admin.from('elements').select('id, x').in('id', [elementId, other]);
  expect(data?.find((row) => row.id === elementId)?.x).toBe(111);
  expect(data?.find((row) => row.id === other)?.x).toBe(222);
});

test('on ne peut pas modifier la catégorie d’un autre tableau via un identifiant connu', async () => {
  const { owner, boardId } = await setup();
  const victim = await createUser();
  const victimBoard = await createBoardFor(victim, 'Victime');
  const victimCategory = crypto.randomUUID();
  await ok(victim, victimBoard, [category(victimCategory, 'Original')]);

  await ok(owner, boardId, [category(victimCategory, 'Piraté')]);
  const { data } = await admin
    .from('tag_categories')
    .select('name, board_id')
    .eq('id', victimCategory)
    .single();
  expect(data).toEqual({ name: 'Original', board_id: victimBoard });
});
