import type { Config } from '@netlify/functions';
import { verifyProduction } from './_lib/publication.mts';

export default async () => { await verifyProduction(); };
export const config: Config = { schedule: '41 9 * * *' };
