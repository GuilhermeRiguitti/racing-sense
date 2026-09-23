import type { Pilot } from '@telemetry/domain';
import { z } from 'zod';

/**
 * Contrato de autenticação da cloud-api.
 *
 * Um login só serve a web e o app do Windows. O que trafega aqui é o par de
 * credenciais e o perfil; o cookie selado que a sessão usa é detalhe do
 * servidor e do adapter — ver `docs/adr/0014-autenticacao-iron-session.md`.
 */
export const visibilityDto = z.enum(['private', 'unlisted', 'public']);

export const signInRequest = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
});
export type SignInRequest = z.infer<typeof signInRequest>;

export const pilotDto = z.object({
  id: z.string(),
  displayName: z.string(),
  defaultVisibility: visibilityDto,
});
export type PilotDto = z.infer<typeof pilotDto>;

export function toPilotDto(pilot: Pilot): PilotDto {
  return {
    id: pilot.id,
    displayName: pilot.displayName,
    defaultVisibility: pilot.defaultVisibility,
  };
}
