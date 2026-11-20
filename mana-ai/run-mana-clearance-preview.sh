#!/usr/bin/env bash
set -euo pipefail
umask 077
app=$(cd -- "$(dirname -- "$0")" && pwd -P)
: "${MANA_CLEARANCE_PREVIEW_WORKSPACE:?Provide the original diagnostic receipt directory.}"
: "${MANA_CLEARANCE_PREVIEW_MODEL_ID:?Provide the exact model identifier used in the original diagnostic.}"
if [[ "$MANA_CLEARANCE_PREVIEW_WORKSPACE" != /* || ! -d "$MANA_CLEARANCE_PREVIEW_WORKSPACE" || -L "$MANA_CLEARANCE_PREVIEW_WORKSPACE" ]]; then
  echo 'Use the original private absolute diagnostic workspace (not a copy or symlink).' >&2
  exit 1
fi
port=${MANA_CONVERSATION_PORT:-8808}
case "$port" in 8794|8804|8805|8806|8807) echo 'Use an unused staging port; existing services will not be stopped.' >&2; exit 1;; esac
unset MANA_CONVERSATION_MODEL_ID MANA_CONVERSATION_MODEL_PORT MANA_SKILL_PILOT_WORKSPACE MANA_SKILL_DEPENDENCE_WORKSPACE MANA_SKILL_DEPENDENCE_PRIOR_WORKSPACE
export MANA_CLEARANCE_PREVIEW_WORKSPACE MANA_CLEARANCE_PREVIEW_MODEL_ID
export MANA_CONVERSATION_PORT="$port"
exec bash "$app/run-mana-conversation.sh"
