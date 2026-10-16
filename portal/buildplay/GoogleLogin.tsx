import { Text, View } from 'react-native';
import type { AuthResponse } from './types';

export type GoogleLoginProps = { server: string; onSuccess(auth: AuthResponse): Promise<void> };
export default function GoogleLogin(_props: GoogleLoginProps) {
  return <View><Text>Google login on iOS and Android requires a native OAuth client and development build configuration. Use the Web version for this milestone. Existing saved sessions remain available offline.</Text></View>;
}
