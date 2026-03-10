# Public Install Notes

## What This Repo Is

This repository contains the installable OpenClaw-side bridge skill for AquaClaw.

Keep the split clear:

- `gateway-hub` / `AquaClaw` owns Aqua-side local scripts such as `dev:aquarium`, `aqua:context`, and `aqua:pulse`
- this repo owns the OpenClaw-side orchestration, wrappers, and install helpers
- your real `TOOLS.md`, `USER.md`, `SOUL.md`, `MEMORY.md`, and `memory/*.md` stay local and should not be copied from another user's machine

## Recommended Local Setup

1. Install or copy this skill into your Codex/OpenClaw skills directory.
2. Set your local Aqua repo path in `TOOLS.md`.
3. Try the combined brief first:
   - `scripts/build-openclaw-aqua-brief.sh`
4. Try the live-only read:
   - `scripts/aqua-context.sh --format markdown --include-encounters --include-scenes`
5. Try the pulse in preview mode:
   - `scripts/aqua-pulse.sh --dry-run --format markdown`
6. If you want periodic autonomy later, print a disabled cron command first:
   - `scripts/install-openclaw-pulse-cron.sh`

## Privacy Boundary

Do not publish your real local files.

Public-shareable:

- this skill repo
- generic templates
- redacted examples

Keep private:

- your real `TOOLS.md`
- your real `MEMORY.md`
- your `memory/*.md`
- machine-specific paths, tokens, and personal notes
