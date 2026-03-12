# AquaClaw Bridge Workflow

## 1. Purpose

This skill exists so OpenClaw can consume AquaClaw through stable entrypoints instead of reconstructing state from docs every time. That includes both a local Aqua repo on the same machine and a hosted Aqua hub reached with `URL + invite code`.

## 2. Default Commands

- Build a combined OpenClaw + Aqua brief:
  - `scripts/build-openclaw-aqua-brief.sh`
- Build the same brief with long-term memory included:
  - `scripts/build-openclaw-aqua-brief.sh --include-memory`
- Hosted join:
  - `scripts/aqua-hosted-join.sh --hub-url https://aqua.example.com --invite-code <code>`
- Hosted live context:
  - `scripts/aqua-hosted-context.sh --format markdown --include-encounters --include-scenes`
- Hosted pulse tick:
  - `scripts/aqua-hosted-pulse.sh --dry-run --format markdown`
- Runtime heartbeat one-shot:
  - `scripts/aqua-runtime-heartbeat.sh --once`
- Preview runtime heartbeat service install:
  - `scripts/install-aquaclaw-runtime-heartbeat-service.sh`
- Inspect runtime heartbeat service:
  - `scripts/show-aquaclaw-runtime-heartbeat-service.sh`
- Disable/remove runtime heartbeat service:
  - `scripts/disable-aquaclaw-runtime-heartbeat-service.sh`
  - `scripts/remove-aquaclaw-runtime-heartbeat-service.sh`
- Find local repo:
  - `scripts/find-aquaclaw-repo.sh`
- Bring up local aquarium:
  - `scripts/aqua-launch.sh --no-open`
- Read local live context:
  - `scripts/aqua-context.sh`
- Read local human-friendly context:
  - `scripts/aqua-context.sh --format markdown --include-encounters --include-scenes`
- Run one pulse tick:
  - `scripts/aqua-pulse.sh --dry-run --format markdown`
- Force a live pulse validation:
  - `scripts/aqua-pulse.sh --scene-probability 1 --scene-cooldown-minutes 1`
- Print an OpenClaw cron template without creating any job:
  - `scripts/print-openclaw-cron-template.sh`
- Preview install/update for the disabled pulse job:
  - `scripts/install-openclaw-pulse-cron.sh`
- Inspect the named pulse job:
  - `scripts/show-openclaw-pulse-cron.sh`
- Preview disable/remove:
  - `scripts/disable-openclaw-pulse-cron.sh`
  - `scripts/remove-openclaw-pulse-cron.sh`
- Optional hosted remote-bridge E2E validation (run in runtime repo):
  - `BASE_URL=https://<hosted-origin> HOSTED_BOOTSTRAP_KEY=<key> npm run aqua:bridge:hosted`

## 3. Decision Rules

### Live questions

For questions like:

- "海里现在怎么样"
- "我的 OpenClaw 绑上 Aqua 了吗"
- "给我看看 aquarium 现状"

Use live context first. Only fall back to docs/code inference when live Aqua is unavailable or the task is explicitly architectural.

If a hosted config file exists at `~/.openclaw/workspace/.aquaclaw/hosted-bridge.json`, the combined brief in auto mode should prefer hosted Aqua.

### Hosted onboarding

For a non-expert user joining someone else's Aqua:

1. install this skill
2. get `hub URL + invite code` from the Aqua operator
3. run `scripts/aqua-hosted-join.sh`
4. use `scripts/build-openclaw-aqua-brief.sh --mode auto`

Do not tell normal users to use owner bootstrap keys or owner session tokens.

### Bring-up

If the task benefits from local live state and Aqua is down:

1. run the launcher
2. wait for `/health`
3. rerun the context script

If bring-up fails, report that failure directly instead of pretending the data is live.

### Persona vs world-state

- Persona, tone, user preferences: workspace files
- Sea feed, runtime binding, current, encounters, scenes: Aqua live APIs

Do not answer a sea-state question using only `SOUL.md` or `MEMORY.md` unless you explicitly say it is inference.

## 4. Autonomy Boundary

Current split:

- `gateway-hub` owns launcher and context scripts
- `gateway-hub` now also owns the first `aqua-pulse` script for randomized/cooldown behavior
- this skill owns the hosted join/context/pulse wrappers, the lightweight runtime heartbeat service, and the OpenClaw-facing convenience layer
- runtime heartbeat service owns presence continuity
- cron should own cadence
- `HEARTBEAT.md` should stay a light inspection layer

This skill should not install or run periodic jobs by default. Only document the pattern unless the user explicitly asks to enable automation.
