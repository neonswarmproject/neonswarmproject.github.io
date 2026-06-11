# Running the NEON SWARM overnight refinement loop

The wrapper survives Claude usage-limit windows: when a limit hits, it parses
the reset time, sleeps until then (timezone-aware), and resumes the SAME
session with `claude --continue`. It stops by itself when the checklist in
`tools/refine-v2-progress.md` is fully shipped (`OVERNIGHT-DONE`).

## Launch (under tmux, so you can close the terminal)

First time only — install the unattended-turn permissions (see Notes):

```bash
./tools/claude-overnight.sh --install-permissions
```

Then:

```bash
cd ~/Downloads/neonswarmproject
tmux new -s neon
./tools/claude-overnight.sh
```

Or launch already-detached in one line:

```bash
tmux new -d -s neon -c ~/Downloads/neonswarmproject ./tools/claude-overnight.sh
```

Detach and go to sleep: press `Ctrl-b`, then `d`.
Re-attach in the morning: `tmux attach -t neon`.
Watch the log live from anywhere: `tail -f ~/.claude/neon-overnight/overnight.log`

## What "done" looks like

The loop exits after printing `OVERNIGHT-DONE` once every checklist item in
`tools/refine-v2-progress.md` is implemented, versioned, committed and pushed.
Since 2026-06-11 each finished item ships straight to `main` (standing user
authorization), so the live site updates as the night progresses.

## Notes

* The loop runs with `--permission-mode acceptEdits`: file edits are
  auto-accepted. For unattended Bash (commit/serve/test) there is a **one-time
  setup that YOU run yourself** — Claude deliberately does not widen its own
  permissions:

  ```bash
  ./tools/claude-overnight.sh --install-permissions
  ```

  It prints every rule it merges into `.claude/settings.local.json`: a scoped
  allowlist (commit/serve/test commands, plus `git push neon main` /
  `git push neon refine/v2` / tag pushes) and DENY rules that hard-block any
  push to `origin` and any `--force`. For reference, `permissions.allow` gets:
  ```json
  "Bash(git status*)", "Bash(git add *)", "Bash(git commit *)",
  "Bash(git checkout *)", "Bash(git switch *)", "Bash(git branch*)",
  "Bash(git log*)", "Bash(git diff*)", "Bash(git show*)",
  "Bash(git tag*)", "Bash(git restore *)", "Bash(git stash*)",
  "Bash(git push neon main)", "Bash(git push neon refine/v2)",
  "Bash(git push neon v*)",
  "Bash(node *)", "Bash(bash -n *)",
  "Bash(python3 -m http.server*)", "Bash(npx playwright *)",
  "Bash(curl http://localhost*)", "Bash(curl -s http://localhost*)",
  "Bash(open http://localhost*)", "Bash(wc *)", "Bash(grep *)",
  "Bash(ls *)", "Bash(tail *)", "Bash(head *)", "Bash(mkdir -p *)"
  ```
  and to `permissions.deny`:
  ```json
  "Bash(git push origin*)",
  "Bash(git push --force*)", "Bash(git push -f *)", "Bash(git push * --force*)",
  "Bash(git push * -f *)"
  ```
  Escape hatch (your explicit call, never the default):
  `CLAUDE_OVERNIGHT_DANGEROUS=1 ./tools/claude-overnight.sh` removes approval
  gates for the unattended turns entirely.
* Pushes: after each finished item it bumps VERSION, updates CHANGELOG, commits
  on `main` and runs `git push neon main` — each push deploys the live site
  (standing user authorization, 2026-06-11). Pushes to `origin` and any
  `--force` stay hard-blocked.
* The wrapper re-execs itself under `caffeinate -is` so the Mac won't sleep
  mid-run. A lid-closed laptop on battery still sleeps — leave it on AC power.
* Stop it anytime with `Ctrl-C` inside tmux (a lock file prevents double-runs).
* Rate-limit reset discovery: `~/.claude/hooks/neon-overnight-statusline.js`
  (chained in front of your normal statusline) snapshots Claude Code's status
  JSON to `~/.claude/neon-overnight/`, and the wrapper also parses the CLI
  output — including the headless `…usage limit reached|<epoch>` message,
  bare epochs near "reset"/"reached", ISO stamps, and "resets at 3am (Zone)"
  clock times. If nothing yields a time, it retries every 30 minutes.
  Verify the parser anytime with `./tools/claude-overnight.sh --selftest`.
