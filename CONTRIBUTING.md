# Contributing to Sports Fair

Thank you for your interest in contributing to Sports Fair! 🎉

## Quick Start

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/sports-fair.git
   cd sports-fair
   ```
3. **Install** dependencies:
   ```bash
   pnpm install
   ```
4. **Create a branch** for your change:
   ```bash
   git checkout -b feature/my-awesome-change
   ```
5. **Make your changes** (see guidelines below)
6. **Test locally**:
   ```bash
   pnpm tsc --noEmit    # TypeScript check
   pnpm build           # Production build
   ```
7. **Commit** with a clear message
8. **Push** and open a Pull Request

## Development Guidelines

### Code Style

- TypeScript strict mode (no `any` unless necessary)
- React functional components + hooks
- CSS Modules for component styles
- Follow existing patterns in the codebase

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

<optional body>

<optional footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, missing semicolons, etc.)
- `refactor`: Code refactor (no functional change)
- `perf`: Performance improvement
- `test`: Add/update tests
- `chore`: Build, CI, dependencies, etc.

**Examples**:
- `feat(assess): add ACWR zone color band`
- `fix(data): filter 异常 RHR < 30`
- `docs: update README with deployment badges`

### Version Bumping

Every functional commit must bump `package.json` version per
[`docs/VERSION_PROCESS.md`](VERSION_PROCESS.md).

After merging your PR, the maintainer will run `./scripts/release.sh` to
automatically create the GitHub release.

## Pull Request Process

1. **Update** `CHANGELOG.md` with your change under `[未发布]` section
2. **Bump version** in `package.json` (patch for bug fix, minor for new feature)
3. **Run** the [PR template](.github/PULL_REQUEST_TEMPLATE.md) checklist
4. **Request review** from a maintainer
5. **Wait for CI** (GitHub Actions) to pass
6. **Address review comments**
7. **Squash and merge** when approved

## Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md).

Include:
- Clear description
- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, browser, version)
- Screenshots if applicable

## Requesting Features

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md).

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating,
you agree to uphold this code.

## License

By contributing, you agree that your contributions will be licensed under
the [MIT License](LICENSE).
