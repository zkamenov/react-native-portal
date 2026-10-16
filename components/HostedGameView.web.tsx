import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  code: string;
  stateMessage: Record<string, unknown>;
  readOnly?: boolean;
  onMove: (message: Record<string, unknown>) => void;
};

export default function HostedGameView({ code, stateMessage, readOnly = false, onMove }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || readOnly) return;
      if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return;
      onMove(event.data as Record<string, unknown>);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMove, readOnly]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(stateMessage, '*');
  }, [stateMessage]);

  return (
    <View style={styles.container}>
      <iframe
        ref={frame}
        title="Hosted game"
        srcDoc={code}
        sandbox="allow-scripts"
        style={frameStyle}
        onLoad={() => frame.current?.contentWindow?.postMessage(stateMessage, '*')}
        aria-readonly={readOnly}
      />
      {readOnly ? <View style={styles.readOnlyOverlay} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 520, position: 'relative' },
  readOnlyOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
});

const frameStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 520,
  border: 'none',
  backgroundColor: '#fff',
};
