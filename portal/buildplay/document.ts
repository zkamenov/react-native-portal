// Inherited by srcdoc frames: games can run inline code, but cannot fetch network
// resources, navigate the host, submit forms, or access the portal's origin/storage.
export const gamePolicy = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
export function offlineDocument(code: string): string {
  return '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="' + gamePolicy + '">' + code;
}

export function nativeDocument(code: string): string {
  // Keep arbitrary game HTML out of the host's script and DOM.
  const encoded = JSON.stringify(offlineDocument(code)).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}body{overflow:hidden}</style></head><body><iframe id="game" sandbox="allow-scripts"></iframe><script>
  const frame=document.getElementById('game');
  window.__portalState=function(message){frame.contentWindow.postMessage(message,'*')};
  window.addEventListener('message',function(event){
    if(event.source===frame.contentWindow && event.data && event.data.type==='make_move')
      window.ReactNativeWebView.postMessage(JSON.stringify(event.data));
  });
  frame.addEventListener('load',function(){window.ReactNativeWebView.postMessage('{"type":"runner_ready"}')});
  frame.srcdoc=${encoded};
  </script></body></html>`;
}
