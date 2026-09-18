import type { NarratorPort } from '@telemetry/application-desktop';
import { NotImplementedError } from '@telemetry/domain';
import type { LlmConfig } from './config.js';

/**
 * Narrador baseado em LLM.
 *
 * Recebe delta e trechos já calculados e devolve a redação. **Não calcula nada** —
 * ver `docs/agente.md` e o ADR 0005.
 *
 * Trocar Gemini por NVIDIA é variável de ambiente; trocar o AI SDK inteiro por
 * outra lib é reescrever este arquivo e mais nenhum, porque a aplicação só
 * conhece `NarratorPort`.
 */
export function createLlmNarrator(_config: LlmConfig): NarratorPort {
  return {
    narrate() {
      return Promise.reject(
        new NotImplementedError(
          'Narrador ainda não implementado: depende do delta calculado (etapa 3 do roadmap)',
        ),
      );
    },
  };
}

/**
 * Narrador que recusa trabalhar.
 *
 * Usado quando não há chave de API configurada. Falha explícita na hora de
 * narrar é melhor que a aplicação nem subir por causa de uma funcionalidade
 * opcional.
 */
export function createUnavailableNarrator(reason: string): NarratorPort {
  return {
    narrate() {
      return Promise.reject(new NotImplementedError(`Narrador indisponível: ${reason}`));
    },
  };
}
