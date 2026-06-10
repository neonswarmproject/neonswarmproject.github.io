#!/usr/bin/env bash
###############################################################################
# claude-overnight.sh — unattended Claude Code loop for the NEON SWARM v2 pass.
#
# What it does:
#   * Re-invokes `claude --continue --print` on the SAME session in this repo,
#     one work-turn at a time, until the refinement pass is complete.
#   * On a usage/rate-limit exit it parses the reset time (from the statusline
#     state file written by ~/.claude/hooks/neon-overnight-statusline.js, or
#     from the CLI output: epoch / ISO / "resets at 3am (America/Foo)" forms),
#     sleeps until then (timezone-aware), and resumes automatically.
#   * Stops when the work prints OVERNIGHT-DONE or the progress file says
#     "STATUS: AWAITING-HUMAN" (preview is up, waiting for your confirmation).
#
# Launch (recommended, inside tmux so you can detach):
#   tmux new -s neon
#   ./tools/claude-overnight.sh
#   # detach with: Ctrl-b then d        re-attach with: tmux attach -t neon
#
# Env knobs:
#   CLAUDE_OVERNIGHT_DANGEROUS=1     use bypassPermissions instead of the default
#                                    acceptEdits + scoped allowlist in
#                                    .claude/settings.local.json. Only set this
#                                    yourself, knowingly: it removes approval gates.
#   CLAUDE_OVERNIGHT_TURN_PAUSE=20   seconds between normal turns
#   CLAUDE_OVERNIGHT_FALLBACK_WAIT=1800  wait when reset time can't be parsed
#   CLAUDE_OVERNIGHT_MAX_FAILS=12    consecutive non-limit failures before quit
###############################################################################
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${HOME}/.claude/neon-overnight"
LOG_FILE="${STATE_DIR}/overnight.log"
RUN_FILE="${STATE_DIR}/last-run.txt"
LOCK_FILE="${STATE_DIR}/lock"
RESET_FILE="${STATE_DIR}/rate-limit-reset"
PROGRESS_FILE="${REPO_DIR}/tools/refine-v2-progress.md"

DONE_SENTINEL="OVERNIGHT-DONE"
WAIT_SENTINEL="STATUS: AWAITING-HUMAN"

TURN_PAUSE="${CLAUDE_OVERNIGHT_TURN_PAUSE:-20}"
FALLBACK_WAIT="${CLAUDE_OVERNIGHT_FALLBACK_WAIT:-1800}"
RESET_BUFFER=90
MAX_HARD_FAILS="${CLAUDE_OVERNIGHT_MAX_FAILS:-12}"

PROMPT='Continue the NEON SWARM v2 refinement pass (overnight mode, branch refine/v2).
1. Read tools/refine-v2-progress.md and find the first unchecked [ ] item.
2. Implement it fully: reuse existing helpers in js/game.js, named constants for every tunable, zero console errors on desktop AND mobile. Do NOT push to main or deploy.
3. Tick the item off in tools/refine-v2-progress.md and commit the subsystem with a clear message on refine/v2.
4. If ALL items are checked: serve the game locally, verify it loads with no console errors, set "STATUS: AWAITING-HUMAN" at the top of the progress file, print OVERNIGHT-DONE, and stop.'

mkdir -p "${STATE_DIR}"

# single-instance lock (stale-safe)
if [ -f "${LOCK_FILE}" ]; then
  oldpid="$(cat "${LOCK_FILE}" 2>/dev/null || true)"
  if [ -n "${oldpid}" ] && kill -0 "${oldpid}" 2>/dev/null; then
    echo "another claude-overnight.sh is already running (pid ${oldpid}); exiting."
    exit 1
  fi
fi
echo $$ > "${LOCK_FILE}"
trap 'rm -f "${LOCK_FILE}"' EXIT INT TERM

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "${LOG_FILE}"; }

# Prints seconds-to-wait until the rate limit resets, or -1 if unknown.
seconds_until_reset() {
  /usr/bin/python3 - "$RUN_FILE" "$RESET_FILE" <<'PYEOF'
import re, sys, time, datetime
try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None

run_file, reset_file = sys.argv[1], sys.argv[2]
now = time.time()
candidates = []

# 1) epoch written by the statusline shim
try:
    v = float(open(reset_file).read().strip())
    if v > 1e12: v /= 1000.0
    if now < v < now + 12 * 3600: candidates.append(v)
except Exception:
    pass

try:
    text = open(run_file, errors="replace").read()[-20000:]
except Exception:
    text = ""

# 2) bare epoch timestamps near the word "reset"
for m in re.finditer(r'reset[^\n]{0,80}?(\d{10,13})', text, re.I):
    v = float(m.group(1))
    if v > 1e12: v /= 1000.0
    if now < v < now + 12 * 3600: candidates.append(v)

# 3) ISO-8601 stamps anywhere in the tail
for m in re.finditer(r'(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)', text):
    try:
        s = m.group(1).replace(" ", "T")
        dt = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None: dt = dt.astimezone()
        v = dt.timestamp()
        if now < v < now + 12 * 3600: candidates.append(v)
    except Exception:
        pass

# 4) '"resets" at 3am (America/Puerto_Rico)' style clock times, tz-aware
m = re.search(r'reset[s]?(?:\s+at|\s+@)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:\(([\w/+_-]+)\))?',
              text, re.I)
if m:
    hh = int(m.group(1)); mm = int(m.group(2) or 0)
    ap = (m.group(3) or "").lower(); tzname = m.group(4)
    if ap == "pm" and hh < 12: hh += 12
    if ap == "am" and hh == 12: hh = 0
    tz = None
    if tzname and ZoneInfo:
        try: tz = ZoneInfo(tzname)
        except Exception: tz = None
    base = datetime.datetime.now(tz) if tz else datetime.datetime.now().astimezone()
    cand = base.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if cand.timestamp() <= now: cand += datetime.timedelta(days=1)
    v = cand.timestamp()
    if now < v < now + 12 * 3600: candidates.append(v)

print(int(min(candidates) - now) if candidates else -1)
PYEOF
}

hard_fails=0
log "=== claude-overnight loop starting (repo: ${REPO_DIR}) ==="

while true; do
  if [ -f "${PROGRESS_FILE}" ] && grep -q "${WAIT_SENTINEL}" "${PROGRESS_FILE}"; then
    log "progress file says ${WAIT_SENTINEL} — work complete, preview awaits you. Exiting."
    break
  fi

  PERM_ARGS=(--permission-mode acceptEdits)
  if [ "${CLAUDE_OVERNIGHT_DANGEROUS:-0}" = "1" ]; then PERM_ARGS=(--permission-mode bypassPermissions); fi

  log "--- invoking claude --continue (one work turn) ---"
  ( cd "${REPO_DIR}" && claude --continue --print "${PROMPT}" "${PERM_ARGS[@]}" ) >"${RUN_FILE}" 2>&1
  code=$?
  cat "${RUN_FILE}" >> "${LOG_FILE}"
  log "claude exited with code ${code}"

  if grep -q "${DONE_SENTINEL}" "${RUN_FILE}"; then
    log "done sentinel seen — stopping. The preview is awaiting human confirmation."
    break
  fi

  if grep -Eiq 'usage limit|rate[ -]?limit|limit (will )?reset|out of (usage|credits)|hour limit|overloaded' "${RUN_FILE}"; then
    wait_s="$(seconds_until_reset)"
    case "${wait_s}" in (-1|''|*[!0-9]*) wait_s="${FALLBACK_WAIT}";; esac
    wait_s=$(( wait_s + RESET_BUFFER ))
    until_str="$(date -v "+${wait_s}S" '+%a %H:%M:%S' 2>/dev/null || echo "in ${wait_s}s")"
    log "usage/rate limit detected — sleeping ${wait_s}s (until ${until_str})"
    sleep "${wait_s}"
    hard_fails=0
    continue
  fi

  if [ "${code}" -ne 0 ]; then
    hard_fails=$(( hard_fails + 1 ))
    if [ "${hard_fails}" -ge "${MAX_HARD_FAILS}" ]; then
      log "too many consecutive failures (${hard_fails}) — giving up to avoid waste."
      break
    fi
    backoff=$(( 300 * hard_fails ))
    log "non-limit failure ${hard_fails}/${MAX_HARD_FAILS} — backing off ${backoff}s"
    sleep "${backoff}"
    continue
  fi

  hard_fails=0
  sleep "${TURN_PAUSE}"
done

log "=== claude-overnight loop finished ==="
