#!/usr/bin/env bash
set -euo pipefail
umask 077
app=$(cd -- "$(dirname -- "$0")" && pwd -P)
node_bin=${MANA_NODE_BIN:-node}
"$node_bin" -e 'if (Number(process.versions.node.split(".")[0])!==24) throw new Error("Node.js 24 required");'
port=${MANA_CONVERSATION_PORT:-8804}
if [[ ! "$port" =~ ^[1-9][0-9]{3,4}$ ]] || (( port < 1024 || port > 65535 )); then
  echo 'Use a free non-privileged port.' >&2; exit 1
fi
if ! command -v ss >/dev/null; then echo 'ss is required.' >&2; exit 1; fi
if [[ -n "$(ss -ltnH "sport = :$port")" ]]; then echo "PORT_${port}_IN_USE: no service was stopped." >&2; exit 1; fi
export MANA_DEVELOPMENT_WORKSPACE
MANA_DEVELOPMENT_WORKSPACE=$(mktemp -d /tmp/mana-conversation-state.XXXXXXXX)
export MANA_DEVELOPMENT_PORT="$port"
unset MANA_JARVIS_PREVIEW_WORKSPACE MANA_FURNISHED_WORKSPACE MANA_PRECEDENT_SEARCH_URL
echo "Private mission receipts: $MANA_DEVELOPMENT_WORKSPACE"
echo "Conversation preview: http://127.0.0.1:$port/mana"
exec "$node_bin" "$app/development-ui.cjs"
