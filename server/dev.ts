import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { MissingConfigError } from './env.js';

const port = Number(process.env['PORT'] ?? 3000);

try {
    const app = createApp();

    serve({ fetch: app.fetch, port }, (info) => {
        console.log(`[api] disponível em http://localhost:${info.port}/api`);
    });
} catch (error) {
    if (error instanceof MissingConfigError) {
        console.error(`[api] configuração ausente: ${error.message}`);
        process.exit(1);
    }

    throw error;
}
