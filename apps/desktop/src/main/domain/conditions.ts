/**
 * Condições da sessão.
 *
 * Sem isso a comparação entre pilotos mente: dois segundos de diferença podem
 * ser pista 15 °C mais quente, não erro de pilotagem. Por isso as condições
 * viajam junto com a volta compartilhada, e não como metadado opcional.
 *
 * Todo campo é anulável porque nem todo `.ibt` traz tudo — arquivo de sessão
 * antiga ou de carro diferente pode não ter um canal. Ausência é ausência, não
 * zero: temperatura 0 °C é um dado, `null` é "não sei".
 */
export interface SessionConditions {
  /** Temperatura do ar em °C. */
  readonly airTempCelsius: number | null;
  /** Temperatura da pista em °C. Manda mais no tempo de volta que a do ar. */
  readonly trackTempCelsius: number | null;
  readonly relativeHumidityPct: number | null;
  readonly windSpeedMs: number | null;
  /** Céu como o sim reporta: limpo, nublado, encoberto. */
  readonly skies: string | null;
  /** Horário na pista, em segundos desde a meia-noite. Sol baixo muda tudo. */
  readonly timeOfDaySeconds: number | null;
  /** Estado da borracha na pista, quando o sim informa. */
  readonly trackUsage: string | null;
}

export const UNKNOWN_CONDITIONS: SessionConditions = {
  airTempCelsius: null,
  trackTempCelsius: null,
  relativeHumidityPct: null,
  windSpeedMs: null,
  skies: null,
  timeOfDaySeconds: null,
  trackUsage: null,
};

/**
 * Quão comparáveis são duas sessões do ponto de vista das condições.
 *
 * Não bloqueia comparação — isso é decisão de quem lê. Serve para a interface
 * avisar "a referência foi feita com a pista 12 °C mais fria" em vez de deixar o
 * piloto concluir que ele é lento.
 */
export interface ConditionsGap {
  readonly trackTempDeltaCelsius: number | null;
  readonly airTempDeltaCelsius: number | null;
  /** Verdadeiro quando a diferença é grande o bastante para explicar tempo. */
  readonly isSignificant: boolean;
}

/** Acima disto a diferença de pista explica décimos sozinha. */
export const SIGNIFICANT_TRACK_TEMP_DELTA = 5;

export function compareConditions(
  reference: SessionConditions,
  target: SessionConditions,
): ConditionsGap {
  const delta = (a: number | null, b: number | null): number | null =>
    a === null || b === null ? null : Number((b - a).toFixed(2));

  const trackTempDeltaCelsius = delta(reference.trackTempCelsius, target.trackTempCelsius);

  return {
    trackTempDeltaCelsius,
    airTempDeltaCelsius: delta(reference.airTempCelsius, target.airTempCelsius),
    isSignificant:
      trackTempDeltaCelsius !== null &&
      Math.abs(trackTempDeltaCelsius) >= SIGNIFICANT_TRACK_TEMP_DELTA,
  };
}
