// PLAN-LOOKS-AND-FLEET §0 and Step D, PLAN-POLICE-AND-OWN-CAR §1: cars are "inspired by" only.
// No real maker, model, body-kit or film name, and no real police agency or emblem, anywhere in
// the shipped code. The "inspired by" column of the plans lives in docs/, never in src/.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {VEHICLES} from '../src/traffic/config.mjs';

// Unambiguous: matched case-insensitively anywhere.
const BANNED=[
 'toyota','nissan','mazda','honda','mitsubishi','subaru','suzuki','daihatsu','lexus','infiniti',
 'hiace','alphard','vellfire','voxy','noah','serena','silvia','lancer','supra','prius',
 // Chassis codes like s15 or r34 are left out: this repo's stage ids are s1..s16.
 'n-box','nbox','tanto','spacia','veilside','fd3s','fc3s',
 'fast & furious','fast and furious','furious','tokyo drift','jpn taxi','jpntaxi',
 '警視庁','旭日章','旭日','桜の代紋','トヨタ','日産','マツダ','ホンダ','スバル','スズキ','ダイハツ',
 'ハイエース','アルファード','ヴォクシー','シルビア','スカイライン','クラウン','ランエボ','ワイルド・スピード'
];
// Words that are also ordinary English in this codebase (a building's crown, a city skyline):
// banned only as a proper noun or as a model code.
const PROPER=[/\bSkyline\b/,/\bCrown (class|sedan|patrol)\b/i,/\bGT-?R\b/,/\bRX-?[78]\b/,/\b350Z\b/];

function files(dir,out=[]){
 for(const name of readdirSync(dir)){
  const p=join(dir,name),s=statSync(p);
  if(s.isDirectory())files(p,out);
  else if(/\.(mjs|js|ts|tsx|json|glsl)$/.test(name))out.push(p);
 }
 return out;
}

test('no real car maker, model, kit, film or agency name in src/ or app/',()=>{
 const hits=[];
 for(const file of [...files('src'),...files('app')]){
  const text=readFileSync(file,'utf8'),lower=text.toLowerCase();
  for(const word of BANNED){
   // `noah` and `s15`-style codes need word boundaries; plain words are matched as substrings.
   const re=new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\&]/g,'\\$&')}($|[^a-z0-9])`,'i');
   if(/^[\x00-\x7f]+$/.test(word)?re.test(lower):text.includes(word))hits.push(`${file}: ${word}`);
  }
  for(const re of PROPER)if(re.test(text))hits.push(`${file}: ${re}`);
 }
 assert.deepEqual(hits,[],'real names in shipped code:\n'+hits.join('\n'));
});

test('every vehicle type and label is fictional',()=>{
 for(const [id,def] of Object.entries(VEHICLES)){
  for(const s of [id,def.name??''])for(const word of BANNED)
   assert.ok(!s.toLowerCase().includes(word),`${id}: ${s} uses ${word}`);
 }
 // The new classes carry a made-up name for UI and docs.
 for(const id of ['longVan','minivan','tallKei','cityTaxi','truck2t','police','coupe'])
  assert.ok(VEHICLES[id]?.name,`${id} has no fictional name`);
});

test('the guard itself catches a real name',()=>{
 const re=new RegExp('(^|[^a-z0-9])hiace($|[^a-z0-9])','i');
 assert.ok(re.test('const van = "HiAce"'.toLowerCase()));
 assert.ok(!/\bSkyline\b/.test('the city skyline'));
});

// PLAN-WEAPONS §2: generic shapes only -- a pistol, a revolver, a katana. No real gun maker or
// model, in any language, anywhere in shipped code.
const GUNS=['glock','smith & wesson','smith and wesson','s&w','new nambu','nambu','beretta','colt','walther',
 'sig sauer','ruger','makarov','tokarev','desert eagle','magnum','chiefs special','heckler','kimber','taurus',
 'ニューナンブ','グロック','ベレッタ','コルト','ワルサー','スミス&ウェッソン','スミス＆ウェッソン','マグナム'];
// Words that are also ordinary elsewhere: SAKURA is a common name, and a reconstructed Center-gai
// sign already reads サクラ美容外科 (a fictional clinic). As a revolver's model name it is banned
// in the weapon code, which is where it could only mean the gun. So are model codes like M360.
const WEAPON_FILES=/(weapon|ballistic|arsenal|gunfire|police)/;
const WEAPON_ONLY=[/sakura/i,/サクラ/,/\bM ?360J?\b/,/\bM ?37\b/,/\bP ?226\b/,/\bG ?17\b/];

test('no real gun maker or model name in src/ or app/ (PLAN-WEAPONS §2)',()=>{
 const hits=[];
 for(const file of [...files('src'),...files('app')]){
  const text=readFileSync(file,'utf8'),lower=text.toLowerCase();
  for(const word of GUNS){
   const re=new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\&]/g,'\\$&')}($|[^a-z0-9])`,'i');
   if(/^[\x00-\x7f]+$/.test(word)?re.test(lower):text.includes(word))hits.push(`${file}: ${word}`);
  }
  if(WEAPON_FILES.test(file))for(const re of WEAPON_ONLY)if(re.test(text))hits.push(`${file}: ${re}`);
 }
 assert.deepEqual(hits,[],'real gun names in shipped code:\n'+hits.join('\n'));
});

test('the gun guard catches a real name and covers the weapon code',()=>{
 const re=new RegExp('(^|[^a-z0-9])s&w($|[^a-z0-9])','i');
 assert.ok(re.test('a s&w revolver'));
 assert.ok(WEAPON_ONLY[0].test('const model="SAKURA"'));
 for(const f of ['src/player/weapons.mjs','src/player/weapon-mesh.mjs','src/player/ballistics.mjs','src/audio/gunfire.mjs'])
  assert.ok(WEAPON_FILES.test(f),`${f} is not covered by the weapon-only names`);
});
