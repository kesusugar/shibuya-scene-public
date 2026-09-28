import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
export const STATIC_SCHEMA=1;
// Only inputs used while baking geometry belong here. Runtime rendering, motion and
// choreography changes must not discard the expensive ground/network artifact.
export const STATIC_ROOTS=['src/ground/model.mjs','src/buildings/model.mjs','src/station/model.mjs','src/station-detail/model.mjs','src/signs/model.mjs','src/streetscape/model.mjs','src/traffic/graph.mjs','src/life/network.mjs','src/quality/static-context.mjs'];
// The only installed packages the baked modules import. Their versions belong in the key
// because a geometry library upgrade changes the artifact; the rest of package-lock.json
// does not, and hashing the whole file made the key machine-dependent: npm rewrites the
// lock's 200-odd platform-specific entries per operating system, so a pack baked on one
// machine was rejected on every other one and the scene silently rebuilt 18 MB of geometry
// at runtime on every load.
export const GEOMETRY_PACKAGES=['three','polygon-clipping'];
export const LOCK_FILE='package-lock.json';
export function geometryPackageVersions(root){
 const lock=JSON.parse(readFileSync(resolve(root,LOCK_FILE),'utf8'));
 return GEOMETRY_PACKAGES.map(name=>{
  const version=lock.packages?.['node_modules/'+name]?.version;
  if(!version)throw Error('No locked version for geometry package '+name);
  return name+'@'+version;
 });
}
export function staticModelKey(root){
 const files=new Set(['public/data/shibuya-scene-data.json']);
 function visit(file){if(files.has(file))return;files.add(file);const text=readFileSync(resolve(root,file),'utf8');for(const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)){if(match[1].startsWith('.'))visit(relative(root,resolve(root,dirname(file),match[1])).replaceAll('\\','/'));}}
 STATIC_ROOTS.forEach(visit);
 const packages=geometryPackageVersions(root);
 const hash=createHash('sha256').update(String(STATIC_SCHEMA));
 for(const spec of packages)hash.update(spec);
 const sorted=[...files].sort();
 for(const file of sorted)hash.update(file).update(readFileSync(resolve(root,file)));
 // `files` is what the key hashes; `watch` additionally covers the lock, so a dependency
 // bump still invalidates the virtual module even though its bytes are not in the hash.
 return {key:hash.digest('hex'),files:sorted,packages,watch:[...sorted,LOCK_FILE]};
}
export function staticModelVersionPlugin(root){
 const id='\0virtual:shibuya-static-key';
 return {name:'shibuya-static-version',resolveId(source){if(source==='virtual:shibuya-static-key')return id;},load(source){if(source===id)return 'export default '+JSON.stringify(staticModelKey(root).key);},handleHotUpdate(ctx){const paths=staticModelKey(root).watch.map(f=>resolve(root,f));if(paths.includes(resolve(ctx.file))){const mod=ctx.server.moduleGraph.getModuleById(id);if(mod)ctx.server.moduleGraph.invalidateModule(mod);ctx.server.ws.send({type:'full-reload'});}}};
}
