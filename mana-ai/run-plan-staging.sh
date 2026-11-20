#!/usr/bin/env bash
# Foreground, loopback-only MANA furnished staging. Does not install packages.
set -euo pipefail
umask 077
app=$(cd -- "$(dirname -- "$0")" && pwd -P)
node_bin=${MANA_NODE_BIN:-node}
if ! "$node_bin" -e 'process.exit(Number(process.versions.node.split(".")[0])===24?0:1)'; then
  echo 'Node.js 24 is required. Set MANA_NODE_BIN to its executable.' >&2; exit 1
fi
if ! python3 -c 'from importlib.metadata import version; assert all(version(name)==expected for name,expected in [("ezdxf","1.4.4"),("reportlab","4.4.9"),("PyMuPDF","1.26.6")])' 2>/dev/null; then
  echo 'Python artifact dependencies missing or different. Activate the existing pilot virtualenv or see PLAN-TAKEOFF-PILOT.fa.md.' >&2; exit 1
fi
port=${MANA_PLAN_PORT:-8803}
if [[ ! "$port" =~ ^[1-9][0-9]{3,4}$ ]] || (( port < 1024 || port > 65535 )); then
  echo 'MANA_PLAN_PORT must be a non-privileged port.' >&2; exit 1
fi
if ! command -v ss >/dev/null; then echo 'ss is required to check for a listening service.' >&2; exit 1; fi
if [[ -n "$(ss -ltnH "sport = :$port")" ]]; then
  echo "PORT_${port}_IN_USE: no service was stopped." >&2; exit 1
fi
dev=$(mktemp -d /tmp/mana-plan-dev.XXXXXXXX)
plans=$(mktemp -d /tmp/mana-plan-data.XXXXXXXX)
echo "Private staging state: $plans"
echo "Plan preview: http://127.0.0.1:$port/furnished"
unset MANA_PRECEDENT_SEARCH_URL MANA_JARVIS_PREVIEW_WORKSPACE
export MANA_DEVELOPMENT_WORKSPACE="$dev" MANA_FURNISHED_WORKSPACE="$plans" MANA_DEVELOPMENT_PORT="$port"
exec "$node_bin" "$app/development-ui.cjs"
