#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const scriptDir=path.dirname(fileURLToPath(import.meta.url)); const rootDir=path.resolve(scriptDir,".."); await mkdir(path.join(rootDir,".tmp"),{recursive:true}); const tmpRoot=await mkdtemp(path.join(rootDir,".tmp","cf-approval-"));
async function withClient(env, fn){ const client=new Client({name:"cf-approval-test",version:"1.0.1"},{capabilities:{}}); const transport=new StdioClientTransport({command:process.execPath,args:[path.join(scriptDir,"vnem-tools-mcp-server.mjs")],cwd:rootDir,env:{...process.env,VNEM_TOOLS_ALLOWED_ROOTS:tmpRoot,VNEM_TOOLS_EVIDENCE_ROOT:path.join(tmpRoot,".vnem","tool-runs"),CLOUDFLARE_API_TOKEN:"cfut_abcdefghijklmnopqrstuvwxyz1234567890",CLOUDFLARE_ACCOUNT_ID:"acct",VNEM_TOOLS_PERMISSION_PROFILE:"creator-power",...env},stderr:"pipe"}); await client.connect(transport); try{return await fn(client)} finally{await client.close().catch(()=>{})}}
try{
 await withClient({}, async client=>{
  const pages=await client.callTool({name:"vnem_tools_cloudflare_pages_deploy",arguments:{project_dir:".",project_name:"demo",output_dir:"dist",simulate:true}}); assert.equal(pages.isError,true); assert.equal(pages.structuredContent?.code,"cloudflare_mutation_approval_required");
  const wrong=await client.callTool({name:"vnem_tools_cloudflare_pages_deploy",arguments:{project_dir:".",project_name:"demo",output_dir:"dist",simulate:true,approval_phrase:"approve"}}); assert.equal(wrong.isError,true);
  const ok=await client.callTool({name:"vnem_tools_cloudflare_pages_deploy",arguments:{project_dir:".",project_name:"demo",output_dir:"dist",simulate:true,approval_phrase:"I APPROVE CLOUDFLARE MUTATION"}}); assert.equal(ok.isError,undefined); assert.equal(ok.structuredContent?.pages_deploy?.mutated,true); assert.ok(ok.structuredContent?.pages_deploy?.evidence_pack_path);
  const worker=await client.callTool({name:"vnem_tools_cloudflare_workers_deploy",arguments:{project_dir:".",script_name:"demo",simulate:true}}); assert.equal(worker.isError,true); assert.equal(worker.structuredContent?.code,"cloudflare_mutation_approval_required");
  const dnsDelete=await client.callTool({name:"vnem_tools_cloudflare_dns_apply",arguments:{zone_name:"example.com",record_name:"www",record_type:"A",record_value:"192.0.2.1",operation:"delete",simulate:true,approval_phrase:"I APPROVE CLOUDFLARE MUTATION"}}); assert.equal(dnsDelete.isError,true); assert.equal(dnsDelete.structuredContent?.code,"cloudflare_destructive_approval_required");
  const dnsOk=await client.callTool({name:"vnem_tools_cloudflare_dns_apply",arguments:{zone_name:"example.com",record_name:"www",record_type:"A",record_value:"192.0.2.1",operation:"delete",simulate:true,approval_phrase:"I APPROVE CLOUDFLARE DESTRUCTIVE ACTION",protected_acknowledgment:"I understand this changes protected DNS"}}); assert.equal(dnsOk.isError,undefined); assert.equal(dnsOk.structuredContent?.dns_apply?.destructive_approval_verified,true);
  for (const name of ["vnem_tools_cloudflare_rollback","vnem_tools_cloudflare_cache_purge"]) { const res=await client.callTool({name,arguments:{zone_name:"example.com",project_name:"demo",script_name:"demo",simulate:true}}); assert.equal(res.isError,true, name); assert.match(res.structuredContent?.code||"",/approval_required/); }
 });
 await withClient({VNEM_TOOLS_PERMISSION_PROFILE:"safe-readonly"}, async client=>{ const res=await client.callTool({name:"vnem_tools_cloudflare_env_apply",arguments:{target_type:"workers",target_name:"demo",variables:[{name:"A",value:"B",secret:true,operation:"put"}],simulate:true,approval_phrase:"I APPROVE CLOUDFLARE MUTATION"}}); assert.equal(res.isError,true); assert.equal(res.structuredContent?.code,"permission_profile_blocked"); });
 await withClient({VNEM_TOOLS_PERMISSION_PROFILE:"dangerous-disabled"}, async client=>{ const res=await client.callTool({name:"vnem_tools_cloudflare_pages_deploy",arguments:{project_name:"demo",simulate:true,approval_phrase:"I APPROVE CLOUDFLARE MUTATION"}}); assert.equal(res.isError,true); assert.equal(res.structuredContent?.code,"permission_profile_blocked"); });
 console.log("vnem Tools Cloudflare approval gate tests passed");
} finally { await rm(tmpRoot,{recursive:true,force:true}); }
