import type { Config } from "@netlify/functions";
import { performSweep } from "./_lib/sweep.mts";

export default async () => {
  const result=await performSweep();
  console.log(JSON.stringify({event:"fronteraeval_weekly_sweep",checked_at:result.checked_at,inspect_sha:result.inspect.sha,changes:result.changes}));
};

export const config:Config={schedule:"17 2 * * 0"};
