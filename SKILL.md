---
name: aquaclaw-openclaw-bridge
description: "Use when working with a local AquaClaw aquarium from OpenClaw: bring the aquarium up, read live sea-state, check whether the local runtime is bound, or answer questions like '海里怎么样' from live Aqua data instead of repo docs alone. This skill prefers repo-level scripts (`npm run dev:aquarium`, `npm run aqua:context`) and keeps persona/preferences in workspace files rather than treating them as Aqua world-state."
---

# AquaClaw OpenClaw Bridge

## Overview

This OpenClaw skill bridges OpenClaw to a local AquaClaw install without collapsing persona and world-state into the same source. Use Aqua live APIs for sea-state; use workspace files (`SOUL.md`, `USER.md`, `MEMORY.md`) for identity, tone, and user preferences.

The real `TOOLS.md`, `MEMORY.md`, and `memory/*.md` are OpenClaw workspace-local files, not files owned by this skill repo. This repo only carries public-safe templates in `references/*.example.md`.

## When To Use

Use this skill when the request involves any of these:

- reading local Aqua live state before answering
- checking whether the local OpenClaw runtime is bound into Aqua
- bringing up the local aquarium stack
- setting up or validating the reusable Aqua/OpenClaw bridge on a machine
- answering "海里怎么样", "what is happening in the aquarium", or similar questions where repo docs alone are not enough

Do not use this skill for pure repo implementation work inside `gateway-hub`; that belongs to normal coding flow.

## Workflow

1. Resolve the AquaClaw repo path with [scripts/find-aquaclaw-repo.sh](./scripts/find-aquaclaw-repo.sh).
2. For Aqua questions, default to [scripts/build-openclaw-aqua-brief.sh](./scripts/build-openclaw-aqua-brief.sh) first.
3. If you only need the live sea slice, use [scripts/aqua-context.sh](./scripts/aqua-context.sh) instead of the full brief.
4. If live state is required and Aqua is not running, bring it up with [scripts/aqua-launch.sh](./scripts/aqua-launch.sh) and retry the read.
5. In the answer, separate:
   - `live Aqua state`
   - `repo/docs inference`
   - `workspace persona/preferences`
6. Only include `MEMORY.md` in the brief when explicitly asked or when the session is clearly main-session/private.
7. If the task is about automation or autonomy, read [references/bridge-workflow.md](./references/bridge-workflow.md), use [scripts/aqua-pulse.sh](./scripts/aqua-pulse.sh) as the repo-consumer entrypoint, and use the OpenClaw cron lifecycle scripts when the user wants reusable install/status/disable/remove flows. Cadence belongs to cron; randomness and cooldowns belong to the pulse script, not to `HEARTBEAT.md`.

## Rules

- Prefer repo-owned scripts over ad hoc `curl` commands.
- For Aqua questions, prefer the combined brief over raw endpoint output unless the user asked for a narrower live-only read.
- Treat `npm run aqua:context` as the deterministic read entrypoint.
- Treat `npm run dev:aquarium` as the bring-up entrypoint.
- Treat `npm run aqua:pulse` as the autonomy/pulse entrypoint.
- If Aqua still cannot be reached after bring-up, answer from docs only if necessary and say clearly that the result is not live.
- Keep persona and user preference state in workspace files; do not present them as if Aqua produced them.
- `HEARTBEAT.md` may cache or inspect, but it is not the main autonomy engine.

## Local Configuration

- Set `AQUACLAW_REPO` when the repo is not in the default workspace location.
- The default expected repo path is `$HOME/.openclaw/workspace/gateway-hub`.
- The recommended install path for workspace-scoped use is `$HOME/.openclaw/workspace/skills/aquaclaw-openclaw-bridge`.
- The managed alternative is `$HOME/.openclaw/skills/aquaclaw-openclaw-bridge`.
- Your real machine-specific path and command notes belong in `$HOME/.openclaw/workspace/TOOLS.md`, not in this skill repo.
- Your real long-term memory belongs in `$HOME/.openclaw/workspace/MEMORY.md`; `references/MEMORY.example.md` is only a template.
- For a public-shareable install baseline, see [references/public-install.md](./references/public-install.md), [references/TOOLS.example.md](./references/TOOLS.example.md), and [references/MEMORY.example.md](./references/MEMORY.example.md).
