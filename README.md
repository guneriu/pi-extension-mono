# pi-extension-mono

Pi coding agent extensions by [guneriu](https://github.com/guneriu).

## Extensions

| Package | npm | Description |
|---------|-----|-------------|
| [`@guneriu/pi-files`](./packages/pi-files) | `pi install npm:@guneriu/pi-files` | Agent-edited files widget + interactive project tree (`/pi-files`, type-to-filter, Space to peek) |
| [`@guneriu/pi-session-files`](./packages/session-files) | `pi install npm:@guneriu/pi-session-files` | Track context, read, and modified files in your session |
| [`@guneriu/pi-keybindings-help`](./packages/keybindings-help) | `pi install npm:@guneriu/pi-keybindings-help` | Press `?` on an empty editor → floating keybindings reference |
| [`@guneriu/pi-copilot-quota`](./packages/copilot-quota) | git only | GitHub Copilot quota chip, session cost, `/copilot-rates` |
| [`@guneriu/pi-footer`](./packages/pi-footer) | git only | Enhanced footer — tokens, cache %, context bar, Copilot cost breakdown |

## Install

```bash
# Individual packages (on npm):
pi install npm:@guneriu/pi-files
pi install npm:@guneriu/pi-session-files
pi install npm:@guneriu/pi-keybindings-help

# All five from GitHub (includes copilot-quota and pi-footer):
pi install git:github.com/guneriu/pi-extension-mono

# Local development:
pi install /path/to/pi-extension-mono
```

## Requirements

- [pi coding agent](https://pi.dev)
- [`gh` CLI](https://cli.github.com) — required by `pi-copilot-quota`
- GitHub Copilot subscription — required by `pi-copilot-quota`

## Development

```bash
# Install locally for testing
pi install ./pi-extension-mono

# After editing, reload in pi
/reload
```

## Publish (npm)

Only the three public packages are published to npm:

```bash
npm login   # must be logged in as guneriu

cd packages/pi-files         && npm publish --access public && cd ../..
cd packages/session-files    && npm publish --access public && cd ../..
cd packages/keybindings-help && npm publish --access public && cd ../..
```

## License

MIT © Uğur Güneri
