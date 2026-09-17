/**
 * Contratos compartilhados entre `api`, `web` e `agent`.
 *
 * Regra do projeto: nenhum tipo de domínio é redeclarado em outro pacote.
 * Se um formato atravessa fronteira de processo (HTTP, arquivo, prompt de LLM),
 * o schema dele mora aqui e a validação usa este schema.
 *
 * Estado: contrato inicial, feito antes do primeiro `.ibt` real ser lido.
 * Espere mudanças — o que não pode é divergir entre os pacotes.
 */
import { z } from 'zod';

/** Canal de telemetria, como descrito pela tabela de variáveis do arquivo. */
export const channelDescriptorSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** Unidade declarada pelo sim: `m/s`, `%`, `rad/s`, `C`... */
  unit: z.string(),
  type: z.enum(['char', 'bool', 'int', 'bitField', 'float', 'double']),
  /** > 1 em canais indexados por carro. */
  count: z.int().positive(),
});
export type ChannelDescriptor = z.infer<typeof channelDescriptorSchema>;

/** Dados semi-estáticos da sessão, extraídos do YAML de session info. */
export const sessionSummarySchema = z.object({
  id: z.string(),
  trackName: z.string(),
  trackConfig: z.string().nullable(),
  carName: z.string(),
  driverName: z.string().nullable(),
  sessionType: z.string().nullable(),
  recordedAt: z.iso.datetime().nullable(),
  tickRate: z.int().positive(),
  sampleCount: z.int().nonnegative(),
  durationSeconds: z.number().nonnegative(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

/**
 * Uma volta identificada dentro da gravação.
 *
 * As amostras do `.ibt` não vêm agrupadas por volta: o recorte é feito pela
 * análise (ver `@telemetry/analysis`). `startSample`/`endSample` são índices
 * de amostra, não timestamps — timestamp se deriva com `index / tickRate`.
 */
export const lapSchema = z.object({
  /** Número da volta como o sim reporta. */
  number: z.int(),
  startSample: z.int().nonnegative(),
  endSample: z.int().nonnegative(),
  lapTimeSeconds: z.number().positive().nullable(),
  /** Falso para out lap, in lap, volta cortada pelo início/fim da gravação ou com off-track. */
  isComplete: z.boolean(),
});
export type Lap = z.infer<typeof lapSchema>;

/** Eixo usado para alinhar séries. Comparar voltas exige distância, não tempo. */
export const seriesAxisSchema = z.enum(['time', 'lapDistPct']);
export type SeriesAxis = z.infer<typeof seriesAxisSchema>;

/** Série de um canal ao longo de um eixo. `x` e `y` têm o mesmo comprimento. */
export const channelSeriesSchema = z
  .object({
    channel: z.string(),
    unit: z.string(),
    axis: seriesAxisSchema,
    x: z.array(z.number()),
    y: z.array(z.number()),
  })
  .refine((series) => series.x.length === series.y.length, {
    message: 'x e y precisam ter o mesmo comprimento',
  });
export type ChannelSeries = z.infer<typeof channelSeriesSchema>;

/**
 * Volta guardada como referência para comparação.
 *
 * Pode vir de um `.ibt` importado só para isso (volta de outro piloto, hot lap
 * baixada) ou ser promovida a partir de uma volta de uma sessão já ingerida.
 */
export const referenceLapSchema = z.object({
  id: z.string(),
  label: z.string(),
  source: z.enum(['imported-ibt', 'session-lap']),
  session: sessionSummarySchema,
  lap: lapSchema,
  /** Séries normalizadas por `lapDistPct`, prontas para o delta. */
  series: z.array(channelSeriesSchema),
});
export type ReferenceLap = z.infer<typeof referenceLapSchema>;

/** Trecho da volta onde o delta se move de forma relevante. */
export const comparisonSegmentSchema = z.object({
  startDistPct: z.number().min(0).max(1),
  endDistPct: z.number().min(0).max(1),
  /** Negativo = a volta analisada ganhou tempo no trecho. */
  deltaSeconds: z.number(),
  label: z.string().nullable(),
});
export type ComparisonSegment = z.infer<typeof comparisonSegmentSchema>;

/** Resultado da comparação entre a volta analisada e a de referência. */
export const lapComparisonSchema = z.object({
  referenceLapId: z.string(),
  targetSessionId: z.string(),
  targetLapNumber: z.int(),
  totalDeltaSeconds: z.number(),
  /** Delta acumulado ao longo da volta, eixo `lapDistPct`. */
  deltaSeries: channelSeriesSchema,
  segments: z.array(comparisonSegmentSchema),
});
export type LapComparison = z.infer<typeof lapComparisonSchema>;

/**
 * Saída do agente. Sempre ancorada em evidência: cada achado aponta
 * para um trecho da volta e os canais que sustentam a afirmação.
 */
export const agentFindingSchema = z.object({
  title: z.string(),
  detail: z.string(),
  startDistPct: z.number().min(0).max(1),
  endDistPct: z.number().min(0).max(1),
  deltaSeconds: z.number().nullable(),
  /** Canais que embasam o achado, ex.: `Brake`, `Throttle`, `SteeringWheelAngle`. */
  evidenceChannels: z.array(z.string()),
  confidence: z.enum(['low', 'medium', 'high']),
});
export type AgentFinding = z.infer<typeof agentFindingSchema>;

export const agentReportSchema = z.object({
  summary: z.string(),
  findings: z.array(agentFindingSchema),
  /** Rastreabilidade de custo/modelo. Ver docs/agente.md. */
  model: z.string(),
  generatedAt: z.iso.datetime(),
});
export type AgentReport = z.infer<typeof agentReportSchema>;
