# Shared by Android backup evidence harnesses after each defines adb_cmd.

ANDROID_PIDOF_STATUS_SENTINEL='__CHESSTICIZE_PIDOF_STATUS__='

read_app_process_ids() {
  local remote_script
  local inspection_output
  local sentinel_line
  local process_status
  local process_output

  if [[ ! "$APP_ID" =~ ^[A-Za-z0-9._]+$ ]]; then
    echo "Cannot inspect an invalid Android package name: $APP_ID" >&2
    return 1
  fi

  remote_script='process_output="$(pidof "$1" 2>&1)"; process_status=$?; printf "__CHESSTICIZE_PIDOF_STATUS__=%s\n" "$process_status"; printf "%s" "$process_output"'
  if ! inspection_output="$(adb_cmd shell "sh -c '$remote_script' sh '$APP_ID'")"; then
    echo "Unable to inspect $APP_ID process state because the outer ADB shell command failed." >&2
    return 1
  fi
  inspection_output="${inspection_output//$'\r'/}"
  sentinel_line="${inspection_output%%$'\n'*}"
  if [[ "$inspection_output" == *$'\n'* ]]; then
    process_output="${inspection_output#*$'\n'}"
  else
    process_output=""
  fi
  if [[ ! "$sentinel_line" =~ ^${ANDROID_PIDOF_STATUS_SENTINEL}([0-9]+)$ ]]; then
    echo "Unable to inspect $APP_ID process state because the pidof status sentinel is missing or malformed." >&2
    return 1
  fi
  process_status="${BASH_REMATCH[1]}"

  if [[ "$process_status" == "1" ]]; then
    if [[ -n "$process_output" ]]; then
      echo "Unable to accept $APP_ID process absence because pidof status 1 returned output: $process_output" >&2
      return 1
    fi
    return 0
  fi
  if [[ "$process_status" == "0" ]]; then
    if [[ ! "$process_output" =~ ^[0-9]+([[:space:]]+[0-9]+)*$ ]]; then
      echo "Unable to accept $APP_ID process IDs because pidof status 0 returned malformed output: ${process_output:-<empty>}" >&2
      return 1
    fi
    printf '%s' "$process_output"
    return 0
  fi

  echo "Unable to inspect $APP_ID process state because device pidof returned status $process_status: ${process_output:-<empty>}" >&2
  return 1
}
