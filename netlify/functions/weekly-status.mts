import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { performSweep } from "./_lib/sweep.mts";

export default async () => {
  const store=getStore("fronteraeval-live",{consistency:"strong"});
  let status=await store.get("weekly-status",{type:"json"});
  if(!status){
    try{status=await performSweep()}catch(error){status={schema_version:"0.1.0",status:"build-snapshot",checked_at:null,inspect:null,changes:{new_internal:0,new_register:0,missing_internal:0},source_checks:[],error:error instanceof Error?error.message:String(error)}}
  }
  return Response.json(status,{headers:{"cache-control":"public, max-age=300, stale-while-revalidate=3600"}});
};

export const config:Config={path:"/api/weekly-status"};
