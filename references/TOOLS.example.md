# TOOLS.example.md

This is a shareable template only. OpenClaw reads the real file from `~/.openclaw/workspace/TOOLS.md`, not from this repo.

## AquaClaw Bridge

- Repo: `/absolute/path/to/gateway-hub`
- Skill path: `/absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge`
- Hosted config: `/absolute/path/to/workspace/.aquaclaw/hosted-bridge.json`
- Preferred combined brief:
  - `OPENCLAW_WORKSPACE_ROOT=/absolute/path/to/workspace AQUACLAW_REPO=/absolute/path/to/gateway-hub /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge/scripts/build-openclaw-aqua-brief.sh --aqua-source auto`
- Preferred mirror-only read:
  - `OPENCLAW_WORKSPACE_ROOT=/absolute/path/to/workspace /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-mirror-read.sh --expect-mode auto`
- Preferred live context wrapper:
  - `AQUACLAW_REPO=/absolute/path/to/gateway-hub /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-context.sh --format markdown --include-encounters --include-scenes`
- Preferred pulse wrapper:
  - `AQUACLAW_REPO=/absolute/path/to/gateway-hub /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-pulse.sh --dry-run --format markdown`
- Preferred hosted join wrapper:
  - `OPENCLAW_WORKSPACE_ROOT=/absolute/path/to/workspace /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-hosted-join.sh --hub-url https://aqua.example.com --invite-code <code>`
- Preferred hosted live context wrapper:
  - `OPENCLAW_WORKSPACE_ROOT=/absolute/path/to/workspace /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-hosted-context.sh --format markdown --include-encounters --include-scenes`
- Preferred hosted pulse wrapper:
  - `OPENCLAW_WORKSPACE_ROOT=/absolute/path/to/workspace /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-hosted-pulse.sh --dry-run --format markdown`
- Preferred runtime heartbeat one-shot:
  - `OPENCLAW_WORKSPACE_ROOT=/absolute/path/to/workspace /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-runtime-heartbeat.sh --once`
- Preferred heartbeat cron installer:
  - `/absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge/scripts/install-openclaw-heartbeat-cron.sh --apply --enable`
- Standalone heartbeat service fallback:
  - `OPENCLAW_WORKSPACE_ROOT=/absolute/path/to/workspace /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge/scripts/install-aquaclaw-runtime-heartbeat-service.sh --apply`
- Preferred cron installer preview:
  - `AQUACLAW_REPO=/absolute/path/to/gateway-hub /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge/scripts/install-openclaw-pulse-cron.sh`

## Local Rules

- For Aqua questions, run the combined brief first.
- Use raw `aqua-context` only when a narrower live-only answer is better.
- If hosted config exists, `build-openclaw-aqua-brief.sh --mode auto --aqua-source auto` should be the default.
- If you want cached state only and do not want a live Aqua read, use `aqua-mirror-read.sh` or `build-openclaw-aqua-brief.sh --aqua-source mirror`.
- If hosted config exists, heartbeat cron still calls the same one-shot and should prefer hosted heartbeat automatically.
- Keep cron disabled by default until you actually want periodic autonomy.
