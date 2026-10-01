# Contributing

Use Python 3.12 and Node 24. Run `./scripts/setup.sh` to create the virtual environment, install the locked dependencies and build the frontend. Copy `.env.example` to `.env` only when you need local overrides; `.env` and personal research under `data/` stay outside Git.

Start with `./scripts/start.sh`. For frontend development, run `npm run dev --prefix frontend` alongside the backend; Vite forwards API requests to port 8765.

Before submitting a change, run:

```bash
.venv/bin/python -m pytest -q
npm run build --prefix frontend
npm test --prefix frontend
```

Install Playwright Chromium with `cd frontend && npx playwright install chromium` first if Google Chrome is unavailable. Linux CI installs it with `--with-deps`. The browser suite launches an offline backend on port 8767 with a fresh temporary database and no OpenAI key. AI regressions use controlled provider responses. Real provider smoke scripts are separate manual checks and are excluded from CI.

Keep research restrictions, price-basis separation and the explicitly fictional demo data intact. Update relevant documentation when changing data conventions, strategy rules, model configuration or billing behavior. Use meaningful regression checks for behavior changes.

Commit source and updated lockfiles together when changing dependencies. Keep credentials, local databases, downloaded market data, runtime logs, installed dependencies and generated builds out of commits. Preserve the root `NOTICE` and third-party notices described in [dependency licenses](docs/LICENSES.md).
