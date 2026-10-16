import { useEffect, useMemo, useRef } from 'react';
import type { RunnerProps } from './GameRunner';
import { offlineDocument } from './document';
import { parseMove, stateChanged } from './protocol';

export default function GameRunner({ code, match, userId, onMove, onError }: RunnerProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const consumed = useRef(false);
  const message = JSON.stringify(stateChanged(match, userId));
  const latest = useRef(message);
  latest.current = message;
  const document = useMemo(() => offlineDocument(code), [code]);
  function send() {
    consumed.current = false;
    frame.current?.contentWindow?.postMessage(JSON.parse(latest.current), '*');
  }
  useEffect(() => { if (ready.current) send(); }, [message]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (!ready.current || event.source !== frame.current?.contentWindow || consumed.current) return;
      try { const move = parseMove(event.data); consumed.current = true;
        Promise.resolve(onMove(move)).catch(error => { onError(String(error)); send(); }); }
      catch (error) { onError(String(error)); }
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onMove, onError]);
  return <iframe ref={frame} title="BuildPlay game" sandbox="allow-scripts" srcDoc={document}
    referrerPolicy="no-referrer" style={{ width: '100%', flex: 1, minHeight: 420, border: 0 }}
    onLoad={() => { ready.current = true; send(); }} />;
}
