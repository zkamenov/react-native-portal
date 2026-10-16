const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const dist=path.join(__dirname,'../dist');
test('production app shell precaches exported files and opens with failed network',async()=>{
  const events=new Map(),stores=new Map();let online=true;
  const read=url=>({body:fs.readFileSync(path.join(dist,url==='/'?'index.html':url.slice(1)),'utf8')});
  const caches={open:async name=>{
    if(!stores.has(name))stores.set(name,new Map());const values=stores.get(name);
    return {addAll:async urls=>{for(const url of urls)values.set(url,read(url));},match:async request=>values.get(typeof request==='string'?request:new URL(request.url).pathname)};
  },keys:async()=>[...stores.keys()],delete:async key=>stores.delete(key)};
  vm.runInNewContext(fs.readFileSync(path.join(dist,'sw.js'),'utf8'),{URL,caches,
    fetch:async request=>{if(!online)throw Error('airplane');return read(new URL(request.url).pathname);},
    self:{location:{origin:'https://portal.test'},clients:{claim:async()=>{}},addEventListener:(name,callback)=>events.set(name,callback),skipWaiting:async()=>{}},
  });
  let pending;events.get('install')({waitUntil:p=>{pending=p}});await pending;
  online=false;let response;
  events.get('fetch')({request:{url:'https://portal.test/',method:'GET',mode:'navigate'},respondWith:p=>{response=p}});
  assert.match((await response).body,/gameportal-sw-registration/);
  const js=fs.readdirSync(path.join(dist,'_expo/static/js/web'))[0];
  events.get('fetch')({request:{url:'https://portal.test/_expo/static/js/web/'+js,method:'GET',mode:'cors'},respondWith:p=>{response=p}});
  assert.ok((await response).body.length>1000);
  events.get('fetch')({request:{url:'https://buildplay.fun/auth/google',method:'POST'},respondWith:()=>assert.fail('never cache credentials or backend requests')});
});
test('web manifest supplies a standalone phone entry point',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(dist,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');
  assert.ok(manifest.icons.length>0);
});
