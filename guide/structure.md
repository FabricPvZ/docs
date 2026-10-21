# 项目结构

一个模组工程的骨架非常小：两个构建脚本、一个 `fabric.mod.json`、一个入口点类。工具链只负责游戏本身，
其余依赖都由模组在自己的构建脚本里声明。
这一章以 `pvz-content-mod/` 为例逐个文件讲——它是示例模组里最完整的工程（三株植物、
艺术管线、端到端测试），也是[实例精读](./content-mod.md)的主角。

## 1. 目录树

```
pvz-content-mod/
├── settings.gradle.kts                     # 仓库来源：插件门户 / mavenLocal / Maven Central / Fabric maven
├── build.gradle.kts                        # 插件、pvz(...) 与本模组自己的依赖（API、JUnit…）
├── gradle.properties                       # Gradle 选项（并行、缓存、JDK 版本…）
├── gradle/wrapper/, gradlew, gradlew.bat   # Gradle 9.8.1 wrapper
├── LICENSE, README.md
├── src/
│   ├── main/
│   │   ├── java/cn/enaium/fabricpvz/contentmod/
│   │   │   ├── ContentMod.java             # 入口点：注册三株植物
│   │   │   └── RedPlantsArt.java           # 这个模组的"艺术选择"：红图、种子包图标、缓存帧
│   │   └── resources/fabric.mod.json       # 模组元数据
│   └── test/java/cn/enaium/fabricpvz/contentmod/
│       ├── ContentModEndToEndTest.java     # 端到端测试：真 Loader + 真 main.pak + 报告文件
│       └── test/…                          # 测试用的游戏主类与无头棋盘
├── run/                                    # runClient 的游戏目录（不在 git 里）
│   ├── mods/                               # 安装形态的 mods/：放"别的"模组用
│   └── userdata/                           # 存档
└── build/                                  # 构建产物（不在 git 里）
    ├── libs/pvz-content-mod-1.1.0.jar      # 可安装的模组 jar
    └── pvz/dist/                           # 工具链解包出来的游戏版本包（游戏 jar + JSON 清单就是类路径）
```

两种语言都能写：Java 放 `src/main/java/`，Kotlin 放 `src/main/kotlin/`（Kotlin 模组自己应用
`kotlin("jvm")` 插件，见第 6 节，`jvmTarget` 25）。**Mixin 类一律用 Java 写**，原因见 [实验 Mixin](./mixin.md) 最后一节。

## 2. `settings.gradle.kts`：只声明仓库

```kotlin
pluginManagement {
    repositories {
        // 工具链插件（cn.enaium.fabricpvz.loom）从 Gradle 插件门户解析。
        gradlePluginPortal()
        // 可选兜底，故意放在门户**之后**：门户还没有的版本（自己 publishToMavenLocal 打的开发版）走这里。
        mavenLocal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        // API（cn.enaium.fabricpvz:fabric-api）与版本清单里的库在 Maven Central。
        mavenCentral()
        // Fabric Loader、Sponge Mixin 与 fabric-language-kotlin 只在 Fabric 的 maven 上。
        maven {
            name = "Fabric"
            url = uri("https://maven.fabricmc.net/")
        }
    }
}

rootProject.name = "pvz-content-mod"
```

要点：

- **仓库是工程自己的事**：插件不会替你装仓库集（fabric-loom 会，那是它与你 `settings.gradle.kts` 打架的原因之一）。
- `gradlePluginPortal()` 是插件本体的来源，所以**什么都不用先发布到本地**。
- `mavenLocal()` 在门户之后只是"门户还没有的版本"的兜底。
- 用到 Kotlin 时，`fabric-language-kotlin` 也从 Fabric 的 maven 解析；`mavenCentral()` 覆盖 API 与版本清单里的库。

## 3. `build.gradle.kts`：插件 + `pvz(...)` + 模组自己的依赖

```kotlin
import org.gradle.api.tasks.bundling.Jar

plugins {
    // 工具链：应用它就得到游戏——版本包里的游戏 jar 与它旁边清单列出的库（真 Fabric Loader、
    // Sponge Mixin、ASM、SLF4J/Log4j、LWJGL 与本机 natives）在编译/测试/启动类路径上——以及
    // runClient、端到端测试约定与模组 jar 的发布。别的一概不提供。
    id("cn.enaium.fabricpvz.loom") version "1.0.14"
}

val fabricApi = "cn.enaium.fabricpvz:fabric-api:1.2.2"

dependencies {
    // 对着哪个游戏发行版构建：GitHub Release 的 pvz-portable-<version>-online.zip。
    // 工具链下载一次（缓存进 ~/.gradle/caches/pvz 并记录 SHA-256），解包到 build/pvz/dist：
    // 游戏本体 jar 以 files 方式进类路径，清单里的库按 Maven 坐标解析。
    // 改游戏本体的时候可以指向本地那次构建：pvz(files("../PvZ-Portable/build/distributions"))
    pvz("cn.enaium.fabricpvz:pvz-portable:1.2.5")

    // 这个模组的测试（含端到端测试）：JUnit 是模组自己的声明。
    testImplementation(platform("org.junit:junit-bom:6.1.3"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")

    // 源码用到的 API：聚合 jar，五个模块嵌套在它里面。编译靠 POM 带出模块的坐标；
    // 运行只用聚合 jar（Loader 从它内部读嵌套 jar）。`testCompileOnly` 因为测试源集
    // 不继承 `compileOnly`。
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

- 插件版本**必须写**：它来自插件门户这个外部仓库，Gradle 要求外部插件写明版本。
- `pvz(...)` 不写也能构建（工具链钉在 1.2.5），但写出来才说明"这个模组对着哪一版游戏"。
- 除了游戏本身（游戏 jar 与版本包清单里的 Loader / Mixin / ASM / 日志栈 / LWJGL），其余都是模组自己的声明：
  Kotlin Gradle 插件与 stdlib、JUnit、`fabric-language-kotlin`、API。**API 是可选的**：源码用到才声明，
  并在 `fabric.mod.json` 的 `depends` 里写上对应模块 id。
- 不用 Kotlin 的模组（例如 `pvz-content-mod`）没有 Kotlin 相关声明；Kotlin 的写法见第 6 节。

`gradle.properties` 是工程自己的 Gradle 选项（照抄任一现有模组工程即可）：

```properties
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.jvmargs=-Xmx4g -XX:+UseParallelGC -Duser.language=en -Duser.country=US
org.gradle.java.installations.auto-download=false
# 只有 Kotlin 模组需要：关掉 Kotlin 插件默认的 implementation(kotlin-stdlib)
kotlin.stdlib.default.dependency=false
```

## 4. `src/main/resources/fabric.mod.json`：逐个字段

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

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 元数据格式版本，固定 `1`（Fabric Loader 的格式） |
| `id` | 模组 id：Loader 的唯一标识，也是日志器名字与 `ModQuery.isModLoaded` 的键。**用下划线或短横线，别带空格** |
| `version` | 模组版本。与构建脚本的 `version` 保持一致；玩家看到的依赖约束就是它 |
| `name` / `description` / `authors` / `license` | 展示用元数据；`description` 会出现在 Loader 的模组列表与错误信息里 |
| `environment` | 桌面游戏只有 `client`（写 `*` 也可以），没有 dedicated server |
| `entrypoints.main` | 入口点类列表：必须实现 Fabric 的 `net.fabricmc.api.ModInitializer`，Loader 用**无参构造**反射实例化 |
| `mixins` | Mixin 配置文件名列表（相对 jar 根）。**不用 Mixin 就把整段删掉**；配置文件的写法见 [实验 Mixin](./mixin.md) |
| `depends` | 硬依赖。`java` / `fabricloader` 是内置的；`pvz-portable` 是游戏本体（`"*"` 表示版本无关，游戏升级不需要改模组）；`api-*` / `fabric-api` 是你用到的 API 模块 |

依赖里的 id 都是**真实存在的模组 id**：`pvz-portable`（游戏，由 game provider 以 built-in mod 身份报告）、
`api-base` / `api-events` / `api-plant` / `api-resource` / `api-zombie`（API 的五个模块，随聚合 jar 一起被
Loader 加载成独立模组）、`fabric-api`（聚合器 id，写它等于声明"整份 API 都在"）、`fabricloader`。
版本范围语法（`>=`、`~`、`*`）、`recommends` / `breaks` / `conflicts`、`jars`、自定义入口点 key 全是
Fabric Loader 自己的行为。

## 5. `run/`：`runClient` 的游戏目录

`runClient` 启动游戏时工作目录是工程里的 `run/`，并传 `-Dpvz.gameDir=run`，所以：

```
run/
├── mods/         # 安装形态的 mods/：往里放"别的"模组 jar（例如你要联调的另一个模组）
├── userdata/     # 存档、设置
├── .fabric/      # Loader 自己的缓存
└── (main.pak, properties/)   # 需要零售资源时自己放
```

**`runClient` 不往 `run/mods/` 写东西**：本模组的输出目录直接在类路径上，Loader 靠
`-Dfabric.development=true` 从类路径发现它（以及你声明在 `pvzRunClasspath` 上的 API 聚合 jar、
语言模块）。`run/mods/` 保持安装形态的语义——"玩家往这里丢 jar"。

有一个坑值得先知道：**同一个模组 id 同时出现在类路径和 `run/mods/` 里时，Loader 不报错**，
它只是静默地选一个。在 fabric-loader 0.19.5 上的行为是选 `run/mods/` 里那个 jar，于是"运行反映的是源码"
这句话就不成立了。旧版工具链（1.0.0 的 `pvzModsJar`）留在 `run/mods/` 里的自己那份 jar 请删掉一次。

## 6. 工具链给了你什么

`cn.enaium.fabricpvz.loom` 的契约很窄：**它只给游戏本身**（版本包里的游戏 jar，以及它旁边 JSON 清单列出的库），
再加上下面这些构建接线。其余一切依赖都由模组自己声明，和任何普通 Gradle 工程一样。

| 工具链提供 | 内容 |
| --- | --- |
| `compileOnly` | 解包后版本包里的游戏 jar（`build/pvz/dist/<版本>/<版本>.jar`，以 files 方式——没有仓库托管它），与它旁边清单里逐条列出的库（真 Fabric Loader、Sponge Mixin、ASM、SLF4J/Log4j、LWJGL，全部按 Maven 坐标解析；natives 只在运行类路径上） |
| `testImplementation` / `testRuntimeOnly` | 同一批 jar 供端到端测试在自己的 JVM 里启动真 Loader，natives 进 `testRuntimeOnly` |
| `pvzRunClasspath` | `runClient` 启动时"除本模组之外"的类路径：版本包的 jar 由工具链放进来，模组自己再往里加 API、`fabric-language-kotlin` 等 |
| `include` | 你要装进自己 jar 里的别的模组（Fabric Loom 的 jar-in-jar，见下） |
| 任务 | `pvzDist`（取得并解包版本包到 `build/pvz/dist`）、`runClient` |
| 约定 | Java 25 工具链与 `--release 25`、UTF-8、jar **不打包任何依赖**、JUnit Platform、端到端测试的 `pvz.test.modJar` / `pvz.test.forkClasspath` 系统属性、macOS 下的 `-XstartOnFirstThread` 与无头 SDL、模组 jar 的 `mavenLocal` 发布 |

**模组自己声明**的东西（工具链不提供，也不替你选版本）：

| 依赖 | 形态 |
| --- | --- |
| Kotlin | `kotlin("jvm") version "2.4.21"`，`compileOnly` / `testImplementation` 上加 `kotlin-stdlib`，并在 `gradle.properties` 里写 `kotlin.stdlib.default.dependency=false` |
| JUnit | `testImplementation(platform("org.junit:junit-bom:6.1.3"))` + `junit-jupiter`，`testRuntimeOnly` 上加 `junit-platform-launcher` |
| `fabric-language-kotlin` | Kotlin 模组在 `testRuntimeOnly` 与 `pvzRunClasspath` 上声明（`isTransitive = false`），运行时 stdlib 由它提供 |
| API | 只在源码用到时声明：`compileOnly` / `testCompileOnly` 上放聚合 jar，`testImplementation` / `pvzRunClasspath` 上 `isTransitive = false` |

### 版本包就是启动类路径

这是这套工具链最需要记住的一条语义：`pvz(...)` 指向的**是一个版本包，不是一串坐标**。

- 版本包由游戏 jar 与它旁边的 JSON 清单组成：游戏 jar 以文件方式进入类路径，清单列出的库（Loader、Mixin、
  ASM、日志栈、LWJGL 与各平台 natives）按 Maven 坐标解析。它们同时是**编译类路径**、**测试的类路径**、
  **`runClient` 的启动类路径**。所以"编译时对着的类"和"运行时加载的类"是同一批 jar，这是构造上成立的，
  而不是靠两份版本清单对齐。
- 旧式的应用发行包（`lib/` 里一堆 jar，`distZip` 写出的那种）同样按它的类路径来读，因此老版本也能构建。
- 版本包里**没有任何 mod**。玩家装的模组只从游戏目录的 `mods/` 加载（开发运行例外：类路径上的模组也会被发现）。
- 因为版本包是公开接口，**改游戏本体的依赖就是改所有模组的编译与运行环境**。

### 把自己的依赖装进 jar：`include`

```kotlin
dependencies {
    include("com.example:some-library:1.0")   // 坐标、project(...) 或 files(...) 都行
}
```

工具链把这些 jar **原样**放进你的 jar 的 `META-INF/jars/`，并在打包后的 `fabric.mod.json` 里写上
`"jars": [ { "file": "META-INF/jars/<文件名>.jar" } ]`。十个字节都不改：嵌套 jar 带着自己的
`fabric.mod.json`、id、版本与入口点，被 Loader 当作**独立的模组**加载。`fabric-api` 聚合 jar
正是这样把五个 `api-*` 模块装在自己里面。

两个失败模式值得知道：两个 `include` 的文件重名会在构建时失败（嵌套 jar 在模组 jar 里靠名字寻址）；
带了嵌套 jar 却没有 `fabric.mod.json` 可写 `jars` 数组也会失败（Loader 永远读不到它们）。

### Kotlin 模组：自己声明，两条 Loader 规则

工具链**不**应用 Kotlin 插件，也不替你选 stdlib。Kotlin 模组自己声明（取自 `speed-mod` / `ladder-plant-mod`）：

```kotlin
plugins {
    id("cn.enaium.fabricpvz.loom") version "1.0.14"
    kotlin("jvm") version "2.4.21"
}

val kotlinStdlib = "org.jetbrains.kotlin:kotlin-stdlib:2.4.21"
val languageKotlin = "net.fabricmc:fabric-language-kotlin:1.14.2+kotlin.2.4.21"

dependencies {
    // 编译对着 stdlib，但不打包它；运行时的那份来自 fabric-language-kotlin。
    compileOnly(kotlinStdlib)
    testImplementation(kotlinStdlib)

    // 这个 Kotlin 模组运行时依赖的语言模块。
    testRuntimeOnly(languageKotlin) { isTransitive = false }
    (add("pvzRunClasspath", languageKotlin) as ModuleDependency).isTransitive = false
}
```

`gradle.properties` 里的 `kotlin.stdlib.default.dependency=false` 关掉 Kotlin 插件默认的
`implementation(kotlin-stdlib)`，否则它会进 POM，也会进你的 jar。此外还有两条来自 Fabric Loader 自身的规则：

1. **入口点必须是 Kotlin `class`，不能是 `object`**：Loader 用无参构造反射实例化，`object` 只有私有构造
   （用它就得声明 `fabric-language-kotlin` 提供的 `"kotlin"` 语言适配器）。
2. **stdlib 不打包**：运行时那一份来自 `fabric-language-kotlin`（它内部的嵌套 stdlib）。所以 Kotlin 模组要在
   `fabric.mod.json` 里声明 `"fabric-language-kotlin": ">=1.14.2"`，安装时也要把这个 mod 放进 `mods/`。

Mixin 仍然用 Java 写：Mixin 的注解是给 Mixin 自己的处理器读的，`@Shadow` 之类依赖"把 mixin 类里的成员引用
改写到目标类"这套 Java 字节码规则；Kotlin 编译出的属性访问器、内联函数会让这套规则变得难以推理。

## 7. 自查清单

| 想确认 | 怎么做 |
| --- | --- |
| 模组被加载了吗 | 启动日志的 `Loading N mods:` 列表里有你的 id 与版本 |
| 入口点跑了吗 | 自己在 `onInitialize()` 里的那行日志出现了 |
| 依赖解析对了吗 | 日志里模组下面的 `|--` 缩进行列出嵌套模块（例如 `fabric-api` 下的五个 `api-*`） |
| API 在不在 | 代码里用 `cn.enaium.fabricpvz.api.mod.ModQuery.isModLoaded("fabric-api")` 查询 |
| 构建脚本对不对 | `./gradlew pvzDist` 之后看 `build/pvz/dist/` 里有没有版本包（游戏 jar 与它旁边的清单），再用 `./gradlew dependencies --configuration pvzRunClasspath` 看清单里那些库是否都按 Maven 坐标解析了出来 |
