# La Cour des grands

## Who owns main

- One session owns `main`: the coordinating session Alexis names (today the one working in the worktree `recursing-stonebraker-8b3425`). It commits on `main` or on a branch of its own, merges into `main` itself, pushes, and is the only one that deploys.
- Every other session (child) works on its own branch, commits there, never pushes `main` and never deploys. When its work is ready, it asks the owner session (cross-session message) to merge it into `main` and deploy.
- Production is always the head of `origin/main`: deploy only with `server/deploy/deploy.sh`, which refuses any other commit and any change in `server/`, `web/` or `pipeline/`. Never force-push.
