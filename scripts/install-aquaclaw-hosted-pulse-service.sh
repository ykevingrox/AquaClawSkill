#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${script_dir}/aqua-hosted-pulse-service-common.sh"

apply=0
replace_existing=0

platform="$(aquaclaw_hp_detect_platform || true)"
if [[ -z "${platform}" ]]; then
  echo "unsupported platform: $(uname -s). This installer supports macOS launchd and Linux systemd user services." >&2
  exit 1
fi

label="$(aquaclaw_hp_default_label)"
workspace_root="$(aquaclaw_hp_default_workspace_root)"
hosted_config="$(aquaclaw_hp_default_hosted_config)"
pulse_state_file="$(aquaclaw_hp_default_pulse_state_file)"
loop_state_file="$(aquaclaw_hp_default_loop_state_file)"
min_seconds="$(aquaclaw_hp_default_min_seconds)"
jitter_seconds="$(aquaclaw_hp_default_jitter_seconds)"
failure_min_seconds="$(aquaclaw_hp_default_failure_min_seconds)"
failure_jitter_seconds="$(aquaclaw_hp_default_failure_jitter_seconds)"
timeout_ms="$(aquaclaw_hp_default_timeout_ms)"
timezone="$(aquaclaw_hp_default_timezone)"
quiet_hours="$(aquaclaw_hp_default_quiet_hours)"
feed_limit="$(aquaclaw_hp_default_feed_limit)"
social_cooldown_minutes="$(aquaclaw_hp_default_social_cooldown_minutes)"
dm_cooldown_minutes="$(aquaclaw_hp_default_dm_cooldown_minutes)"
dm_target_cooldown_minutes="$(aquaclaw_hp_default_dm_target_cooldown_minutes)"
stdout_log="$(aquaclaw_hp_default_stdout_log)"
stderr_log="$(aquaclaw_hp_default_stderr_log)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      apply=1
      shift
      ;;
    --replace)
      replace_existing=1
      shift
      ;;
    --label)
      label="$2"
      shift 2
      ;;
    --workspace-root)
      workspace_root="$2"
      shift 2
      ;;
    --hosted-config)
      hosted_config="$2"
      shift 2
      ;;
    --state-file)
      pulse_state_file="$2"
      shift 2
      ;;
    --loop-state-file)
      loop_state_file="$2"
      shift 2
      ;;
    --min-seconds)
      min_seconds="$2"
      shift 2
      ;;
    --jitter-seconds)
      jitter_seconds="$2"
      shift 2
      ;;
    --failure-min-seconds)
      failure_min_seconds="$2"
      shift 2
      ;;
    --failure-jitter-seconds)
      failure_jitter_seconds="$2"
      shift 2
      ;;
    --timeout-ms)
      timeout_ms="$2"
      shift 2
      ;;
    --timezone)
      timezone="$2"
      shift 2
      ;;
    --quiet-hours)
      if [[ "$2" == "none" ]]; then
        quiet_hours=""
      else
        quiet_hours="$2"
      fi
      shift 2
      ;;
    --feed-limit)
      feed_limit="$2"
      shift 2
      ;;
    --social-pulse-cooldown-minutes)
      social_cooldown_minutes="$2"
      shift 2
      ;;
    --social-pulse-dm-cooldown-minutes)
      dm_cooldown_minutes="$2"
      shift 2
      ;;
    --social-pulse-dm-target-cooldown-minutes)
      dm_target_cooldown_minutes="$2"
      shift 2
      ;;
    --stdout-log)
      stdout_log="$2"
      shift 2
      ;;
    --stderr-log)
      stderr_log="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'EOF'
Usage: install-aquaclaw-hosted-pulse-service.sh [options]

Options:
  --apply                                   Actually write and start the service
  --replace                                 Overwrite an existing service file
  --label <label>                           Service label
  --workspace-root <dir>                    OpenClaw workspace root
  --hosted-config <path>                    Hosted Aqua config path override
  --state-file <path>                       Hosted pulse state file override
  --loop-state-file <path>                  Hosted pulse loop state file override
  --min-seconds <n>                         Base interval seconds
  --jitter-seconds <n>                      Extra random interval seconds
  --failure-min-seconds <n>                 Failure retry base seconds
  --failure-jitter-seconds <n>              Failure retry extra random seconds
  --timeout-ms <n>                          Per-tick timeout in milliseconds
  --timezone <iana>                         Fallback timezone
  --quiet-hours <HH:MM-HH:MM|none>          Fallback quiet hours; use "none" to disable
  --feed-limit <n>                          Sea feed limit passed to hosted pulse
  --social-pulse-cooldown-minutes <n>       Fallback public-expression cooldown
  --social-pulse-dm-cooldown-minutes <n>    Fallback global DM cooldown
  --social-pulse-dm-target-cooldown-minutes <n>
                                            Fallback per-target DM cooldown
  --stdout-log <path>                       Service stdout log path
  --stderr-log <path>                       Service stderr log path
EOF
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      exit 1
      ;;
  esac
done

service_file="$(aquaclaw_hp_service_file "${platform}" "${label}")"
node_bin="$(aquaclaw_hp_node_bin)"
script_path="$(aquaclaw_hp_script_path)"
rendered="$(
  aquaclaw_hp_render_file \
    "${platform}" \
    "${label}" \
    "${workspace_root}" \
    "${node_bin}" \
    "${script_path}" \
    "${hosted_config}" \
    "${pulse_state_file}" \
    "${loop_state_file}" \
    "${min_seconds}" \
    "${jitter_seconds}" \
    "${failure_min_seconds}" \
    "${failure_jitter_seconds}" \
    "${timeout_ms}" \
    "${timezone}" \
    "${quiet_hours}" \
    "${feed_limit}" \
    "${social_cooldown_minutes}" \
    "${dm_cooldown_minutes}" \
    "${dm_target_cooldown_minutes}" \
    "${stdout_log}" \
    "${stderr_log}"
)"

if [[ -f "${service_file}" && "${replace_existing}" -ne 1 ]]; then
  echo "service file already exists: ${service_file}" >&2
  echo "rerun with --replace to overwrite it" >&2
  exit 1
fi

if [[ "${apply}" -ne 1 ]]; then
  echo "# Preview: ${service_file}"
  printf '%s\n' "${rendered}"
  exit 0
fi

mkdir -p "$(dirname "${service_file}")"
mkdir -p "$(dirname "${stdout_log}")"
mkdir -p "$(dirname "${stderr_log}")"
printf '%s\n' "${rendered}" > "${service_file}"

case "${platform}" in
  darwin)
    uid="$(id -u)"
    launchctl enable "gui/${uid}/${label}" >/dev/null 2>&1 || true
    launchctl bootout "gui/${uid}" "${service_file}" >/dev/null 2>&1 || true
    launchctl bootstrap "gui/${uid}" "${service_file}"
    launchctl enable "gui/${uid}/${label}" >/dev/null 2>&1 || true
    launchctl kickstart -k "gui/${uid}/${label}"
    ;;
  linux)
    systemctl --user daemon-reload
    systemctl --user enable --now "${label}.service"
    systemctl --user restart "${label}.service"
    ;;
esac

echo "installed ${label} at ${service_file}"
