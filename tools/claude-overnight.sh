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

# Keep the Mac awake for the whole loop (otherwise system sleep freezes the
# wrapper mid-wait). -i blocks idle sleep, -s blocks system sleep on AC power;
# a lid-closed laptop on battery will still sleep — leave it on the charger.
if [ -z "${CLAUDE_OVERNIGHT_CAFF:-}" ] && command -v caffeinate >/dev/null 2>&1; then
  CLAUDE_OVERNIGHT_CAFF=1 exec caffeinate -is "$0" "$@"
fi

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
3. Tick the item off in tools/refine-v2-progress.md, commit the subsystem with a clear message on refine/v2, then back it up with `git push neon refine/v2`. NEVER push main, never push origin, never deploy.
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

# 2) headless CLI limit message: "Claude AI usage limit reached|<epoch>"
for m in re.finditer(r'limit reached\|(\d{10,13})', text, re.I):
    v = float(m.group(1))
    if v > 1e12: v /= 1000.0
    if now < v < now + 12 * 3600: candidates.append(v)

# 2b) bare epoch timestamps near "reset"/"reached"
for m in re.finditer(r'(?:reset|reached)[^\n]{0,80}?(\d{10,13})', text, re.I):
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

# `./tools/claude-overnight.sh --selftest` — exercises the reset-time parser
# against the real CLI formats without invoking claude.
if [ "${1:-}" = "--selftest" ]; then
  tmp="$(mktemp -d)"; RESET_FILE="${tmp}/none"
  future=$(( $(date +%s) + 3700 ))
  RUN_FILE="${tmp}/a"; printf 'Claude AI usage limit reached|%s\n' "${future}" > "${RUN_FILE}"
  s1="$(seconds_until_reset)"
  clock="$( (date -v+2H '+%l:%M%p' 2>/dev/null || date -d '+2 hours' '+%l:%M%p') | tr -d ' ' | tr 'APM' 'apm')"
  RUN_FILE="${tmp}/b"; printf 'usage limit hit - resets at %s\n' "${clock}" > "${RUN_FILE}"
  s2="$(seconds_until_reset)"
  rm -rf "${tmp}"
  echo "selftest: pipe-epoch wait=${s1}s (want ~3700), clock-time '${clock}' wait=${s2}s (want ~7200)"
  if [ "${s1}" -ge 3550 ] && [ "${s1}" -le 3700 ] && [ "${s2}" -ge 6900 ] && [ "${s2}" -le 7500 ]; then
    echo "selftest: PASS"; exit 0
  else
    echo "selftest: FAIL"; exit 1
  fi
fi

# `./tools/claude-overnight.sh --install-permissions` — ONE-TIME, run by YOU.
# Claude does not install this itself (an agent must not widen its own
# permissions). Merges the scoped overnight allowlist + push-protection DENY
# rules into this repo's .claude/settings.local.json and prints every rule it
# adds. Deny rules win over allow rules: main/origin/--force pushes stay
# impossible for unattended turns.
if [ "${1:-}" = "--install-permissions" ]; then
  # optional 2nd arg = alternate target file (used for dry-run tests)
  tgt="${2:-${REPO_DIR}/.claude/settings.local.json}"
  /usr/bin/python3 - "${tgt}" <<'PYEOF'
import json, os, sys
path = sys.argv[1]
ALLOW = [
  "Bash(git status*)", "Bash(git add *)", "Bash(git commit *)",
  "Bash(git checkout *)", "Bash(git switch *)", "Bash(git branch*)",
  "Bash(git log*)", "Bash(git diff*)", "Bash(git show*)",
  "Bash(git tag*)", "Bash(git restore *)", "Bash(git stash*)",
  "Bash(git push neon refine/v2)",
  "Bash(node *)", "Bash(bash -n *)",
  "Bash(python3 -m http.server*)", "Bash(npx playwright *)",
  "Bash(curl http://localhost*)", "Bash(curl -s http://localhost*)",
  "Bash(open http://localhost*)", "Bash(wc *)", "Bash(grep *)",
  "Bash(ls *)", "Bash(tail *)", "Bash(head *)", "Bash(mkdir -p *)",
]
DENY = [
  "Bash(git push origin*)", "Bash(git push * main*)", "Bash(git push *:main*)",
  "Bash(git push --force*)", "Bash(git push -f *)", "Bash(git push * --force*)",
  "Bash(git push * -f *)",
]
cfg = {}
if os.path.exists(path):
    with open(path) as f:
        cfg = json.load(f)
perms = cfg.setdefault("permissions", {})
for key, items in (("allow", ALLOW), ("deny", DENY)):
    lst = perms.setdefault(key, [])
    added = [x for x in items if x not in lst]
    lst.extend(added)
    print(f"permissions.{key}: +{len(added)} rule(s)")
    for x in added:
        print(f"  + {x}")
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
print(f"written: {path}")
PYEOF
  exit $?
fi

if [ "${CLAUDE_OVERNIGHT_DANGEROUS:-0}" != "1" ] && \
   ! grep -q 'git commit' "${REPO_DIR}/.claude/settings.local.json" 2>/dev/null; then
  log "WARNING: overnight allowlist not installed — unattended turns cannot commit/serve/test."
  log "WARNING: run once, yourself:  ./tools/claude-overnight.sh --install-permissions"
fi

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
