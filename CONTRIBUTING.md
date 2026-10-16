# Contributing

1. Open an issue that describes the problem and the expected behavior.
2. Install dependencies with `npm ci`. The integration tests run Cypress in Chrome, which must be installed. `BROWSER=firefox` runs them in Firefox. CI runs Chrome and Firefox.
3. Make your change in `src/` and run `npm run build`. The tests run against `dist/`, which is not committed.
4. Run `npm run verify` (build, type check, format check, unit and integration tests). It must pass.
5. Open a PR with the implementation and tests. Don't change the version in `package.json`: the maintainer releases from GitHub Actions, which increases the version.
