import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

type Props = {
  code: string;
  stateMessage: Record<string, unknown>;
  readOnly?: boolean;
  onMove: (message: Record<string, unknown>) => void;
};

const bridgeScript = `
  (function() {
    if (!window.ReactNativeWebView) return;
    window.parent.postMessage = function(message) {
      window.ReactNativeWebView.postMessage(typeof message === 'string' ? message : JSON.stringify(message));
    };
  })();
  true;
`;

export default function HostedGameView({
  code,
  stateMessage,
  readOnly = false,
  onMove,
}: Props) {
  const webView = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) {
      webView.current?.injectJavaScript(
        `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(stateMessage)}, source: window.parent })); true;`,
      );
    }
  }, [loaded, stateMessage]);

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const message: unknown = JSON.parse(event.nativeEvent.data);
      if (message && typeof message === 'object' && !Array.isArray(message)) {
        const record = message as Record<string, unknown>;
        if (!readOnly) {
          onMove(record);
        }
      }
    } catch (error) {
      console.error('Could not read a hosted game message:', error);
    }
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webView}
        source={{ html: code, baseUrl: 'https://buildplay.fun/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled
        injectedJavaScriptBeforeContentLoaded={bridgeScript}
        onMessage={handleMessage}
        onLoadEnd={() => setLoaded(true)}
        pointerEvents={readOnly ? 'none' : 'auto'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 400 },
});
