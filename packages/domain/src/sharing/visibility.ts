import type { PilotId } from '../pilot/pilot.js';
import type { Brand } from '../shared/id.js';

/**
 * Quem pode ver uma sessão.
 *
 * - `private` — só o dono. É o default de conta nova.
 * - `unlisted` — quem tiver o link. Não aparece em perfil nem em busca.
 * - `public` — aparece no perfil do piloto e no que for público na web.
 */
export type Visibility = 'private' | 'unlisted' | 'public';

export type ShareToken = Brand<string, 'ShareToken'>;
export const toShareToken = (value: string): ShareToken => value as ShareToken;

/** Link de compartilhamento de uma sessão. Revogável. */
export interface ShareLink {
  readonly token: ShareToken;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

export function isActive(link: ShareLink, now: Date): boolean {
  return link.revokedAt === null || link.revokedAt > now;
}

/** O que o domínio precisa saber de uma sessão para decidir acesso. */
export interface ShareableSession {
  readonly ownerId: PilotId;
  readonly visibility: Visibility;
  readonly shareLinks: readonly ShareLink[];
}

/** Quem está pedindo para ver, e com qual link na mão. */
export interface Viewer {
  readonly pilotId: PilotId | null;
  readonly shareToken: ShareToken | null;
}

/**
 * Decide se este visitante pode ver esta sessão.
 *
 * Regra em um lugar só, testada, usada igual pelo servidor e pelo desktop.
 * Espalhar isso por controller é como nasce vazamento de dado privado.
 */
export function canView(session: ShareableSession, viewer: Viewer, now: Date): boolean {
  if (viewer.pilotId !== null && viewer.pilotId === session.ownerId) {
    return true;
  }
  if (session.visibility === 'public') {
    return true;
  }
  // Link só abre porta em sessão `unlisted`. Sessão que o piloto fechou de volta
  // para `private` deixa de ser acessível, mesmo por quem já tinha o link —
  // senão "tornar privado" não significaria nada.
  if (session.visibility !== 'unlisted' || viewer.shareToken === null) {
    return false;
  }
  return session.shareLinks.some((link) => link.token === viewer.shareToken && isActive(link, now));
}
