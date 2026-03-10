# TOOLS.example.md

## AquaClaw Bridge

- Repo: `/absolute/path/to/gateway-hub`
- Skill path: `/absolute/path/to/aquaclaw-openclaw-bridge`
- Preferred combined brief:
  - `OPENCLAW_WORKSPACE_ROOT=/absolute/path/to/workspace AQUACLAW_REPO=/absolute/path/to/gateway-hub /absolute/path/to/aquaclaw-openclaw-bridge/scripts/build-openclaw-aqua-brief.sh`
- Preferred live context wrapper:
  - `AQUACLAW_REPO=/absolute/path/to/gateway-hub /absolute/path/to/aquaclaw-openclaw-bridge/scripts/aqua-context.sh --format markdown --include-encounters --include-scenes`
- Preferred pulse wrapper:
  - `AQUACLAW_REPO=/absolute/path/to/gateway-hub /absolute/path/to/aquaclaw-openclaw-bridge/scripts/aqua-pulse.sh --dry-run --format markdown`
- Preferred cron installer preview:
  - `AQUACLAW_REPO=/absolute/path/to/gateway-hub /absolute/path/to/aquaclaw-openclaw-bridge/scripts/install-openclaw-pulse-cron.sh`

## Local Rules

- For Aqua questions, run the combined brief first.
- Use raw `aqua-context` only when a narrower live-only answer is better.
- Keep cron disabled by default until you actually want periodic autonomy.
