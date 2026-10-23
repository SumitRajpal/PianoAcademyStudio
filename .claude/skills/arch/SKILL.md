---
name: arch
description: Answers questions about Piano Academy Studio's architecture from the generated graph (where code lives, what uses what, what a change would affect, how the mic-to-screen hot path runs, which thread each part is on) and runs the architecture checks. Use for /arch, whenever someone asks how parts connect, and before creating, moving, renaming or deleting a module.
argument-hint: "[show|who-uses|deps|impact|path|hot-path|find|check] [target]"
allowed-tools:
  - Bash(node scripts/architecture/query.mjs *)
  - Bash(node scripts/architecture/check.mjs *)
  - Bash(node scripts/architecture/build.mjs *)
---

# Architecture questions

Answer from the graph, not by searching the repo. Run:

```sh
node scripts/architecture/query.mjs $ARGUMENTS
```

| Command | Answers |
|---|---|
| (none) / `map` | the compact map (the one loaded at session start) |
| `show <x>` | one module: purpose, plane, thread, what it uses, what uses it, packages |
| `who-uses <x>` / `deps <x>` | direct connections |
| `impact <x>` | everything that changing `x` can affect, including screens and scenes |
| `path <a> <b>` | how two parts connect |
| `hot-path` | each flow from the mic or playback to the screen, with the thread of every step |
| `find <name>` | where an export or module lives |
| `check` | rule violations, modules without a purpose, flows that don't match the code |

`x` can be a module (`motion/scenes/PianoMaster/CorePiano`, or just `CorePiano`), a file path, or an exported name.

## Keeping the meaning true

The script builds the structure. Claude writes the meaning, and the Stop hook checks it at the end of every turn:

- **Every module needs a purpose.** A module is a folder with an `index.ts`, or a single file. Add a header at the top of its entry file: `/** @purpose One line on what it does. */`.
- **Thread tags are optional.** Add `@thread ui|js|audio|native|any` only when the role default is wrong. Defaults: a barrel is any; React components and hooks are js; looks, designs and types are any; otherwise the plane default.
- **Flows live in `docs/architecture/flows.md`:** a `##` name, then a `flow` block of steps joined with `->`. A heading ending in `(js ok)` marks a flow that crosses the JS thread on purpose; say why.
- **Conventions:** add any non-obvious decision to the Conventions section of `docs/architecture/ARCHITECTURE.md`. Never edit sections 1–6 or `graph.json`; they are generated.

Rules and planes live in `scripts/architecture/config.mjs`. Changing them needs the owner's OK. If a rule blocks an edit, change the code to follow it, or explain to the owner why the rule should change.
