# AquaClawSkill

A beginner-friendly bridge between OpenClaw and a local AquaClaw aquarium.

This repo is the public OpenClaw-side install guide and skill package for the AquaClaw stack:

- `AquaClaw` runs the local aquarium
- `AquaClawSkill` teaches OpenClaw how to start it, read it, and talk about it from live state

If you want the shortest possible summary:

- clone the AquaClaw runtime repo
- clone this skill repo into your OpenClaw workspace `skills/` directory
- install the runtime dependencies
- start the aquarium
- ask OpenClaw about the aquarium, or run the bridge scripts directly

## What This Is

There are two public repos in this setup:

- Runtime repo: `https://github.com/ykevingrox/AquaClaw.git`
- Skill repo: `https://github.com/ykevingrox/AquaClawSkill.git`

They do different jobs:

- `AquaClaw` is the local sea runtime and console
- `AquaClawSkill` is the OpenClaw skill that knows how to:
  - find your local AquaClaw repo
  - bring the aquarium up
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

## What You Can Do

After setup, this stack lets you:

- start a full local aquarium with one command
- open a local aquarium console in the browser
- read a live owner/runtime/current/feed snapshot
- ask OpenClaw "how is the aquarium right now?" and have it answer from live state
- run a preview pulse tick that heartbeats the runtime and can optionally generate a scene
- print a disabled cron template for periodic autonomy
- run an optional hosted bridge end-to-end validation flow against a hosted Aqua deployment

## Recommended Local Layout

```text
~/.openclaw/workspace/
  gateway-hub/
  skills/
    aquaclaw-openclaw-bridge/
  SOUL.md
  USER.md
  TOOLS.md
  MEMORY.md
  memory/
```

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

### 1. Clone the AquaClaw runtime repo

```bash
mkdir -p ~/.openclaw/workspace
git clone https://github.com/ykevingrox/AquaClaw.git ~/.openclaw/workspace/gateway-hub
```

### 2. Clone this skill repo into the OpenClaw skills directory

```bash
mkdir -p ~/.openclaw/workspace/skills
git clone https://github.com/ykevingrox/AquaClawSkill.git ~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge
```

This location matters. OpenClaw discovers workspace skills from `~/.openclaw/workspace/skills`.

Do not put this repo in `~/.codex/skills` if your goal is OpenClaw skill discovery.

### 3. Install the AquaClaw runtime dependencies

```bash
cd ~/.openclaw/workspace/gateway-hub
npm install
```

### 4. Verify that OpenClaw can see the skill

```bash
openclaw skills info aquaclaw-openclaw-bridge
```

You should see the skill with source `openclaw-workspace`.

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
- Repo: /absolute/path/to/gateway-hub
- Skill path: /absolute/path/to/workspace/skills/aquaclaw-openclaw-bridge
```

If your AquaClaw repo is not at the default path, set `AQUACLAW_REPO` when running the bridge scripts.

### Example files

These files are examples only:

- `references/TOOLS.example.md`
- `references/MEMORY.example.md`

OpenClaw does not load those example files as live config.

## First Run

### 1. Start the local aquarium

```bash
cd ~/.openclaw/workspace/gateway-hub
npm run dev:aquarium
```

This starts the server and console, bootstraps the local owner session, binds the local runtime, heartbeats it, and seeds the local reef sandbox.

Useful variant:

```bash
npm run dev:aquarium -- --no-open
```

### 2. Check the live aquarium snapshot

```bash
cd ~/.openclaw/workspace/gateway-hub
npm run aqua:context -- --format markdown --include-encounters --include-scenes
```

### 3. Ask OpenClaw about the aquarium

Examples:

- "How is the aquarium right now?"
- "Is my local runtime bound to AquaClaw?"
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

### Read live-only context

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-context.sh --format markdown --include-encounters --include-scenes
```

### Run a preview pulse tick

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/aqua-pulse.sh --dry-run --format markdown
```

### Print a cron template without installing anything

```bash
~/.openclaw/workspace/skills/aquaclaw-openclaw-bridge/scripts/print-openclaw-cron-template.sh
```

### (Optional) Validate hosted remote bridge flow end-to-end

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
- Editing `references/TOOLS.example.md` and expecting OpenClaw to read it
- Putting your real `TOOLS.md` or `MEMORY.md` into the public skill repo
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
