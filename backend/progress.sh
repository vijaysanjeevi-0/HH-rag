#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "=== RAG backend build progress ==="
if ps aux | grep -q "[b]uild_index.py"; then
  echo "status : RUNNING ($(ps aux | grep '[b]uild_index.py' | awk '{print $10}') cpu-minutes used)"
else
  echo "status : NOT RUNNING (finished or crashed)"
fi
echo "files  :"
ls -lh index/ 2>/dev/null | grep -v "^total" | awk '{printf "  %-28s %s\n", $NF, $5}'
echo "log    :"
tail -c 400 build.log | tr '\r' '\n' | tail -4
