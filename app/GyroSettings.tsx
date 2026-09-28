"use client";
// Stage 0: the gyro aim switch. Connecting has to come from a click (the browser's device picker);
// a controller this site was allowed before is reopened on load without asking.
import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import {GYRO,sharedGyro} from '../src/player/gyro.mjs';

const LABEL:Record<string,string>={off:'未接続',calibrating:'補正中（コントローラーを置いてください）',on:'接続中',error:'接続できませんでした',unsupported:'このブラウザは非対応（Chrome / Edge）'};

export default function GyroSettings(){
 // Made after mounting: the server has no navigator, and the first render has to match its HTML.
 const [gyro,setGyro]=useState<any>(null);
 const [,tick]=useState(0);
 useEffect(()=>{const g=sharedGyro();setGyro(g);const off=g.onStatus(()=>tick(n=>n+1));if(g.settings.enabled)g.resume();return ()=>{off();};},[]);
 if(!gyro)return <><h2>ジャイロ照準</h2><p className="note">読み込み中…</p></>;
 const s=gyro.settings,refresh=()=>tick(n=>n+1);
 const toggle=async(on:boolean)=>{gyro.configure({enabled:on});refresh();if(on&&!gyro.connected){if(!(await gyro.resume()))await gyro.connect();}refresh();};
 return <><h2>ジャイロ照準</h2><div className="modules gyro-settings">
  <label><span>ジャイロ照準<small>{LABEL[gyro.status]??gyro.status}</small></span><Switch checked={s.enabled&&gyro.connected} disabled={gyro.status==='unsupported'} onCheckedChange={toggle} aria-label="ジャイロ照準"/></label>
  <div className="segmented" role="group" aria-label="ジャイロが効くとき">{[['aim','構え中のみ'],['always','常時']].map(([id,label])=><button key={id} aria-pressed={s.mode===id} onClick={()=>{gyro.configure({mode:id});refresh();}}>{label}</button>)}</div>
  <label className="gyro-sens"><span>感度 <b>{s.sensitivity.toFixed(2)}</b></span><input type="range" min={GYRO.sensitivity.min} max={GYRO.sensitivity.max} step={.05} value={s.sensitivity} onChange={e=>{gyro.configure({sensitivity:Number(e.target.value)});refresh();}} aria-label="ジャイロ感度"/></label>
  <label><span>左右反転</span><Switch checked={s.invertX} onCheckedChange={v=>{gyro.configure({invertX:v});refresh();}} aria-label="ジャイロ左右反転"/></label>
  <label><span>上下反転</span><Switch checked={s.invertY} onCheckedChange={v=>{gyro.configure({invertY:v});refresh();}} aria-label="ジャイロ上下反転"/></label>
 </div><p className="note">Switch Pro コントローラーを USB か Bluetooth でつなぎ、オンにして一覧から選びます。既定は ZL で構えている間だけ効きます。オンにした直後の約0.5秒は机に置いて静止させてください（ずれの補正）。</p></>;
}
