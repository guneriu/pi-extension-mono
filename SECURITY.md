# Security Policy

## Supported versions

Only the latest published version of each package is supported. Please upgrade before reporting.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private vulnerability reporting:
**Security → Report a vulnerability** on this repository
(https://github.com/guneriu/pi-extension-mono/security/advisories/new).

You'll get an acknowledgement as soon as possible. Once a fix is available and
released, the report will be disclosed publicly with credit (unless you prefer to
remain anonymous).

## Scope notes

These extensions run inside the pi agent and may execute local tooling
(e.g. `pi-copilot-quota` shells out to the `gh` CLI). Reports about command
injection, credential leakage, or arbitrary file access are especially welcome.
