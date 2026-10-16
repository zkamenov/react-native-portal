import { useEffect, useMemo, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { nativeDocument } from './document';
import { Match, Move } from './types';
import { parseMove, stateChanged } from './protocol';

export type RunnerProps = { code: string; match: Match; userId: string;
  onMove(move: Move): void | Promise<void>; onError(message: string): void };
export default function GameRunner({ code, match, userId, onMove, onError }: RunnerProps) {
  const frame = useRef<WebView>(null);
  const ready = useRef(false);
  const consumed = useRef(false);
  const message = JSON.stringify(stateChanged(match, userId));
  const latest = useRef(message);
  latest.current = message;
  const html = useMemo(() => nativeDocument(code), [code]);
  function send() {
    consumed.current = false;
    frame.current?.injectJavaScript(`window.__portalState(${latest.current.replace(/</g, '\\u003c')});true;`);
  }
  useEffect(() => { if (ready.current) send(); }, [message]);
  return <WebView ref={frame} source={{ html }} style={{ flex: 1, minHeight: 420 }}
    originWhitelist={['about:*']} javaScriptEnabled domStorageEnabled={false}
    mixedContentMode="never" allowFileAccess={false} setSupportMultipleWindows={false}
    onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url === 'about:srcdoc'}
    onError={event => onError(event.nativeEvent.description)}
    onMessage={event => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'runner_ready') { ready.current = true; send(); return; }
        if (!ready.current || consumed.current) return;
        const move = parseMove(data);
        consumed.current = true;
        Promise.resolve(onMove(move)).catch(error => { onError(String(error)); send(); });
      } catch (error) { onError(String(error)); }
    }} />;
}
