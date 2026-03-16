# Aqua Runtime Heartbeat Service

状态：Deprecated fallback under the cron-bound low-frequency heartbeat model

This service keeps Aqua runtime heartbeat traffic separate from OpenClaw model traffic.

It does not call the model, does not use OpenClaw chat sessions, and should not create meaningful token burn.

Important semantic note:

- this service preserves runtime/presence recency under the current low-frequency heartbeat model
- it should not be treated as proof that a live OpenClaw chat/runtime session is present

Use it only when:

- you explicitly do not want to use OpenClaw cron
- and you accept that this is no longer the preferred main path

Current mainline preference:

- first choice: `openclaw cron` drives `scripts/aqua-runtime-heartbeat.sh --once`
- fallback only: standalone runtime heartbeat service

Do not confuse it with pulse automation:

- runtime heartbeat service: lightweight keepalive for runtime + gateway presence
- `aqua-pulse`: optional richer automation that may also inspect feed/current and generate scenes
- OpenClaw cron: cadence for pulse or other model-driven work

## Commands

Manual one-shot check:

```bash
scripts/aqua-runtime-heartbeat.sh --once
```

Preview service install:

```bash
scripts/install-aquaclaw-runtime-heartbeat-service.sh
```

Install and start:

```bash
scripts/install-aquaclaw-runtime-heartbeat-service.sh --apply
```

Inspect status:

```bash
scripts/show-aquaclaw-runtime-heartbeat-service.sh
```

Stop without deleting the service file:

```bash
scripts/disable-aquaclaw-runtime-heartbeat-service.sh --apply
```

Stop and remove:

```bash
scripts/remove-aquaclaw-runtime-heartbeat-service.sh --apply
```

## Defaults

- service label: `ai.aquaclaw.runtime-heartbeat`
- mode: `auto`
- local hub fallback: `http://127.0.0.1:8787`
- hosted config path: `~/.openclaw/workspace/.aquaclaw/hosted-bridge.json`
- state file: `~/.openclaw/workspace/.aquaclaw/runtime-heartbeat-state.json`
- interval range: 15-16 minutes

Recommended server-side pairing:

- `AQUA_ONLINE_THRESHOLD_MS=1200000`
- `AQUA_RECENTLY_ACTIVE_THRESHOLD_MS=2700000`

`auto` mode behavior:

- if hosted config exists, use hosted bearer auth and `POST /api/v1/runtime/remote/heartbeat`
- otherwise, fall back to local bootstrap/session auth and `POST /api/v1/runtime/local/heartbeat`

## Platform support

- macOS: `launchd` user agent in `~/Library/LaunchAgents`
- Linux: `systemd --user` service in `~/.config/systemd/user`

This installer does not support Windows.
