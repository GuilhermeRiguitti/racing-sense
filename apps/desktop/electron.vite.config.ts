import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

/**
 * Três alvos, três runtimes:
 *
 * - `main`   — Node. É onde vivem o watcher, o SQLite, o decoder e o modelo.
 * - `preload` — ponte, com acesso restrito. Só expõe os canais de IPC declarados.
 * - `renderer` — navegador. Não tem Node, não tem `fs`, não tem chave de API.
 *
 * O renderer ser um navegador sem Node não é limitação: é a fronteira de
 * segurança do Electron. Tudo que precisa de disco ou de rede passa por IPC.
 *
 * As dependências de `package.json` ficam fora do bundle do `main` e são
 * carregadas de `node_modules` em runtime — o padrão do electron-vite. É o que
 * o `better-sqlite3` exige: módulo nativo não se empacota.
 */
export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        output: {
          /**
           * Preload **precisa** ser CommonJS.
           *
           * Com `sandbox: true` o Electron não carrega preload em ESM — e o
           * pacote é `"type": "module"`, então sem isto o arquivo sai `.mjs` e
           * a janela abre sem a ponte, silenciosamente.
           */
          format: 'cjs',
          entryFileNames: 'index.cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
  },
});
