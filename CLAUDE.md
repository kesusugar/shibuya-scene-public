# Claude Code project guide

Read `AGENTS.md` first; it is the authoritative shared rule set. Then read `docs/IMPLEMENTATION-STATUS.md` and the focused design note for the area being changed.

For the GTA Fidelity Master Plan work on `claude/gta-fidelity-upgrade`, read
`docs/GTA-FIDELITY-STATUS.md` — it carries the RUN state, the architecture decisions that are
closed, and the bugs already solved. `docs/CHATGPT-WORK-RESUME.md` is the short starting
instruction for a session picking that work up cold.

## Windows setup

Requirements: Git, Node.js 22.13 or newer, npm, and Chrome or Edge.

```powershell
git clone https://github.com/kesusugar/shibuya-scene.git
cd shibuya-scene
npm ci
npm run dev:local
```

Open `http://127.0.0.1:5174/?tier=high&time=night&camera=scramble`. The local helper normally selects port 5174; use the URL printed in the terminal if it differs.

## Branch workflow

```powershell
git switch master
git pull --ff-only origin master
git switch -c claude/<short-topic>
```

Keep implementation, generated evidence, and collaboration-document changes in separate commits. Before requesting review:

```powershell
npm run typecheck
npm run test:ci
npm test
git status --short
git push -u origin claude/<short-topic>
```

Create a pull request into `master` and complete the repository PR checklist. Do not work directly on the same branch as another agent.

The build entrypoint is cross-platform and does not require WSL or Git Bash. It invokes the local Vinext CLI with a three-minute default timeout; override it with `SITES_BUILD_TIMEOUT_MS` only when necessary.

## Project map

- `app/ShibuyaScene.tsx`: application and scene-system orchestration
- `src/heroes/`: landmark buildings and QFRONT
- `src/signs/`, `src/nightglow/`: advertisements and night emission
- `src/ground/`, `src/streetscape/`: roads, sidewalks, fixtures
- `src/traffic/`, `src/life/`: vehicles and pedestrians
- `src/fidelity/`, `src/environment/`: post-processing, lighting, solar cycle
- `tests/`: deterministic and lifecycle regressions
- `evidence/`: intentionally generated validation snapshots
- `docs/`: decisions, visual status, and known limitations

The current work is not finished. Do not infer completion from a successful build; visual comparison and performance acceptance are separate gates.
