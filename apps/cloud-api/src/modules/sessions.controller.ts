import { Controller, Get, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { setVisibilityRequest, toPublishedSessionSummaryDto } from '@telemetry/contracts';
import { NotImplementedError, toPilotId, toSessionId, toShareToken } from '@telemetry/domain';
import type { Request, Response } from 'express';
import type { CloudUseCases } from '../composition-root.js';
import { parseBody } from '../http/validation.pipe.js';

export const CLOUD_USE_CASES = Symbol('CLOUD_USE_CASES');

/**
 * Controller: valida, chama **um** caso de uso, devolve DTO.
 *
 * A regra que mantém o Nest honesto é "módulo liga, não pensa". Nenhum `if`
 * sobre regra de corrida ou de acesso aqui — quem decide quem pode ver é
 * `canView`, no domínio.
 */
@Controller('sessions')
export class SessionsController {
  constructor(@Inject(CLOUD_USE_CASES) private readonly useCases: CloudUseCases) {}

  @Get('public')
  async listPublic(@Query('trackId') trackId?: string, @Query('carId') carId?: string) {
    const sessions = await this.useCases.listPublicSessions({
      ...(trackId === undefined ? {} : { trackId }),
      ...(carId === undefined ? {} : { carId }),
    });
    return sessions.map(toPublishedSessionSummaryDto);
  }

  @Get(':sessionId')
  async view(
    @Param('sessionId') sessionId: string,
    @Query('shareToken') shareToken: string | undefined,
    @Req() request: Request,
  ) {
    const viewerId = pilotIdOf(request);
    const published = await this.useCases.viewPublishedSession({
      sessionId: toSessionId(sessionId),
      viewerId,
      shareToken: shareToken === undefined ? null : toShareToken(shareToken),
    });
    return toPublishedSessionSummaryDto({
      sessionId: published.session.id,
      ownerId: published.ownerId,
      trackName: published.session.track.name,
      carName: published.session.car.name,
      visibility: published.visibility,
      bestLapTimeSeconds: null,
      lapCount: published.laps.length,
      recordedAt: published.session.recordedAt,
    });
  }

  @Patch(':sessionId/visibility')
  async setVisibility(@Param('sessionId') sessionId: string, @Req() request: Request) {
    const { visibility } = parseBody(setVisibilityRequest, request.body);
    await this.useCases.setSessionVisibility({
      sessionId: toSessionId(sessionId),
      actorId: requirePilot(request),
      visibility,
    });
    return { visibility };
  }

  @Post(':sessionId/share-links')
  async share(@Param('sessionId') sessionId: string, @Req() request: Request) {
    const token = await this.useCases.shareSession({
      sessionId: toSessionId(sessionId),
      actorId: requirePilot(request),
    });
    return { token };
  }

  @Post()
  publish(@Res() _response: Response) {
    // TODO(cloud): receber a sessão publicada pelo desktop e gravar no Postgres.
    // Depende do adapter-postgres sair do esqueleto — ver docs/pendencias.md.
    throw new NotImplementedError('Recebimento de sessão publicada ainda não implementado');
  }
}

/** O piloto logado, lido do cookie selado pelo middleware de sessão. */
function pilotIdOf(request: Request) {
  const pilotId = (request as Request & { pilotId?: string }).pilotId;
  return pilotId === undefined ? null : toPilotId(pilotId);
}

function requirePilot(request: Request) {
  const pilotId = pilotIdOf(request);
  if (pilotId === null) {
    // Sem sessão não há dono; o caso de uso já recusaria, mas falhar aqui evita
    // uma consulta inútil ao banco.
    throw new NotImplementedError('Autenticação obrigatória ainda não conectada ao middleware');
  }
  return pilotId;
}
