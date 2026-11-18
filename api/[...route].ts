import { createApp } from '../server/app';

const app = createApp();

export const config = { runtime: 'nodejs' as const };

export default { fetch: app.fetch };
