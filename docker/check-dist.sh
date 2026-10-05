#!/bin/sh
# Run in the image build right after `nest build`. Every source file the build compiles must have its compiled .js in backend/dist.
# If one is missing the server would crash at start-up with "Cannot find module ..." and keep restarting; failing HERE instead stops the
# bad image from ever being deployed, so the previous working version keeps running, and the log names exactly what is missing.
cd "$(dirname "$0")/.." 2>/dev/null; [ -d backend/src ] || cd /repo || exit 1
cd backend || exit 1
missing=0; total=0
for f in $(find src -name '*.ts' ! -name '*.d.ts' ! -name '*.spec.ts' ! -path '*/__tests__/*'); do
  total=$((total + 1)); js="dist/${f#src/}"; js="${js%.ts}.js"
  if [ ! -f "$js" ]; then echo "MISSING from the build: $js (compiled from $f)"; missing=$((missing + 1)); fi
done
if [ "$missing" -ne 0 ]; then echo "BUILD FAILED: $missing of $total compiled files are missing from backend/dist."; exit 1; fi
echo "OK: all $total source files have their compiled file in backend/dist"
