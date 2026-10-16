import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
export default function OfflineStatus() {
  const [status,setStatus]=useState('Preparing offline startup…');
  const [waiting,setWaiting]=useState<ServiceWorker|null>(null);
  const [help,setHelp]=useState(false);
  useEffect(()=>{
    if(!('serviceWorker' in navigator)||!window.isSecureContext){setStatus('Offline startup needs HTTPS (or localhost).');return;}
    let alive=true,registration:ServiceWorkerRegistration|undefined;
    const update=()=>{if(alive)setWaiting(registration?.waiting??null);};
    const timeout=setTimeout(()=>{if(alive)setStatus('Offline startup is not ready. Use the deployed website and reload while online.');},25000);
    navigator.serviceWorker.ready.then(r=>{
      registration=r;if(!alive)return;clearTimeout(timeout);
      setStatus('Offline startup ready on this device.');update();
      r.addEventListener('updatefound',()=>{r.installing?.addEventListener('statechange',update);});
    }).catch(()=>{if(alive)setStatus('Could not prepare offline startup. Reconnect and reload.');});
    return()=>{alive=false;clearTimeout(timeout);};
  },[]);
  return <View style={{paddingHorizontal:16,paddingVertical:8,gap:8}}>
    <Text accessibilityLiveRegion="polite" style={{color:'#475569'}}>{status}</Text>
    <Pressable accessibilityRole="button" style={{minHeight:44,justifyContent:'center'}} onPress={()=>setHelp(v=>!v)}><Text style={{color:'#1e3a8a'}}>Install on phone / offline instructions</Text></Pressable>
    {help&&<Text>iPhone: open this website in Safari → Share → Add to Home Screen. Android: open in Chrome → menu → Install app / Add to Home screen. While online, wait for “Offline startup ready”, download games and open your matches. Then close the app, enable airplane mode and reopen the saved home-screen app. Google login and first downloads need internet.</Text>}
    {waiting&&<Pressable accessibilityRole="button" style={{minHeight:44}} onPress={()=>{
      navigator.serviceWorker.addEventListener('controllerchange',()=>window.location.reload(),{once:true});
      waiting.postMessage({type:'ACTIVATE_UPDATE'});
    }}><Text>New version downloaded — reload when your move is saved</Text></Pressable>}
  </View>;
}
