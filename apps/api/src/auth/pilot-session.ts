import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  type NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { IronSession, SessionOptions } from 'iron-session';
import { type PilotSessionData, readPilotSession, sessionOptions } from './session-cookie.js';

/** A requisição depois do middleware: com o cookie selado já aberto. */
export interface RequestWithPilot extends Request {
  pilotSession: IronSession<PilotSessionData>;
}

/**
 * Abre o cookie selado em toda requisição.
 *
 * O resto da api não lê cookie: pede o piloto a `@Viewer()` ou `@CurrentPilot()`.
 */
@Injectable()
export class PilotSessionMiddleware implements NestMiddleware {
  private readonly options: SessionOptions = sessionOptions(process.env);

  async use(request: Request, response: Response, next: NextFunction): Promise<void> {
    (request as RequestWithPilot).pilotSession = await readPilotSession(
      request,
      response,
      this.options,
    );
    next();
  }
}

const pilotIdOf = (context: ExecutionContext): string | null =>
  context.switchToHttp().getRequest<RequestWithPilot>().pilotSession?.pilotId ?? null;

/** Quem está vendo: o id do piloto logado, ou `null` para visitante. */
export const Viewer = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  pilotIdOf(context),
);

/** O piloto logado. Use só em rota protegida por `PilotGuard`. */
export const CurrentPilot = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const pilotId = pilotIdOf(context);
    if (pilotId === null) {
      throw new UnauthorizedException();
    }
    return pilotId;
  },
);

/** Rota que só existe para quem está logado. Sem sessão, 401. */
@Injectable()
export class PilotGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (pilotIdOf(context) === null) {
      throw new UnauthorizedException('Login necessário');
    }
    return true;
  }
}
