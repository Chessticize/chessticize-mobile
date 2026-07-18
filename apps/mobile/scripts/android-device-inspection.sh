# Shared by Android backup evidence harnesses after each defines adb_cmd.

ANDROID_DEVICE_STATUS_SENTINEL='__CHESSTICIZE_DEVICE_STATUS__='
ANDROID_DEVICE_COMMAND_STATUS=''
ANDROID_DEVICE_COMMAND_OUTPUT=''

inspect_device_command() {
  local remote_command="$1"
  local remote_wrapper
  local inspection_output
  local sentinel_line

  if [[ -z "$remote_command" || "$remote_command" == *"'"* \
      || "$remote_command" == *$'\n'* || "$remote_command" == *$'\r'* ]]; then
    echo "Refusing to inspect an empty or unsafe Android device command." >&2
    return 1
  fi

  remote_wrapper='command_output="$(sh -c "$1" 2>&1)"; command_status=$?; printf "__CHESSTICIZE_DEVICE_STATUS__=%s\n" "$command_status"; printf "%s" "$command_output"'
  if ! inspection_output="$(adb_cmd shell "sh -c '$remote_wrapper' sh '$remote_command'")"; then
    echo "Unable to inspect Android device state because the outer ADB shell command failed." >&2
    return 1
  fi
  inspection_output="${inspection_output//$'\r'/}"
  sentinel_line="${inspection_output%%$'\n'*}"
  if [[ "$inspection_output" == *$'\n'* ]]; then
    ANDROID_DEVICE_COMMAND_OUTPUT="${inspection_output#*$'\n'}"
  else
    ANDROID_DEVICE_COMMAND_OUTPUT=''
  fi
  if [[ ! "$sentinel_line" =~ ^${ANDROID_DEVICE_STATUS_SENTINEL}([0-9]+)$ ]]; then
    echo "Unable to inspect Android device state because the command-status sentinel is missing or malformed." >&2
    return 1
  fi
  ANDROID_DEVICE_COMMAND_STATUS="${BASH_REMATCH[1]}"
}

read_app_process_ids() {
  if [[ ! "$APP_ID" =~ ^[A-Za-z0-9._]+$ ]]; then
    echo "Cannot inspect an invalid Android package name: $APP_ID" >&2
    return 1
  fi
  if ! inspect_device_command "pidof \"$APP_ID\""; then
    return 1
  fi

  if [[ "$ANDROID_DEVICE_COMMAND_STATUS" == "1" ]]; then
    if [[ -n "$ANDROID_DEVICE_COMMAND_OUTPUT" ]]; then
      echo "Unable to accept $APP_ID process absence because pidof status 1 returned output: $ANDROID_DEVICE_COMMAND_OUTPUT" >&2
      return 1
    fi
    return 0
  fi
  if [[ "$ANDROID_DEVICE_COMMAND_STATUS" == "0" ]]; then
    if [[ ! "$ANDROID_DEVICE_COMMAND_OUTPUT" =~ ^[0-9]+([[:space:]]+[0-9]+)*$ ]]; then
      echo "Unable to accept $APP_ID process IDs because pidof status 0 returned malformed output: ${ANDROID_DEVICE_COMMAND_OUTPUT:-<empty>}" >&2
      return 1
    fi
    printf '%s' "$ANDROID_DEVICE_COMMAND_OUTPUT"
    return 0
  fi

  echo "Unable to inspect $APP_ID process state because device pidof returned status $ANDROID_DEVICE_COMMAND_STATUS: ${ANDROID_DEVICE_COMMAND_OUTPUT:-<empty>}" >&2
  return 1
}

validate_device_path() {
  local path="$1"

  if [[ -z "$path" || ! "$path" =~ ^[A-Za-z0-9._/~=-]+$ ]]; then
    echo "Refusing to inspect an empty or unsafe Android device path: ${path:-<empty>}" >&2
    return 1
  fi
}

push_host_file_to_device() {
  local host_path="$1"
  local device_path="$2"

  if [[ -z "$host_path" || "$host_path" == *$'\n'* || "$host_path" == *$'\r'* \
      || ! -f "$host_path" || ! -s "$host_path" ]]; then
    echo "Refusing to push an invalid or empty host file: ${host_path:-<empty>}" >&2
    return 1
  fi
  validate_device_path "$device_path" || return 1
  if [[ "$device_path" != /*.apk ]]; then
    echo "Refusing to push an APK to a non-APK device path: $device_path" >&2
    return 1
  fi
  adb_cmd push "$host_path" "$device_path"
}

remove_device_file() {
  local path="$1"

  validate_device_path "$path" || return 1
  if ! inspect_device_command "rm -f \"$path\""; then
    return 1
  fi
  if [[ "$ANDROID_DEVICE_COMMAND_STATUS" != "0" \
      || -n "$ANDROID_DEVICE_COMMAND_OUTPUT" ]]; then
    echo "Unable to remove Android device file $path (status $ANDROID_DEVICE_COMMAND_STATUS): ${ANDROID_DEVICE_COMMAND_OUTPUT:-<empty>}" >&2
    return 1
  fi
}

install_device_apk() {
  local path="$1"

  validate_device_path "$path" || return 1
  if [[ "$path" != /*.apk ]]; then
    echo "Refusing to install a non-APK device path: $path" >&2
    return 1
  fi
  if ! inspect_device_command "pm install -r -t \"$path\""; then
    return 1
  fi
  if [[ "$ANDROID_DEVICE_COMMAND_STATUS" != "0" \
      || "$ANDROID_DEVICE_COMMAND_OUTPUT" != "Success" ]]; then
    echo "Package Manager did not strictly accept retained APK $path (status $ANDROID_DEVICE_COMMAND_STATUS): ${ANDROID_DEVICE_COMMAND_OUTPUT:-<empty>}" >&2
    return 1
  fi
  printf '%s' "$ANDROID_DEVICE_COMMAND_OUTPUT"
}

read_installed_package_apk_paths() {
  local package_name="$1"
  local line
  local path

  if [[ ! "$package_name" =~ ^[A-Za-z0-9._]+$ ]]; then
    echo "Cannot inspect an invalid Android package name: $package_name" >&2
    return 1
  fi
  if ! inspect_device_command "pm path \"$package_name\""; then
    return 1
  fi
  if [[ "$ANDROID_DEVICE_COMMAND_STATUS" != "0" \
      || -z "$ANDROID_DEVICE_COMMAND_OUTPUT" ]]; then
    echo "Unable to read installed APK paths for $package_name (status $ANDROID_DEVICE_COMMAND_STATUS): ${ANDROID_DEVICE_COMMAND_OUTPUT:-<empty>}" >&2
    return 1
  fi

  while IFS= read -r line; do
    if [[ "$line" != package:* ]]; then
      echo "Installed APK path output was malformed for $package_name: $line" >&2
      return 1
    fi
    path="${line#package:}"
    if ! validate_device_path "$path" || [[ "$path" != /*.apk ]]; then
      echo "Installed APK path output was unsafe or not an APK for $package_name: $line" >&2
      return 1
    fi
    printf 'package:%s\n' "$path"
  done <<< "$ANDROID_DEVICE_COMMAND_OUTPUT"
}

read_single_installed_base_apk_path() {
  local package_name="$1"
  local installed_paths
  local line
  local path
  local selected_path=''
  local path_count=0

  if ! installed_paths="$(read_installed_package_apk_paths "$package_name")"; then
    return 1
  fi
  while IFS= read -r line; do
    path_count=$((path_count + 1))
    path="${line#package:}"
    if [[ "$path" == */base.apk ]]; then
      if [[ -n "$selected_path" ]]; then
        echo "Installed APK path output contained multiple base.apk paths for $package_name." >&2
        return 1
      fi
      selected_path="$path"
    fi
  done <<< "$installed_paths"

  if (( path_count != 1 )) || [[ -z "$selected_path" ]]; then
    echo "Expected exactly one installed base.apk path for $package_name; found $path_count validated APK paths." >&2
    return 1
  fi
  printf '%s' "$selected_path"
}

read_device_file_size() {
  local path="$1"

  validate_device_path "$path" || return 1
  if ! inspect_device_command "stat -c %s \"$path\""; then
    return 1
  fi
  if [[ "$ANDROID_DEVICE_COMMAND_STATUS" != "0" \
      || ! "$ANDROID_DEVICE_COMMAND_OUTPUT" =~ ^(0|[1-9][0-9]*)$ ]]; then
    echo "Unable to read a strict device-local size for $path (status $ANDROID_DEVICE_COMMAND_STATUS): ${ANDROID_DEVICE_COMMAND_OUTPUT:-<empty>}" >&2
    return 1
  fi
  printf '%s' "$ANDROID_DEVICE_COMMAND_OUTPUT"
}

require_device_files_identical() {
  local expected_path="$1"
  local actual_path="$2"

  validate_device_path "$expected_path" || return 1
  validate_device_path "$actual_path" || return 1
  if [[ "$expected_path" == "$actual_path" ]]; then
    echo "Refusing to compare one Android device path to itself: $expected_path" >&2
    return 1
  fi
  if ! inspect_device_command "cmp \"$expected_path\" \"$actual_path\""; then
    return 1
  fi
  if [[ "$ANDROID_DEVICE_COMMAND_STATUS" != "0" \
      || -n "$ANDROID_DEVICE_COMMAND_OUTPUT" ]]; then
    echo "Android device files are not proven byte-identical (status $ANDROID_DEVICE_COMMAND_STATUS): ${ANDROID_DEVICE_COMMAND_OUTPUT:-<empty>}" >&2
    return 1
  fi
}

probe_device_path() {
  local kind="$1"
  local path="$2"
  local run_as_package="${3:-}"
  local test_flag
  local remote_command

  validate_device_path "$path" || return 1
  if [[ -n "$run_as_package" && ! "$run_as_package" =~ ^[A-Za-z0-9._]+$ ]]; then
    echo "Refusing to inspect an invalid Android run-as package: $run_as_package" >&2
    return 1
  fi
  case "$kind" in
    file) test_flag='-f' ;;
    directory) test_flag='-d' ;;
    any) test_flag='-e' ;;
    *)
      echo "Unsupported Android device path probe kind: $kind" >&2
      return 1
      ;;
  esac
  remote_command="test $test_flag \"$path\""
  if [[ -n "$run_as_package" ]]; then
    remote_command="run-as \"$run_as_package\" $remote_command"
  fi
  if ! inspect_device_command "$remote_command"; then
    return 1
  fi
  if [[ -n "$ANDROID_DEVICE_COMMAND_OUTPUT" ]]; then
    echo "Android device path probe returned unexpected output for $path: $ANDROID_DEVICE_COMMAND_OUTPUT" >&2
    return 1
  fi
  case "$ANDROID_DEVICE_COMMAND_STATUS" in
    0) printf 'present' ;;
    1) printf 'absent' ;;
    *)
      echo "Android device path probe failed for $path with device status $ANDROID_DEVICE_COMMAND_STATUS." >&2
      return 1
      ;;
  esac
}

require_device_path_state() {
  local kind="$1"
  local path="$2"
  local expected_state="$3"
  local run_as_package="${4:-}"
  local actual_state

  if [[ "$expected_state" != "present" && "$expected_state" != "absent" ]]; then
    echo "Unsupported required Android device path state: $expected_state" >&2
    return 1
  fi
  if ! actual_state="$(probe_device_path "$kind" "$path" "$run_as_package")"; then
    return 1
  fi
  if [[ "$actual_state" != "$expected_state" ]]; then
    echo "Android device path $path is $actual_state; required $expected_state." >&2
    return 1
  fi
}

read_canonical_device_path() {
  local path="$1"

  validate_device_path "$path" || return 1
  if ! inspect_device_command "readlink -f \"$path\""; then
    return 1
  fi
  if [[ "$ANDROID_DEVICE_COMMAND_STATUS" != "0" \
      || ! "$ANDROID_DEVICE_COMMAND_OUTPUT" =~ ^/[A-Za-z0-9._/~=-]+$ ]]; then
    echo "Unable to canonicalize present Android device path $path (status $ANDROID_DEVICE_COMMAND_STATUS): ${ANDROID_DEVICE_COMMAND_OUTPUT:-<empty>}" >&2
    return 1
  fi
  printf '%s' "$ANDROID_DEVICE_COMMAND_OUTPUT"
}

read_device_file_identity() {
  local path="$1"

  validate_device_path "$path" || return 1
  if ! inspect_device_command "stat -c %d:%i \"$path\""; then
    return 1
  fi
  if [[ "$ANDROID_DEVICE_COMMAND_STATUS" != "0" \
      || ! "$ANDROID_DEVICE_COMMAND_OUTPUT" =~ ^[0-9]+:[0-9]+$ ]]; then
    echo "Unable to read a strict device/inode identity for $path (status $ANDROID_DEVICE_COMMAND_STATUS): ${ANDROID_DEVICE_COMMAND_OUTPUT:-<empty>}" >&2
    return 1
  fi
  printf '%s' "$ANDROID_DEVICE_COMMAND_OUTPUT"
}

find_existing_device_paths() {
  local kind="$1"
  shift
  local path
  local path_state
  local canonical_path
  local -a existing_paths=()

  for path in "$@"; do
    if ! path_state="$(probe_device_path "$kind" "$path")"; then
      return 1
    fi
    if [[ "$path_state" == "present" ]]; then
      if ! canonical_path="$(read_canonical_device_path "$path")"; then
        return 1
      fi
      existing_paths+=("$canonical_path")
    elif [[ "$path_state" != "absent" ]]; then
      echo "Android device path probe returned an unsupported state for $path: $path_state" >&2
      return 1
    fi
  done
  if (( ${#existing_paths[@]} > 0 )); then
    printf '%s\n' "${existing_paths[@]}" | sort -u
  fi
}
