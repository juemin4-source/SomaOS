#!/bin/bash
# SomaOS E2E Fixture Test Runner
# Runs soma investigate against each planted bug and records results.
# Requires ANTHROPIC_API_KEY to be set.

set -e

REPO_DIR="$(cd "$(dirname "$0")/bug-repo" && pwd)"
RESULTS_DIR="$(cd "$(dirname "$0")" && pwd)/results"
SOMA_BIN="$(cd "$(dirname "$0")/.." && cargo build -q 2>/dev/null && echo "$(pwd)/target/debug/soma")"

mkdir -p "$RESULTS_DIR"
RUN_ID=$(date +%Y%m%d-%H%M%S)
SUMMARY="$RESULTS_DIR/run-$RUNID.md"

echo "# SomaOS E2E Run $RUN_ID" > "$SUMMARY"
echo "" >> "$SUMMARY"
echo "| Bug | Type | Verdict | Turns |" >> "$SUMMARY"
echo "|-----|------|---------|-------|" >> "$SUMMARY"

TOTAL=0
PASSED=0

run_bug() {
    local id=$1
    local query=$2
    local outfile="$RESULTS_DIR/$id-$RUNID.txt"
    TOTAL=$((TOTAL + 1))

    echo ""
    echo "=== [$id] $query ==="

    cd "$REPO_DIR"
    if echo "$query" | timeout 120 "$SOMA_BIN" investigate "$query" > "$outfile" 2>&1; then
        local verdict="PASS"
        PASSED=$((PASSED + 1))
    else
        local verdict="FAIL"
    fi

    local turns=$(grep -c "事件数:" "$outfile" || echo "?")
    echo "| $id | ${query%%:*} | $verdict | $turns |" >> "$SUMMARY"
    echo "[$id] $verdict"
}

echo "Running E2E tests..."
echo "Results dir: $RESULTS_DIR"

run_bug "B1" "bug1: sum_to_n function returns 10 instead of 15 for n=5"
run_bug "B2" "bug2: filter_even returns odd numbers instead of even numbers"
run_bug "B3" "bug3: program panics with unwrap on None when config file is missing"
run_bug "B4" "bug4: average function panics on empty list division by zero"
run_bug "B5" "bug5: DATABASE_URL points to somaos_prod instead of somaos_dev"
run_bug "B6" "bug6: API endpoint uses v1 but should use v2"

echo ""
echo "=== Summary ==="
echo "Passed: $PASSED / $TOTAL"
echo "Rate:   $(( PASSED * 100 / TOTAL ))%"
echo "" >> "$SUMMARY"
echo "**Passed: $PASSED / $TOTAL ($(( PASSED * 100 / TOTAL ))%)**" >> "$SUMMARY"
echo "" >> "$SUMMARY"
echo "Results saved to $SUMMARY"
cat "$SUMMARY"
