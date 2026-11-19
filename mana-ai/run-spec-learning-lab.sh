#!/usr/bin/env bash
# Manual experiment only. No timer, installation or production changes.
set -euo pipefail
here="$(cd -- "$(dirname -- "$0")" && pwd -P)"
if [ "$#" -ne 2 ]; then
  echo 'Usage: bash run-spec-learning-lab.sh /absolute/master.txt /absolute/private/state' >&2
  exit 1
fi
node_bin="${MANA_NODE_BIN:-node}"
"$node_bin" -e 'if (+process.versions.node.split(".")[0]<24) {console.error("NODE_24_REQUIRED");process.exit(1)}'
port="${MANA_CODER_PORT:-8794}"
if [ -z "${MANA_CODER_MODEL:-}" ]; then
  export MANA_CODER_MODEL="$("$node_bin" -e '
    const port=Number(process.argv[1]); if(!/^\d{1,5}$/.test(process.argv[1])||port<1||port>65535)process.exit(1);
    fetch("http://127.0.0.1:"+port+"/v1/models",{redirect:"error",signal:AbortSignal.timeout(5000)})
      .then(async r=>{if(!r.ok)throw Error();const limit=65536;const rd=r.body.getReader();let n=0,b=[];while(true){const c=await rd.read();if(c.done)break;n+=c.value.length;if(n>limit){await rd.cancel();throw Error();}b.push(c.value);}return JSON.parse(Buffer.concat(b).toString("utf8"));})
      .then(o=>{const id=o.data?.[0]?.id;if(!Array.isArray(o.data)||o.data.length!==1||typeof id!=="string"||!/^[A-Za-z0-9_./:@+-]{1,300}$/.test(id))throw Error();process.stdout.write(id);})
      .catch(()=>{console.error("LOCAL_MODEL_DISCOVERY_FAILED (set MANA_CODER_MODEL explicitly)");process.exitCode=1;});' "$port")"
  [ -n "$MANA_CODER_MODEL" ] || exit 1
fi
export MANA_CODER_PORT="$port"
exec "$node_bin" "$here/spec-learning.cjs" "$1" "$2"
