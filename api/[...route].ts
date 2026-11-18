import { createApp } from '../server/app.js';

const app = createApp();

export const config = { runtime: 'nodejs' as const };

export default { fetch: app.fetch };
