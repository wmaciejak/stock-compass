# GitHub repository preparation

The local repository uses `main` and the SSH remote `git@github.com:wmaciejak/stock-compass.git`. Preparing the repository does not publish it; the initial commit is local.

The repository includes application source, deterministic fictional fixtures, dependency locks, tests, docs and synthetic-demo screenshots. Personal research, credentials and runtime data remain local: `.env`, `data/`, installed packages, generated builds, test output and `.superpowers/` are ignored. An empty API-key template is committed as `.env.example`.

Inspect the local state with:

```bash
git status
git remote -v
git log -1 --oneline
```

When you explicitly choose to publish, the command is:

```bash
git push -u origin main
```

The destination repository must exist and your SSH key must have write access. If it already has commits, fetch and reconcile that history before publishing; do not force-push over it.

The CI workflow runs on Ubuntu with Python 3.12 and Node 24. It installs from the committed lockfiles, builds the frontend, runs backend tests and installs Chromium for the browser suite. Jobs have read-only repository permissions, do not retain checkout credentials, use isolated temporary databases and disable live market access and AI. The official checkout, Python and Node actions are pinned to verified commit hashes. A hosted CI run can be verified after the first push.

No project license has been selected by this preparation. Existing dependency license documentation and the TradingView attribution notice are preserved.
