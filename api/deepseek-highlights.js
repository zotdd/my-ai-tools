'use strict';
// Vercel Node.js Function. A private access code is mandatory until we add persistent public quotas.
const crypto = require('node:crypto');
const MAX_PAYLOAD = 1800000;
const MAX_FRAMES = 12;
const ipWindow = new Map(); // best-effort per-instance throttle; NOT a durable rate limiter
function fail(res,code,error){return res.status(code).json({error})}
function sameSecret(a,b){
 const aHash=crypto.createHash('sha256').update(a||'').digest();
 const bHash=crypto.createHash('sha256').update(b||'').digest();
 return crypto.timingSafeEqual(aHash,bHash);
}
function clean(v,max=160){return typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):''}
function clipNumber(n){return typeof n==='number' && Number.isFinite(n)?n:NaN}
function restrict(req){
 const addr=clean(req.headers['x-forwarded-for']?.split(',')[0]||req.socket?.remoteAddress||'unknown',100);
 const now=Date.now();
 const value=ipWindow.get(addr)||{at:now,count:0};
 if(now-value.at>60000){value.at=now;value.count=0;}
 value.count++;
 ipWindow.set(addr,value);
 if(ipWindow.size>2000){for(const [k,v] of ipWindow){if(now-v.at>60000)ipWindow.delete(k)}}
 return value.count<=5;
}
module.exports = async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(res,405,'Use POST to analyze a selected clip range.');}
 if(!process.env.DEEPSEEK_API_KEY || !process.env.CLIPFORGE_AI_ACCESS_CODE){
   return fail(res,503,'AI beta is not configured. Site owner must set DEEPSEEK_API_KEY and CLIPFORGE_AI_ACCESS_CODE in Vercel.');
 }
 if(req.headers['content-length'] && Number(req.headers['content-length'])>MAX_PAYLOAD){return fail(res,413,'Too many frames. Reduce the range and retry.');}
 if(!restrict(req))return fail(res,429,'Too many AI requests. Please wait before trying again.');
 let body=req.body;
 if(typeof body==='string'){try{body=JSON.parse(body)}catch(_){return fail(res,400,'Invalid JSON.')}}
 if(!body||typeof body!=='object')return fail(res,400,'Invalid request.');
 if(!sameSecret(clean(body.accessCode,200),process.env.CLIPFORGE_AI_ACCESS_CODE))return fail(res,403,'Incorrect private beta access code.');
 const {frames}=body,start=clipNumber(body.start),end=clipNumber(body.end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end-start<5||end-start>90||!Array.isArray(frames)||frames.length<2||frames.length>MAX_FRAMES)
    return fail(res,400,'Choose a 5–90 second clip range and 2–12 sampled frames.');
 const content=[{type:'text',text:`Analyze these sparse, timestamped frames sampled from a video, not continuous video. Scene type / creator goal: ${clean(body.context,250)}. Source window: ${start.toFixed(2)} to ${end.toFixed(2)} seconds. Return JSON only, with {"clips":[{"start":number,"end":number,"label":string,"reason":string}]}. Suggest 0–3 promising *approximate* short segments near visible interesting changes; start/end must lie inside the window, and each duration should be 2–15 seconds. Do not claim to detect speech, kills, exact actions or unseen moments, and do not invent action between images. If you can't judge from frames, return {"clips":[]}. Frame timestamps use absolute source seconds.`}];
 let previous=-Infinity;
 for(const fr of frames){
   if(!fr||typeof fr!=='object')return fail(res,400,'Malformed frame.');
   const t=clipNumber(fr.time),data=fr.image;
   if(!Number.isFinite(t)||t<start-.25||t>end+.25||t<previous||typeof data!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data)||data.length>140000){return fail(res,400,'Invalid compressed sample frame.');}
   previous=t;
   content.push({type:'text',text:`FRAME at ${t.toFixed(2)} seconds`});
   content.push({type:'image_url',image_url:{url:data,detail:'low'}});
 }
 if(Buffer.byteLength(JSON.stringify(content))>MAX_PAYLOAD)return fail(res,413,'Images too large; try again with shorter footage.');
 const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),45000);
 try{
   const response=await fetch('https://api.deepseek.com/chat/completions',{
     method:'POST',signal:controller.signal,
     headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.DEEPSEEK_API_KEY}`},
     body:JSON.stringify({model:'deepseek-flash',temperature:0.3,max_tokens:900,response_format:{type:'json_object'},messages:[{role:'system',content:'You are a cautious short-video assistant. Only use visible evidence in provided still images. Respond with compact strict JSON. Approximate suggestions; do not infer unseen motion.'},{role:'user',content}]})
   });
   if(!response.ok){
     // Don't return provider internal detail, token or full request to browser.
     if(response.status===401||response.status===403)return fail(res,502,'DeepSeek API key was rejected. Check Vercel environment variables.');
     if(response.status===402||response.status===429)return fail(res,503,'DeepSeek budget, rate limit or quota reached.');
     return fail(res,502,`DeepSeek request failed (${response.status}).`);
   }
   const data=await response.json();
   const raw=data?.choices?.[0]?.message?.content||'';
   let parsed;try{parsed=JSON.parse(raw)}catch(_){return fail(res,502,'DeepSeek did not return valid suggestions. Retry once or use manual editing.');}
   const clips=Array.isArray(parsed.clips)?parsed.clips.slice(0,3).map(item=>{
     const a=clipNumber(item?.start),b=clipNumber(item?.end);
     if(!Number.isFinite(a)||!Number.isFinite(b))return null;
     const c=Math.max(start,Math.min(end, a)),d=Math.max(start,Math.min(end,b));
     if(d-c<.2||d-c>20)return null;
     return {start:Number(c.toFixed(2)),end:Number(d.toFixed(2)),label:clean(item.label,80),reason:clean(item.reason,240)};
   }).filter(Boolean):[];
   return res.status(200).json({clips,disclaimer:'Sparse still-frame suggestions; manually inspect and refine.'});
 }catch(e){return fail(res,504,e?.name==='AbortError'?'DeepSeek did not respond in 45 seconds.':'Unable to reach DeepSeek. Try later.');}
 finally{clearTimeout(timeout);}
};
