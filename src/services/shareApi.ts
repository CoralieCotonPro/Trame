import { supabase } from '../lib/supabase';

export type ShareRole = 'editor' | 'viewer';

export interface ShareLink {
  id: string;
  role: ShareRole;
  expires_at: string | null;
}

export interface Member {
  user_id: string;
  role: 'owner' | ShareRole;
  display_name: string | null;
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function listActiveLinks(boardId: string): Promise<ShareLink[]> {
  return unwrap(
    await supabase
      .from('board_share_links')
      .select('id, role, expires_at')
      .eq('board_id', boardId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ) as ShareLink[];
}

export async function listMembers(boardId: string): Promise<Member[]> {
  return unwrap(
    await supabase
      .from('board_permissions')
      .select('user_id, role, display_name')
      .eq('board_id', boardId)
      .order('created_at'),
  ) as Member[];
}

/** Le jeton n'est disponible qu'ici : le serveur n'en conserve que l'empreinte. */
export async function createShareLink(boardId: string, role: ShareRole, days: number) {
  const { token } = unwrap(
    await supabase.rpc('create_share_link', { p_board: boardId, p_role: role, p_days: days }),
  ) as { token: string };
  // Dans le fragment d'URL (#), le jeton n'est envoyé à aucun serveur.
  return `${window.location.origin}/rejoindre#${token}`;
}

export async function revokeShareLink(linkId: string) {
  unwrap(await supabase.rpc('revoke_share_link', { p_link: linkId }));
}

export async function setMemberRole(boardId: string, userId: string, role: ShareRole) {
  unwrap(await supabase.rpc('set_member_role', { p_board: boardId, p_user: userId, p_role: role }));
}

export async function removeMember(boardId: string, userId: string) {
  unwrap(await supabase.rpc('remove_member', { p_board: boardId, p_user: userId }));
}

export async function redeemShareLink(token: string, name: string): Promise<string> {
  const { board_id: boardId } = unwrap(
    await supabase.rpc('redeem_share_link', { p_token: token, p_display_name: name }),
  ) as { board_id: string };
  return boardId;
}
