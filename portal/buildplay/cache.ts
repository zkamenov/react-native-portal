import { Game } from './types';

type FetchAsset = (url: string) => Promise<{ bytes: Uint8Array; mime: string }>;
function utf8(bytes:Uint8Array):string {
  if(typeof TextDecoder!=='undefined')return new TextDecoder().decode(bytes);
  return decodeURIComponent(Array.from(bytes,b=>'%'+b.toString(16).padStart(2,'0')).join(''));
}
function base64(bytes: Uint8Array): string {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result='';
  for(let i=0;i<bytes.length;i+=3) {
    const a=bytes[i],b=bytes[i+1],c=bytes[i+2];
    result+=alphabet[a>>2]+alphabet[((a&3)<<4)|((b??0)>>4)]
      +(b===undefined?'=':alphabet[((b&15)<<2)|((c??0)>>6)])+(c===undefined?'=':alphabet[c&63]);
  }
  return result;
}
const download: FetchAsset = async url => {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try {
    // No BuildPlay credentials are ever sent to game asset hosts.
    const response=await fetch(url,{credentials:'omit',signal:controller.signal});
    if(!response.ok)throw new Error(`Asset download failed (${response.status}): ${url}`);
    const bytes=new Uint8Array(await response.arrayBuffer());
    return {bytes,mime:response.headers.get('content-type')?.split(';')[0]??'application/octet-stream'};
  } finally {clearTimeout(timer);}
};
async function replaceAsync(text:string, pattern:RegExp, replace:(match:RegExpMatchArray)=>Promise<string>):Promise<string> {
  let result='',end=0;
  for(const match of text.matchAll(pattern)) {
    result+=text.slice(end,match.index)+await replace(match);
    end=match.index!+match[0].length;
  }
  return result+text.slice(end);
}

// Bundle declarative assets into the HTML instead of relying on an HTTP cache.
// Dynamically constructed fetches, module imports, workers and frames cannot be
// safely made offline from an opaque HTML string; report those games explicitly.
export async function prepareGame(game:Game,server:string,fetchAsset:FetchAsset=download):Promise<Game> {
  if(typeof game.code!=='string'||!game.code.trim())throw new Error('No game HTML returned');
  const seen=new Map<string,Promise<{bytes:Uint8Array;mime:string}>>();
  let total=0;
  async function asset(raw:string,base:string) {
    const url=new URL(raw,base);
    if(!['http:','https:'].includes(url.protocol))throw new Error('Unsupported game asset URL');
    const key=url.href;
    if(!seen.has(key)) {
      if(seen.size>=64)throw new Error('Game has too many external assets for offline caching');
      seen.set(key,fetchAsset(key).then(value=>{
        total+=value.bytes.length;
        if(total>8*1024*1024)throw new Error('Game assets exceed the 8 MB offline cache limit');
        return value;
      }));
    }
    return {...await seen.get(key)!,url:key};
  }
  function checkScript(script:string) {
    if(/\b(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\s*\(|import\s*\(|importScripts\s*\(|new\s+(?:SharedWorker|Worker)\s*\()/i.test(script)
      || /\b(?:import|export)\s+(?:["'{*]|\w)/.test(script)) {
      throw new Error('This game requires network or module code. Offline caching needs a self-contained Builder export.');
    }
  }
  async function css(source:string,base:string,depth=0):Promise<string> {
    if(depth>6)throw new Error('Stylesheet imports are too deeply nested');
    source=await replaceAsync(source,/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*([^;]*);/gi,async m=>{
      const value=await asset(m[1],base);
      const nested=await css(utf8(value.bytes),value.url,depth+1);
      return m[2].trim()?`@media ${m[2]}{${nested}}`:nested;
    });
    return replaceAsync(source,/url\(\s*(["']?)([^)'"\s]+)\1\s*\)/gi,async m=>{
      if(/^(data:|blob:|#)/i.test(m[2]))return m[0];
      const value=await asset(m[2],base);
      return `url("data:${value.mime};base64,${base64(value.bytes)}")`;
    });
  }
  let code=game.code;
  if(/<(?:iframe|frame|object|embed)\b|\bsrcset\s*=|<script\b[^>]*\btype\s*=\s*["']module["']/i.test(code)) {
    throw new Error('This game uses frames, responsive assets or modules that need a self-contained offline export.');
  }
  for(const m of code.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi))checkScript(m[1]);
  code=await replaceAsync(code,/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script\s*>/gi,async m=>{
    const value=await asset(m[2],server+'/');
    const script=utf8(value.bytes);checkScript(script);
    return '<script>'+script.replace(/<\/script/gi,'<\\/script')+'</script>';
  });
  code=await replaceAsync(code,/<link\b[^>]*>/gi,async m=>{
    if(!/\brel\s*=\s*["']stylesheet["']/i.test(m[0]))return m[0];
    const href=/\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0]);
    if(!href)return m[0];
    const value=await asset(href[1],server+'/');
    return '<style>'+ (await css(utf8(value.bytes),value.url)).replace(/<\/style/gi,'<\\/style')+'</style>';
  });
  code=await replaceAsync(code,/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi,async m=>'<style>'+await css(m[1],server+'/')+'</style>');
  code=await replaceAsync(code,/<(?:img|audio|video|source)\b[^>]*>/gi,async m=>replaceAsync(m[0],/\b(src|poster)\s*=\s*(["'])([^"']+)\2/gi,async a=>{
    if(/^(data:|blob:)/i.test(a[3]))return a[0];
    const value=await asset(a[3],server+'/');
    return `${a[1]}="data:${value.mime};base64,${base64(value.bytes)}"`;
  }));
  code=await replaceAsync(code,/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi,async m=>{
    const value=await css(m[2],server+'/');
    return `style=${m[1]}${value.replace(new RegExp(m[1],'g'),m[1]==='"'?'&quot;':'&#39;')}${m[1]}`;
  });
  // A conservative check catches unquoted asset attributes left by unusual HTML.
  if(/<(?:script|img|source|audio|video)\b[^>]*\bsrc\s*=\s*(?!["']?(?:data:|blob:))[a-z/]/i.test(code)) {
    throw new Error('An external asset could not be embedded. Use a self-contained HTML game.');
  }
  return {...game,offlineCode:code,cachedAt:new Date().toISOString()};
}
