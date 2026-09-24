import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ConditionsDto,
  LapDto,
  PublishedSessionDto,
  PublishedSessionSummaryDto,
  PublishSessionDto,
  SeriesDto,
  ShareLinkDto,
} from './sessions.dto.js';
import { canView, type Visibility } from './visibility.js';

/** O que as consultas de resumo trazem do banco. */
const summarySelect = {
  id: true,
  ownerId: true,
  owner: { select: { displayName: true } },
  trackId: true,
  trackName: true,
  carId: true,
  carName: true,
  visibility: true,
  bestLapTimeSeconds: true,
  lapCount: true,
  recordedAt: true,
  publishedAt: true,
} satisfies Prisma.PublishedSessionSelect;

type SummaryRow = Prisma.PublishedSessionGetPayload<{ select: typeof summarySelect }>;

const toSummary = (row: SummaryRow): PublishedSessionSummaryDto => ({
  sessionId: row.id,
  ownerId: row.ownerId,
  ownerName: row.owner.displayName,
  trackId: row.trackId,
  trackName: row.trackName,
  carId: row.carId,
  carName: row.carName,
  visibility: row.visibility,
  bestLapTimeSeconds: row.bestLapTimeSeconds,
  lapCount: row.lapCount,
  recordedAt: row.recordedAt?.toISOString() ?? null,
  publishedAt: row.publishedAt.toISOString(),
});

/**
 * Sem permissão responde "não encontrada", nunca "proibido": distinguir os dois
 * entrega ao curioso que a sessão existe (regra 13).
 */
const notFound = (sessionId: string) => new NotFoundException(`Sessão ${sessionId} não encontrada`);

/** Token de compartilhamento precisa ser imprevisível: 32 bytes de aleatório real. */
const newShareToken = (): string => randomBytes(32).toString('base64url');

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recebe o que o desktop publicou.
   *
   * A sessão nasce com a visibilidade padrão da conta (`private`, a menos que o
   * piloto tenha mudado). Publicar de novo substitui voltas e dados, mas não
   * mexe na visibilidade: quem decidiu abrir ou fechar foi o piloto, na web.
   */
  async publish(ownerId: string, dto: PublishSessionDto): Promise<void> {
    const existing = await this.prisma.publishedSession.findUnique({
      where: { id: dto.id },
      select: { ownerId: true },
    });
    // Id de outro piloto: não sobrescreve e não confirma que existe.
    if (existing !== null && existing.ownerId !== ownerId) {
      throw notFound(dto.id);
    }

    const owner = await this.prisma.pilot.findUniqueOrThrow({
      where: { id: ownerId },
      select: { defaultVisibility: true },
    });

    const data = {
      trackId: dto.trackId,
      trackName: dto.trackName,
      trackConfig: dto.trackConfig ?? null,
      trackLengthMeters: dto.trackLengthMeters ?? null,
      carId: dto.carId,
      carName: dto.carName,
      driverName: dto.driverName ?? null,
      sessionType: dto.sessionType ?? null,
      recordedAt:
        dto.recordedAt === null || dto.recordedAt === undefined ? null : new Date(dto.recordedAt),
      tickRate: dto.tickRate,
      sampleCount: dto.sampleCount,
      conditions: { ...dto.conditions } as Prisma.InputJsonObject,
      bestLapTimeSeconds: dto.bestLapTimeSeconds ?? null,
      lapCount: dto.laps.length,
    };

    await this.prisma.$transaction([
      this.prisma.publishedSession.upsert({
        where: { id: dto.id },
        create: { id: dto.id, ownerId, visibility: owner.defaultVisibility, ...data },
        update: data,
      }),
      this.prisma.publishedLap.deleteMany({ where: { sessionId: dto.id } }),
      this.prisma.publishedLap.createMany({
        data: dto.laps.map((lap) => ({
          sessionId: dto.id,
          number: lap.number,
          startSample: lap.startSample,
          endSample: lap.endSample,
          lapTimeSeconds: lap.lapTimeSeconds ?? null,
          isComplete: lap.isComplete,
          flags: lap.flags,
          series: lap.series as unknown as Prisma.InputJsonArray,
        })),
      }),
    ]);
  }

  /** Sessões públicas: o feed e a busca de referência de outro piloto. */
  async listPublic(filter: {
    trackId?: string | undefined;
    carId?: string | undefined;
    limit?: number | undefined;
  }): Promise<PublishedSessionSummaryDto[]> {
    const rows = await this.prisma.publishedSession.findMany({
      where: {
        visibility: 'public',
        ...(filter.trackId === undefined ? {} : { trackId: filter.trackId }),
        ...(filter.carId === undefined ? {} : { carId: filter.carId }),
      },
      orderBy: { publishedAt: 'desc' },
      take: filter.limit ?? 20,
      select: summarySelect,
    });
    return rows.map(toSummary);
  }

  /**
   * As sessões de um piloto que este visitante pode ver.
   *
   * O dono vê todas; os outros, só as públicas — não listada não aparece em
   * perfil, por definição.
   */
  async listByOwner(
    ownerId: string,
    viewerId: string | null,
  ): Promise<PublishedSessionSummaryDto[]> {
    const rows = await this.prisma.publishedSession.findMany({
      where: { ownerId, ...(viewerId === ownerId ? {} : { visibility: 'public' as const }) },
      orderBy: { publishedAt: 'desc' },
      select: summarySelect,
    });
    return rows.map(toSummary);
  }

  /** Abre uma sessão, se este visitante puder vê-la. */
  async view(
    sessionId: string,
    viewerId: string | null,
    shareToken: string | null,
  ): Promise<PublishedSessionDto> {
    const row = await this.prisma.publishedSession.findUnique({
      where: { id: sessionId },
      select: {
        ...summarySelect,
        trackConfig: true,
        trackLengthMeters: true,
        driverName: true,
        sessionType: true,
        tickRate: true,
        conditions: true,
        shareLinks: true,
        laps: {
          orderBy: { number: 'asc' },
          select: {
            number: true,
            startSample: true,
            endSample: true,
            lapTimeSeconds: true,
            isComplete: true,
            flags: true,
          },
        },
      },
    });
    if (row === null || !canView(row, { pilotId: viewerId, shareToken }, new Date())) {
      throw notFound(sessionId);
    }

    return {
      ...toSummary(row),
      trackConfig: row.trackConfig,
      trackLengthMeters: row.trackLengthMeters,
      driverName: row.driverName,
      sessionType: row.sessionType,
      tickRate: row.tickRate,
      conditions: row.conditions as unknown as ConditionsDto,
      laps: row.laps.map((lap) => ({ ...lap, flags: lap.flags as LapDto['flags'] })),
    };
  }

  /** As séries de uma volta, com a mesma regra de acesso da sessão. */
  async lapSeries(
    sessionId: string,
    lapNumber: number,
    viewerId: string | null,
    shareToken: string | null,
  ): Promise<SeriesDto[]> {
    const session = await this.prisma.publishedSession.findUnique({
      where: { id: sessionId },
      select: { ownerId: true, visibility: true, shareLinks: true },
    });
    if (session === null || !canView(session, { pilotId: viewerId, shareToken }, new Date())) {
      throw notFound(sessionId);
    }
    const lap = await this.prisma.publishedLap.findUnique({
      where: { sessionId_number: { sessionId, number: lapNumber } },
      select: { series: true },
    });
    if (lap === null) {
      throw new NotFoundException(`Volta ${lapNumber} não existe na sessão ${sessionId}`);
    }
    return lap.series as unknown as SeriesDto[];
  }

  async setVisibility(ownerId: string, sessionId: string, visibility: Visibility): Promise<void> {
    await this.requireOwned(ownerId, sessionId);
    await this.prisma.publishedSession.update({ where: { id: sessionId }, data: { visibility } });
  }

  /**
   * Cria um link de compartilhamento.
   *
   * Compartilhar move a sessão privada para `unlisted`: ela deixa de ser
   * privada, mas não entra no perfil nem em busca — só quem tem o link entra.
   * Voltar para `private` fecha até para quem já tinha o link (`canView`).
   */
  async share(ownerId: string, sessionId: string): Promise<ShareLinkDto> {
    const session = await this.requireOwned(ownerId, sessionId);
    const [link] = await this.prisma.$transaction([
      this.prisma.shareLink.create({ data: { token: newShareToken(), sessionId } }),
      ...(session.visibility === 'private'
        ? [
            this.prisma.publishedSession.update({
              where: { id: sessionId },
              data: { visibility: 'unlisted' },
            }),
          ]
        : []),
    ]);
    return { token: link.token, createdAt: link.createdAt.toISOString(), revokedAt: null };
  }

  /** Derruba um link já distribuído. Quem tinha o endereço para de entrar. */
  async revokeShareLink(ownerId: string, sessionId: string, token: string): Promise<void> {
    await this.requireOwned(ownerId, sessionId);
    await this.prisma.shareLink.updateMany({
      where: { token, sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Apaga a sessão na nuvem.
   *
   * É a única obrigação de sincronia com o desktop: o que o piloto apagou lá não
   * pode continuar visível aqui. É privacidade, não sync (regra 14).
   */
  async remove(ownerId: string, sessionId: string): Promise<void> {
    await this.requireOwned(ownerId, sessionId);
    await this.prisma.publishedSession.delete({ where: { id: sessionId } });
  }

  private async requireOwned(ownerId: string, sessionId: string) {
    const session = await this.prisma.publishedSession.findUnique({
      where: { id: sessionId },
      select: { ownerId: true, visibility: true },
    });
    if (session === null || session.ownerId !== ownerId) {
      throw notFound(sessionId);
    }
    return session;
  }
}
