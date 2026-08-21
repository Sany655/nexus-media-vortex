#!/usr/bin/env bash
set -euo pipefail
# ContextVC hook adapter — fail-open except explicit block
INPUT=$(cat)
CTX_BIN="${CTX_BIN:-ctx}"
export CTX_REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$CTX_REPO_ROOT" || exit 0

EVENT="${CTX_HOOK_EVENT:-SessionStart}"
AGENT="${CTX_HOOK_AGENT:-unknown}"
fail_closed_event() {
  case "$EVENT" in
    PreToolUse|preToolUse|beforeShellExecution|beforeMCPExecution) [[ "$AGENT" == "cursor" || "$AGENT" == "codex" ]] ;;
    *) return 1 ;;
  esac
}
deny_json() {
  printf '{"permissionDecision":"deny","permission":"deny","permissionDecisionReason":"ContextVC gate unavailable in fail-closed hook","agent_message":"ContextVC gate unavailable in fail-closed hook"}\n'
}
if ! command -v "$CTX_BIN" >/dev/null 2>&1; then
  if fail_closed_event; then deny_json; exit 1; fi
  exit 0
fi
if [[ ! -f .context/VERSION ]]; then
  if fail_closed_event; then deny_json; exit 1; fi
  exit 0
fi

case "$EVENT" in
  SessionStart|sessionStart)
    "$CTX_BIN" hook session-start <<< "$INPUT" || true
    ;;
  PreToolUse|preToolUse|beforeShellExecution|beforeMCPExecution)
    "$CTX_BIN" hook pre-tool <<< "$INPUT" || { if fail_closed_event; then deny_json; exit 1; fi; true; }
    ;;
  PostToolUse|postToolUse|afterFileEdit)
    "$CTX_BIN" hook post-tool <<< "$INPUT" || true
    ;;
  UserPromptSubmit|userPromptSubmit)
    "$CTX_BIN" hook user-prompt-submit <<< "$INPUT" || true
    ;;
  PreCompact|preCompact)
    "$CTX_BIN" hook pre-compact <<< "$INPUT" || true
    ;;
  Stop|stop)
    "$CTX_BIN" hook stop <<< "$INPUT" || true
    ;;
  *)
    exit 0
    ;;
esac
