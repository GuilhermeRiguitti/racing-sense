/**
 * O que atravessa o IPC entre o processo principal e a tela.
 *
 * Só tipos: main, preload e renderer compilam juntos, então o compilador já
 * confere os dois lados. O DTO existe para proteger a tela do modelo interno —
 * mudar um campo do domínio não quebra a interface sem alguém mexer no mapper
 * (`src/main/ipc/dto.ts`) e perceber.
 */

export type ChannelTypeDto = 'number' | 'integer' | 'boolean' | 'text' | 'bitfield';

export interface ChannelDto {
  readonly name: string;
  readonly description: string;
  readonly unit: string;
  readonly type: ChannelTypeDto;
  readonly valuesPerSample: number;
}

export interface ConditionsDto {
  readonly airTempCelsius: number | null;
  readonly trackTempCelsius: number | null;
  readonly relativeHumidityPct: number | null;
  readonly windSpeedMs: number | null;
  readonly skies: string | null;
  readonly timeOfDaySeconds: number | null;
  readonly trackUsage: string | null;
}

/** Um nó da ficha de acerto. Ver `SetupNode` no domínio. */
export interface SetupNodeDto {
  readonly key: string;
  readonly value: string | null;
  readonly children: readonly SetupNodeDto[];
}

export interface CarLimitsDto {
  readonly redlineRpm: number | null;
  readonly shiftRpm: number | null;
  readonly fuelCapacityLiters: number | null;
}

export interface SessionDto {
  readonly id: string;
  /** Id estável da pista com layout: é o que decide se uma referência serve. */
  readonly trackId: string;
  readonly trackName: string;
  readonly trackConfig: string | null;
  /**
   * Comprimento do traçado, lido do arquivo. É o que deixa a tela mostrar
   * distância em metros em vez de fração da volta — a unidade em que o piloto
   * pensa ("freei 30 m antes"). `null` quando o arquivo não informa.
   */
  readonly trackLengthMeters: number | null;
  readonly carId: string;
  readonly carName: string;
  readonly driverName: string | null;
  readonly sessionType: string | null;
  /** ISO 8601. */
  readonly recordedAt: string | null;
  readonly tickRate: number;
  readonly sampleCount: number;
  readonly durationSeconds: number;
  /** Temperatura, horário e céu viajam com a sessão: sem isso a comparação mente. */
  readonly conditions: ConditionsDto;
  readonly channels: readonly ChannelDto[];
  /** A ficha de acerto como o sim declarou; `null` quando o arquivo não traz. */
  readonly setup: readonly SetupNodeDto[] | null;
  readonly carLimits: CarLimitsDto;
}

export interface LapStretchDto {
  readonly startPct: number;
  readonly endPct: number;
}

export type LapFlagDto = 'incomplete' | 'pit' | 'off-track';

export interface LapDto {
  readonly number: number;
  readonly startSample: number;
  readonly endSample: number;
  readonly lapTimeSeconds: number | null;
  readonly isComplete: boolean;
  /** Por que a volta não serve de referência. Vazio = serve. */
  readonly flags: readonly LapFlagDto[];
  /**
   * Onde a volta saiu da pista. `null` quando não se sabe (volta gravada antes
   * de o app registrar os trechos) — o que é diferente de lista vazia.
   */
  readonly offTrackStretches: readonly LapStretchDto[] | null;
}

/** Um canal resumido numa volta. Ver `ChannelSummary` no domínio. */
export interface ChannelSummaryDto {
  readonly channel: string;
  readonly unit: string;
  readonly type: ChannelTypeDto;
  readonly first: number;
  readonly last: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number | null;
}

export interface StintLapDto {
  readonly lap: LapDto;
  readonly channels: readonly ChannelSummaryDto[];
}

export interface SeriesDto {
  readonly channel: string;
  readonly unit: string;
  /**
   * Viaja até a tela: quem desenha precisa saber se pode ligar dois pontos com
   * uma reta (contínuo) ou se tem que desenhar degrau (marcha, booleano).
   */
  readonly type: ChannelTypeDto;
  readonly axis: 'time' | 'lapDistPct';
  readonly x: readonly number[];
  readonly y: readonly number[];
}

export interface ComparisonDto {
  readonly referenceLapId: string;
  readonly lapNumber: number;
  readonly totalDeltaSeconds: number;
  readonly deltaSeries: SeriesDto;
}

export interface ReferenceLapDto {
  readonly id: string;
  readonly label: string;
  readonly trackId: string;
  readonly trackName: string;
  readonly carId: string;
  readonly carName: string;
  readonly lapNumber: number;
  readonly lapTimeSeconds: number | null;
}

export interface AnalysisFindingDto {
  readonly title: string;
  readonly detail: string;
  readonly startDistPct: number;
  readonly endDistPct: number;
  readonly deltaSeconds: number | null;
  readonly evidenceChannels: readonly string[];
  readonly confidence: 'low' | 'medium' | 'high';
}

export interface AnalysisReportDto {
  readonly sessionId: string;
  readonly lapNumber: number;
  readonly referenceLapId: string;
  readonly summary: string;
  readonly findings: readonly AnalysisFindingDto[];
  readonly model: string;
  /** ISO 8601. */
  readonly generatedAt: string;
}

/** O piloto logado na api. `null` quando não há login — o app funciona igual. */
export interface PilotDto {
  readonly id: string;
  readonly displayName: string;
  readonly defaultVisibility: 'private' | 'unlisted' | 'public';
}
