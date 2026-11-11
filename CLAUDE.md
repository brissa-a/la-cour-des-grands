# La Cour des grands

## Main only

- Work lands on `main` directly: commit in your worktree, then `git push origin HEAD:main` as a fast-forward, after `git fetch origin main && git rebase origin/main` if main moved.
- No long-lived branches, no pull requests. Never force-push.
- Production is always the head of `origin/main`: deploy only with `server/deploy/deploy.sh`, which refuses any other commit and any change in `server/`, `web/` or `pipeline/`.
