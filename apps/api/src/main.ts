import { SwaggerModule } from '@nestjs/swagger';
import { createApp, createOpenApiDocument } from './app.js';

const port = Number(process.env.PORT ?? 4000);

async function bootstrap(): Promise<void> {
  const app = await createApp();

  // Documentação navegável em /docs; o JSON cru em /docs-json.
  SwaggerModule.setup('docs', app, createOpenApiDocument(app));

  await app.listen(port);
  console.log(`api ouvindo em http://localhost:${port} — documentação em /docs`);
}

void bootstrap();
