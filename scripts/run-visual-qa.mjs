import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';

const EXPECTED_PNGS = [
  'overview-day.png',
  'overview-night.png',
  'scramble-street-day.png',
  'scramble-street-night.png',
  'qfront-night.png',
  'scramble-high-day.png',
  'scramble-high-night.png',
  'center-gai-day.png',
  'center-gai-night.png',
];

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument near '${key ?? ''}'`);
    }
    values.set(key.slice(2), value);
  }
  return {
    url: values.get('url'),
    output: resolve(values.get('output') ?? 'qa/latest'),
    cdpPort: Number(values.get('cdp-port') ?? 9222),
    timeoutMs: Number(values.get('timeout-ms') ?? 300000),
  };
}

const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function findPageTarget(port, expectedUrl, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  const expectedOrigin = new URL(expectedUrl).origin;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const target = targets.find(item =>
        item.type === 'page' &&
        item.webSocketDebuggerUrl &&
        item.url.startsWith(expectedOrigin),
      );
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(1_000);
  }
  throw new Error(`Chrome DevTools target was not available within ${timeoutMs} ms: ${lastError ?? 'no page target'}`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.diagnostics = [];
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolveConnect, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out connecting to Chrome DevTools')), 30_000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolveConnect();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Chrome DevTools WebSocket connection failed'));
      }, { once: true });
    });
    this.socket.addEventListener('message', event => this.onMessage(event.data));
    this.socket.addEventListener('close', () => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error('Chrome DevTools connection closed'));
      }
      this.pending.clear();
    });
  }

  onMessage(rawMessage) {
    const message = JSON.parse(rawMessage);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result);
      return;
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      this.diagnostics.push(`[page exception] ${details.exception?.description ?? details.text}`);
    } else if (message.method === 'Runtime.consoleAPICalled') {
      const text = message.params.args.map(argument => argument.value ?? argument.description ?? argument.type).join(' ');
      this.diagnostics.push(`[console.${message.params.type}] ${text}`);
    } else if (message.method === 'Log.entryAdded') {
      this.diagnostics.push(`[browser ${message.params.entry.level}] ${message.params.entry.text}`);
    }
  }

  send(method, params = {}, timeoutMs = 120_000) {
    const id = this.nextId++;
    return new Promise((resolveCommand, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolveCommand, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, { awaitPromise = false, timeoutMs = 120_000 } = {}) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    }, timeoutMs);
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    }
    return response.result.value;
  }

  close() {
    this.socket?.close();
  }
}

async function waitFor(client, description, expression, timeoutMs) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await client.evaluate(expression, { timeoutMs: Math.min(120_000, Math.max(1_000, deadline - Date.now())) })) {
        return Date.now() - startedAt;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(2_000);
  }
  throw new Error(`Timed out waiting for ${description} after ${timeoutMs} ms${lastError ? `; last error: ${lastError}` : ''}`);
}

function isPng(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

const args = parseArgs(process.argv.slice(2));
if (!args.url) throw new Error('--url is required');
if (!Number.isInteger(args.cdpPort) || args.cdpPort < 1 || args.cdpPort > 65535) throw new Error('--cdp-port must be a valid port');

if(!Number.isFinite(args.timeoutMs)||args.timeoutMs<1000||args.timeoutMs>1800000)throw new Error('--timeout-ms must be 1000..1800000');
const overallStartedAt = Date.now();
let client,completed=false;
mkdirSync(args.output,{recursive:true});
const summary=(status)=>writeFileSync(resolve(args.output,'run.json'),JSON.stringify({status,elapsedMs:Date.now()-overallStartedAt,timeoutMs:args.timeoutMs,cdpCommands:client?client.nextId-1:0,paidCloudCalls:0},null,2));
const deadline=setTimeout(()=>{summary('timeout');console.error('[Visual QA] Overall time limit reached');client?.close();process.exit(1);},args.timeoutMs);
try {
  console.log(`[Visual QA] Target URL: ${args.url}`);
  console.log(`[Visual QA] Output directory: ${args.output}`);

  const target = await findPageTarget(args.cdpPort, args.url);
  console.log(`[Visual QA] Chrome target: ${target.url}`);
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await Promise.all([
    client.send('Runtime.enable'),
    client.send('Log.enable'),
    client.send('Page.enable'),
  ]);

  const apiWaitMs = await waitFor(
    client,
    'window.__SHIBUYA_QA__',
    "typeof window.__SHIBUYA_QA__ === 'object'",
    5 * 60_000,
  );
  console.log(`[Visual QA] QA API available after ${apiWaitMs} ms`);

  await waitFor(
    client,
    'window.__SHIBUYA_QA__.ready',
    'window.__SHIBUYA_QA__?.ready === true',
    15 * 60_000,
  );
  const readyMs = Date.now() - overallStartedAt;
  console.log(`[Visual QA] QA ready time: ${readyMs} ms`);

  const renderer = await client.evaluate(`(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'Scene canvas was not found' };
    const gl = canvas.getContext('webgl2');
    if (!gl) return { error: 'WebGL2 context was not available' };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      webglVersion: gl.getParameter(gl.VERSION),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    };
  })()`);
  console.log(`[Visual QA] Chrome WebGL renderer: ${JSON.stringify(renderer)}`);
  if (renderer?.error) throw new Error(renderer.error);

  const captureStartedAt = Date.now();
  const captureSummary = await client.evaluate(`(async () => {
    const result = await window.__SHIBUYA_QA__.capture({ download: false });
    window.__SHIBUYA_QA_AUTOMATION_RESULT__ = result;
    return {
      files: result.files,
      captures: result.captures.map(item => ({ file: item.file, size: item.blob.size, type: item.blob.type })),
      metrics: result.metrics,
    };
  })()`, { awaitPromise: true, timeoutMs: 10 * 60_000 });
  const captureMs = Date.now() - captureStartedAt;
  console.log(`[Visual QA] Capture time: ${captureMs} ms`);

  const captureNames = captureSummary.captures.map(item => item.file);
  if (JSON.stringify(captureNames) !== JSON.stringify(EXPECTED_PNGS)) {
    throw new Error(`Unexpected capture manifest: ${JSON.stringify(captureNames)}`);
  }

  await mkdir(args.output, { recursive: true });
  for (let index = 0; index < captureSummary.captures.length; index += 1) {
    const encoded = await client.evaluate(`(async () => {
      const capture = window.__SHIBUYA_QA_AUTOMATION_RESULT__.captures[${index}];
      const bytes = new Uint8Array(await capture.blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return { file: capture.file, base64: btoa(binary) };
    })()`, { awaitPromise: true, timeoutMs: 180_000 });
    const png = Buffer.from(encoded.base64, 'base64');
    if (!isPng(png)) throw new Error(`${encoded.file} is not a valid PNG`);
    await writeFile(resolve(args.output, encoded.file), png);
    console.log(`[Visual QA] PNG: ${encoded.file} (${png.length} bytes)`);
  }

  const startup=await client.evaluate('window.__SHIBUYA_STARTUP_TIMING__ ?? null');
  const loading=await client.evaluate('window.__SHIBUYA_QA__.playableLoading ?? null');
  for(const [name,value] of Object.entries({renderer,gl:{webglVersion:renderer.webglVersion},startup,build:startup?.buildIdentity??{unavailable:true},stage:startup?.stages??[],playableLoading:loading})){
    await writeFile(resolve(args.output,name+'.json'),JSON.stringify(value,null,2)+'\n');
  }
  const metricsPath = resolve(args.output, 'metrics.json');
  await writeFile(metricsPath, `${JSON.stringify(captureSummary.metrics, null, 2)}\n`, 'utf8');
  console.log(`[Visual QA] metrics.json:\n${JSON.stringify(captureSummary.metrics, null, 2)}`);
  await client.evaluate('delete window.__SHIBUYA_QA_AUTOMATION_RESULT__');
  completed=true;console.log('[Visual QA] SUCCESS');
} catch (error) {
  console.error(`[Visual QA] FAILURE: ${error.stack ?? error}`);
  if (client?.diagnostics.length) {
    console.error('[Visual QA] Browser diagnostics:');
    for (const line of client.diagnostics.slice(-100)) console.error(line);
  }
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);summary(completed?'success':'failure');
  writeFileSync(resolve(args.output,'console.json'),JSON.stringify(client?.diagnostics??[],null,2));
  client?.close();
}
