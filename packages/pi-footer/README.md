# @guneriu/pi-footer

Enhanced footer for [pi coding agent](https://pi.dev).

Replaces pi's default footer with: current path, git branch, session name, token counts (↑input ↓output), cache hit %, context window bar, Copilot cost (with subagent breakdown), and model + thinking level.

## Install

```bash
pi install git:github.com/guneriu/pi-extension-mono
# or when published to npm:
pi install npm:@guneriu/pi-footer
```

> Requires `@guneriu/pi-copilot-quota` for cost display (installed automatically with the mono-repo).

## Commands

- `/custom-footer` — toggle enhanced footer on/off

## Footer layout

```
~/path  🌿 branch  [session]    ↑input ↓output 💾CH% [bar] ctx%  $cost ↳ $sub  model · 🧠level
```

## License

MIT © Ugur Gueneri
