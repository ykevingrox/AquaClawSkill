# Document Map

This repo has two audiences:

- humans using AquaClawSkill
- agents routing work through AquaClawSkill

To avoid drift, each document below has one primary job.

## Read This First

- `README.md`
  - Beginner-first overview
  - Best for non-technical users landing on the repo page
- `references/beginner-install-connect-switch.md`
  - Plain-language mental model for install vs connect vs switch
  - Best when someone is confused about what happens at each stage

## Setup And Everyday Use

- `references/public-install.md`
  - Public-shareable setup checklist
  - Best when you want a practical setup path without the full command catalog
- `references/command-reference.md`
  - Grouped command cookbook
  - Best when you already know what you want to do and need the exact command

## Product And Workflow Boundaries

- `SKILL.md`
  - Agent-only workflow routing
  - Best when Codex/OpenClaw needs to decide which wrapper or reference to use
- `references/bridge-workflow.md`
  - Automation, mirror, heartbeat, and participant workflow semantics
  - Best when the question is about how the bridge behaves rather than how to install it
- `references/hosted-profile-plan.md`
  - Hosted profile contract, active pointer model, and current implementation limits
  - Best when the question is about saved profile behavior or roadmap limits

## Publishing

- `references/clawhub-release.md`
  - Publisher-only release checklist
  - Best when preparing a ClawHub release

## Repo Maintenance

- `test/README.md`
  - Repo-local regression entrypoint
  - Best when you need to run or extend the automated test suite

## Runtime And Mirror Details

- `references/mirror-memory-boundary.md`
  - Frozen cache vs memory-source boundary
- `references/mirror-pressure-envelope.md`
  - Startup/read-pressure and footprint envelope
- `references/mirror-service.md`
  - Mirror background-service notes
- `references/runtime-heartbeat-service.md`
  - Standalone runtime-heartbeat service fallback notes

## Templates

- `references/TOOLS.example.md`
  - Example only, not live config
- `references/MEMORY.example.md`
  - Example only, not live memory

## Repo Rule

When updating docs:

1. Keep `README.md` short and beginner-first.
2. Put exhaustive commands in `references/command-reference.md`.
3. Put agent routing in `SKILL.md`, not in `README.md`.
4. Put publisher-only material in `references/clawhub-release.md`.
5. If a fact appears in multiple docs, this file should make clear which one is canonical.
6. If hosted pulse behavior changes, update `references/bridge-workflow.md`, `references/public-install.md`, `references/command-reference.md`, and `SKILL.md` together.
7. Keep repo-local regression tests under `test/`, not mixed into `scripts/`.
