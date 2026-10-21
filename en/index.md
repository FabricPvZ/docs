---
layout: home

hero:
  name: PvZ-Portable · Mod Development
  text: From a first mod to rewriting the game with Mixin and the content API
  tagline: For mod authors of the PvZ-Portable Java port — the same chapters in English and Chinese
  actions:
    - theme: brand
      text: Getting started
      link: /en/guide/index
    - theme: alt
      text: API reference
      link: /en/guide/reference

features:
  - title: 1. Getting started
    details: Prerequisites, running the game, where the mods/ directory is, and a first mod that runs
  - title: 2. Project structure
    details: The pvz-content-mod layout, both build scripts, every fabric.mod.json field, and the meaning of run/
  - title: 3. Mixin experiments
    details: Picking a target, the mixin config, complete copyable @Inject/@Redirect/@ModifyConstant/@Accessor examples, and require
  - title: 4. Content with fabric-api
    details: Registering plants and zombies, overriding existing numbers, images and reanimations, resource overrides, events
  - title: 5. Walkthrough
    details: pvz-content-mod file by file — registration, the art pipeline, seed-packet drawing, unlock gates
  - title: 6. Building, testing, publishing
    details: build/test/runClient, how an end-to-end test is written, publishToMavenLocal, handing the jar to a player
  - title: 7. API reference
    details: The public API of every module, and where to read the real implementations
---

## What this documentation is

This site is about one thing: **writing mods for PvZ-Portable**. PvZ-Portable is a Java desktop port of
*Plants vs. Zombies* GOTY (JDK 25 + Gradle + LWJGL/SDL3) that **runs on the real Fabric Loader**, so a
mod is an ordinary Fabric mod: a `fabric.mod.json`, a `ModInitializer` entry point and a jar.

The chapters run from "nothing" to "the game behaves differently":

| Chapter | Read it to |
| --- | --- |
| [1. Getting started](./guide/index.md) | Prepare the environment and the game, and let a first mod run |
| [2. Project structure](./guide/structure.md) | Understand every file of a mod project, and what the toolchain does for you |
| [3. Mixin experiments](./guide/mixin.md) | Rewrite game classes without touching the game's source, with a complete example |
| [4. Plants and zombies](./guide/content.md) | Register content and override existing numbers with `api-plant` / `api-zombie` |
| [5. Resources and art](./guide/resources.md) | Images, reanimations, and loose files above the pak |
| [6. Events and lifecycle](./guide/events.md) | Observe the game with `api-events`, and when not to |
| [7. Walkthrough](./guide/content-mod.md) | `pvz-content-mod` file by file: how three red plants come to exist |
| [8. Building, testing, publishing](./guide/build.md) | Build, test, publish and ship a mod |
| [9. API reference](./guide/reference.md) | Look up a class or a method |

The Chinese version lives at the site root and mirrors these chapters one to one.

## What actually exists in the workspace

Every snippet in this documentation comes from a real project of the workspace, so it can be read and
run as it stands:

| Project | What it is |
| --- | --- |
| `PvZ-Portable/` | The game itself (mod id `pvz-portable`), **not** a mod |
| `fabric-api/` | The mod API: `api-base`, `api-events`, `api-plant`, `api-resource`, `api-zombie`; the aggregate coordinate is `cn.enaium.fabricpvz:fabric-api` |
| `loom/` | The toolchain Gradle plugin `cn.enaium.fabricpvz.loom`: one plugin line brings the game and the libraries its version package's manifest names (Loader, Mixin, ASM, the logging stack, LWJGL), `runClient` and jar-in-jar |
| `pvz-example-mod/` | The smallest runnable example: events plus three mixins |
| `pvz-content-mod/` | The teaching example: three red plants, registration, an art pipeline and an end-to-end test |
| `pvz-mod-95-edition/` | A large rebalance example: rule and number overrides, written in Kotlin |

Every project in the table can be opened next to this site; the build scripts and snippets here follow
their current contents. The toolchain supplies only the game and the libraries its version package's
manifest names; Kotlin, JUnit, `fabric-language-kotlin` and the API are declared by each mod itself.
