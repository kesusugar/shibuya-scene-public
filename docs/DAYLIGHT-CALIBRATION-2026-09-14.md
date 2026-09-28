# Stage 4: solar daylight calibration, first pass

The active SolarCycle overwrites RenderFidelity exposure each frame. Daylight work therefore belongs in SOLAR_PHASES, not only the quality-tier defaults.

- Day key 2.1 -> 1.65, fill .38 -> .30, exposure .78 -> .74.
- Less pale horizon and an explicit neutral-warm daylight fill, blended away at night.
- Settled night sky, key, fill and exposure remain unchanged.
- Reuse constant white/fill Color objects rather than allocating a white Color on every update.
- Integration test exercises the real DayNightSystem + RenderFidelity + SolarCycle chain across day/night/day. Existing interpolation and cafe tests retained.

Visual comparison: HIGH Scramble High at the same Chrome viewport, before/after daylight. Slightly reduced pale highlights, but substantial overall blue cast remains; this is not final color acceptance. Material reflection tint and QFRONT glass require their own pass. No performance improvement is claimed.

Six focused tests passed. Stage 4 is in progress, not complete. Stages 2/3 retain their listed open items and stages 5–7 remain pending.
