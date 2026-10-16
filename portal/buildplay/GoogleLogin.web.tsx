import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { createApi } from './api';
import type { GoogleLoginProps } from './GoogleLogin';

type GoogleIdentity = {
  initialize(options: {client_id: string; callback(response: {credential: string}): void; auto_select: boolean}): void;
  renderButton(element: HTMLElement, options: {theme: string; size: string; width: number}): void;
};
function identityApi(): GoogleIdentity | undefined {
  return (window as unknown as {google?: {accounts?: {id?: GoogleIdentity}}}).google?.accounts?.id;
}
let loading: Promise<void> | undefined;
function loadGoogle(): Promise<void> {
  if (identityApi()) return Promise.resolve();
  if (!loading) loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => { script.remove(); reject(new Error('Google sign-in timed out. Check your connection and retry.')); }, 15000);
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true; script.defer = true;
    script.onload = () => { clearTimeout(timeout); if (identityApi()) resolve(); else reject(new Error('Google sign-in is unavailable')); };
    script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('Could not load Google sign-in. Check your connection.')); };
    document.head.appendChild(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}

export default function GoogleLogin({server, onSuccess}: GoogleLoginProps) {
  const holder = useRef<HTMLDivElement>(null);
  const callback = useRef(onSuccess); callback.current = onSuccess;
  const submitting = useRef(false);
  const [message, setMessage] = useState('Loading Google sign-in…');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const element = holder.current;
    element?.replaceChildren();
    setMessage('Loading Google sign-in…');
    void (async () => {
      const api = createApi(server); // Never link/merge a previous account implicitly.
      const config = await api.authConfig();
      if (!config.google_client_id) throw new Error('Google login is not configured on this BuildPlay server.');
      await loadGoogle();
      if (cancelled || !element) return;
      const google = identityApi()!;
      google.initialize({client_id: config.google_client_id, auto_select: false,
        callback: response => {
          if (cancelled || submitting.current) return;
          submitting.current = true; setMessage('Signing in to BuildPlay…');
          void (async () => {
            if (!response.credential) throw new Error('Google did not return an ID token');
            const auth = await api.googleLogin(response.credential);
            if (!auth.user_id || !auth.password) throw new Error('BuildPlay returned an invalid account response');
            if (!cancelled) await callback.current(auth);
          })().catch(error => { if (!cancelled) setMessage(String(error)); })
            .finally(() => { submitting.current = false; });
        }});
      google.renderButton(element, {theme:'outline',size:'large',width:280});
      setMessage('Sign in with your Google account. No Google password is stored by this app.');
    })().catch(error => { if (!cancelled) setMessage(String(error)); });
    return () => { cancelled = true; element?.replaceChildren(); };
  }, [server, retry]);
  return <View style={{gap:12}}>
    <div ref={holder} style={{minHeight:44}} />
    <Text accessibilityLiveRegion="polite">{message}</Text>
    <Text>If Google reports an unauthorized origin, the course OAuth administrator must allow {window.location.origin}. Logging into the separate BuildPlay website does not automatically log this portal in.</Text>
    <Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={{padding:12}}><Text>Retry Google sign-in</Text></Pressable>
  </View>;
}
