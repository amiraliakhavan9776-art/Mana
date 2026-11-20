#!/usr/bin/env bash
set -euo pipefail
umask 077
app=$(cd -- "$(dirname -- "$0")" && pwd -P)
: "${MANA_SKILL_DEPENDENCE_WORKSPACE:?Provide one existing private directory; reuse it on restart.}"
: "${MANA_SKILL_DEPENDENCE_PRIOR_WORKSPACE:?Provide the original PR9 receipt directory.}"
: "${MANA_CONVERSATION_MODEL_ID:?Provide the same exact local model ID as the original trial.}"
for dir in "$MANA_SKILL_DEPENDENCE_WORKSPACE" "$MANA_SKILL_DEPENDENCE_PRIOR_WORKSPACE"; do
  if [[ "$dir" != /* || ! -d "$dir" || -L "$dir" ]]; then
    echo 'Both receipt directories must be absolute, existing, non-symlink directories.' >&2
    exit 1
  fi
done
port=${MANA_CONVERSATION_PORT:-8807}
case "$port" in 8804|8805|8806) echo 'Choose an unused port other than 8804, 8805 or 8806.' >&2; exit 1;; esac
unset MANA_SKILL_PILOT_WORKSPACE
export MANA_SKILL_DEPENDENCE_WORKSPACE MANA_SKILL_DEPENDENCE_PRIOR_WORKSPACE MANA_CONVERSATION_MODEL_ID
export MANA_CONVERSATION_PORT="$port"
exec bash "$app/run-mana-conversation.sh"
