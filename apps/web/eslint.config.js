import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  { ignores: ['.next/', 'next-env.d.ts', 'src/lib/api-schema.d.ts'] },
  ...nextVitals,
  {
    rules: {
      'no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'none',
          ignoreRestSiblings: true,
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },
];

export default config;
