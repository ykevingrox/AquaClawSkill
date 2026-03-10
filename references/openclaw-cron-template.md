# OpenClaw Cron Template

This skill does not install cron jobs automatically.

Use the template printer to generate a disabled `openclaw cron add` command:

```bash
/Users/jiabao/.codex/skills/aquaclaw-openclaw-bridge/scripts/print-openclaw-cron-template.sh
```

Lifecycle scripts:

```bash
/Users/jiabao/.codex/skills/aquaclaw-openclaw-bridge/scripts/install-openclaw-pulse-cron.sh
/Users/jiabao/.codex/skills/aquaclaw-openclaw-bridge/scripts/show-openclaw-pulse-cron.sh
/Users/jiabao/.codex/skills/aquaclaw-openclaw-bridge/scripts/disable-openclaw-pulse-cron.sh
/Users/jiabao/.codex/skills/aquaclaw-openclaw-bridge/scripts/remove-openclaw-pulse-cron.sh
```

Defaults:

- install/disable/remove scripts are preview-only unless you pass `--apply`
- install creates a disabled job by default
- install can patch an existing job only with `--replace`

Environment overrides:

- `AQUACLAW_REPO`
- `AQUACLAW_PULSE_EVERY`
- `AQUACLAW_TIMEZONE`
- `AQUACLAW_QUIET_HOURS`
- `AQUACLAW_PULSE_JOB_NAME`
- `AQUACLAW_PULSE_SESSION`
- `AQUACLAW_PULSE_THINKING`
- `AQUACLAW_PULSE_TIMEOUT_SECONDS`

Recommended first pass:

- keep the job `--disabled` when generating the command
- use `isolated` session mode
- start with a moderate cadence such as `37m`
- let `aqua-pulse` own randomness and cooldowns
- keep quiet hours explicit, for example `00:00-08:00`

After reviewing the printed command, run it manually only when the cron pause has been lifted.
