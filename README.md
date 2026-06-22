# pi-extension-mono

Pi coding agent extensions by [guneriu](https://github.com/guneriu).

## Extensions

| Package | Description | Install |
|---------|-------------|---------|
| [@guneriu/pi-copilot-quota](./packages/copilot-quota) | GitHub Copilot AI credit usage chip in the footer | `pi install npm:@guneriu/pi-copilot-quota` |
| [@guneriu/pi-footer](./packages/pi-footer) | Enhanced footer with tokens, cache %, cost, model | `pi install npm:@guneriu/pi-footer` |
| [@guneriu/pi-session-files](./packages/session-files) | Track context, read, and modified files per session | `pi install npm:@guneriu/pi-session-files` |

## Install all (GitHub)

```bash
pi install git:github.com/guneriu/pi-extension-mono
```

## Install all (local development)

```bash
pi install /path/to/pi-extension-mono
```

## Requirements

- [pi coding agent](https://pi.dev) v1+
- [`gh` CLI](https://cli.github.com) (for `pi-copilot-quota` quota chip)
- GitHub Copilot subscription (for `pi-copilot-quota`)

## License

MIT © Ugur Gueneri
