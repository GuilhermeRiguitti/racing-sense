import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3333);

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`telemetry-api ouvindo em http://localhost:${info.port}`);
});
