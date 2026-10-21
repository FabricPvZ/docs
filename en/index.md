---
layout: home

hero:
  name: PvZ-Portable · Mod Development
  text: From a first mod to rewriting the game with Mixin and the content API
  tagline: A Java desktop port of Plants vs. Zombies GOTY that runs on the real Fabric Loader
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
