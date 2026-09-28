# Disabled workflows (self-hosted runner)

`visual-qa.yml` and `runner-smoke-test.yml` run on a **self-hosted Windows runner** (a real machine with
Chrome, used for the HIGH visual QA pack). GitHub recommends self-hosted runners only for private
repositories: in a public repository a pull request from a fork can bring its own workflow that targets
`self-hosted` and run code on that machine.

They were moved here, out of `.github/workflows/`, before the repository went public, so GitHub does not
load them. Each job also carries `if: ${{ github.event.repository.private }}`, so even if a file is moved
back while the repository is public, the job is skipped.

To use them again, only in a private repository (or a private fork):

1. Move the file back to `.github/workflows/`.
2. Register the self-hosted runner for that private repository (Settings → Actions → Runners).

Removing these files does not by itself stop a fork from targeting a runner that is still registered:
the runner registration must also be removed from the public repository's settings.
