import {existsSync, mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const runtimeRoot=resolve(process.env.SITES_RUNTIME_ROOT||join(projectRoot,'.sites-runtime'));
const vinextCli=join(projectRoot,'node_modules','vinext','dist','cli.js');
const timeoutMs=Number(process.env.SITES_BUILD_TIMEOUT_MS||180000);

if(!existsSync(vinextCli)){
 console.error('vinext is unavailable. Run npm ci before building.');
 process.exit(69);
}
if(!Number.isFinite(timeoutMs)||timeoutMs<1000){
 console.error('SITES_BUILD_TIMEOUT_MS must be a finite number of at least 1000.');
 process.exit(64);
}

for(const directory of ['npm-cache','xdg-config','tmp','wrangler/logs'])mkdirSync(join(runtimeRoot,directory),{recursive:true});
const env={
 ...process.env,
 SITES_ENV_READY:'1',
 SITES_PROJECT_ROOT:projectRoot,
 XDG_CONFIG_HOME:join(runtimeRoot,'xdg-config'),
 TMPDIR:join(runtimeRoot,'tmp'),
 WRANGLER_WRITE_LOGS:'false',
 WRANGLER_LOG_PATH:join(runtimeRoot,'wrangler','logs'),
 MINIFLARE_REGISTRY_PATH:join(runtimeRoot,'wrangler','registry'),
 npm_config_cache:join(runtimeRoot,'npm-cache'),
 npm_config_audit:'false',
 npm_config_fund:'false',
 npm_config_update_notifier:'false',
};
for(const name of ['npm_config_proxy','npm_config_http_proxy','npm_config_https_proxy','NPM_CONFIG_PROXY','NPM_CONFIG_HTTP_PROXY','NPM_CONFIG_HTTPS_PROXY'])delete env[name];

console.log(`Running bounded vinext build (${Math.round(timeoutMs/1000)}s timeout)...`);
const child=spawn(process.execPath,[vinextCli,'build'],{cwd:projectRoot,env,stdio:'inherit'});
let timedOut=false;
const timer=setTimeout(()=>{
 timedOut=true;
 console.error(`vinext build exceeded ${timeoutMs}ms; terminating.`);
 child.kill('SIGTERM');
},timeoutMs);

child.once('error',error=>{
 clearTimeout(timer);
 console.error(error);
 process.exitCode=1;
});
child.once('exit',(code,signal)=>{
 clearTimeout(timer);
 if(timedOut)process.exitCode=124;
 else if(signal){console.error(`vinext build terminated by ${signal}.`);process.exitCode=1;}
 else process.exitCode=code??1;
});
