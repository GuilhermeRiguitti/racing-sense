import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Prepara o `.env.testing` a partir do `.env.testing.example`.
 *
 * Roda antes dos testes, chamado por `vitest.config.ts`. Só age quando o
 * `.env.testing` ainda não existe: depois de criado, o arquivo é de quem
 * desenvolve, e o script nunca sobrescreve o que foi editado. Para refazer,
 * apague o `.env.testing`.
 *
 * O modelo é copiado, não renomeado: ele é versionado e precisa continuar lá.
 *
 * Na criação, tenta preencher `TELEMETRY_FIXTURE` com o `.ibt` mais recente da
 * pasta de telemetria do iRacing. Não achou a pasta ou nenhum arquivo: a
 * variável fica vazia e o teste de arquivo real é pulado.
 */
export function ensureTestingEnv(appDir: string): void {
  const target = join(appDir, '.env.testing');
  if (existsSync(target)) {
    return;
  }

  const example = join(appDir, '.env.testing.example');
  copyFileSync(example, target);

  const fixture = findLatestTelemetryFile();
  if (fixture === null) {
    console.info(
      '.env.testing criado a partir do modelo. Nenhum .ibt encontrado: TELEMETRY_FIXTURE ficou vazia e o teste de arquivo real será pulado.',
    );
    return;
  }

  const content = readFileSync(target, 'utf8').replace(
    /^TELEMETRY_FIXTURE=.*$/m,
    `TELEMETRY_FIXTURE=${fixture}`,
  );
  writeFileSync(target, content);
  console.info(`.env.testing criado a partir do modelo, com TELEMETRY_FIXTURE=${fixture}`);
}

/**
 * Onde o iRacing grava a telemetria: `Documentos\iRacing\telemetry`.
 *
 * Fora do Electron não há `app.getPath('documents')`, então testa os lugares
 * comuns: a pasta do usuário e a pasta redirecionada para o OneDrive, que
 * aparece com o nome traduzido.
 */
function telemetryDirectoryCandidates(): string[] {
  const roots = [homedir(), process.env.OneDrive].filter(
    (root): root is string => root !== undefined && root !== '',
  );
  return roots.flatMap((root) =>
    ['Documents', 'Documentos'].map((documents) => join(root, documents, 'iRacing', 'telemetry')),
  );
}

/** O `.ibt` modificado por último, com barras normais para caber no `.env`. */
function findLatestTelemetryFile(): string | null {
  let latest: { path: string; modifiedAt: number } | null = null;
  for (const directory of telemetryDirectoryCandidates()) {
    if (!existsSync(directory)) {
      continue;
    }
    for (const name of readdirSync(directory)) {
      if (!name.toLowerCase().endsWith('.ibt')) {
        continue;
      }
      const path = join(directory, name);
      const modifiedAt = statSync(path).mtimeMs;
      if (latest === null || modifiedAt > latest.modifiedAt) {
        latest = { path, modifiedAt };
      }
    }
  }
  return latest === null ? null : latest.path.replaceAll('\\', '/');
}
