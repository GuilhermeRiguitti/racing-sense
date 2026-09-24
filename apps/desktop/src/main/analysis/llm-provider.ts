import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { type LlmConfig, NVIDIA_DEFAULT_BASE_URL } from './llm-config.js';

/**
 * Resolve a configuração num modelo do AI SDK.
 *
 * É o único ponto do código que sabe qual provedor está em uso.
 */
export function resolveModel(config: LlmConfig): LanguageModel {
  switch (config.provider) {
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
      return google(config.modelId);
    }
    case 'nvidia': {
      const nvidia = createOpenAICompatible({
        name: 'nvidia',
        baseURL: config.baseUrl ?? NVIDIA_DEFAULT_BASE_URL,
        apiKey: config.apiKey,
      });
      return nvidia(config.modelId);
    }
  }
}
