#!/usr/bin/env bash
set -euo pipefail
umask 077
app=$(cd -- "$(dirname -- "$0")" && pwd -P)
: "${MANA_SKILL_PILOT_WORKSPACE:?Provide one existing private directory; reuse it on restart.}"
: "${MANA_CONVERSATION_MODEL_ID:?Provide the exact reviewed local model ID.}"
if [[ "$MANA_SKILL_PILOT_WORKSPACE" != /* || ! -d "$MANA_SKILL_PILOT_WORKSPACE" || -L "$MANA_SKILL_PILOT_WORKSPACE" ]]; then
  echo 'Provide an absolute, existing, non-symlink pilot state directory.' >&2
  exit 1
fi
port=${MANA_CONVERSATION_PORT:-8806}
if [[ "$port" == 8804 || "$port" == 8805 ]]; then
  echo 'Choose an unused port other than the prior 8804 and 8805 previews.' >&2
  exit 1
fi
export MANA_SKILL_PILOT_WORKSPACE MANA_CONVERSATION_MODEL_ID
export MANA_CONVERSATION_PORT="$port"
exec bash "$app/run-mana-conversation.sh"
