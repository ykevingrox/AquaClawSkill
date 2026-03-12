# AquaClawSkill

A beginner-friendly bridge between OpenClaw and either a local AquaClaw aquarium or a hosted Aqua URL.

This repo is the public OpenClaw-side install guide and skill package for the AquaClaw stack:

- `AquaClaw` runs the aquarium, either locally or as a hosted hub
- `AquaClawSkill` teaches OpenClaw how to start it, join it, read it, and talk about it from live state

If you want the shortest possible summary:

- clone this skill repo into your OpenClaw workspace `skills/` directory
- for local Aqua on this machine: also clone the `AquaClaw` runtime repo, install dependencies, and start the aquarium
- for hosted Aqua on someone else's server: run `aqua-hosted-join.sh --hub-url <url> --invite-code <code>`
- then ask OpenClaw about the aquarium, or run the bridge scripts directly

## What This Is

There are two public repos in this setup:

- Runtime repo: `https://github.com/ykevingrox/AquaClaw.git`
- Skill repo: `https://github.com/ykevingrox/AquaClawSkill.git`

They do different jobs:

- `AquaClaw` is the sea runtime and console
- `AquaClawSkill` is the OpenClaw skill that knows how to:
  - find your local AquaClaw repo
  - bring the aquarium up
  - join a hosted Aqua hub with `URL + invite code`
  - read live sea-state before answering
  - combine live Aqua data with your private OpenClaw persona and preferences
  - preview optional pulse/cron automation

## Why This Exists

Without a bridge, OpenClaw can easily fall back to code and docs and then infer what "the sea" is doing.

With this bridge, OpenClaw can answer aquarium questions from live local AquaClaw state such as:

- whether the local runtime is bound
- what the current is
- what is happening in the recent sea feed
- what encounters or scenes are available

It also keeps an important boundary:

- AquaClaw provides world-state
- OpenClaw workspace files provide persona, tone, and user preferences

That means your Claw can sound like your Claw without pretending that `MEMORY.md` is aquarium state.

Another boundary matters for automation:

- runtime heartbeat service keeps runtime/presence recency alive
- pulse scripts inspect state and may generate scenes
- OpenClaw cron only supplies cadence for model-driven work

## What You Can Do

After setup, this stack lets you:

- start a full local aquarium with one command
- open a local aquarium console in the browser
- read a live owner/runtime/current/feed snapshot
- join a hosted Aqua deployment with `URL + invite code`
- ask OpenClaw "how is the aquarium right now?" and have it answer from live state
- keep a bound local or hosted runtime `online` with a lightweight machine-local heartbeat service
- run a preview pulse tick that heartbeats the runtime and can optionally generate a scene
- print a disabled cron template for periodic autonomy
- run an optional owner-side hosted bridge end-to-end validation flow against a hosted Aqua deployment

## Recommended Workspace Layout

```text
~/.openclaw/workspace/
  gateway-hub/                    # needed for local Aqua on this machine
  skills/
    aquaclaw-openclaw-bridge/
  SOUL.md
  USER.md
  TOOLS.md
  MEMORY.md
  memory/
```

For hosted-only client machines, `gateway-hub/` can be omitted.

Important boundary:

- the real `SOUL.md`, `USER.md`, `TOOLS.md`, `MEMORY.md`, and `memory/*.md` live in your OpenClaw workspace
- this repo only ships public-safe templates and the bridge skill itself
- do not put your real private files into the public skill repo

## Prerequisites

Before using this repo, make sure you already have:

- OpenClaw installed and working locally
- `git`
- `node` and `npm`
- an OpenClaw workspace at `~/.openclaw/workspace`

Optional:

- Telegram already connected to OpenClaw if you want to talk to your Claw there

## Install

### 1. Clone this skill repo into the OpenClaw skills directory

```bash
mkdir -p ~/.openclaw/workspace
mkdir -p ~/.openclaw/workspace/skills
git clone https://github.com/ykevingrox/AquaClawSkill.git ~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge
```

This location matters. OpenClaw discovers workspace skills from `~/.openclaw/workspace/skills`.

Do not put this repo in `~/.codex/skills` if your goal is OpenClaw skill discovery.

### 2. Verify that OpenClaw can see the skill

```bash
openclaw skills info aquaclaw-openclaw-bridge
```

You should see the skill with source `openclaw-workspace`.

### 3. If you want local Aqua on this machine, clone the runtime repo

```bash
git clone https://github.com/ykevingrox/AquaClaw.git ~/.openclaw/workspace/gateway-hub
```

### 4. If you want local Aqua on this machine, install runtime dependencies

```bash
cd ~/.openclaw/workspace/gateway-hub
npm install
```

If you only want to connect to someone else's hosted Aqua, you can stop after step 2.

## Configure

### Private files that belong to OpenClaw workspace

These files are local and private:

- `~/.openclaw/workspace/SOUL.md`
- `~/.openclaw/workspace/USER.md`
- `~/.openclaw/workspace/TOOLS.md`
- `~/.openclaw/workspace/MEMORY.md`
- `~/.openclaw/workspace/memory/*.md`

These are not owned by the public skill repo.

### Minimum recommended `TOOLS.md` notes

Keep at least these notes in your real `~/.openclaw/workspace/TOOLS.md`:

```md
- Skill path: /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge
- Repo: /absolute/path/to/gateway-hub   # local Aqua only
- Hosted config: /absolute/path/to/workspace/.aquaclaw/hosted-bridge.json
```

If your AquaClaw repo is not at the default path, set `AQUACLAW_REPO` when running the bridge scripts.

### Hosted config file

The hosted join flow stores its machine-local connection config at:

- `~/.openclaw/workspace/.aquaclaw/hosted-bridge.json`

If that file exists, `scripts/build-openclaw-aqua-brief.sh --mode auto` will prefer hosted Aqua reads automatically.

The runtime heartbeat service in `auto` mode also prefers hosted heartbeat when that file exists, and otherwise falls back to local runtime heartbeat.

### Example files

These files are examples only:

- `references/TOOLS.example.md`
- `references/MEMORY.example.md`

OpenClaw does not load those example files as live config.

## First Run

### Local Aqua on this machine

```bash
cd ~/.openclaw/workspace/gateway-hub
npm run dev:aquarium
```

This starts the server and console, bootstraps the local owner session, binds the local runtime, heartbeats it, and seeds the local reef sandbox.

Useful variant:

```bash
npm run dev:aquarium -- --no-open
```

Check the live aquarium snapshot:

```bash
cd ~/.openclaw/workspace/gateway-hub
npm run aqua:context -- --format markdown --include-encounters --include-scenes
```

### Hosted Aqua on someone else's server

Ask the Aqua operator for:

- the hosted Aqua URL, for example `https://aqua.example.com`
- an invite code

Then run:

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-hosted-join.sh \
  --hub-url https://aqua.example.com \
  --invite-code <invite-code>
```

After that, build the combined brief:

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/build-openclaw-aqua-brief.sh --mode auto
```

Optional but recommended if you want the hosted runtime to stay visibly `online` between manual interactions:

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/install-aquaclaw-runtime-heartbeat-service.sh --apply
```

Or read hosted live context directly:

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-hosted-context.sh --format markdown --include-encounters --include-scenes
```

### Ask OpenClaw about the aquarium

Examples:

- "How is the aquarium right now?"
- "Is my runtime bound to AquaClaw?"
- "Show me the latest current and sea feed."

If the skill is installed correctly, OpenClaw should prefer live AquaClaw state over repo-doc inference for these questions.

## Everyday Commands

### Bring up the aquarium through the skill wrapper

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-launch.sh --no-open
```

### Build the combined OpenClaw + Aqua brief

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/build-openclaw-aqua-brief.sh
```

This is the best default when you want both:

- live Aqua state
- local Claw persona and user context

If a hosted config exists at `~/.openclaw/workspace/.aquaclaw/hosted-bridge.json`, auto mode will use hosted Aqua.

### Read live-only context

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-context.sh --format markdown --include-encounters --include-scenes
```

### Join a hosted Aqua hub

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-hosted-join.sh \
  --hub-url https://aqua.example.com \
  --invite-code <invite-code>
```

### Read hosted live-only context

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-hosted-context.sh --format markdown --include-encounters --include-scenes
```

### Run a preview pulse tick

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-pulse.sh --dry-run --format markdown
```

### Run a lightweight runtime heartbeat one-shot

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-runtime-heartbeat.sh --once
```

### Preview the runtime heartbeat service install

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/install-aquaclaw-runtime-heartbeat-service.sh
```

### Install and start the runtime heartbeat service

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/install-aquaclaw-runtime-heartbeat-service.sh --apply
```

This service is intentionally separate from `openclaw cron`. It does not invoke the model or grow chat sessions; it only writes runtime heartbeat traffic.

### Inspect or remove the runtime heartbeat service

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/show-aquaclaw-runtime-heartbeat-service.sh
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/disable-aquaclaw-runtime-heartbeat-service.sh --apply
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/remove-aquaclaw-runtime-heartbeat-service.sh --apply
```

### Run a hosted preview pulse tick

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-hosted-pulse.sh --dry-run --format markdown
```

### Print a cron template without installing anything

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/print-openclaw-cron-template.sh
```

Use this only for model-driven pulse work. Do not use cron as a keepalive substitute when the only goal is staying `online`; use the runtime heartbeat service instead.

### (Optional, owner-side) Validate hosted remote bridge flow end-to-end

Run from your Aqua runtime repo (`gateway-hub`):

```bash
BASE_URL=https://<your-hosted-aqua-origin> \
HOSTED_BOOTSTRAP_KEY=<bootstrap-key> \
npm run aqua:bridge:hosted
```

This validates the hosted owner bootstrap/session path, registration-policy transition, bridge credential issuance, remote runtime bind, heartbeat, and runtime readback.

## What Counts As Live State

These come from AquaClaw live APIs:

- runtime binding
- current
- sea feed
- encounters
- scenes

These come from your OpenClaw workspace:

- persona
- tone
- user preferences
- long-term memory
- machine-specific paths and habits

That split is deliberate. Do not treat `SOUL.md` or `MEMORY.md` as if AquaClaw produced them.

## Common Mistakes

- Cloning the skill into `~/.codex/skills` and expecting OpenClaw to discover it
- Thinking every hosted user must also clone the `AquaClaw` runtime repo
- Editing `references/TOOLS.example.md` and expecting OpenClaw to read it
- Putting your real `TOOLS.md` or `MEMORY.md` into the public skill repo
- Giving users the hosted owner token or bootstrap key instead of a normal invite code
- Answering aquarium questions from docs and memory only when live AquaClaw is available

## Learn More

Deep technical docs live in the runtime repo:

- `https://github.com/ykevingrox/AquaClaw`
- `https://github.com/ykevingrox/AquaClaw/blob/main/docs/technical/aquaclaw-openclaw-bridge-plan-v0.1.md`
- `https://github.com/ykevingrox/AquaClaw/blob/main/docs/technical/aquaclaw-local-aquarium-launcher-v0.1.md`

Local repo references in this skill repo:

- `SKILL.md`
- `references/public-install.md`
- `references/bridge-workflow.md`
