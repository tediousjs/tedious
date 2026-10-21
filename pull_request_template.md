**Before submitting a PR :**
1. Ensure your fork is created from `master` branch of [the repository](https://github.com/tediousjs/tedious).
2. Run `npm install` in the root folder.
3. After bug fix/code change, ensure all the existing tests and new tests (if any) pass (`npm run-script test-all`). During development, to run an individual test use `npx mocha <test_file> -g "<test_name>"`.
4. Build the driver (`npm run build`).
5. Run eslint and the TypeScript typechecker (`npm run lint`).
6. Use a [Conventional Commits](https://www.conventionalcommits.org/) title for your PR (e.g. `fix: ...`, `feat: ...`, `chore: ...`). PRs are squash-merged with the PR title as the commit message, which drives releases and is checked by the "Lint Pull Request Title" workflow.

**Thank you for Contributing!**