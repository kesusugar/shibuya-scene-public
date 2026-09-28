# Issue: medium and low tiers have no prebaked life, signs, streetscape or traffic

Recorded separately from the GTA fidelity work, as requested. Nothing here is fixed yet.

## What is wrong

`public/data/shibuya-static-models.json` is 19.8 MB and is what makes the high tier come up
quickly. Four of its seven heavy sections exist for the high tier only:

| Section | Tiers present | Size |
| --- | --- | --- |
| `detail` | high, medium, low | 1.47 MiB |
| `signs` | **high only** | 2.47 MiB |
| `street` | **high only** | 2.20 MiB |
| `traffic` | **high only** | 2.70 MiB |
| `life` | **high only** | 6.76 MiB |

`scripts/bake-static-models.mjs:23-29` bakes `detail` in a loop over all three tiers, then bakes
`signs`, `street`, `traffic` and `life` once, hard-coded to `tier:'high'`.

The consequence is that `?tier=medium` and `?tier=low` fall back to building the pedestrian
network, the streetscape, the sign set and the traffic graph in the browser at startup — the
exact work the prebake exists to avoid. The tiers meant for weaker hardware therefore do the
most startup work, which is backwards.

## How it was found

Measuring the crowd at `tier=medium` and `tier=low` showed `crowd 0` for about seven minutes
while `tier=high` reached the full 1978 in roughly 75 seconds. The cause is not a crowd bug: at
those tiers the scene is waiting on `buildPedestrianNetworkAsync(...)` because the pack has
nothing for it to load. (An earlier reading of this as a crowd failure was wrong.)

## Why it has not been fixed here

Baking three tiers of all four sections would roughly triple the sections that dominate the
pack, taking `shibuya-static-models.json` from 19.8 MB towards 50 MB, and the pack is fetched
before the scene can start. That trade — three tiers of prebake against a much larger initial
download — is a decision about the loading budget, not a bug fix, and it interacts directly with
the character and vehicle payload work. It should be made with those numbers in hand.

## Options, for when it is taken up

1. **Bake all three tiers of everything.** Simplest, largest pack. Wrong if the pack stays a
   single blocking fetch.
2. **Split the pack per tier and fetch only the requested one.** Each tier's file is roughly
   today's size, and nobody downloads tiers they will not use. Costs a cache key per tier and a
   change to `src/quality/static-models.mjs`, which currently fetches one file keyed by one hash.
3. **Bake medium and low only for the sections whose runtime build is slow** — `life` first,
   since it is 6.76 MiB and the seven-minute wait was the pedestrian network. `signs` and
   `street` may be cheap enough to keep building at runtime on lower tiers.

Option 3 measured, then option 2 if the pack grows past the loading budget, looks right, but the
measurement should decide.

## When to revisit

Not later than the performance pass (RUN 13 of the fidelity plan). Medium and low should be
re-measured during the character and vehicle loading measurement, since that work changes the
loading budget this decision depends on.
