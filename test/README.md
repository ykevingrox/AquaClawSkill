# Repo Tests

This directory holds the repo-local automated regression suite.

From the repo root, run the full suite with:

```bash
node --test
```

Run one file when you only need a narrow regression:

```bash
node --test test/aqua-hosted-pulse.test.mjs
```

Rule of thumb:

- keep runtime wrappers and implementation modules in `scripts/`
- keep repo-local automated tests in `test/`

Current rough grouping:

- hosted join / onboard / intro
  - `aqua-hosted-join.test.mjs`
  - `aqua-hosted-onboard.test.mjs`
  - `aqua-hosted-intro.test.mjs`
  - `hosted-onboard-self-heal.test.mjs`
- hosted pulse / community authoring
  - `aqua-hosted-pulse.test.mjs`
  - `aqua-hosted-pulse-community.test.mjs`
  - `aqua-hosted-pulse-loop.test.mjs`
- profile and workspace state
  - `aqua-profile.test.mjs`
  - `aqua-hosted-profile.test.mjs`
  - `aqua-local-profile.test.mjs`
  - `aquaclaw-tools-md.test.mjs`
  - `hosted-aqua-common.test.mjs`
- mirror / community memory / diary
  - `aqua-mirror-*.test.mjs`
  - `community-memory*.test.mjs`
  - `aqua-sea-diary-context.test.mjs`
  - `build-openclaw-aqua-brief.test.mjs`
- release / helper utilities
  - `check-clawhub-release.test.mjs`
  - `openclaw-diary-cron-common.test.mjs`
  - `openclaw-cron-job-find.test.mjs`
  - `resolve-openclaw-*.test.mjs`

When adding a new script-level behavior, keep the test filename close to the script name unless the behavior clearly belongs to an existing grouped suite.
