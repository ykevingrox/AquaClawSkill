#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

workspace_root="${OPENCLAW_WORKSPACE_ROOT:-$HOME/.openclaw/workspace}"
include_memory=0
max_lines=80
aqua_mode="auto"
aqua_source="auto"
mirror_max_age_seconds="${AQUACLAW_MIRROR_MAX_AGE_SECONDS:-1200}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace-root)
      workspace_root="$2"
      shift 2
      ;;
    --mode)
      aqua_mode="$2"
      shift 2
      ;;
    --aqua-source)
      aqua_source="$2"
      shift 2
      ;;
    --include-memory)
      include_memory=1
      shift
      ;;
    --max-lines)
      max_lines="$2"
      shift 2
      ;;
    --mirror-max-age-seconds)
      mirror_max_age_seconds="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'EOF'
Usage: build-openclaw-aqua-brief.sh [options]

Options:
  --workspace-root <path>  OpenClaw workspace root
  --mode <mode>            auto|local|hosted
  --aqua-source <source>   auto|mirror|live
  --include-memory         Include MEMORY.md in the local context section
  --max-lines <n>          Max lines to include from each local file
  --mirror-max-age-seconds Freshness window for local mirror reads (default: 1200)
EOF
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if ! [[ "$max_lines" =~ ^[1-9][0-9]*$ ]]; then
  echo "--max-lines must be a positive integer" >&2
  exit 1
fi

if [[ "$aqua_mode" != "auto" && "$aqua_mode" != "local" && "$aqua_mode" != "hosted" ]]; then
  echo "--mode must be one of: auto, local, hosted" >&2
  exit 1
fi
if [[ "$aqua_source" != "auto" && "$aqua_source" != "mirror" && "$aqua_source" != "live" ]]; then
  echo "--aqua-source must be one of: auto, mirror, live" >&2
  exit 1
fi
if ! [[ "$mirror_max_age_seconds" =~ ^[1-9][0-9]*$ ]]; then
  echo "--mirror-max-age-seconds must be a positive integer" >&2
  exit 1
fi

hosted_config_path="${AQUACLAW_HOSTED_CONFIG:-${workspace_root}/.aquaclaw/hosted-bridge.json}"
selected_mode="$aqua_mode"

if [[ "$selected_mode" == "auto" ]]; then
  if [[ -f "$hosted_config_path" ]]; then
    selected_mode="hosted"
  else
    selected_mode="local"
  fi
fi

run_capture() {
  local __result_var="$1"
  shift

  local output
  local status
  if output="$("$@" 2>&1)"; then
    status=0
  else
    status=$?
  fi

  printf -v "$__result_var" '%s' "$output"
  return "$status"
}

print_file_section() {
  local title="$1"
  local file_path="$2"

  echo "## ${title}"
  echo
  if [[ -f "$file_path" ]]; then
    sed -n "1,${max_lines}p" "$file_path"
  else
    echo "_Missing: ${file_path}_"
  fi
  echo
}

echo "# OpenClaw Aqua Brief"
echo
echo "- Generated at: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "- Workspace root: ${workspace_root}"
echo "- Aqua mode: ${selected_mode}"
echo "- Aqua source policy: ${aqua_source}"
echo "- Mirror freshness window: ${mirror_max_age_seconds}s"
if [[ "$selected_mode" == "hosted" ]]; then
  echo "- Hosted config presence selects the hosted read target, but does not prove live OpenClaw runtime status."
fi
echo "- Include MEMORY.md: $([[ "$include_memory" -eq 1 ]] && echo yes || echo no)"
echo

echo "# Local Context"
echo
print_file_section "SOUL.md" "${workspace_root}/SOUL.md"
print_file_section "USER.md" "${workspace_root}/USER.md"

if [[ "$include_memory" -eq 1 ]]; then
  print_file_section "MEMORY.md" "${workspace_root}/MEMORY.md"
fi

if [[ "$selected_mode" == "hosted" ]]; then
  live_cmd=(
    "${script_dir}/aqua-hosted-context.sh"
    --workspace-root "${workspace_root}"
    --config-path "${hosted_config_path}"
    --format markdown
    --include-encounters
    --include-scenes
  )
else
  live_cmd=(
    "${script_dir}/aqua-context.sh"
    --format markdown
    --include-encounters
    --include-scenes
  )
fi

mirror_cmd=(
  "${script_dir}/aqua-mirror-read.sh"
  --workspace-root "${workspace_root}"
  --expect-mode "${selected_mode}"
  --format markdown
  --max-age-seconds "${mirror_max_age_seconds}"
)

aqua_output=""
aqua_source_used="unavailable"
aqua_resolution_note=""
mirror_fresh_error=""
mirror_error=""
live_error=""

case "$aqua_source" in
  mirror)
    if run_capture aqua_output "${mirror_cmd[@]}"; then
      aqua_source_used="mirror"
      aqua_resolution_note="Using the local OpenClaw mirror only; no live Aqua read was attempted."
    else
      mirror_error="$aqua_output"
    fi
    ;;
  live)
    if run_capture aqua_output "${live_cmd[@]}"; then
      aqua_source_used="live"
      aqua_resolution_note="Using live Aqua APIs only; mirror state was ignored."
    else
      live_error="$aqua_output"
    fi
    ;;
  auto)
    if run_capture aqua_output "${mirror_cmd[@]}" --fresh-only; then
      aqua_source_used="mirror"
      aqua_resolution_note="Using a fresh local mirror, so no live Aqua read was needed."
    else
      mirror_fresh_error="$aqua_output"
      if run_capture aqua_output "${live_cmd[@]}"; then
        aqua_source_used="live"
        aqua_resolution_note="No fresh local mirror was available, so the brief fell back to live Aqua APIs."
      else
        live_error="$aqua_output"
        if run_capture aqua_output "${mirror_cmd[@]}"; then
          aqua_source_used="mirror (stale fallback)"
          aqua_resolution_note="Live Aqua read failed, so the brief fell back to a stale local mirror."
        else
          mirror_error="$aqua_output"
        fi
      fi
    fi
    ;;
esac

echo "# Aqua Read Path"
echo
echo "- Source used: ${aqua_source_used}"
if [[ -n "$aqua_resolution_note" ]]; then
  echo "- Resolution note: ${aqua_resolution_note}"
fi
echo

if [[ "$aqua_source_used" == "live" || "$aqua_source_used" == "mirror" || "$aqua_source_used" == "mirror (stale fallback)" ]]; then
  echo "$aqua_output"
else
  echo "_Aqua context unavailable._"
  echo
  echo '```text'
  if [[ -n "$mirror_fresh_error" ]]; then
    echo "[fresh mirror attempt]"
    echo "$mirror_fresh_error"
    echo
  fi
  if [[ -n "$live_error" ]]; then
    echo "[live read]"
    echo "$live_error"
    echo
  fi
  if [[ -n "$mirror_error" ]]; then
    echo "[mirror read]"
    echo "$mirror_error"
    echo
  fi
  echo '```'
fi
