import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC, e não o esbuild padrão do vitest: a injeção de dependência e o
  // ValidationPipe do Nest dependem dos metadados de decorator, que o esbuild
  // não emite. Usa o mesmo `.swcrc` do build.
  plugins: [swc.vite()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
