# GitHub collaboration workflow

## One task, one branch

- Codex: `codex/<topic>`
- Claude: `claude/<topic>`
- Manual work: `human/<topic>`

Never let two agents edit the same branch concurrently. Divide work by subsystem when possible, for example lighting versus crowd variation. Open a pull request into `master`; do not merge until CI and visual review are complete.

## Start from another PC

```powershell
git clone https://github.com/kesusugar/shibuya-scene.git
Set-Location .\shibuya-scene
npm ci
git status
git branch --show-current
git remote -v
```

For a private repository, the GitHub account used on that PC must have access. Authentication can use Git Credential Manager, GitHub CLI, or SSH. Claude Code uses the same local Git credentials; it does not bypass GitHub access control.

## Start a task

```powershell
git switch master
git pull --ff-only origin master
git switch -c claude/lighting-pass
```

Replace the branch suffix with the actual task. Commit only files belonging to that task.

## Review and integrate

```powershell
npm run typecheck
npm run test:ci
git status --short
git push -u origin claude/lighting-pass
```

Open a PR into `master`, use the template, and attach fixed-camera before/after images for visual changes. Prefer squash merge for a noisy exploratory branch and normal merge/rebase when its commits are already coherent.

`npm run test:legacy` is retained for historical audits. It contains frozen stage assertions that deliberately reject later systems, so it is not a required PR check.

After merge, every other machine should run:

```powershell
git switch master
git pull --ff-only origin master
```

## Repository settings to enable manually

GitHub branch protection is intentionally not enforced by code because it would immediately change the owner's direct-push workflow. When ready, configure a `master` ruleset requiring pull requests and the `validate` status check, disallow force pushes, and keep administrator bypass available for recovery.
