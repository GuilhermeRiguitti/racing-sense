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
 *   node tests/e2e/drive-app.mjs [--ibt caminho] [--reference 14 --lap 10] [--live] [--out pasta]
 *   node tests/e2e/drive-app.mjs --overlay [--out pasta]
 *
 * Com `--overlay`, sobe o sim falso (`tests/support/fake-sim.ts`) num arquivo
 * mapeado com nome de teste, abre o app apontado para ele, com todos os widgets
 * ligados, e tira print de cada janela do overlay, da volta ao vivo e da tela de
 * configuração. O `.ibt` fica opcional.
 */
/* global document, window -- dentro de page.evaluate o código roda na página */
import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import { chromium } from 'playwright-core';

const APP_DIR = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const { values: opcoes } = parseArgs({
  options: {
    ibt: { type: 'string' },
    reference: { type: 'string' },
    lap: { type: 'string' },
    out: { type: 'string', default: join(tmpdir(), 'telemetry-shots') },
    port: { type: 'string', default: '9333' },
    live: { type: 'boolean', default: false },
    overlay: { type: 'boolean', default: false },
  },
});

/** Sem `--ibt`, o mesmo arquivo dos testes: `TELEMETRY_FIXTURE` do `.env.testing`. */
function arquivoPadrao() {
  if (process.env.TELEMETRY_FIXTURE) return process.env.TELEMETRY_FIXTURE;
  const env = join(APP_DIR, '.env.testing');
  return existsSync(env) ? parseEnv(readFileSync(env, 'utf8')).TELEMETRY_FIXTURE : undefined;
}

const ibt = opcoes.ibt ?? arquivoPadrao();
const temIbt = Boolean(ibt) && existsSync(ibt);
if (!temIbt && !opcoes.overlay) {
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
if (temIbt) copyFileSync(ibt, join(telemetria, basename(ibt)));

// O sim falso escreve num mapeamento com nome de teste: o do iRacing nunca é tocado.
const MAPA_FALSO = `Local\\TelemetryFakeSim-${process.pid}`;
let simFalso;
let vite;
if (opcoes.overlay) {
  const { createServer } = await import('vite');
  vite = await createServer({
    root: APP_DIR,
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  const { startFakeSim } = await vite.ssrLoadModule('/tests/support/fake-sim.ts');
  simFalso = startFakeSim(MAPA_FALSO);
  const todos = { enabled: true, x: null, y: null, scale: 1 };
  writeFileSync(
    join(dados, 'overlay.json'),
    JSON.stringify({
      visible: true,
      widgets: Object.fromEntries(
        ['relative', 'standings', 'delta', 'inputs', 'fuel', 'radar', 'flag'].map((id) => [id, todos]),
      ),
    }),
  );
}

// Rodando de dentro do VS Code (que também é Electron), o ambiente traz
// ELECTRON_RUN_AS_NODE=1, e o Electron sobe como Node puro, sem janela.
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([nome]) => nome !== 'ELECTRON_RUN_AS_NODE' && nome !== 'ELECTRON_RENDERER_URL',
  ),
);
env.TELEMETRY_DIRECTORY = telemetria;
if (opcoes.overlay) env.TELEMETRY_LIVE_MEMORY_NAME = MAPA_FALSO;

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
    .find((pagina) => !pagina.url().startsWith('devtools') && !pagina.url().includes('overlay='));
  await page.setViewportSize({ width: 1440, height: 1000 });

  if (opcoes.overlay) await fotografarOverlay(browser, page);

  if (temIbt) {
  // Dentro da lista: o item "Ao vivo" da barra lateral usa a mesma classe.
  await page.waitForSelector('.sessions .sessions__item', { timeout: 60_000 });
  await page.click('.sessions .sessions__item');
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
  }

  if (opcoes.live) {
    // A tela ao vivo lê a memória do sim de verdade: com o sim fechado, o print
    // mostra o estado "sim fechado"; numa sessão, a tabela de canais.
    await page.click('.live__entry');
    await page.waitForSelector('.live__table, .empty h1, .alert', { timeout: 20_000 });
    await espera(1500);
    await page.screenshot({ path: join(opcoes.out, '3-ao-vivo.png') });
    console.log('print:', join(opcoes.out, '3-ao-vivo.png'));
  }
} finally {
  await browser?.close().catch(() => {});
  app.kill();
  simFalso?.stop();
  await vite?.close();
  await espera(1000);
  rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}

/**
 * Um print por janela do overlay, sobre um fundo escuro esverdeado que faz as
 * vezes da imagem da pista (a janela é transparente), mais a volta ao vivo e a
 * configuração na janela do app.
 */
async function fotografarOverlay(navegador, principal) {
  await principal.setViewportSize({ width: 1440, height: 1000 });
  await principal.click('.live__entry >> nth=0');
  // O sim falso anda três vezes mais rápido que o relógio: ~30 s por volta.
  await espera(14_000);
  const janelas = navegador
    .contexts()[0]
    .pages()
    .filter((pagina) => pagina.url().includes('overlay='));
  for (const janela of janelas) {
    const widget = new URL(janela.url()).searchParams.get('overlay');
    // A janela tem de ter o tamanho do que desenhou: maior, seria área
    // invisível por cima do sim. Conferido antes de o print mexer no viewport.
    const medida = await janela.evaluate(() => {
      const raiz = document.querySelector('.ov');
      return {
        janela: [window.innerWidth, window.innerHeight],
        conteudo: [raiz?.offsetWidth ?? 0, raiz?.offsetHeight ?? 0],
      };
    });
    console.log(`${widget}: janela ${medida.janela.join('×')}, conteúdo ${medida.conteudo.join('×')}`);
    await janela.evaluate(() => {
      document.body.style.background = '#2e3a31';
      document.body.style.padding = '12px';
    });
    const tamanho = await janela.evaluate(() => {
      const raiz = document.querySelector('.ov');
      return { width: (raiz?.offsetWidth ?? 10) + 24, height: (raiz?.offsetHeight ?? 10) + 24 };
    });
    await janela.setViewportSize(tamanho);
    const arquivo = join(opcoes.out, `overlay-${widget}.png`);
    await janela.screenshot({ path: arquivo });
    console.log('print:', arquivo);
  }
  await principal.screenshot({ path: join(opcoes.out, '4-ao-vivo-volta.png') });
  console.log('print:', join(opcoes.out, '4-ao-vivo-volta.png'));
  await principal.click('.live__entry >> nth=1');
  await espera(800);
  await principal.click('button:has-text("Destravar para mover")');
  await espera(1500);
  await principal.screenshot({ path: join(opcoes.out, '5-overlay-config.png'), fullPage: true });
  console.log('print:', join(opcoes.out, '5-overlay-config.png'));
  const relative = navegador
    .contexts()[0]
    .pages()
    .find((pagina) => pagina.url().includes('overlay=relative'));
  if (relative !== undefined) {
    await relative.screenshot({ path: join(opcoes.out, 'overlay-relative-mover.png') });
    console.log('print:', join(opcoes.out, 'overlay-relative-mover.png'));
  }
}
