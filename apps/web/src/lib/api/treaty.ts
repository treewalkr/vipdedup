import { treaty } from '@elysiajs/eden';
import type { App } from '@vd/api';
import { PUBLIC_API_URL } from '$env/static/public';

/** Eden Treaty client — types flow from the Elysia app (type-only import). */
export const client = treaty<App>(PUBLIC_API_URL || 'http://localhost:4100');
