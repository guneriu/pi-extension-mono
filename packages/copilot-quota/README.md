# @guneriu/pi-copilot-quota

GitHub Copilot AI credit usage chip for [pi coding agent](https://pi.dev).

Shows your Copilot quota in the footer and calculates session costs using Copilot's credit-based pricing.

> ⚠️ **Uses an undocumented internal GitHub API** (`copilot_internal`). This endpoint has no stability guarantee and may change without notice.

## Install

```bash
pi install git:github.com/guneriu/pi-extension-mono
# or when published to npm:
pi install npm:@guneriu/pi-copilot-quota
```

## Commands

- `/copilot-usage` — open settings (GitHub host, metric, refresh interval, cost format)

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Show/hide the quota chip |
| `githubHost` | `github.com` | Your GitHub host (or GHE hostname) |
| `clearGithubTokenEnv` | `false` | Set to `true` if GHE auth fails due to `GITHUB_TOKEN` conflict |
| `metric` | `remaining` | What to show: `remaining`, `used`, `percent`, `remaining+percent` |
| `refreshEvery` | `10` | Refresh interval in minutes (5, 10, or 30) |
| `costFormat` | `money` | Display as `money` ($) or `credits` (cr) |

## Requirements

- [`gh` CLI](https://cli.github.com) authenticated to your GitHub host
- GitHub Copilot subscription

## License

MIT © Ugur Gueneri
