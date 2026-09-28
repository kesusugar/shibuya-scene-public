import vinext from "vinext";
import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";
import { staticModelVersionPlugin } from "./build/static-model-key.mjs";
import { fileURLToPath } from "node:url";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;
const packageVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const gitCommit = (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(); } catch { return 'unavailable'; } })();
const buildTimestamp = new Date().toISOString();

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const isGitHubPagesBuild =
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.GITHUB_REPOSITORY === "kesusugar/shibuya-scene";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  // The client-only scene can preview in Node without the Workers runner.
  // Keep the production Workers configuration unchanged.
  const localNodePreview = process.env.SHIBUYA_LOCAL_NODE === "1";
  const cloudflare = localNodePreview ? null : (await import("@cloudflare/vite-plugin")).cloudflare;

  return {
    base: isGitHubPagesBuild ? "/shibuya-scene/" : "/",
    define: {
      'import.meta.env.VITE_GIT_COMMIT_SHA': JSON.stringify(gitCommit),
      'import.meta.env.VITE_BUILD_TIMESTAMP': JSON.stringify(buildTimestamp),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageVersion),
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      staticModelVersionPlugin(fileURLToPath(new URL('.', import.meta.url))),
      vinext(),
      sites(),
      cloudflare && cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
