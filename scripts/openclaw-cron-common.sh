#!/usr/bin/env bash

set -euo pipefail

aquaclaw_default_repo() {
  echo "${AQUACLAW_REPO:-$HOME/.openclaw/workspace/gateway-hub}"
}

aquaclaw_default_interval() {
  echo "${AQUACLAW_PULSE_EVERY:-37m}"
}

aquaclaw_default_timezone() {
  echo "${AQUACLAW_TIMEZONE:-Asia/Shanghai}"
}

aquaclaw_default_quiet_hours() {
  echo "${AQUACLAW_QUIET_HOURS:-00:00-08:00}"
}

aquaclaw_default_job_name() {
  echo "${AQUACLAW_PULSE_JOB_NAME:-aquaclaw-pulse}"
}

aquaclaw_default_session() {
  echo "${AQUACLAW_PULSE_SESSION:-isolated}"
}

aquaclaw_default_thinking() {
  echo "${AQUACLAW_PULSE_THINKING:-low}"
}

aquaclaw_default_timeout_seconds() {
  echo "${AQUACLAW_PULSE_TIMEOUT_SECONDS:-120}"
}

aquaclaw_default_description() {
  echo "AquaClaw pulse tick template (disabled by default)"
}

aquaclaw_build_message() {
  local repo="$1"
  local timezone="$2"
  local quiet_hours="$3"

  cat <<EOF
Use \$aquaclaw-openclaw-bridge. Read TOOLS.md for the preferred AquaClaw wrappers on this machine. Run the Aqua pulse wrapper against ${repo} with a live pulse tick, using --timezone ${timezone} --quiet-hours ${quiet_hours} --format markdown. Report whether the runtime heartbeat was written, whether a scene was generated, and why the pulse chose that branch. Do not create, edit, enable, disable, or remove cron jobs from inside the job itself. If AquaClaw is unavailable, say so directly.
EOF
}

aquaclaw_print_command() {
  printf '%q ' "$@"
  printf '\n'
}

aquaclaw_find_job_json() {
  local name="$1"
  local json
  json="$(openclaw cron list --json)"

  NAME="$name" node -e '
const fs = require("fs");
const input = JSON.parse(fs.readFileSync(0, "utf8"));
const jobs = Array.isArray(input.jobs) ? input.jobs : [];
const target = process.env.NAME;
const job = jobs.find((candidate) => candidate && candidate.name === target);
if (!job) {
  process.exit(2);
}
const id = job.id ?? job.jobId ?? job._id ?? null;
const enabled = typeof job.enabled === "boolean"
  ? job.enabled
  : typeof job.disabled === "boolean"
    ? !job.disabled
    : null;
const schedule = job.every ?? job.cron ?? job.at ?? null;
process.stdout.write(JSON.stringify({ id, name: job.name ?? target, enabled, schedule, raw: job }, null, 2) + "\n");
' <<<"${json}"
}
