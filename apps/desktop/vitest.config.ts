import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';
import { ensureTestingEnv } from './scripts/testing-env';

/**
 * O ambiente dos testes vem de `.env.testing`, e só dele.
 *
 * O arquivo não é versionado: na primeira vez, `ensureTestingEnv` o cria a
 * partir de `.env.testing.example` (esse, sim, versionado).
 *
 * Não usa o `loadEnv` do vite: ele carrega também o `.env` do aplicativo, e a
 * chave do provedor de LLM do piloto passaria a existir dentro dos testes.
 *
 * Variável definida no terminal vence o arquivo, e valor vazio no arquivo é o
 * mesmo que variável ausente — é assim que o teste de `.ibt` real sabe que deve
 * pular.
 */
function loadTestingEnv(): Record<string, string> {
  ensureTestingEnv(fileURLToPath(new URL('.', import.meta.url)));
  const file = parseEnv(readFileSync(new URL('./.env.testing', import.meta.url), 'utf8'));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(file)) {
    const resolved = process.env[key] || value;
    if (resolved) {
      env[key] = resolved;
    }
  }
  return env;
}

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: loadTestingEnv(),
  },
});
