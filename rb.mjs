import { createClient } from "@supabase/supabase-js"; import sharp from "sharp"; import fs from "node:fs";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const URL=env.NEXT_PUBLIC_SUPABASE_URL,JINA=env.JINA_API_KEY;
const sb=createClient(URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function emb(u){const b=Buffer.from(await(await fetch(u)).arrayBuffer());const s=await sharp(b).resize(768,768,{fit:"inside",withoutEnlargement:true}).jpeg({quality:85}).toBuffer();for(let a=0;a<5;a++){const r=await fetch("https://api.jina.ai/v1/embeddings",{method:"POST",headers:{Authorization:`Bearer ${JINA}`,"Content-Type":"application/json"},body:JSON.stringify({model:"jina-clip-v2",dimensions:512,normalized:true,input:[{image:s.toString("base64")}]})});const j=await r.json();if(r.ok)return j.data[0].embedding;await sleep(7000);}throw new Error("rate limited");}
const {data:photos}=await sb.from("photos").select("id, storage_path");
let ok=0;
for(const p of photos){try{const e=await emb(`${URL}/storage/v1/object/public/dog-photos/${p.storage_path}`);await sb.from("photos").update({embedding:e}).eq("id",p.id);ok++;process.stdout.write(".");await sleep(1500);}catch(err){console.log(`\nfail ${p.id}: ${err.message}`);}}
console.log(`\nRe-embedded ${ok}/${photos.length} at 768px`);
