import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

process.env.SHIBUYA_LOCAL_NODE='1';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=await createServer({root,cacheDir:fileURLToPath(new URL('../node_modules/.vite-local/',import.meta.url)),server:{host:'127.0.0.1',port:5174,strictPort:true}});
await server.listen();
server.printUrls();
console.log('Shibuya HIGH / night: http://127.0.0.1:5174/?tier=high&time=night&camera=scramble');
