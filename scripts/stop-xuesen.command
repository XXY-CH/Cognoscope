#!/bin/sh
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if "$SCRIPT_DIR/stop-xuesen.sh" "$@"; then
  status=0
else
  status=$?
fi

if [ -t 0 ] && [ "${XUESEN_KEEP_TERMINAL:-1}" = "1" ]; then
  printf '\nPress Return to close this window.\n'
  read -r _
fi
exit "$status"
