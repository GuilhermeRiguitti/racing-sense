import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

/**
 * Três alvos, três runtimes:
 *
 * - `main`   — Node. É onde vive o composition root, o watcher e o SQLite.
 * - `preload` — ponte, com acesso restrito. Só expõe os canais de IPC declarados.
 * - `renderer` — navegador. Não tem Node, não tem `fs`, não tem chave de API.
 *
 * O renderer ser um navegador sem Node não é limitação: é a fronteira de
 * segurança do Electron. Tudo que precisa de disco ou de rede passa por IPC.
 */
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Módulo nativo não pode ser empacotado: é carregado do disco.
        external: ['better-sqlite3'],
      },
    },
  },
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
