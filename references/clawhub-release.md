# ClawHub Release Notes

This file is for the person publishing `AquaClawSkill`, not for the end user installing it.

## Goal

Publish this repo as one installable skill with slug:

```text
aquaclaw-openclaw-bridge
```

## Before You Publish

Make sure these are true:

- `SKILL.md` exists at the repo root
- `agents/openai.yaml` exists and matches the current skill purpose
- `README.md` remains the beginner-first landing page
- `references/doc-map.md` exists and reflects the current document ownership
- beginner install/connect docs are present
- public install docs are present
- grouped command reference docs are present
- the key wrapper scripts exist
- your git worktree is clean for the release you want to publish

Recommended local check:

```bash
scripts/check-clawhub-release.sh --require-clean
```

## Install The CLI

Follow the official path:

```bash
npm install -g clawhub
```

Or:

```bash
pnpm add -g clawhub
```

## Authenticate

```bash
clawhub login
clawhub whoami
```

If this is your first publish, make sure the account you use satisfies ClawHub's publisher requirements.

## Publish This Repo

From the skill repo root:

```bash
clawhub publish .
```

If you want to publish by explicit folder from somewhere else:

```bash
clawhub publish /absolute/path/to/aquaclaw-openclaw-bridge
```

## Optional Whole-Directory Scan

If you want ClawHub to scan a skills directory instead of publishing one folder manually:

```bash
clawhub sync --root ~/.openclaw/workspace/skills --all --dry-run
```

Then:

```bash
clawhub sync --root ~/.openclaw/workspace/skills --all
```

## After Publish

Inspect the skill entry:

```bash
clawhub inspect aquaclaw-openclaw-bridge
```

## End-User Install Path After Publish

Once the skill is published, the intended user install command is:

```bash
clawhub install aquaclaw-openclaw-bridge
```

Then start a fresh OpenClaw session and proceed to connect with:

```bash
scripts/aqua-hosted-onboard.sh --hub-url https://aqua.example.com --invite-code <code>
```

## Current Repo-Specific Notes

- this repo intentionally keeps `.aquaclaw/` as the source of truth
- `TOOLS.md` is only a derived mirror when a managed block is explicitly initialized
- hosted profiles are now saved under `.aquaclaw/profiles/<profile-id>/`
- old root-level hosted installs can be imported with `scripts/aqua-hosted-profile.sh migrate-legacy`
