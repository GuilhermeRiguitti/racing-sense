import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPilot, PilotGuard, Viewer } from '../auth/pilot-session.js';
import {
  ListPublicSessionsQuery,
  PublishedSessionDto,
  PublishedSessionSummaryDto,
  PublishSessionDto,
  SeriesDto,
  SetVisibilityDto,
  ShareLinkDto,
  ShareTokenQuery,
} from './sessions.dto.js';
import { SessionsService } from './sessions.service.js';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  @HttpCode(204)
  @UseGuards(PilotGuard)
  @ApiCookieAuth()
  @ApiNoContentResponse({ description: 'Sessão guardada. Publicar de novo substitui.' })
  async publish(@CurrentPilot() pilotId: string, @Body() body: PublishSessionDto): Promise<void> {
    await this.sessions.publish(pilotId, body);
  }

  @Get('public')
  @ApiOkResponse({ type: [PublishedSessionSummaryDto] })
  listPublic(@Query() query: ListPublicSessionsQuery): Promise<PublishedSessionSummaryDto[]> {
    return this.sessions.listPublic(query);
  }

  @Get(':sessionId')
  @ApiOkResponse({ type: PublishedSessionDto })
  @ApiNotFoundResponse({ description: 'Não existe, ou este visitante não pode ver.' })
  view(
    @Param('sessionId') sessionId: string,
    @Query() { shareToken }: ShareTokenQuery,
    @Viewer() viewerId: string | null,
  ): Promise<PublishedSessionDto> {
    return this.sessions.view(sessionId, viewerId, shareToken ?? null);
  }

  @Get(':sessionId/laps/:lapNumber/series')
  @ApiOkResponse({ type: [SeriesDto] })
  @ApiNotFoundResponse({ description: 'Não existe, ou este visitante não pode ver.' })
  lapSeries(
    @Param('sessionId') sessionId: string,
    @Param('lapNumber', ParseIntPipe) lapNumber: number,
    @Query() { shareToken }: ShareTokenQuery,
    @Viewer() viewerId: string | null,
  ): Promise<SeriesDto[]> {
    return this.sessions.lapSeries(sessionId, lapNumber, viewerId, shareToken ?? null);
  }

  @Patch(':sessionId/visibility')
  @UseGuards(PilotGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: SetVisibilityDto })
  async setVisibility(
    @CurrentPilot() pilotId: string,
    @Param('sessionId') sessionId: string,
    @Body() { visibility }: SetVisibilityDto,
  ): Promise<SetVisibilityDto> {
    await this.sessions.setVisibility(pilotId, sessionId, visibility);
    return { visibility };
  }

  @Post(':sessionId/share-links')
  @UseGuards(PilotGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: ShareLinkDto })
  share(
    @CurrentPilot() pilotId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<ShareLinkDto> {
    return this.sessions.share(pilotId, sessionId);
  }

  @Delete(':sessionId/share-links/:token')
  @HttpCode(204)
  @UseGuards(PilotGuard)
  @ApiCookieAuth()
  @ApiNoContentResponse()
  async revokeShareLink(
    @CurrentPilot() pilotId: string,
    @Param('sessionId') sessionId: string,
    @Param('token') token: string,
  ): Promise<void> {
    await this.sessions.revokeShareLink(pilotId, sessionId, token);
  }

  @Delete(':sessionId')
  @HttpCode(204)
  @UseGuards(PilotGuard)
  @ApiCookieAuth()
  @ApiNoContentResponse({ description: 'Apagada. O que o piloto apagou no desktop some aqui.' })
  async remove(
    @CurrentPilot() pilotId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    await this.sessions.remove(pilotId, sessionId);
  }
}

@ApiTags('pilots')
@Controller('pilots')
export class PilotsController {
  constructor(private readonly sessions: SessionsService) {}

  /** O perfil: tudo para o dono, só as públicas para os outros. */
  @Get(':pilotId/sessions')
  @ApiOkResponse({ type: [PublishedSessionSummaryDto] })
  listByOwner(
    @Param('pilotId') pilotId: string,
    @Viewer() viewerId: string | null,
  ): Promise<PublishedSessionSummaryDto[]> {
    return this.sessions.listByOwner(pilotId, viewerId);
  }
}
