# Building, testing and publishing

## 1. Everyday commands

All of them run in the mod project's directory:

| Command | Effect |
| --- | --- |
| `./gradlew build` | Compile + tests; output `build/libs/<mod>-<version>.jar` |
| `./gradlew test` | Tests only |
| `./gradlew runClient` | Start the game on the real Fabric Loader (a development run: this mod is discovered on the class path, nothing is copied) |
| `./gradlew pvzDist` | Obtain the game version package and unpack it into `build/pvz/dist` (the game jar and the JSON manifest next to it are the class path) |
| `./gradlew publishToMavenLocal` | Publish the mod jar to `mavenLocal` (for another project that wants to depend on it) |
| `./gradlew clean` | Remove `build/` |

The output of `build` is a jar holding **only your own things**: classes, resources and (optionally) a mixin
config. The game, Loader, Mixin and ASM come from the toolchain as `compileOnly`; the API, the Kotlin stdlib
and the rest are your own declarations — either way they **bundle nothing**, they come from the player's
installation, and a duplicate in the jar is a bug (the toolchain's jar task treats a duplicate as a failure).

## 2. What a unit test can cover

It can cover **pure data and pure logic**: "my plant registered at 175 sun", "the override table says this",
"this hue mapping turns green into red" — none of that needs the loader or a running game.

It cannot cover **"this holds once installed"**: a mod's key behaviour happens after the loader resolved the
mods, ran the entry points and applied the mixins, and that environment does not exist in a plain JUnit
process. That is why end-to-end tests exist.

## 3. End-to-end tests: the real loader, real assets, a report file

`pvz-content-mod` and `pvz-mod-95-edition` both write one. The shape is always the same:

1. **Pack**: `./gradlew test` depends on `jar` (the toolchain puts the jar's absolute path into the test
   fork's `pvz.test.modJar` system property), and the test copies that jar into a temporary `mods/`
   directory. JUnit itself is the mod's declaration (`junit-bom` + `junit-jupiter` on
   `testImplementation`, `junit-platform-launcher` on `testRuntimeOnly`); the toolchain only configures the
   JUnit Platform convention.
2. **Start a second JVM**: the main class is the loader's own
   `net.fabricmc.loader.impl.launch.knot.KnotClient`, and the class path comes from
   `pvz.test.forkClasspath` (the version package's jars plus the API / language module you declared on the
   test class path) and **deliberately not the mod's own output**: the mod can only come from `mods/`,
   just like a player's installation.
3. **Replace the game's main class with a harness**: `-Dpvz.game.mainClass=<your.test.GameMain>`, so the
   harness runs instead of the real window loop.
4. **Make the harness and the game share one class loader**: `-Dpvz.extraClasspath=<test classes dir>`, which
   the provider adds to the loader's own class loader — otherwise an assertion reads the **second** copy of
   every static (the loader defines its own copy of the game classes), which is the easiest trap in this kind
   of test.
5. **A report file**: the harness writes every observed fact into `-Dpvz.test.report=<file>` and the test
   asserts on it. The report is not optional: in-memory state does not cross a JVM boundary, and class
   loader isolation makes "read a static field" unreliable.
6. **Assets**: an optional retail resource directory is passed in as `-Dpvz.test.resources=<dir>`; without it
   the assertions that need assets are skipped instead of failing — **that is what keeps the test green on a
   machine without the game installed**.

`pvz-content-mod`'s boot command (`ContentModEndToEndTest#launch`) looks like this:

```java
command.add(java);
command.add("--enable-native-access=ALL-UNNAMED");
command.add("-XstartOnFirstThread");                        // macOS: SDL needs the first thread
command.add("-cp");
command.add(forkClasspath());                               // pvz.test.forkClasspath
command.add("-Dpvz.extraClasspath=" + harnessDirectory());   // harness and game in one class loader
command.add("-Dfabric.development=true");                    // mods on the class path (the API modules) are discovered too
command.add("-Dfabric.skipMcProvider=true");
command.add("-Dfabric.noGui=true");                          // crash out instead of opening the Swing error window
command.add("-Dpvz.gameDir=" + runDir);
command.add("-Dfabric.modsFolder=" + mods);                  // the mod under test can only come from here
command.add("-Dpvz.game.mainClass=cn.enaium.fabricpvz.contentmod.test.ContentModGameMain");
command.add("-Dpvz.test.report=" + report);
command.add(LAUNCHER_CLASS);                                 // net.fabricmc.loader.impl.launch.knot.KnotClient
command.add("-savedir");
command.add(runDir.resolve("userdata").toString());
```

What those assertions should be, in order of value:

1. **The registration really reached the game's definition table**: `Plant.getPlantDefinition(seedType)`
   reports the cost, recharge, launch rate, reanimation, subclass and burst you wrote.
2. **Gates and unlocks**: `LawnApp.hasSeedType(...)` before and after the gate is the player's.
3. **Whether the UI offers it**: the almanac's second page, the seed chooser's second page (mod content lives
   on the page after the retail grid).
4. **Behaviour**: place one on a headless board, shoot a zombie, and assert which projectile and how many
   shots per volley.
5. **Pixels**: the icon's size, that its mask matches its twin's packet art, and the red pixel count — **these
   need real assets** and are skipped without them.

These tests are slow (a new JVM, the real loader, sometimes real assets) and they are the only verification
that proves "this holds in an installation". **When you change a mod's behaviour, extend this test instead of
only adding log lines.**

## 4. Publishing

### For other projects locally: `publishToMavenLocal`

```bash
./gradlew publishToMavenLocal
```

That publishes `cn.enaium.fabricpvz:<your-mod>:<version>` into `~/.m2/repository`, so another project can
depend on it (`PvZ-Portable`'s end-to-end test consumes a mod jar from mavenLocal exactly this
way). The POM metadata (the MIT licence and the rest) comes from the toolchain's conventions.

### For a player: a jar in `mods/`

```
<game directory>/
├── mods/
│   ├── my-mod-1.0.0.jar
│   └── fabric-api-1.2.2.jar      # optional: only when you use the API; it is this one jar
└── userdata/
```

- A player needs **every dependency your `fabric.mod.json` declares**. Miss one and the loader refuses to
  start and names what is missing.
- Write version-independent constraints such as `"pvz-portable": "*"`, so a game update needs no re-release.
- If saves must keep working, do not assume "once per object" in `onPlanted` / `onSpawned` (a save load
  replays them), and do not put mod state into the game's save format — those are not your fields.

### A pre-release checklist

| Check | Why |
| --- | --- |
| `./gradlew build` is green | The tests are the only regression net |
| The jar holds only your own things (`unzip -l build/libs/*.jar`) | Bundling Loader/API conflicts with the player's installation |
| `fabric.mod.json`'s `depends` and `version` match reality | Dependency resolution on the player's side depends on it |
| The mixin config names match the paths in the jar | A wrong name means a silently inactive mixin (unless `required: true` makes it fail loudly) |
| Install it by hand in a **distribution** once and start it | Only that step confirms the difference between `runClient` and an installation (class path vs `mods/`) |

## 5. Where to look when it breaks

| Symptom | Look first at |
| --- | --- |
| The game will not start and complains about dependencies | The loader's error message: who is missing, who was disabled |
| Your mod is not in the mod list | Is the jar in `mods/`; is the `id` in `fabric.mod.json` valid |
| The entry point did not run | The exception in the log; is the class `public` with a **no-argument constructor** |
| A mixin did nothing | The troubleshooting table in [Mixin experiments](./mixin.md) (`required`, `require`, the config in the jar) |
| Registered content never shows up | Was it registered in the entry point (before the game reads the table); is the `unlockAfter` seed the player's |
| Art is lost on every resource load | Never park runtime-built images under a game resource id; use `packetArt(Supplier)` |

Next chapter: [API reference](./reference.md).
