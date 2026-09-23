import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PilotId } from '@telemetry/domain';
import { getIronSession, type SessionOptions } from 'iron-session';

/**
 * A sessão do piloto, num cookie selado.
 *
 * Um login só serve a web e o app do Windows: os dois falam com esta API, e o
 * cookie é emitido aqui. No navegador o cookie é gerido pelo próprio navegador;
 * no Electron, pela sessão do Chromium — nenhum dos dois manipula o conteúdo,
 * porque ele é criptografado e assinado com um segredo que só o servidor tem.
 *
 * Ver `docs/adr/0014-autenticacao-iron-session.md`.
 */
export interface PilotSessionData {
  pilotId?: PilotId;
}

export function sessionOptions(env: Record<string, string | undefined>): SessionOptions {
  const password = env.SESSION_SECRET;
  if (password === undefined || password.length < 32) {
    // Falhar ao subir é melhor que subir com sessão forjável.
    throw new Error('SESSION_SECRET ausente ou com menos de 32 caracteres');
  }

  return {
    password,
    cookieName: 'telemetry_session',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      // Em produção o cookie só viaja em HTTPS; em desenvolvimento local, não.
      secure: env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

export async function readPilotSession(
  request: IncomingMessage,
  response: ServerResponse,
  options: SessionOptions,
) {
  return getIronSession<PilotSessionData>(request, response, options);
}
