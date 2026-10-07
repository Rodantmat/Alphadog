#!/usr/bin/env bash
# CONFLICT-SAFE COMMIT + PUSH for pipeline data files (2026-10-07, full-system certification pass A).
#
#   usage: bash nba/git_push_retry.sh "<commit message>" <pathspec> [<pathspec> ...]
#
# Why: every NBA pipeline committed with the same loop - `git push || (git fetch; git rebase origin/main)` - under
# `set -e`. When two pipelines write the SAME generated file minutes apart (P1 and P2B both refresh
# nba/data/nba_players_current*.json), the rebase stops on a content conflict, `set -e` kills the step, and the
# whole run's files never reach the repo: P1 2026-10-07 (run 37656317775) lost its entire weekly scrape that way,
# so the DARKO loader found nothing new and the run went red after every scrape had succeeded.
#
# Rule: these files are GENERATED, never hand-edited; the run that is committing holds the newest copy of what it
# produced, so its version wins every collision. During a rebase the commit being replayed is "theirs"
# (`-X theirs` = this run); if the rebase still cannot complete, abort it and merge with `-X ours` (= this run).
# Nothing is swallowed: a push that fails after six attempts exits 1 and prints an error.
set -uo pipefail
msg="${1:?commit message required}"; shift
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add "$@" 2>/dev/null || true
if git diff --cached --quiet; then echo "No changes to commit."; exit 0; fi
git commit -m "$msg" || { echo "::error::git commit failed"; exit 1; }
for i in 1 2 3 4 5 6; do
  if git push origin HEAD:main; then echo "pushed on attempt $i"; exit 0; fi
  git fetch origin main
  if ! git rebase -X theirs origin/main; then
    echo "rebase could not complete - aborting and merging (this run's files win)"
    git rebase --abort || true
    git merge -X ours --no-edit origin/main || git merge --abort || true
  fi
  sleep $((RANDOM % 5 + 2))
done
echo "::error::could not push after 6 attempts (concurrent commits or GitHub unavailable)"
exit 1
