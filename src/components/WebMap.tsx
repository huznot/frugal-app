import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

// Android map: MapLibre GL + OpenFreeMap vector tiles inside a WebView. No Google Maps key, so it
// works the same in Expo Go and in the Play Store build (Google's map in Expo Go on Android has
// been blank since SDK 55 — a known Expo Go key issue).

export type WebMapStore = { id: string; lat: number; lon: number; name: string; logo?: string; mono: string; bg: string; fg: string };

type Props = {
  center: { lat: number; lon: number };
  user: { lat: number; lon: number };
  stores: WebMapStore[];
  selectedId?: string;
  recenter: number; // bump to fly back to the user
  dark: boolean;
  onSelect: (id: string) => void;
  onMapPress: () => void;
  onMoved: (lat: number, lon: number) => void;
};

const html = (center: { lat: number; lon: number }, dark: boolean) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link href="https://cdn.jsdelivr.net/npm/maplibre-gl@5/dist/maplibre-gl.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@5/dist/maplibre-gl.js"></script>
<style>
html,body,#map{margin:0;height:100%;width:100%;background:${dark ? '#1c1c1c' : '#f2efe9'}}
.m{width:34px;height:34px;border-radius:11px;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.22);display:flex;align-items:center;justify-content:center;overflow:hidden;padding:2px;box-sizing:border-box;transition:transform .15s}
.m.sel{transform:scale(1.3);box-shadow:0 0 0 3px #FF5050,0 4px 12px rgba(0,0,0,.3)}
.m img{width:84%;height:84%;object-fit:contain}
.m .mono{width:100%;height:100%;border-radius:9px;display:flex;align-items:center;justify-content:center;font:700 12px system-ui}
.maplibregl-marker:has(.sel){z-index:2}
.you{width:18px;height:18px;border-radius:50%;background:#3F7BFF;border:3px solid #fff;box-shadow:0 0 0 8px rgba(63,123,255,.22)}
.maplibregl-ctrl-attrib{font-size:10px}
</style></head><body><div id="map"></div><script>
const post=(m)=>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m));
const map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[${center.lon},${center.lat}],zoom:12.5,attributionControl:{compact:true}});
let markers={},you=null,selected=null,moving=false;
map.on('click',()=>post({type:'press'}));
map.on('moveend',(e)=>{if(e.originalEvent){const c=map.getCenter();post({type:'moved',lat:c.lat,lon:c.lng});}});
// MapLibre positions a marker by setting transform on the element it's given, so the styled badge
// (with its scale transition) sits inside a plain wrapper. Otherwise every pan/zoom gets animated
// and the markers lag and wobble behind the map.
function el(s){const w=document.createElement('div');const d=document.createElement('div');d.className='m';w.appendChild(d);
  if(s.logo){const i=document.createElement('img');i.src=s.logo;i.onerror=()=>{d.innerHTML='<div class="mono" style="background:'+s.bg+';color:'+s.fg+'">'+s.mono+'</div>'};d.appendChild(i);}
  else d.innerHTML='<div class="mono" style="background:'+s.bg+';color:'+s.fg+'">'+s.mono+'</div>';
  w.addEventListener('click',(e)=>{e.stopPropagation();post({type:'select',id:s.id});});return w;}
window.frugal={
  setStores(list){const keep={};for(const s of list){const k=s.id+'|'+(s.logo||'');if(markers[k]){keep[k]=markers[k];delete markers[k];continue;}
    keep[k]=new maplibregl.Marker({element:el(s)}).setLngLat([s.lon,s.lat]).addTo(map);keep[k]._id=s.id;}
    for(const k in markers)markers[k].remove();markers=keep;this.setSelected(selected);},
  setSelected(id){selected=id;for(const k in markers){markers[k].getElement().firstChild.classList.toggle('sel',markers[k]._id===id);}},
  setUser(lat,lon){if(!you){const d=document.createElement('div');d.className='you';you=new maplibregl.Marker({element:d}).setLngLat([lon,lat]).addTo(map);}else you.setLngLat([lon,lat]);},
  flyTo(lat,lon){map.flyTo({center:[lon,lat],zoom:12.5,duration:500});}
};
// Markers can be added before tiles finish loading, so don't wait for the full 'load' event.
post({type:'ready'});
</script></body></html>`;

export default function WebMap({ center, user, stores, selectedId, recenter, dark, onSelect, onMapPress, onMoved }: Props) {
  const ref = useRef<WebView>(null);
  const ready = useRef(false);
  // The page is built once (initial center); later updates are pushed in with injectJavaScript.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ html: html(center, dark) }), [dark]);
  const run = (js: string) => ready.current && ref.current?.injectJavaScript(`${js};true;`);

  const pushAll = () => {
    run(`window.frugal.setUser(${user.lat},${user.lon})`);
    run(`window.frugal.setStores(${JSON.stringify(stores)})`);
    run(`window.frugal.setSelected(${JSON.stringify(selectedId ?? null)})`);
  };

  useEffect(() => {
    run(`window.frugal.setStores(${JSON.stringify(stores)})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);
  useEffect(() => {
    run(`window.frugal.setSelected(${JSON.stringify(selectedId ?? null)})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
  useEffect(() => {
    run(`window.frugal.setUser(${user.lat},${user.lon})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.lat, user.lon]);
  useEffect(() => {
    if (recenter) run(`window.frugal.flyTo(${user.lat},${user.lon})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenter]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: any;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m.type === 'ready') {
      ready.current = true;
      pushAll();
    } else if (m.type === 'select') onSelect(m.id);
    else if (m.type === 'press') onMapPress();
    else if (m.type === 'moved') onMoved(m.lat, m.lon);
  };

  return (
    <WebView
      ref={ref}
      source={source}
      style={StyleSheet.absoluteFill}
      originWhitelist={['*']}
      onMessage={onMessage}
      onLoadStart={() => (ready.current = false)}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      overScrollMode="never"
      androidLayerType="hardware"
    />
  );
}
