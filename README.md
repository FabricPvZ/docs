# Mod-development documentation

The VitePress site that documents mod development for the port: getting started, a mod
project's structure, a Mixin walk-through, the Fabric-style API for content and
resources, a reading of `pvz-content-mod`, and how to build, test and ship a mod.
Chinese is the default locale; the English copy lives under `en/` with the same file
names.

Built with **Bun**. `node_modules` and `bun.lock` are Bun's; there is no npm lockfile.
VitePress is pinned to exactly **2.0.0-alpha.20** (no range) - the 2.x line has no stable
release yet, so the version that the site is verified against is the version it builds with.

```bash
bun install          # once, and after package.json changes
bun run dev          # dev server on http://localhost:5173 (hot reload)
bun run build        # static site into .vitepress/dist
bun run preview      # serve the built site
```

`bun run build` fails on a dead internal link, so a green build is also the link check.

Notes for whoever edits this site:

- every Chinese page has an English counterpart under `en/` with the same path and file
  name - a page added to one language without the other is a bug;
- code in the guides is meant to compile: the Mixin walk-through's example is kept valid
  against the current game distribution, so check a snippet against the jars in
  `../pvz-content-mod/build/pvz/dist/` (or any unpacked release) before changing it;
- what a guide must not become is a changelog: the repositories' own READMEs carry
  their build and release facts, and a guide states the behaviour of the current
  versions only.
