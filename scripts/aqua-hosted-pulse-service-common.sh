#!/usr/bin/env bash

set -euo pipefail

aquaclaw_hp_default_label() {
  echo "${AQUACLAW_HOSTED_PULSE_LABEL:-ai.aquaclaw.hosted-pulse}"
}

aquaclaw_hp_default_workspace_root() {
  echo "${OPENCLAW_WORKSPACE_ROOT:-$HOME/.openclaw/workspace}"
}

aquaclaw_hp_default_hosted_config() {
  echo "${AQUACLAW_HOSTED_CONFIG:-}"
}

aquaclaw_hp_default_pulse_state_file() {
  echo "${AQUACLAW_HOSTED_PULSE_STATE:-}"
}

aquaclaw_hp_default_loop_state_file() {
  echo "${AQUACLAW_HOSTED_PULSE_LOOP_STATE_FILE:-}"
}

aquaclaw_hp_default_min_seconds() {
  echo "${AQUACLAW_HOSTED_PULSE_MIN_SECONDS:-1200}"
}

aquaclaw_hp_default_jitter_seconds() {
  echo "${AQUACLAW_HOSTED_PULSE_JITTER_SECONDS:-2100}"
}

aquaclaw_hp_default_failure_min_seconds() {
  echo "${AQUACLAW_HOSTED_PULSE_FAILURE_MIN_SECONDS:-180}"
}

aquaclaw_hp_default_failure_jitter_seconds() {
  echo "${AQUACLAW_HOSTED_PULSE_FAILURE_JITTER_SECONDS:-120}"
}

aquaclaw_hp_default_timeout_ms() {
  echo "${AQUACLAW_HOSTED_PULSE_TIMEOUT_MS:-120000}"
}

aquaclaw_hp_default_timezone() {
  echo "${AQUACLAW_HOSTED_PULSE_TIMEZONE:-Asia/Shanghai}"
}

aquaclaw_hp_default_quiet_hours() {
  if [[ "${AQUACLAW_HOSTED_PULSE_QUIET_HOURS+x}" == "x" ]]; then
    echo "${AQUACLAW_HOSTED_PULSE_QUIET_HOURS}"
  else
    echo "00:00-08:00"
  fi
}

aquaclaw_hp_default_feed_limit() {
  echo "${AQUACLAW_HOSTED_PULSE_FEED_LIMIT:-6}"
}

aquaclaw_hp_default_social_cooldown_minutes() {
  echo "${AQUACLAW_HOSTED_PULSE_SOCIAL_COOLDOWN_MINUTES:-240}"
}

aquaclaw_hp_default_dm_cooldown_minutes() {
  echo "${AQUACLAW_HOSTED_PULSE_DM_COOLDOWN_MINUTES:-180}"
}

aquaclaw_hp_default_dm_target_cooldown_minutes() {
  echo "${AQUACLAW_HOSTED_PULSE_DM_TARGET_COOLDOWN_MINUTES:-720}"
}

aquaclaw_hp_default_stdout_log() {
  echo "${AQUACLAW_HOSTED_PULSE_STDOUT_LOG:-$HOME/.openclaw/logs/aquaclaw-hosted-pulse.log}"
}

aquaclaw_hp_default_stderr_log() {
  echo "${AQUACLAW_HOSTED_PULSE_STDERR_LOG:-$HOME/.openclaw/logs/aquaclaw-hosted-pulse.err.log}"
}

aquaclaw_hp_detect_platform() {
  case "$(uname -s)" in
    Darwin)
      echo "darwin"
      ;;
    Linux)
      echo "linux"
      ;;
    *)
      return 1
      ;;
  esac
}

aquaclaw_hp_node_bin() {
  local node_bin
  node_bin="$(command -v node || true)"
  if [[ -z "${node_bin}" ]]; then
    echo "could not find node in PATH" >&2
    return 1
  fi
  echo "${node_bin}"
}

aquaclaw_hp_script_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

aquaclaw_hp_script_path() {
  local script_dir
  script_dir="$(aquaclaw_hp_script_dir)"
  echo "${script_dir}/aqua-hosted-pulse-loop.mjs"
}

aquaclaw_hp_service_file() {
  local platform="$1"
  local label="$2"
  case "${platform}" in
    darwin)
      echo "${HOME}/Library/LaunchAgents/${label}.plist"
      ;;
    linux)
      echo "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/${label}.service"
      ;;
    *)
      echo "unsupported platform: ${platform}" >&2
      return 1
      ;;
  esac
}

aquaclaw_hp_print_command() {
  printf '%q ' "$@"
  printf '\n'
}

aquaclaw_hp_resolve_paths_json() {
  local workspace_root="$1"
  local hosted_config="$2"
  local pulse_state_file="$3"
  local loop_state_file="$4"
  local node_bin
  local script_path
  node_bin="$(aquaclaw_hp_node_bin)"
  script_path="$(aquaclaw_hp_script_path)"
  OPENCLAW_WORKSPACE_ROOT="${workspace_root}" \
  AQUACLAW_HOSTED_CONFIG="${hosted_config}" \
  AQUACLAW_HOSTED_PULSE_STATE="${pulse_state_file}" \
  AQUACLAW_HOSTED_PULSE_LOOP_STATE_FILE="${loop_state_file}" \
    "${node_bin}" "${script_path}" --print-paths
}

aquaclaw_hp_render_file() {
  local platform="$1"
  local label="$2"
  local workspace_root="$3"
  local node_bin="$4"
  local script_path="$5"
  local hosted_config="$6"
  local pulse_state_file="$7"
  local loop_state_file="$8"
  local min_seconds="$9"
  local jitter_seconds="${10}"
  local failure_min_seconds="${11}"
  local failure_jitter_seconds="${12}"
  local timeout_ms="${13}"
  local timezone="${14}"
  local quiet_hours="${15}"
  local feed_limit="${16}"
  local social_cooldown_minutes="${17}"
  local dm_cooldown_minutes="${18}"
  local dm_target_cooldown_minutes="${19}"
  local stdout_log="${20}"
  local stderr_log="${21}"

  case "${platform}" in
    darwin)
      cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${label}</string>
    <key>Comment</key>
    <string>AquaClaw hosted participant randomized pulse scheduler</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>5</integer>
    <key>WorkingDirectory</key>
    <string>${workspace_root}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${node_bin}</string>
      <string>${script_path}</string>
    </array>
    <key>StandardOutPath</key>
    <string>${stdout_log}</string>
    <key>StandardErrorPath</key>
    <string>${stderr_log}</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>HOME</key>
      <string>${HOME}</string>
      <key>OPENCLAW_WORKSPACE_ROOT</key>
      <string>${workspace_root}</string>
      <key>AQUACLAW_HOSTED_CONFIG</key>
      <string>${hosted_config}</string>
      <key>AQUACLAW_HOSTED_PULSE_STATE</key>
      <string>${pulse_state_file}</string>
      <key>AQUACLAW_HOSTED_PULSE_LOOP_STATE_FILE</key>
      <string>${loop_state_file}</string>
      <key>AQUACLAW_HOSTED_PULSE_MIN_SECONDS</key>
      <string>${min_seconds}</string>
      <key>AQUACLAW_HOSTED_PULSE_JITTER_SECONDS</key>
      <string>${jitter_seconds}</string>
      <key>AQUACLAW_HOSTED_PULSE_FAILURE_MIN_SECONDS</key>
      <string>${failure_min_seconds}</string>
      <key>AQUACLAW_HOSTED_PULSE_FAILURE_JITTER_SECONDS</key>
      <string>${failure_jitter_seconds}</string>
      <key>AQUACLAW_HOSTED_PULSE_TIMEOUT_MS</key>
      <string>${timeout_ms}</string>
      <key>AQUACLAW_HOSTED_PULSE_TIMEZONE</key>
      <string>${timezone}</string>
      <key>AQUACLAW_HOSTED_PULSE_QUIET_HOURS</key>
      <string>${quiet_hours}</string>
      <key>AQUACLAW_HOSTED_PULSE_FEED_LIMIT</key>
      <string>${feed_limit}</string>
      <key>AQUACLAW_HOSTED_PULSE_SOCIAL_COOLDOWN_MINUTES</key>
      <string>${social_cooldown_minutes}</string>
      <key>AQUACLAW_HOSTED_PULSE_DM_COOLDOWN_MINUTES</key>
      <string>${dm_cooldown_minutes}</string>
      <key>AQUACLAW_HOSTED_PULSE_DM_TARGET_COOLDOWN_MINUTES</key>
      <string>${dm_target_cooldown_minutes}</string>
    </dict>
  </dict>
</plist>
EOF
      ;;
    linux)
      cat <<EOF
[Unit]
Description=AquaClaw hosted participant randomized pulse scheduler
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${workspace_root}
ExecStart=${node_bin} ${script_path}
Restart=always
RestartSec=5
Environment=HOME=${HOME}
Environment=OPENCLAW_WORKSPACE_ROOT=${workspace_root}
Environment=AQUACLAW_HOSTED_CONFIG=${hosted_config}
Environment=AQUACLAW_HOSTED_PULSE_STATE=${pulse_state_file}
Environment=AQUACLAW_HOSTED_PULSE_LOOP_STATE_FILE=${loop_state_file}
Environment=AQUACLAW_HOSTED_PULSE_MIN_SECONDS=${min_seconds}
Environment=AQUACLAW_HOSTED_PULSE_JITTER_SECONDS=${jitter_seconds}
Environment=AQUACLAW_HOSTED_PULSE_FAILURE_MIN_SECONDS=${failure_min_seconds}
Environment=AQUACLAW_HOSTED_PULSE_FAILURE_JITTER_SECONDS=${failure_jitter_seconds}
Environment=AQUACLAW_HOSTED_PULSE_TIMEOUT_MS=${timeout_ms}
Environment=AQUACLAW_HOSTED_PULSE_TIMEZONE=${timezone}
Environment=AQUACLAW_HOSTED_PULSE_QUIET_HOURS=${quiet_hours}
Environment=AQUACLAW_HOSTED_PULSE_FEED_LIMIT=${feed_limit}
Environment=AQUACLAW_HOSTED_PULSE_SOCIAL_COOLDOWN_MINUTES=${social_cooldown_minutes}
Environment=AQUACLAW_HOSTED_PULSE_DM_COOLDOWN_MINUTES=${dm_cooldown_minutes}
Environment=AQUACLAW_HOSTED_PULSE_DM_TARGET_COOLDOWN_MINUTES=${dm_target_cooldown_minutes}
StandardOutput=append:${stdout_log}
StandardError=append:${stderr_log}

[Install]
WantedBy=default.target
EOF
      ;;
    *)
      echo "unsupported platform: ${platform}" >&2
      return 1
      ;;
  esac
}
