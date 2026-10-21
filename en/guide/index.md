# Getting started: run the game and a first mod

This chapter does three things: it states the prerequisites, it shows how to run the game and where the
`mods/` directory is, and it gives you a **minimal but complete** mod that builds, starts, and shows up
in the log.

## 1. Prerequisites

| What | Version / notes |
| --- | --- |
| JDK | **25**. The toolchain pins every project to Java 25 (`--release 25`) and the game's class files are 25 as well, so a Mixin config's `compatibilityLevel` must be `JAVA_25` |
| Gradle | **Nothing to install.** Every mod project carries a Gradle 9.8.1 wrapper (`gradlew` / `gradlew.bat` plus `gradle/wrapper/`); copy it from a template |
| Platform | Windows / Linux / macOS, x64 and arm64 both have natives; a distribution's `lib/` carries all of them |
| Game assets | The repository contains **no** retail assets. To play real levels you need `main.pak` and `properties/` from your own installation of *Plants vs. Zombies* GOTY |
| Network | The first build downloads the toolchain plugin (Gradle Plugin Portal), the game distribution (a GitHub release) and the Maven dependencies |

The `gradle.properties` every project ships contains `org.gradle.java.installations.auto-download=false`:
Gradle will **not** download a JDK for you, so install JDK 25 first (`java -version` must say 25).

## 2. Running the game itself

Two ways, depending on what you are doing.

**From source** (when you work on the game or debug it):

```bash
cd PvZ-Portable
./gradlew run                 # the real Fabric Loader, the real Mixin; working directory is run/
```

- The working directory is the project's `run/` (`-Dpvz.gameDir=run`), so `run/mods/` is this run's
  `mods/` directory and `run/userdata/` holds the save data.
- The task copies **nothing** into `run/mods/`: whatever is in there is what the loader loads, exactly
  like a player's installation.
- When you need retail assets, copy `main.pak` and `properties/` into the game directory first:

```bash
./gradlew syncDevResources run -PpvzResDir="/path/to/PvZ/resources"
```

**From a distribution** (the shape a mod author and a player use):

```bash
cd PvZ-Portable
./gradlew distZip             # output: build/distributions/pvz-portable-<version>-offline.zip
```

Unpacked, that is a complete installation:

```
pvz-portable-<version>/
├── bin/pvz-portable          # the launcher script (a .bat on Windows); macOS gets -XstartOnFirstThread
├── bin/pvz-portable.bat
├── lib/                      # the game jar + Loader/Mixin/ASM/logging + LWJGL and every platform's natives
├── lib/native/…              # runtime natives such as libopenmpt
└── mods/                     # create it yourself: this is where a player installs mods
```

- The launcher script passes `-Dpvz.gameDir=$APP_HOME` (`$APP_HOME` being the unpacked root), so **the
  game directory is the unpacked root** and `mods/` sits next to `bin/`.
- The game directory is resolved as `-Dpvz.gameDir` → the `-gamedir <path>` argument → the current
  working directory. Overriding the property through `PVZ_PORTABLE_OPTS` / `JAVA_OPTS` therefore changes
  which directory is the game directory.
- Retail assets still come from you: put them into the game directory (the game looks for `main.pak` and
  `properties/` in its own order).

## 3. Where the `mods/` directory is

In one sentence: **`mods/` under the game directory**, and which directory that is depends on how you started:

| How it was started | Game directory | Where mods are loaded from |
| --- | --- | --- |
| A distribution (`bin/pvz-portable`) | the unpacked root | `<unpacked root>/mods/` |
| `PvZ-Portable`'s `./gradlew run` | `PvZ-Portable/run/` | `run/mods/` |
| **your own mod's** `./gradlew runClient` | the `run/` of your project | the **class path**: your mod's own output is on it (`-Dfabric.development=true`); `run/mods/` only holds *other* mods |

An installation (what you hand to a player) is just: copy jars into `mods/`.

```
<game directory>/
├── mods/
│   ├── my-mod-1.0.0.jar        # your mod
│   └── fabric-api-1.2.2.jar    # optional: needed only when your sources use the API (one jar)
└── userdata/                   # save data
```

There are no implicit mod dependencies: your `fabric.mod.json` states what you need, and the player has
to put every one of them into `mods/`. The API itself is **one** jar (`fabric-api-<version>.jar`, with
the five `api-*` modules nested inside it, which the loader loads as mods of their own), so a player who
uses the API still installs a single file for all of it.

## 4. A first, empty mod

These four files are a mod that builds, starts and shows itself in the log. It does nothing else: it makes
"the loader recognised my mod and ran its entry point" true, and every later chapter builds on this skeleton.

```
my-mod/
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties                 # copy from any existing mod project
├── gradle/wrapper/…, gradlew, gradlew.bat
└── src/main/
    ├── java/com/example/mymod/MyMod.java
    └── resources/fabric.mod.json
```

`settings.gradle.kts` — **the repositories are the project's own business** (the toolchain installs none):

```kotlin
pluginManagement {
    repositories {
        // The toolchain plugin (cn.enaium.fabricpvz.loom) resolves from the Gradle Plugin Portal.
        gradlePluginPortal()
        // A version the portal does not serve yet (a development build, published to mavenLocal) resolves here.
        mavenLocal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        // The API (cn.enaium.fabricpvz:fabric-api) and the libraries the version manifest names are on Maven Central.
        mavenCentral()
        // Fabric Loader, Mixin and fabric-language-kotlin resolve from Fabric's maven.
        maven {
            name = "Fabric"
            url = uri("https://maven.fabricmc.net/")
        }
    }
}

rootProject.name = "my-mod"
```

`build.gradle.kts` — the plugin, `pvz(...)`, and what this mod itself uses:

```kotlin
plugins {
    id("cn.enaium.fabricpvz.loom") version "1.0.14"
}

dependencies {
    // Which game distribution to build against: the version package, the asset
    // pvz-portable-<version>-online.zip of the GitHub release.
    // The toolchain downloads it once (cached in ~/.gradle/caches/pvz) and unpacks it into build/pvz/dist:
    // the game jar and the libraries the version package's JSON names become the compile/test/runClient class path.
    pvz("cn.enaium.fabricpvz:pvz-portable:1.2.5")

    // When you write tests: JUnit (the toolchain only configures the JUnit Platform convention; the versions are the mod's).
    testImplementation(platform("org.junit:junit-bom:6.1.3"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")

    // Declared only when the sources use the API; this empty mod does not, so it is absent:
    // compileOnly("cn.enaium.fabricpvz:fabric-api:1.2.2")
}

group = "com.example"
version = "1.0.0"
description = "My first PvZ mod"
```

`src/main/resources/fabric.mod.json` — Fabric's own metadata format:

```json
{
  "schemaVersion": 1,
  "id": "my-mod",
  "version": "1.0.0",
  "name": "My Mod",
  "description": "My first PvZ-Portable mod.",
  "authors": [
    "Me"
  ],
  "license": "MIT",
  "environment": "client",
  "entrypoints": {
    "main": [
      "com.example.mymod.MyMod"
    ]
  },
  "depends": {
    "java": ">=25",
    "fabricloader": ">=0.19.0",
    "pvz-portable": "*"
  }
}
```

`src/main/java/com/example/mymod/MyMod.java` — the entry point:

```java
package com.example.mymod;

import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class MyMod implements ModInitializer {

    /** The logger is named by the mod id: that is how the log lines are tagged with your mod. */
    private static final Logger LOGGER = LoggerFactory.getLogger("my-mod");

    @Override
    public void onInitialize() {
        LOGGER.info("My Mod loaded");
    }
}
```

### Building and running

```bash
cd my-mod
./gradlew build          # compile + tests; output: build/libs/my-mod-1.0.0.jar
./gradlew runClient      # start the game (real loader); this mod is discovered on the class path, nothing is copied
```

What `runClient` does: it launches `net.fabricmc.loader.impl.launch.knot.KnotClient` with the working
directory `run/` and a class path of the version package's game jar and the libraries its manifest names,
plus whatever you declare on `pvzRunClasspath` (the API aggregate jar when you use the API,
`fabric-language-kotlin` in a Kotlin mod), **plus this mod's own output directories**
(`build/classes/java/main`, `build/resources/main`, … as one `fabric.classPathGroups` group). So "change
the sources and run again" is enough; nothing has to be built by hand.

### What you should see

Two things in the start-up log prove it really loaded:

```
Loading 2 mods:
	- my-mod 1.0.0
	- pvz-portable 1.2.5
	…
[main/INFO] (my-mod) My Mod loaded
```

- `my-mod 1.0.0` in the mod list: the loader parsed your `fabric.mod.json`.
- Your own log line: the loader instantiated the entry point reflectively (it needs a **no-argument
  constructor**) and called `onInitialize()`.
- If your mod declares the API, the list also shows `fabric-api 1.2.2` with its five `api-* 1.2.2`
  modules underneath.

The entry point runs **before** the game's `main`, and the loader makes no promise about the order of
mod entry points, so this is the place for registration only — do not assume another mod (the API
included) has initialised already.

## 5. Where to go next

- To understand every file of a project and what the toolchain gives you → [Project structure](./structure.md)
- To change the game's behaviour → [Mixin experiments](./mixin.md)
- To add plants, zombies or art → [Content with fabric-api](./content.md)
