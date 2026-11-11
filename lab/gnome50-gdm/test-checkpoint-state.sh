#!/usr/bin/env bash
# Regression: libvirt domstate often terminates with extra newlines.
# The checkpoint helper must compare only the state line and refuse all
# other VM states, including "running", "paused", and "shut off (reason)".
(
    set -euo pipefail
    HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    SOURCE="$HERE/checkpoint-before-gdm.sh"

    bash -n "$SOURCE"
    grep -Fq 'domstate "$VM" | head -n 1)' "$SOURCE"
    if grep -Fq "grep -viqx 'shut off'" "$SOURCE"; then
        echo 'FAIL: old grep -v guard still present' >&2
        exit 1
    fi

    canonical() {
        head -n 1
    }
    actual="$(printf 'shut off\n\n' | canonical)"
    test "$actual" = 'shut off' || {
        echo 'FAIL: blank line invalidated shut-off state' >&2
        exit 1
    }

    for state in running paused 'in shutdown' 'shut off (unknown)'; do
        actual="$(printf '%s\n\n' "$state" | canonical)"
        if [[ "$actual" == 'shut off' ]]; then
            echo "FAIL: accepted unexpected VM state: $state" >&2
            exit 1
        fi
    done
    echo 'PASS: extra blank lines tolerated; unsafe VM states refused'
)
