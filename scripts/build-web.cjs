const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
if (!process.argv.includes('--finalize-only')) {
  const result = spawnSync(process.execPath, [require.resolve('expo/bin/cli'), 'export', '--platform', 'web'], {cwd:root,stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
const dist = path.join(root, 'dist');
const htmlPath = path.join(dist, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
if (!html.includes('gameportal-sw-registration')) html = html.replace('</body>',
  '<script id="gameportal-sw-registration">if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(e){console.warn("Offline startup unavailable",e)})})}</script></body>');
html = html.replace(/<title>.*?<\/title>/, '<title>GamePortal</title>');
if(!html.includes('manifest.webmanifest'))html=html.replace('</head>',
  '<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#2855c5"><meta name="apple-mobile-web-app-capable" content="yes"></head>');
fs.writeFileSync(path.join(dist,'icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#2855c5"/><path d="M112 112l120 120m0-120L112 232" stroke="white" stroke-width="28" stroke-linecap="round"/><circle cx="338" cy="338" r="62" fill="none" stroke="white" stroke-width="28"/></svg>');
fs.writeFileSync(path.join(dist,'manifest.webmanifest'),JSON.stringify({name:'GamePortal',short_name:'GamePortal',start_url:'/',scope:'/',display:'standalone',background_color:'#f6f8fc',theme_color:'#2855c5',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]}));
fs.writeFileSync(htmlPath,html);
function walk(directory) {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry => entry.isDirectory()
    ? walk(path.join(directory,entry.name)) : [path.join(directory,entry.name)]);
}
const files=walk(dist).filter(file=>!['sw.js','_headers'].includes(path.basename(file)));
const hash=crypto.createHash('sha256');
for(const file of files) hash.update(fs.readFileSync(file));
const name='gameportal-shell-'+hash.digest('hex').slice(0,16);
const urls=['/',...files.map(file=>'/'+path.relative(dist,file).split(path.sep).join('/'))];
fs.writeFileSync(path.join(dist,'sw.js'),`
const CACHE=${JSON.stringify(name)};
const FILES=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('gameportal-shell-')&&key!==CACHE).map(key=>caches.delete(key)))),
  self.clients.claim()
])));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(cache=>cache.match('/index.html'))));
    return;
  }
  if(FILES.includes(url.pathname))event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request).then(hit=>hit||fetch(event.request))));
});
`);
fs.writeFileSync(path.join(dist,'_headers'),'/sw.js\n  Cache-Control: no-cache\n/*\n  Referrer-Policy: strict-origin-when-cross-origin\n  Cross-Origin-Opener-Policy: same-origin-allow-popups\n');
console.log('Web export prepared; offline app shell:',name);
