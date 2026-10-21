# Project structure

A mod project is small: two build scripts, one `fabric.mod.json` and one entry point class. The toolchain
supplies the game itself; every other dependency is declared by the mod in its own build script. This
chapter walks through `pvz-content-mod/` file by file — the most complete mod of the workspace (three
plants, an art pipeline, an end-to-end test) and the subject of the [walkthrough](./content-mod.md).

## 1. The directory tree

```
pvz-content-mod/
├── settings.gradle.kts                     # repositories: plugin portal / mavenLocal / Maven Central / Fabric maven
├── build.gradle.kts                        # the plugin, pvz(...) and this mod's own dependencies (API, JUnit…)
├── gradle.properties                       # Gradle options (parallel, caching, JDK…)
├── gradle/wrapper/, gradlew, gradlew.bat   # the Gradle 9.8.1 wrapper
├── LICENSE, README.md
├── src/
│   ├── main/
│   │   ├── java/cn/enaium/fabricpvz/contentmod/
│   │   │   ├── ContentMod.java             # the entry point: registers the three plants
│   │   │   └── RedPlantsArt.java           # this mod's art choices: red copies, packet icons, cached frames
│   │   └── resources/fabric.mod.json       # mod metadata
│   └── test/java/cn/enaium/fabricpvz/contentmod/
│       ├── ContentModEndToEndTest.java     # end to end: the real loader, a real main.pak, a report file
│       └── test/…                          # the test's game main and headless board
├── run/                                    # runClient's game directory (not in git)
│   ├── mods/                               # an installation's mods/: for *other* mods
│   └── userdata/                           # save data
└── build/                                  # build outputs (not in git)
    ├── libs/pvz-content-mod-1.1.0.jar      # the installable mod jar
    └── pvz/dist/                           # the unpacked game version package (game jar + JSON manifest = class path)
```

Both languages are available: Java under `src/main/java/`, Kotlin under `src/main/kotlin/` (a Kotlin mod
applies `kotlin("jvm")` itself, see section 6, at `jvmTarget` 25). **Mixin classes are always Java**, for
the reason in the last section of [Mixin experiments](./mixin.md).

## 2. `settings.gradle.kts`: repositories only

```kotlin
pluginManagement {
    repositories {
        // The toolchain plugin (cn.enaium.fabricpvz.loom) resolves from the Gradle Plugin Portal.
        gradlePluginPortal()
        // An optional fallback, deliberately *after* the portal: a version the portal does not serve
        // yet (a development build published to mavenLocal) is resolved from here.
        mavenLocal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        // The API (cn.enaium.fabricpvz:fabric-api) and the libraries the version manifest names are on Maven Central.
        mavenCentral()
        // Fabric Loader, Sponge Mixin and fabric-language-kotlin resolve from Fabric's maven.
        maven {
            name = "Fabric"
            url = uri("https://maven.fabricmc.net/")
        }
    }
}

rootProject.name = "pvz-content-mod"
```

Points worth remembering:

- **The repositories are the project's own business**: the plugin installs no repository set (fabric-loom
  does, which is one reason it fights with a project's `settings.gradle.kts`).
- `gradlePluginPortal()` is where the plugin itself comes from, so **nothing has to be published locally first**.
- `mavenLocal()` after the portal is only a fallback for "a version the portal does not have yet".
- A Kotlin mod also resolves `fabric-language-kotlin` from Fabric's maven; `mavenCentral()` covers the API
  and the libraries the version manifest names.

## 3. `build.gradle.kts`: the plugin, `pvz(...)` and the mod's own dependencies

```kotlin
import org.gradle.api.tasks.bundling.Jar

plugins {
    // The toolchain: applying it supplies the game — the game jar of the version package and the
    // libraries its JSON manifest names (the real Fabric Loader, Sponge Mixin, ASM, SLF4J/Log4j,
    // LWJGL with this machine's natives) on the compile, test and launch class paths — plus runClient,
    // the end-to-end test conventions and the mod jar's publication. Nothing else.
    id("cn.enaium.fabricpvz.loom") version "1.0.14"
}

val fabricApi = "cn.enaium.fabricpvz:fabric-api:1.2.2"

dependencies {
    // Which game distribution this mod is built against: the version package, the
    // pvz-portable-<version>-online.zip asset of the GitHub release. The toolchain downloads it once
    // (cached in ~/.gradle/caches/pvz with its SHA-256) and unpacks it into build/pvz/dist: the game jar
    // goes on the class paths as a file, every library the manifest names as a Maven coordinate.
    // While working on the game itself, point it at that build:
    // pvz(files("../PvZ-Portable/build/distributions"))
    pvz("cn.enaium.fabricpvz:pvz-portable:1.2.5")

    // This mod's tests (the end-to-end harness included): JUnit is the mod's own declaration.
    testImplementation(platform("org.junit:junit-bom:6.1.3"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")

    // The API this mod uses: the aggregate jar, whose nested jars are the five feature modules.
    // Compilation carries the modules through its POM; at runtime the aggregate alone is used, because
    // Fabric Loader reads the nested jars out of it. `testCompileOnly` because a test source set does
    // not inherit `compileOnly`.
    for (configuration in listOf("compileOnly", "testCompileOnly")) {
        add(configuration, fabricApi)
    }
    for (configuration in listOf("testImplementation", "pvzRunClasspath")) {
        (add(configuration, fabricApi) as ModuleDependency).isTransitive = false
    }
}

group = "cn.enaium.fabricpvz"
version = "1.1.0"
description = "Content mod for the PvZ port: red peashooter, repeater and gatling pea plants"

tasks.jar {
    manifest {
        attributes(
            "Implementation-Title" to "PvZ Content Mod",
            "Implementation-Version" to project.version,
            "Fabric-Mod-Id" to "pvz-content-mod",
        )
    }
}
```

- The plugin version is **required**: it comes from the plugin portal, an external repository, and Gradle
  requires an explicit version for those.
- `pvz(...)` is optional (the toolchain tracks 1.2.5), but writing it is what says which game this mod was
  built against.
- Beyond the game itself (the game jar and the version package's Loader / Mixin / ASM / logging stack /
  LWJGL), everything is the mod's own declaration: the Kotlin Gradle plugin and stdlib, JUnit,
  `fabric-language-kotlin`, the API. **The API is optional**: declare it only where the sources use it,
  and list the module ids in `fabric.mod.json`'s `depends`.
- A mod that is not written in Kotlin (such as `pvz-content-mod`) has no Kotlin declarations; the Kotlin
  shape is in section 6.

`gradle.properties` holds the project's own Gradle options (copy it from any existing mod project):

```properties
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.jvmargs=-Xmx4g -XX:+UseParallelGC -Duser.language=en -Duser.country=US
org.gradle.java.installations.auto-download=false
# Kotlin mods only: turns off the Kotlin plugin's default implementation(kotlin-stdlib)
kotlin.stdlib.default.dependency=false
```

## 4. `src/main/resources/fabric.mod.json`: field by field

```json
{
  "schemaVersion": 1,
  "id": "pvz-content-mod",
  "version": "1.1.0",
  "name": "PvZ Content Mod",
  "description": "Three red plants: a Red Peashooter (175 sun …), a Red Repeater (225 sun …) and a Red Gatling Pea (275 sun …) …",
  "authors": [
    "PvZ Fabric"
  ],
  "license": "MIT",
  "environment": "*",
  "entrypoints": {
    "main": [
      "cn.enaium.fabricpvz.contentmod.ContentMod"
    ]
  },
  "depends": {
    "java": ">=25",
    "fabricloader": ">=0.19.0",
    "pvz-portable": "*",
    "api-base": ">=1.0.0",
    "api-events": ">=1.0.0",
    "api-plant": ">=1.0.0",
    "api-resource": ">=1.0.0",
    "api-zombie": ">=1.0.0"
  }
}
```

| Field | Meaning |
| --- | --- |
| `schemaVersion` | The metadata format version, always `1` (Fabric's format) |
| `id` | The mod id: the loader's unique key, and the name of your logger and of `ModQuery.isModLoaded`. **Use underscores or dashes, no spaces** |
| `version` | The mod version. Keep it in step with the build script's `version`; it is what players' dependency constraints see |
| `name` / `description` / `authors` / `license` | Display metadata; `description` shows up in the loader's mod list and in error messages |
| `environment` | A desktop game only has `client` (`*` is accepted too); there is no dedicated server |
| `entrypoints.main` | Entry point classes: they must implement Fabric's `net.fabricmc.api.ModInitializer`, and the loader instantiates them reflectively through a **no-argument constructor** |
| `mixins` | Mixin config file names (relative to the jar root). **Delete the whole block if you use no mixin**; see [Mixin experiments](./mixin.md) |
| `depends` | Hard dependencies. `java` / `fabricloader` are built in; `pvz-portable` is the game itself (`"*"` means "version independent", so a game update needs no change here); `api-*` / `fabric-api` are the API modules you use |

Every id in `depends` is a **real mod id**: `pvz-portable` (the game, reported by the game provider as a
built-in mod), `api-base` / `api-events` / `api-plant` / `api-resource` / `api-zombie` (the API's five
modules, loaded as mods of their own from inside the aggregate jar), `fabric-api` (the aggregate id;
declaring it means "the whole API is here"), `fabricloader`. Version ranges (`>=`, `~`, `*`),
`recommends` / `breaks` / `conflicts`, `jars` and custom entry point keys are all Fabric Loader behaviour.

## 5. `run/`: runClient's game directory

`runClient` starts the game with the project's `run/` as the working directory and passes
`-Dpvz.gameDir=run`, so:

```
run/
├── mods/         # an installation's mods/: put *other* mod jars here (e.g. another mod you develop against)
├── userdata/     # save data and settings
├── .fabric/      # the loader's own cache
└── (main.pak, properties/)   # put retail assets here when you need them
```

**`runClient` writes nothing into `run/mods/`**: this mod's output directories are on the class path and
the loader discovers the mod there (`-Dfabric.development=true`), together with whatever you declare on
`pvzRunClasspath` (the API aggregate jar, the language module). `run/mods/` keeps an installation's
meaning — the directory a person drops a jar into.

One pitfall worth knowing up front: **when the same mod id is on the class path and in `run/mods/`, the
loader does not complain** — it silently picks one. On fabric-loader 0.19.5 it picks the jar in
`run/mods/`, so "a run reflects the sources" stops being true. Delete your own jar out of `run/mods/` once
if an older toolchain (1.0.0's `pvzModsJar`) left one there.

## 6. What the toolchain gives you

The contract of `cn.enaium.fabricpvz.loom` is narrow: **it supplies the game itself** (the game jar of the
version package and the libraries the JSON manifest next to it names), plus the build wiring below.
Everything else is declared by the mod, like in any ordinary Gradle project.

| The toolchain supplies | Contents |
| --- | --- |
| `compileOnly` | The game jar of the unpacked version package (`build/pvz/dist/<version>/<version>.jar`, a file: no repository holds it), and every library the manifest next to it names as a Maven coordinate (the real Fabric Loader, Sponge Mixin, ASM, SLF4J/Log4j, LWJGL; natives are runtime-only) |
| `testImplementation` / `testRuntimeOnly` | The same jars, so an end-to-end test starts the real loader in its own JVM; the natives go on `testRuntimeOnly` |
| `pvzRunClasspath` | What `runClient` launches *besides this mod*: the version package's jars come from the toolchain, and the mod adds its API, `fabric-language-kotlin`, its own libraries |
| `include` | Other mods to carry inside your own jar (Fabric Loom's jar-in-jar, below) |
| Tasks | `pvzDist` (obtains and unpacks the version package into `build/pvz/dist`), `runClient` |
| Conventions | Java 25 toolchain and `--release 25`, UTF-8, jars with **no bundled dependency**, JUnit Platform, the end-to-end test's `pvz.test.modJar` / `pvz.test.forkClasspath` system properties, `-XstartOnFirstThread` and headless SDL on macOS, the mod jar's `mavenLocal` publication |

**What the mod declares itself** (the toolchain neither supplies it nor picks a version for it):

| Dependency | Shape |
| --- | --- |
| Kotlin | `kotlin("jvm") version "2.4.21"`, `kotlin-stdlib` on `compileOnly` / `testImplementation`, and `kotlin.stdlib.default.dependency=false` in `gradle.properties` |
| JUnit | `testImplementation(platform("org.junit:junit-bom:6.1.3"))` + `junit-jupiter`, and `junit-platform-launcher` on `testRuntimeOnly` |
| `fabric-language-kotlin` | A Kotlin mod declares it on `testRuntimeOnly` and `pvzRunClasspath` (`isTransitive = false`); the stdlib it carries is the runtime |
| API | Only where the sources use it: the aggregate jar on `compileOnly` / `testCompileOnly`, and on `testImplementation` / `pvzRunClasspath` with `isTransitive = false` |

### The version package *is* the launch class path

This is the one semantic to remember about this toolchain: `pvz(...)` points at **a version package, not a
list of coordinates**.

- A version package is a game jar plus the JSON manifest next to it: the game jar enters the class path as
  a file, and the libraries the manifest names (Loader, Mixin, ASM, the logging stack, LWJGL with every
  platform's natives) resolve as Maven coordinates. They are the **compile class path**, the **test class
  path** and `runClient`'s **launch class path** at once. "Compile against what runs" is therefore true by
  construction, not by keeping two version lists in step.
- An older, application-style distribution (a `lib/` of jars, what `distZip` writes) is read as the class
  path it is, so a vintage without a manifest still builds.
- A distribution ships **no mods**. What a player installs is loaded from the game directory's `mods/`
  (a development run is the exception: mods on the class path are discovered too).
- Because the version package is a public interface, **changing the game's dependencies changes what every
  mod links and runs against**.

### Carrying your own dependencies inside your jar: `include`

```kotlin
dependencies {
    include("com.example:some-library:1.0")   // a coordinate, a project(...) or files(...)
}
```

The toolchain copies those jars into `META-INF/jars/` of your jar **as they are** and writes
`"jars": [ { "file": "META-INF/jars/<name>.jar" } ]` into the packaged `fabric.mod.json`. Nothing is
renamed or merged: a nested jar keeps its own `fabric.mod.json`, id, version and entry points, and the
loader loads it as a **mod of its own**. The workspace's `fabric-api` aggregate ships its five `api-*`
modules exactly that way.

Two failure modes are worth knowing: two `include`d files sharing a name fail the build (a nested jar is
addressed by its name inside the mod jar), and a mod jar that carries nested jars but has no
`fabric.mod.json` to list them in fails too (the loader would never read them).

### Kotlin mods: declare it yourself, then two Loader rules

The toolchain does **not** apply the Kotlin plugin and does not pick a stdlib. A Kotlin mod declares them
itself (from `speed-mod` / `ladder-plant-mod`):

```kotlin
plugins {
    id("cn.enaium.fabricpvz.loom") version "1.0.14"
    kotlin("jvm") version "2.4.21"
}

val kotlinStdlib = "org.jetbrains.kotlin:kotlin-stdlib:2.4.21"
val languageKotlin = "net.fabricmc:fabric-language-kotlin:1.14.2+kotlin.2.4.21"

dependencies {
    // Compile against the stdlib, bundle none of it; the runtime copy comes from fabric-language-kotlin.
    compileOnly(kotlinStdlib)
    testImplementation(kotlinStdlib)

    // The language module this Kotlin mod runs on.
    testRuntimeOnly(languageKotlin) { isTransitive = false }
    (add("pvzRunClasspath", languageKotlin) as ModuleDependency).isTransitive = false
}
```

`kotlin.stdlib.default.dependency=false` in `gradle.properties` turns off the Kotlin plugin's default
`implementation(kotlin-stdlib)`, which would otherwise reach the POM and your jar. Two rules come from
Fabric Loader itself:

1. **Entry points are Kotlin `class`es, not `object`s**: the loader instantiates them through their
   no-argument constructor and an `object` only has a private one (using it means declaring the `"kotlin"`
   language adapter that `fabric-language-kotlin` provides).
2. **The stdlib is not bundled**: the runtime copy comes from `fabric-language-kotlin` (the stdlib nested
   inside its jar). A Kotlin mod therefore declares `"fabric-language-kotlin": ">=1.14.2"` in its
   `fabric.mod.json`, and an installation keeps that mod's jar in `mods/` like any other.

Mixin classes stay Java: Mixin's annotations are read by Mixin's own processor and `@Shadow` and friends
rely on the Java bytecode rule "a member reference inside the mixin class is rewritten to the target
class"; Kotlin's generated property accessors and inline functions make that rule hard to reason about.

## 7. A self-check list

| To confirm | How |
| --- | --- |
| The mod was loaded | Your id and version are in the `Loading N mods:` list |
| The entry point ran | The line you log in `onInitialize()` appeared |
| Dependencies resolved | The nested modules show up as `|--` lines under their parent (e.g. `fabric-api`'s five `api-*`) |
| The API is there | `cn.enaium.fabricpvz.api.mod.ModQuery.isModLoaded("fabric-api")` from your code |
| The build script is right | After `./gradlew pvzDist`, `build/pvz/dist/` holds the version package (the game jar and its manifest), and `./gradlew dependencies --configuration pvzRunClasspath` lists the Maven libraries the manifest named |
