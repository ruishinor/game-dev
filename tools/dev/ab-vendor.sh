#!/bin/bash
for t in a b; do
  mkdir -p ${SCRATCH:-/tmp/attune-scratch}/ab-$t && cd ${SCRATCH:-/tmp/attune-scratch}/ab-$t
  start=$(date +%s)
  node ${SCRATCH:-/tmp/attune-scratch}/wt-$t/test/e2e/vendor.mjs > vendor.log 2>&1; code=$?
  echo "RESULT $t exit=$code secs=$(($(date +%s)-start)) heartbeat=$(grep -c '"cause":"heartbeat"' vendor.log)" >> ${SCRATCH:-/tmp/attune-scratch}/ab-result.txt
done
