/**
 * Abre o aplicativo do piloto de verdade, ingere um `.ibt` e tira prints da tela.
 *
 * Existe para conferir gráfico e tabela como o piloto os vê — o que teste não
 * pega: texto sobreposto, rótulo cortado, layout quebrado. Ver a skill
 * `.claude/skills/run-desktop/SKILL.md`.
 *
 * Nunca toca no banco do piloto: o app sobe com uma pasta de dados e uma pasta
 * de telemetria temporárias, que são apagadas no fim. Só os prints ficam.
 *
 *   pnpm build
 *   node scripts/drive-app.mjs [--ibt caminho] [--reference 14 --lap 10] [--out pasta]
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import { chromium } from 'playwright-core';

const APP_DIR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const { values: opcoes } = parseArgs({
  options: {
    ibt: { type: 'string' },
    reference: { type: 'string' },
    lap: { type: 'string' },
    out: { type: 'string', default: join(tmpdir(), 'telemetry-shots') },
    port: { type: 'string', default: '9333' },
  },
});

/** Sem `--ibt`, o mesmo arquivo dos testes: `TELEMETRY_FIXTURE` do `.env.testing`. */
function arquivoPadrao() {
  if (process.env.TELEMETRY_FIXTURE) return process.env.TELEMETRY_FIXTURE;
  const env = join(APP_DIR, '.env.testing');
  return existsSync(env) ? parseEnv(readFileSync(env, 'utf8')).TELEMETRY_FIXTURE : undefined;
}

const ibt = opcoes.ibt ?? arquivoPadrao();
if (!ibt || !existsSync(ibt)) {
  throw new Error(`Sem .ibt para abrir: passe --ibt ou preencha TELEMETRY_FIXTURE (recebido: ${ibt})`);
}
if (!existsSync(join(APP_DIR, 'out/main/index.js'))) {
  throw new Error('O app não está compilado: rode `pnpm build` em apps/desktop antes.');
}

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const base = mkdtempSync(join(tmpdir(), 'telemetry-drive-'));
const dados = join(base, 'userdata');
const telemetria = join(base, 'telemetry');
mkdirSync(dados);
mkdirSync(telemetria);
mkdirSync(opcoes.out, { recursive: true });
copyFileSync(ibt, join(telemetria, basename(ibt)));

// Rodando de dentro do VS Code (que também é Electron), o ambiente traz
// ELECTRON_RUN_AS_NODE=1, e o Electron sobe como Node puro, sem janela.
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([nome]) => nome !== 'ELECTRON_RUN_AS_NODE' && nome !== 'ELECTRON_RENDERER_URL',
  ),
);
env.TELEMETRY_DIRECTORY = telemetria;

const electron = createRequire(import.meta.url)('electron');
const app = spawn(
  electron,
  [`--remote-debugging-port=${opcoes.port}`, `--user-data-dir=${dados}`, APP_DIR],
  { env, stdio: 'ignore' },
);

let browser;
try {
  // O `_electron` do Playwright não conversa com o Electron 44; o protocolo de
  // depuração do Chromium, sim.
  for (let tentativa = 0; tentativa < 30 && browser === undefined; tentativa += 1) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${opcoes.port}`);
    } catch {
      await espera(1000);
    }
  }
  if (browser === undefined) throw new Error('O app não abriu a porta de depuração em 30 s.');

  // A garantia de que o banco do piloto ficou de fora: o banco desta execução
  // tem que nascer na pasta temporária.
  for (let tentativa = 0; tentativa < 15 && !existsSync(join(dados, 'telemetry.db')); tentativa += 1) {
    await espera(1000);
  }
  if (!existsSync(join(dados, 'telemetry.db'))) {
    throw new Error(`O banco não apareceu em ${dados}: o app pode estar usando a pasta de dados real.`);
  }

  const page = browser
    .contexts()[0]
    .pages()
    .find((pagina) => !pagina.url().startsWith('devtools'));
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.waitForSelector('.sessions__item', { timeout: 60_000 });
  await page.click('.sessions__item');
  await page.waitForSelector('table.laps tbody tr', { timeout: 60_000 });
  await espera(1500);
  await page.screenshot({ path: join(opcoes.out, '1-sessao.png') });
  console.log('print:', join(opcoes.out, '1-sessao.png'));

  const linha = (numero) => `table.laps tbody tr:has(td:text-is("${numero}"))`;
  if (opcoes.reference !== undefined) {
    await page.click(linha(opcoes.reference));
    await espera(1000);
    await page.click('button:has-text("Usar como referência")');
    await espera(1500);
  }
  if (opcoes.lap !== undefined) {
    await page.click(linha(opcoes.lap));
    await espera(1000);
    if (opcoes.reference !== undefined) {
      const seletor = page.locator('.lap-view select');
      const rotulo = (await seletor.locator('option').allTextContents()).find((texto) =>
        texto.startsWith(`Volta ${opcoes.reference} `),
      );
      if (rotulo === undefined) throw new Error(`A volta ${opcoes.reference} não virou referência.`);
      await seletor.selectOption({ label: rotulo });
      await page.waitForSelector('.panel--delta', { timeout: 20_000 });
    }
    await espera(1500);
    await page.locator('.lap-view').screenshot({ path: join(opcoes.out, '2-volta.png') });
    console.log('print:', join(opcoes.out, '2-volta.png'));
  }
} finally {
  await browser?.close().catch(() => {});
  app.kill();
  await espera(1000);
  rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
