# pi-extension-mono

Pi coding agent extensions by [guneriu](https://github.com/guneriu).

## Extensions

| Package | Install | Description |
|---------|---------|-------------|
| [`@guneriu/pi-files`](./packages/pi-files) | `pi install npm:@guneriu/pi-files` | Agent-edited files widget + interactive project tree (`/pi-files`, type-to-filter, Space to peek) |
| [`@guneriu/pi-session-files`](./packages/session-files) | `pi install npm:@guneriu/pi-session-files` | Track context, read, and modified files in your session |
| [`@guneriu/pi-keybindings-help`](./packages/keybindings-help) | `pi install npm:@guneriu/pi-keybindings-help` | Press `?` on an empty editor → floating keybindings reference |

## Install

```bash
# Individual packages (recommended):
pi install npm:@guneriu/pi-files
pi install npm:@guneriu/pi-session-files
pi install npm:@guneriu/pi-keybindings-help

# All three from GitHub:
pi install git:github.com/guneriu/pi-extension-mono

# Local development:
pi install /path/to/pi-extension-mono
```

## Requirements

- [pi coding agent](https://pi.dev)

## Development

```bash
# Install locally for testing
pi install ./pi-extension-mono

# After editing, reload in pi
/reload
```

## Publish

```bash
npm login   # must be logged in as guneriu

cd packages/pi-files         && npm version minor && npm publish --access public && cd ../..
cd packages/session-files    && npm version minor && npm publish --access public && cd ../..
cd packages/keybindings-help && npm version minor && npm publish --access public && cd ../..

git push && git push --tags
```

## License

MIT © Uğur Güneri
