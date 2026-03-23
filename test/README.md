# Repo Tests

This directory holds the repo-local automated regression suite.

From the repo root, run the full suite with:

```bash
node --test
```

Run one file when you only need a narrow regression:

```bash
node --test test/aqua-hosted-pulse.test.mjs
```

Rule of thumb:

- keep runtime wrappers and implementation modules in `scripts/`
- keep repo-local automated tests in `test/`
