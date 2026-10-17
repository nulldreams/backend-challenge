#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1

failed=()

for script in [0-9][0-9]-*.sh; do
    if ! bash "$script"; then failed+=("$script"); fi
done

echo
if ((${#failed[@]} == 0)); then
    echo $'\e[32m\e[1mAll scenarios passed\e[0m'
else
    echo $'\e[31m\e[1mFailed scenarios:\e[0m' "${failed[@]}"
    exit 1
fi
