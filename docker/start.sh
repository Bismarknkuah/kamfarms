#!/bin/sh
# The API's start command: prepare the database (docker/prepare.sh), then run the server. The image uses it as its CMD and
# railway.json pins it, so a stale start command in the Railway dashboard cannot skip the database steps.
cd "$(dirname "$0")/.." || exit 1
sh docker/prepare.sh || exit 1
export STARTUP_TASKS_DONE=1
exec node backend/dist/main.js
