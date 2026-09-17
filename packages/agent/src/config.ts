/**
 * Configuração do provedor de LLM.
 *
 * O projeto não se amarra a um provedor: a camada de análise entrega dados
 * estruturados e o modelo só redige em cima deles. Trocar de provedor é trocar
 * esta configuração — nunca as ferramentas nem os schemas.
 *
 * Providers suportados no MVP:
 *  - `google`  — Gemini, modelos Flash. Barato, tem free tier, latência boa.
 *  - `nvidia`  — NVIDIA NIM, endpoint compatível com OpenAI.
 *
 * Chaves vêm de variável de ambiente. Nunca hardcode chave, nem em teste.
 */
export type LlmProvider = 'google' | 'nvidia';

export interface LlmConfig {
  provider: LlmProvider;
  /**
   * ID do modelo no provedor escolhido.
   * Confirme o ID atual na documentação do provedor antes de fixar em produção —
   * nomes de modelo mudam mais rápido que este repositório.
   */
  modelId: string;
  apiKey: string;
  /** Sobrescreve o endpoint. Usado pelo provider compatível com OpenAI. */
  baseUrl?: string;
}

export const NVIDIA_DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';

/**
 * Defaults conservadores: modelo barato e estável, não o mais novo.
 * O `@ai-sdk/google` instalado também tipa `gemini-3.5-flash` e `gemini-3-flash-preview`;
 * medir custo e qualidade antes de promover qualquer um deles a default
 * (ver docs/pendencias.md).
 */
const DEFAULT_MODEL_IDS: Record<LlmProvider, string> = {
  google: 'gemini-2.5-flash',
  nvidia: 'meta/llama-3.3-70b-instruct',
};

const API_KEY_ENV_VARS: Record<LlmProvider, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
};

function isLlmProvider(value: string): value is LlmProvider {
  return value === 'google' || value === 'nvidia';
}

/** Monta a configuração a partir do ambiente. Falha alto se faltar chave. */
export function loadLlmConfigFromEnv(env: Record<string, string | undefined>): LlmConfig {
  const rawProvider = env.TELEMETRY_LLM_PROVIDER ?? 'google';
  if (!isLlmProvider(rawProvider)) {
    throw new Error(`TELEMETRY_LLM_PROVIDER inválido: "${rawProvider}". Use "google" ou "nvidia".`);
  }

  const envVar = API_KEY_ENV_VARS[rawProvider];
  const apiKey = env[envVar];
  if (!apiKey) {
    throw new Error(`Falta a variável de ambiente ${envVar} para o provider "${rawProvider}".`);
  }

  const baseUrl = env.TELEMETRY_LLM_BASE_URL;
  return {
    provider: rawProvider,
    modelId: env.TELEMETRY_LLM_MODEL ?? DEFAULT_MODEL_IDS[rawProvider],
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
  };
}
