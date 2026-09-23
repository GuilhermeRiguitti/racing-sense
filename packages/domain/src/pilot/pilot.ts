import type { Brand } from '../shared/id.js';
import type { Visibility } from '../sharing/visibility.js';

export type PilotId = Brand<string, 'PilotId'>;
export const toPilotId = (value: string): PilotId => value as PilotId;

/**
 * A conta do piloto, do ponto de vista do domínio.
 *
 * O mesmo login serve para o app no Windows e para a web — ver
 * `docs/adr/0014-autenticacao-iron-session.md`. Aqui não existe senha nem token:
 * credencial é assunto do adapter de autenticação.
 */
export interface Pilot {
  readonly id: PilotId;
  readonly displayName: string;
  /**
   * Visibilidade aplicada às sessões novas.
   *
   * Nasce `private`: como o desktop publica tudo automaticamente, o default
   * fechado é o único seguro. O piloto abre o que quiser.
   */
  readonly defaultVisibility: Visibility;
}
