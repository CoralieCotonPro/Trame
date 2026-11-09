import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.E2E_SUPABASE_URL as string;
const anonKey = process.env.E2E_ANON_KEY as string;
const serviceKey = process.env.E2E_SERVICE_KEY as string;

const options = { auth: { persistSession: false, autoRefreshToken: false } };

/** Client administrateur, réservé aux tests contre la base locale. */
export const admin = createClient(url, serviceKey, options);
export const anonymous = () => createClient(url, anonKey, options);

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

export async function createUser(): Promise<TestUser> {
  const email = `test-${crypto.randomUUID()}@exemple.test`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const client = anonymous();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id: data.user.id, email, client };
}

export async function magicLink(email: string, redirectTo: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  });
  if (error) throw error;
  return data.properties.action_link;
}

export async function createBoardFor(user: TestUser, name = 'Test'): Promise<string> {
  const { data, error } = await user.client
    .from('boards')
    .insert({ name, owner_id: user.id })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export function postitOp(id = crypto.randomUUID(), body = 'Bonjour') {
  return {
    id: crypto.randomUUID(),
    kind: 'element.create',
    element: {
      id,
      type: 'postit',
      x: 0,
      y: 0,
      width: 200,
      height: 160,
      z_index: 1,
      content: { body },
      style: { color: 'yellow' },
      tags: {},
    },
  };
}

export const apply = (user: TestUser, boardId: string, ops: unknown[]) =>
  user.client.rpc('apply_board_ops', { p_board: boardId, p_ops: ops });

export async function ok(user: TestUser, boardId: string, ops: unknown[]) {
  const { data, error } = await apply(user, boardId, ops);
  if (error) throw error;
  return (data as { results: { status: string; [key: string]: unknown }[] }).results;
}
