# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.1.x   | :white_check_mark: |
| < 2.1   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Sports Fair, please report it by
opening a [GitHub Issue](https://github.com/wuleiyuan/sports-fair/issues/new?template=bug_report.md)
with the label `security` or by emailing the maintainer directly.

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

When reporting, please include:

1. A clear description of the vulnerability
2. Steps to reproduce the issue
3. Potential impact of the vulnerability
4. Any known workarounds

We will respond to your report within 7 days and keep you informed of the
progress toward a fix.

## Security Best Practices for Forks

If you fork this project:

1. **Never commit secrets** (API keys, tokens, passwords) to the repository
2. Use `.gitignore` to exclude sensitive files (already configured for common cases)
3. Use environment variables or GitHub Secrets for any credentials
4. Regularly update dependencies (`pnpm update`, `pip install --upgrade`)
5. Review the [Data Sync workflow](.github/workflows/run_data_sync.yml) before
   enabling automatic data imports

## Known Security Considerations

- `data.db` may contain personal activity data — review before pushing to public forks
- HealthKit exports include sensitive health metrics — handle with care
- Strava/Garmin/Keep integration requires API tokens — store in GitHub Secrets
