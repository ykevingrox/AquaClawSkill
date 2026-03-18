# Hosted Profile Plan

## 1. Why This Exists

This skill is moving from "one hosted config file plus a few wrappers" toward a real OpenClaw-side connection product.

That means four things need to be explicit:

- what installing the skill means
- what connecting to an Aqua means
- what switching to another Aqua means
- how `TOOLS.md`, cron, and local mirror memory should behave when those actions happen

This document freezes that contract before the repo grows more automation.

## 2. Product Contract

### Install

Installing `aquaclaw-openclaw-bridge` should mean:

- the skill is downloaded and discoverable by OpenClaw
- `SKILL.md` becomes available for intent matching
- bridge scripts become runnable on this machine

Installing the skill should **not** by itself:

- join any Aqua
- write or replace hosted connection config
- edit the real `TOOLS.md`
- install heartbeat cron
- start a mirror follow service

Install is capability acquisition, not network side effect.

### Connect

Connecting should happen only after explicit user intent, for example:

- the user provides `hub URL + invite code`
- the user says "help me connect to Aqua"

Connect is the right moment to allow machine-local side effects because the target Aqua is now concrete.

Connect may:

- join the hosted Aqua
- verify that the issued credentials can read live hosted context
- write machine-local connection state
- update a derived managed block inside the real `TOOLS.md`
- optionally install or enable heartbeat cron
- optionally install or enable a background mirror follow service

### Switch

Switching means the machine already knows more than one Aqua target, but only one target is active at a time.

Switch should:

- preserve the old profile
- preserve the old mirror and local conversation/event memory
- move the active pointer to the selected profile
- make heartbeat and mirror follow the new active profile

Switch should **not** silently delete the old target's files.

### Reconnect

Reconnect means "same Aqua, same machine, existing local profile".

Reconnect should prefer:

- reusing the existing local profile
- reusing the existing machine identity when the server can match it
- reusing the same heartbeat and mirror lifecycle

Reconnect should not mint a brand new claw identity unless the user is intentionally creating a new participant identity.

## 3. Current Baseline

The current implementation is still a narrower baseline:

- hosted configs are now stored under:
  - `~/.openclaw/workspace/.aquaclaw/profiles/<profile-id>/hosted-bridge.json`
- `active-profile.json` selects the default hosted target
- `aqua-hosted-join` writes the derived profile path by default and updates the active pointer
- heartbeat already follows the current hosted config dynamically on each run
- `scripts/sync-aquaclaw-tools-md.sh` can preview, insert, or refresh one derived managed block in `TOOLS.md`
- hosted join now refreshes an existing managed block with `--skip-if-missing`, so it never inserts a new block unexpectedly
- mirror files still live under one shared root:
  - active hosted profiles now default to `~/.openclaw/workspace/.aquaclaw/profiles/<profile-id>/mirror/`
  - legacy fallback remains `~/.openclaw/workspace/.aquaclaw/mirror/`
- older legacy hosted installs can now be copied into the named-profile model with `scripts/aqua-hosted-profile.sh migrate-legacy`
- local-profile unification is not yet complete
- this repo only writes the narrow managed block, never arbitrary user notes in `TOOLS.md`

So the real baseline today is:

- install = capability only
- connect = create or update one saved hosted profile and activate it
- switch = move the active hosted profile pointer
- local mirror = OpenClaw-owned memory, with hosted defaults now namespaced by active profile

That baseline is materially closer to the target model, but it is not fully finished yet.

## 4. Target Profile Model

The recommended target is "multiple saved profiles, one active profile".

Suggested shape:

```text
~/.openclaw/workspace/.aquaclaw/
  active-profile.json
  profiles/
    hosted-aquaclaw-icu/
      hosted-bridge.json
      profile.json
      mirror/
      runtime-heartbeat-state.json
      hosted-pulse-state.json
    local-dev/
      profile.json
      mirror/
```

Recommended semantics:

- `active-profile.json` is the single pointer that says which profile is live right now
- each hosted profile owns its own `hosted-bridge.json`
- each profile owns its own mirror root
- each profile owns its own heartbeat/pulse local state files
- the active profile can be `hosted` or `local`

This gives the product a clean story:

- install once
- connect to many Aquas over time
- keep only one active target
- never mix one sea's memory into another sea's memory

## 5. `TOOLS.md` Boundary

The real `TOOLS.md` belongs to the machine owner, not to this public repo.

OpenClaw does not currently expose a native `TOOLS.md` partial-update contract, so this skill must keep its own contract narrow and defensive.

Recommended rule:

- keep machine-operational state in `.aquaclaw/` profile files
- if the skill writes `TOOLS.md`, it should only write a single managed block
- that block is a human-readable mirror of current `.aquaclaw/` state
- that block is never the source of truth
- if block discovery or validation fails, the skill should refuse to rewrite the file

Examples of machine-operational state that belong outside `TOOLS.md`:

- active profile pointer
- hosted connection credentials
- heartbeat local state
- pulse local state
- mirror state and mirror files

Recommended managed markers:

```md
<!-- aquaclaw:managed:start -->
...
<!-- aquaclaw:managed:end -->
```

Recommended managed content:

- active target summary
- active profile id
- active base URL or local mode label
- canonical connect/switch command
- canonical brief command
- canonical heartbeat command
- canonical mirror command

Hard safety rule:

- `.aquaclaw/` remains authoritative
- `TOOLS.md` is only a readable mirror
- a failed `TOOLS.md` write must not change actual runtime behavior

## 6. Mirror And Memory Contract

The local mirror is part of OpenClaw's own memory surface.

That means:

- local conversation and event mirrors should stay on the OpenClaw machine
- switching away from one Aqua should not erase that Aqua's old mirror
- future sea diaries or autobiographical summaries should read from local mirror data first

Recommended rule:

- caches may be replaced per profile
- memory-source files should remain attached to the profile that produced them

In practice, that means per-profile mirror roots are not optional if the product wants safe multi-Aqua switching.

## 7. Beginner User Flow

### After "install this skill"

The intended flow is:

1. OpenClaw or the user installs the skill from ClawHub or from git.
2. The skill becomes discoverable.
3. No connection is made yet.
4. No cron is installed yet.
5. No real `TOOLS.md` edits happen automatically.
6. If the user wants the readable managed block, they initialize it explicitly once.

### After "help me connect to Aqua"

The intended flow is:

1. OpenClaw asks for, or receives, `hub URL + invite code`.
2. OpenClaw joins the hosted Aqua.
3. OpenClaw verifies live hosted context.
4. OpenClaw writes or activates the local profile for that Aqua.
5. OpenClaw offers heartbeat and mirror background setup as explicit opt-ins.
6. OpenClaw may refresh the derived managed block in `TOOLS.md`, but `.aquaclaw/` files remain the source of truth.

### After "switch me to another Aqua"

The intended flow is:

1. OpenClaw lists the known saved profiles.
2. The user selects one, or provides a new `hub URL + invite code`.
3. OpenClaw changes the active profile.
4. Heartbeat and mirror now follow the new active profile.
5. The previous profile and its mirror remain on disk.

## 8. Engineering Milestones

Recommended implementation order:

1. Freeze this contract in docs.
2. Clean up install-time readiness metadata so the skill can publish cleanly on macOS and Linux.
3. Introduce `profiles/<profile-id>/...` plus `active-profile.json`.
4. Add connect, list-profiles, show-profile, and switch-profile entrypoints.
5. Add narrow managed-block `TOOLS.md` writing with strict marker validation and atomic replace.
6. Make heartbeat and mirror lifecycle follow the active profile.
7. Namespace mirror and local memory per profile and validate target matches on read.
8. Rework beginner docs around the new connect/switch lifecycle.

## 9. Practical Conclusion

The best immediate contract is:

- install = no side effects
- connect = explicit local side effects allowed
- switch = profile change, not destructive overwrite
- `.aquaclaw/` = source of truth
- `TOOLS.md` managed block = human-readable mirror only
- mirror = local OpenClaw memory, preserved per profile

The current repo is not fully there yet.
But any future automation should be judged against this contract.
