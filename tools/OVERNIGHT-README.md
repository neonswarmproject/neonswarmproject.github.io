# Running the NEON SWARM overnight refinement loop

The wrapper survives Claude usage-limit windows: when a limit hits, it parses
the reset time, sleeps until then (timezone-aware), and resumes the SAME
session with `claude --continue`. It stops by itself when the whole pass is
done and the preview is waiting for you.

## Launch (under tmux, so you can close the terminal)

```bash
cd ~/Downloads/neonswarmproject
tmux new -s neon
./tools/claude-overnight.sh
```

Detach and go to sleep: press `Ctrl-b`, then `d`.
Re-attach in the morning: `tmux attach -t neon`.
Watch the log live from anywhere: `tail -f ~/.claude/neon-overnight/overnight.log`

## What "done" looks like

The loop exits after printing `OVERNIGHT-DONE`, and
`tools/refine-v2-progress.md` shows `STATUS: AWAITING-HUMAN`. A local preview
server will be up — open the printed URL, playtest, then tell Claude to merge
and deploy (it will NOT touch main until you do).

## Notes

* The loop runs with `--permission-mode acceptEdits`: file edits are
  auto-accepted, but Bash commands (git commit, local server, tests) still need
  permission. For unattended overnight progress you must do ONE of these two
  things yourself before launching:
  1. **Scoped allowlist (recommended).** Add the snippet below to
     `.claude/settings.local.json` in this repo (merge into the existing
     `permissions.allow` array). It covers commit/serve/test commands and
     deliberately DENIES `git push`:
     ```json
     "Bash(git status*)", "Bash(git add *)", "Bash(git commit *)",
     "Bash(git checkout *)", "Bash(git switch *)", "Bash(git branch*)",
     "Bash(git log*)", "Bash(git diff*)", "Bash(git show*)",
     "Bash(node *)", "Bash(bash -n *)",
     "Bash(python3 -m http.server*)", "Bash(npx playwright *)",
     "Bash(curl http://localhost*)", "Bash(curl -s http://localhost*)",
     "Bash(open http://localhost*)", "Bash(wc *)", "Bash(grep *)",
     "Bash(ls *)", "Bash(tail *)", "Bash(head *)"
     ```
     and under `permissions.deny`: `"Bash(git push*)"`.
  2. **Full bypass (your explicit call, not the default):**
     `CLAUDE_OVERNIGHT_DANGEROUS=1 ./tools/claude-overnight.sh`
     This removes approval gates for the unattended turns entirely.
* It never pushes: all work stays on the local `refine/v2` branch.
* Stop it anytime with `Ctrl-C` inside tmux (a lock file prevents double-runs).
* Rate-limit reset discovery: `~/.claude/hooks/neon-overnight-statusline.js`
  (chained in front of your normal statusline) snapshots Claude Code's status
  JSON to `~/.claude/neon-overnight/`, and the wrapper also parses the CLI
  output (epoch / ISO / "resets at 3am (Zone)" formats). If neither yields a
  time, it retries every 30 minutes.
