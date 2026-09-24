import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['out/', 'dist/', 'src/main/cloud/api-schema.d.ts'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Nome começando com `_` é "ignorado de propósito" — a mesma convenção
      // que o `tsc` do projeto já aceita em `noUnusedLocals`/`noUnusedParameters`.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Processo principal, preload e scripts de ferramenta: Node.
    files: ['src/main/**', 'src/preload/**', 'scripts/**', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // A tela: navegador, React. As duas regras clássicas de hooks; as regras do
    // React Compiler (recomendadas no plugin 7) ficam de fora até a tela ser
    // revisada para elas.
    files: ['src/renderer/**'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
