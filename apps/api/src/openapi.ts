import { writeFile } from 'node:fs/promises';
import { createApp, createOpenApiDocument } from './app.js';

/**
 * Exporta o contrato da api para `openapi.json`.
 *
 * É o arquivo que o desktop e a web leem para gerar os próprios tipos
 * (`pnpm api:types` em cada um). Nenhum dos dois importa código daqui: o que
 * atravessa a fronteira é este documento.
 *
 * Não precisa de banco nem de segredo de verdade: a aplicação é montada, o
 * documento é lido e ela fecha sem abrir conexão.
 */
process.env.SESSION_SECRET ??= 'somente-para-exportar-o-contrato-openapi';

const app = await createApp();
const document = createOpenApiDocument(app);
await writeFile(
  new URL('../openapi.json', import.meta.url),
  `${JSON.stringify(document, null, 2)}\n`,
);
await app.close();
console.log('openapi.json atualizado');
