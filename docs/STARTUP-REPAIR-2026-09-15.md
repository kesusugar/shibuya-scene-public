# Startup and landing-quality repair

Branch: codex/startup-repair

## Findings
- The collaboration commits do not change scene generators or rendering profiles. Their runtime CSS change moves existing imports to legal positions.
- The supplied push log publishes commits; it does not alter local quality settings.
- Port 5174 was not accepting connections at diagnosis. Starting `npm run dev:local` restored HTTP 200. Vite performed dependency optimization at this startup.
- A bare URL previously selected MEDIUM/day. MEDIUM uses scale 0.6 and lower-resolution textures; the expensive sign/street/traffic/life models are prebuilt only for HIGH. Thus a bare URL can be lower quality and more expensive to construct than the previously shared HIGH URL. The user's exact failing URL has not been established, so this is a verified problematic path, not proof of the entire reported regression.
- The existing local static pack key matches current inputs. No rebake is needed for this patch.

## Changes
- UI tests started a differently configured Vite server against the default preview cache. The suite logged config-triggered dependency reoptimization and left an empty optimizer metadata set. Separate preview and UI-test caches now prevent that interference; first use of the new preview cache still requires one optimization pass.
- Runtime-only landing defaults now select HIGH/night without invalidating the geometry pack. Explicit MEDIUM, LOW, day and QA settings remain supported.
- Local startup prints the full HIGH/night/scramble link.
- Static-pack fetch includes its expected version key to avoid reusing a cached pack from a previous deployment. Signature validation and live fallback remain intact.
- Collaboration instructions, CI, scene density and rendering profiles are preserved.

## Verification limits
The current suite passed 97/97 before cache separation. Final targeted cache/landing/UI tests passed 7/7; typecheck passed. After UI tests, the concurrently running preview returned HTTP 200 in 0.106 seconds (HTML response only, not scene completion).
Caches must stay under node_modules: an intermediate .sites-runtime location caused the RSC plugin to re-transform optimized dependencies and emit a duplicate-default-export error. The final node_modules/.vite-local and node_modules/.vite-ui-tests paths passed the HTTP and UI checks.
HTTP responded successfully. Browser diagnostics repeatedly timed out during initialization; this is not settled visual acceptance or a measured startup-speed improvement. No FPS or before/after seconds are claimed. Continue profiling if the explicit HIGH URL still starts slowly.

## Start
Run `npm run dev:local` in the repository and keep that terminal open.
Open http://127.0.0.1:5174/?tier=high&time=night&camera=scramble.
Do not use `npm test` as a preview launcher: it performs a production build and the regression suite.
