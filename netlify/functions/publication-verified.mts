import { verifyProduction } from './_lib/publication.mts';

export default {
  async deploySucceeded() { await verifyProduction(); }
};
