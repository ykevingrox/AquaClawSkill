# Repo Structure And Docs Refresh Plan v0.1

## Status

- Date: 2026-03-19
- Scope: `AquaClawSkill` / `aquaclaw-openclaw-bridge`
- Goal: make the repo easier for non-technical users to read, reduce document drift, and clarify which docs are canonical

## Problems This Pass Fixes

1. `README.md` currently mixes beginner onboarding, advanced command cookbook, operator notes, and publisher notes in one long page.
2. `README.md`, `SKILL.md`, and multiple `references/*.md` files repeat the same facts in slightly different wording, which makes drift likely.
3. The repo has many scripts, but the human-facing docs do not clearly separate:
   - everyday beginner paths
   - advanced command reference
   - publisher / release steps
   - operator / workflow semantics
4. The current release check only verifies a minimal file set and does not protect the new documentation structure from drifting away later.

## Non-Goals

- Do not physically rename or move large batches of scripts in this pass.
- Do not change working command paths in a way that would break existing users.
- Do not hide or obfuscate scripts to evade ClawHub review.
- Do not merge user-facing beginner docs with agent-facing `SKILL.md`.

## Target Information Architecture

### README.md

- Audience: non-technical end users
- Role: shortest beginner-first explanation of what this repo is and what to do next
- Must include:
  - what AquaClaw vs AquaClawSkill each do
  - choose-your-path guidance: hosted participant / local machine / public observer only
  - install basics
  - one recommended hosted quickstart
  - one recommended local quickstart
  - where advanced docs live
- Must not include:
  - exhaustive command catalog
  - publisher-only release details
  - deep mirror/service/cron internals

### SKILL.md

- Audience: Codex / OpenClaw agent
- Role: routing and workflow selection only
- Must stay concise and point to references rather than duplicating long human docs

### references/doc-map.md

- Audience: humans and agents
- Role: canonical map of which document owns which topic
- This is the anti-drift index

### references/command-reference.md

- Audience: advanced users / operators
- Role: exhaustive grouped command catalog that no longer belongs in `README.md`

### references/beginner-install-connect-switch.md

- Audience: non-technical users who need the install/connect/switch mental model
- Role: plain-language conceptual walkthrough

### references/public-install.md

- Audience: public shareable install readers
- Role: practical setup checklist, narrower than the full command catalog

### references/bridge-workflow.md

- Audience: operators / agents
- Role: workflow semantics, automation boundaries, and system behavior

### references/clawhub-release.md

- Audience: publisher only
- Role: release and publish checklist

## Planned Changes

1. Add a formal doc map file and make it the canonical routing surface.
2. Add a separate advanced command reference file and move the long command catalog responsibility there.
3. Rewrite `README.md` to be dramatically shorter and friendlier for ordinary users.
4. Tighten `SKILL.md` so it routes to the new canonical docs instead of carrying overlapping detail.
5. Add release-check coverage for the new canonical docs so future releases do not silently drop them.

## Exit Criteria

- `README.md` is clearly beginner-first and materially shorter than before.
- There is one canonical doc map.
- There is one canonical advanced command reference.
- Existing docs link to the new canonical map instead of re-explaining everything.
- Release tooling verifies the presence of the new canonical docs.

## Follow-Up Work

- A later pass may physically regroup scripts by category, but only after the doc boundaries are stable and the user-facing paths are intentionally redesigned.
