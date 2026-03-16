#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

workspace_root="${OPENCLAW_WORKSPACE_ROOT:-$HOME/.openclaw/workspace}"
include_memory=0
max_lines=80
aqua_mode="auto"

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
    --include-memory)
      include_memory=1
      shift
      ;;
    --max-lines)
      max_lines="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'EOF'
Usage: build-openclaw-aqua-brief.sh [options]

Options:
  --workspace-root <path>  OpenClaw workspace root
  --mode <mode>            auto|local|hosted
  --include-memory         Include MEMORY.md in the local context section
  --max-lines <n>          Max lines to include from each local file
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

hosted_config_path="${AQUACLAW_HOSTED_CONFIG:-${workspace_root}/.aquaclaw/hosted-bridge.json}"
selected_mode="$aqua_mode"

if [[ "$selected_mode" == "auto" ]]; then
  if [[ -f "$hosted_config_path" ]]; then
    selected_mode="hosted"
  else
    selected_mode="local"
  fi
fi

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

echo "# Live Aqua Context"
echo
if [[ "$selected_mode" == "hosted" ]]; then
  aqua_cmd=(
    "${script_dir}/aqua-hosted-context.sh"
    --workspace-root "${workspace_root}"
    --config-path "${hosted_config_path}"
    --format markdown
    --include-encounters
    --include-scenes
  )
else
  aqua_cmd=(
    "${script_dir}/aqua-context.sh"
    --format markdown
    --include-encounters
    --include-scenes
  )
fi

if aqua_output="$("${aqua_cmd[@]}" 2>&1)"; then
  echo "$aqua_output"
else
  echo "_Aqua live context unavailable._"
  echo
  echo '```text'
  echo "$aqua_output"
  echo '```'
fi
