# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).
It is how every user-facing change to a package gets versioned, changelogged, and released.

## TL;DR — the only command you need day to day

```bash
npx changeset
```

Run that after making a change. Answer the prompts:

1. **Which packages changed?** (space to select)
2. **What kind of bump?**
   - `patch` — bug fix, no API change (0.2.0 → 0.2.1)
   - `minor` — new feature, backwards compatible (0.2.0 → 0.3.0)
   - `major` — breaking change (0.2.0 → 1.0.0). Pre-1.0 we still treat breaking as `minor`.
3. **Summary** — one line; this becomes the CHANGELOG entry.

This creates a small `.changeset/<name>.md` file. Commit it with your change. **No release happens yet** — changesets pile up until you decide to release.

## Releasing (controlled, local — only when you want)

Releases are run **from your machine**. When you decide to ship:

```bash
make version        # consume pending changesets -> bump versions + CHANGELOGs
git commit -am "chore: version packages"
make release-local  # runs tests, then npm publish for changed public packages
git push --follow-tags
```

Until you run `make version`, changesets just accumulate and nothing ships.

See `CONTRIBUTING.md` and `AGENTS.md` for the full process.
