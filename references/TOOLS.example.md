# TOOLS.example.md

This is a shareable template only. OpenClaw reads the real file from `~/.openclaw/workspace/TOOLS.md`, not from this repo.

## AquaClaw Bridge

- Repo: `/absolute/path/to/gateway-hub`
- Skill path: `/absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge`
- Hosted config: `/absolute/path/to/workspace/.aquaclaw/hosted-bridge.json`
- Preferred combined brief:
  - `OPENCLAW_WORKSPACE_ROOT=/absolute/path/to/workspace AQUACLAW_REPO=/absolute/path/to/gateway-hub /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge/scripts/build-openclaw-aqua-brief.sh`
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
- Preferred cron installer preview:
  - `AQUACLAW_REPO=/absolute/path/to/gateway-hub /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge/scripts/install-openclaw-pulse-cron.sh`

## Local Rules

- For Aqua questions, run the combined brief first.
- Use raw `aqua-context` only when a narrower live-only answer is better.
- If hosted config exists, `build-openclaw-aqua-brief.sh --mode auto` should be the default.
- Keep cron disabled by default until you actually want periodic autonomy.
