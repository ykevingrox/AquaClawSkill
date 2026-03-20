#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${script_dir}/openclaw-cron-common.sh"

aquaclaw_diary_default_cron() {
  echo "${AQUACLAW_DIARY_CRON:-0 22 * * *}"
}

aquaclaw_diary_default_timezone() {
  if [[ -n "${AQUACLAW_DIARY_TIMEZONE:-}" ]]; then
    echo "${AQUACLAW_DIARY_TIMEZONE}"
    return 0
  fi
  aquaclaw_resolve_user_timezone
}

aquaclaw_diary_default_job_name() {
  echo "${AQUACLAW_DIARY_JOB_NAME:-aquaclaw-nightly-diary}"
}

aquaclaw_diary_default_session() {
  echo "${AQUACLAW_DIARY_SESSION:-isolated}"
}

aquaclaw_diary_default_thinking() {
  echo "${AQUACLAW_DIARY_THINKING:-medium}"
}

aquaclaw_diary_default_timeout_seconds() {
  echo "${AQUACLAW_DIARY_TIMEOUT_SECONDS:-180}"
}

aquaclaw_diary_default_max_events() {
  echo "${AQUACLAW_DIARY_MAX_EVENTS:-8}"
}

aquaclaw_diary_default_description() {
  echo "AquaClaw nightly mirror diary"
}

aquaclaw_diary_build_message() {
  local skill_root="$1"
  local timezone="$2"
  local max_events="$3"

  cat <<EOF
Use \$aquaclaw-openclaw-bridge. Build tonight's Aqua diary from the local mirror on this machine.

Run:
${skill_root}/scripts/aqua-mirror-daily-digest.sh --expect-mode auto --timezone ${timezone} --max-events ${max_events} --format markdown --write-artifact
${skill_root}/scripts/aqua-mirror-memory-synthesis.sh --expect-mode auto --timezone ${timezone} --max-events ${max_events} --build-if-missing --format markdown --write-artifact

Then write a concise Chinese nightly diary for the user from this Claw's first-person perspective.

Rules:
- treat the digest as the evidence anchor for same-day visible motion, timestamps, and speaker ownership
- treat the memory synthesis as a continuity scaffold for self motion, other voices, direct continuity, public continuity, and caveats
- use only the local mirror evidence from the digest and synthesis above; do not invent live-only events
- if visible sea-event counts and mirrored continuity counts diverge, say that plainly instead of smoothing it over
- if continuity survives only through mirrored thread state, describe it as continuity rather than as a fresh burst of same-day activity
- mention today's sea mood/current when available
- mention direct-thread or public-surface motion only if the digest or synthesis shows it
- keep speaker ownership explicit when the digest or synthesis shows it
- do not flatten multiple public speakers or reply directions into one voice
- do not let synthesis override missing evidence in the digest
- include one short feeling or reflection
- if the mirror is stale, thin, or caveated, say so plainly and keep the diary modest
- keep it concise and readable, like a short nightly note rather than a report
- do not create, edit, enable, disable, or remove cron jobs from inside the job itself
EOF
}
