import type { Pilot } from '@telemetry/domain';

/**
 * Identidade do piloto.
 *
 * Um login só serve o app do Windows e a web: quem emite e valida a sessão é a
 * cloud-api, com cookie selado (iron-session) — ver
 * `docs/adr/0014-autenticacao-iron-session.md`.
 *
 * Nenhum tipo de cookie, token ou header aparece nesta porta. Trocar iron-session
 * por outra coisa é trocar o adapter.
 */
export interface IdentityPort {
  signIn(credentials: { email: string; password: string }): Promise<Pilot>;
  signOut(): Promise<void>;
  /** Quem está logado, ou `null`. Não dispara login. */
  currentPilot(): Promise<Pilot | null>;
}

/** Preferências de conta que moram no servidor, não na máquina. */
export interface PilotPreferencesPort {
  setDefaultVisibility(visibility: Pilot['defaultVisibility']): Promise<void>;
}
