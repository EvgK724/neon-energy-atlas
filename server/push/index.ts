import webpush from 'npm:web-push@3.6.7';
const APP='https://evgk724.github.io';
const FEED=APP+'/neon-energy-atlas/data/alerts.json';
const dbURL=Deno.env.get('SUPABASE_URL')!;
const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const dbHeaders:Record<string,string>={'apikey':secret,'Content-Type':'application/json'};
if(!secret.startsWith('sb_secret_'))dbHeaders.Authorization='Bearer '+secret;
async function db(path:string,method='GET',body?:unknown,extra={}){const r=await fetch(dbURL+'/rest/v1/'+path,{method,headers:{...dbHeaders,...extra},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw new Error('storage '+r.status);await r.arrayBuffer();return null;}
async function rows(path:string){const r=await fetch(dbURL+'/rest/v1/'+path,{headers:dbHeaders});if(!r.ok)throw Error('storage '+r.status);return await r.json();}
async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');}
function equal(a:string,b:string){if(a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0;}
async function configuration(){let [c]=await rows('atlas_push_config?id=eq.1');if(!c){const v=webpush.generateVAPIDKeys();await db('atlas_push_config','POST',{id:1,vapid_public:v.publicKey,vapid_private:v.privateKey,admin_token:crypto.randomUUID()+crypto.randomUUID()},{Prefer:'resolution=ignore-duplicates'});[c]=await rows('atlas_push_config?id=eq.1');}webpush.setVapidDetails('https://evgk724.github.io/neon-energy-atlas/',c.vapid_public,c.vapid_private);return c;}
function validSubscription(s:any){try{const u=new URL(s?.endpoint);const h=u.hostname;return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(h==='web.push.apple.com'||h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='push.services.mozilla.com')&&typeof s.keys?.p256dh==='string'&&/^[A-Za-z0-9_-]{87}$/.test(s.keys.p256dh)&&/^[A-Za-z0-9_-]{22}$/.test(s.keys.auth);}catch{return false;}}
async function send(device:any,payload:any){try{await webpush.sendNotification(device.subscription,JSON.stringify(payload),{TTL:86400,timeout:12000});return true;}catch(e){if([404,410].includes(e.statusCode))await db('atlas_push_devices?token_hash=eq.'+device.token_hash,'DELETE');return false;}}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin');const allowed=origin===APP;
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 if(allowed){headers['Access-Control-Allow-Origin']=APP;headers['Access-Control-Allow-Headers']='Content-Type';headers['Access-Control-Allow-Methods']='POST,GET,OPTIONS';}
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return allowed?new Response(null,{status:204,headers}):reply({error:'origin'},403);
 try{
  const cfg=await configuration();
  if(req.method==='GET')return reply({ok:true,publicKey:cfg.vapid_public,service:'neon-energy-atlas-push'});
  if(req.method!=='POST')return reply({error:'method'},405);
  if(Number(req.headers.get('Content-Length')||0)>10000)return reply({error:'size'},413);
  const text=await req.text();if(text.length>10000)return reply({error:'size'},413);const body=JSON.parse(text);
  if(body.action==='deliver'){
   if(!equal(req.headers.get('Authorization')||'','Bearer '+cfg.admin_token))return reply({error:'authorization'},401);
   const feed=await fetch(FEED,{cache:'no-store'});if(!feed.ok)throw Error('feed '+feed.status);const data=await feed.json();if(data.schema!==1||!Array.isArray(data.events)||data.events.length>300)throw Error('invalid feed');
   let sent=0,failed=0;const devices=await rows('atlas_push_devices?select=*');
   for(const event of data.events){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(event.id)||typeof event.title!=='string'||typeof event.body!=='string'||!Number.isFinite(Date.parse(event.publishedAt)))continue;if(Date.now()-Date.parse(event.publishedAt)>30*86400000)continue;
    await db('atlas_push_events','POST',{id:event.id,published_at:event.publishedAt,title:event.title.slice(0,120),body:event.body.slice(0,700)},{Prefer:'resolution=ignore-duplicates'});
    for(const device of devices){if(Date.parse(event.publishedAt)<Date.parse(device.created_at))continue;const done=await rows('atlas_push_deliveries?event_id=eq.'+event.id+'&token_hash=eq.'+device.token_hash);if(done.length)continue;
      const ok=await send(device,{id:event.id,title:event.title.slice(0,120),body:event.body.slice(0,700)});if(ok){await db('atlas_push_deliveries','POST',{event_id:event.id,token_hash:device.token_hash},{Prefer:'resolution=ignore-duplicates'});sent++;}else failed++;
    }
   }
   await db('atlas_push_config?id=eq.1','PATCH',{last_polled_at:new Date().toISOString()});return reply({ok:true,sent,failed,devices:devices.length});
  }
  if(!allowed)return reply({error:'origin'},403);
  if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return reply({error:'device token'},400);
  const th=await hash(body.token),[device]=await rows('atlas_push_devices?token_hash=eq.'+th);
  if(body.action==='subscribe'){
   if(!validSubscription(body.subscription))return reply({error:'invalid push subscription'},400);
   // This capability belongs to one installation. It cannot read any other subscriber.
   const eh=await hash(body.subscription.endpoint);const existing=await rows('atlas_push_devices?endpoint_hash=eq.'+eh);
   if(existing.length&&existing[0].token_hash!==th)return reply({error:'endpoint already registered'},409);
   const items=await rows('atlas_push_devices?select=token_hash&limit=101');if(!device&&items.length>=100)return reply({error:'subscription limit'},429);
   await db('atlas_push_devices?on_conflict=token_hash','POST',{token_hash:th,subscription:body.subscription,endpoint_hash:eh,last_seen_at:new Date().toISOString(),...(device?{created_at:device.created_at}: {})},{Prefer:'resolution=merge-duplicates'});return reply({ok:true});
  }
  if(!device)return reply({error:'device not subscribed'},404);
  if(body.action==='unsubscribe'){await db('atlas_push_devices?token_hash=eq.'+th,'DELETE');return reply({ok:true});}
  if(body.action==='test'){if(device.last_test_at&&Date.now()-Date.parse(device.last_test_at)<60000)return reply({error:'try in one minute'},429);await db('atlas_push_devices?token_hash=eq.'+th,'PATCH',{last_test_at:new Date().toISOString()});const sent=await send(device,{id:'atlas-test',title:'Энергия мира',body:'Тест push: уведомления этого устройства работают.'});return reply({ok:true,sent});}
  return reply({error:'unknown action'},400);
 }catch(e){return reply({error:'notification service unavailable'},503);}
});
