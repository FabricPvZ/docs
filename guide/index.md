# 开始：把游戏和第一个模组跑起来

这一章只做三件事：把前置条件讲清楚、告诉你游戏本体怎么跑、`mods/` 目录在哪，
然后给你一个**最小但完整**的空模组，它能构建、能启动、能在日志里看到自己。

## 1. 前置条件

| 需要 | 版本 / 说明 |
| --- | --- |
| JDK | **25**。工具链把每个工程钉在 Java 25（`--release 25`），游戏的 class 文件也是 25，所以 Mixin 配置里的 `compatibilityLevel` 必须是 `JAVA_25` |
| Gradle | **不用装**。每个模组工程自带 Gradle 9.8.1 的 wrapper（`gradlew` / `gradlew.bat` + `gradle/wrapper/`），从模板复制即可 |
| 平台 | Windows / Linux / macOS，x64 与 arm64 都有原生库；发行包的 `lib/` 一次带全平台 |
| 游戏资源 | 仓库里**没有**零售资源。要跑真正的关卡，需要你自己安装的《植物大战僵尸》GOTY 的 `main.pak` 与 `properties/` |
| 网络 | 首次构建要下载工具链插件（Gradle 插件门户）、游戏发行包（GitHub Release）与 Maven 依赖 |

工程自带的 `gradle.properties` 里有一行 `org.gradle.java.installations.auto-download=false`：
Gradle **不会**替你下载 JDK，请先把 JDK 25 装好（`java -version` 应报 25）。

## 2. 跑一次游戏本体

两种方式，按你要做什么选：

**从源码跑**（改游戏本身或调试时用）：

```bash
cd PvZ-Portable
./gradlew run                 # 真 Fabric Loader + 真 Mixin；工作目录是 run/
```

- 工作目录被设成工程里的 `run/`（`-Dpvz.gameDir=run`），`run/mods/` 就是这次运行的
  `mods/` 目录，`run/userdata/` 是存档目录。
- 这个任务**不往 `run/mods/` 里拷任何东西**：里面有什么就加载什么，和玩家的安装形态一致。
- 需要零售资源时，先把 `main.pak` 与 `properties/` 放进游戏目录再启动：

```bash
./gradlew syncDevResources run -PpvzResDir="/path/to/PvZ/resources"
```

**用发行包跑**（模组作者和玩家用的形态）：

```bash
cd PvZ-Portable
./gradlew distZip             # 产物：build/distributions/pvz-portable-<version>-offline.zip
```

解包之后就是一份完整安装：

```
pvz-portable-<version>/
├── bin/pvz-portable          # 启动脚本（Windows 是 .bat）；macOS 上自动加 -XstartOnFirstThread
├── bin/pvz-portable.bat
├── lib/                      # 游戏 jar + Loader/Mixin/ASM/日志栈 + LWJGL 与各平台原生库
├── lib/native/…              # libopenmpt 等运行时原生库
└── mods/                     # 自己建：玩家装的东西放这里（发行包本身不带任何 mod）
```

- 启动脚本自己带 `-Dpvz.gameDir=$APP_HOME`（`$APP_HOME` 就是解包根目录），所以**游戏目录就是解包根目录**，
  `mods/` 与 `bin/` 平级。
- `-Dpvz.gameDir` 的解析顺序是：`-Dpvz.gameDir` → `-gamedir <path>` 命令行参数 → 当前工作目录。
  换句话说，用 `PVZ_PORTABLE_OPTS` / `JAVA_OPTS` 覆盖它会改变"哪一个是游戏目录"。
- 零售资源依旧要自己放：放在游戏目录下（游戏会按自己的顺序找 `main.pak` 与 `properties/`）。

## 3. `mods/` 目录在哪

一句话：**游戏目录下的 `mods/`**。谁是游戏目录，取决于你怎么启动：

| 怎么启动 | 游戏目录 | 模组从哪加载 |
| --- | --- | --- |
| 发行包（`bin/pvz-portable`） | 解包根目录 | `<解包根>/mods/` |
| `PvZ-Portable` 的 `./gradlew run` | `PvZ-Portable/run/` | `run/mods/` |
| **你自己模组的** `./gradlew runClient` | 你的工程里的 `run/` | **类路径**：你的模组自己的输出就在类路径上（`-Dfabric.development=true`），`run/mods/` 只是"再放一个别的模组"的地方 |

安装形态（给玩家）就是：把 jar 放进 `mods/`。

```
<game directory>/
├── mods/
│   ├── my-mod-1.0.0.jar        # 你的模组
│   └── fabric-api-1.2.2.jar    # 可选：源码用到 API 时才需要（API 只有这一个 jar）
└── userdata/                   # 存档
```

模组之间没有隐式依赖：你的 `fabric.mod.json` 里写清依赖谁，玩家就得把谁都放进 `mods/`。
API 本身是**一个** jar（`fabric-api-<version>.jar`，五个 `api-*` 模块嵌套在它里面，Loader 会把
它们加载成各自独立的模组），所以用了 API 的玩家也只需要一个文件。

## 4. 第一个空模组

下面四份文件就是一个能构建、能启动、能在日志里看到自己的模组。它不做任何事——只是把
"模组被 Loader 认出来了、入口点跑了"这件事做实，后面每一章都在这套骨架上加东西。

```
my-mod/
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties                 # 从任意现有模组工程复制
├── gradle/wrapper/…, gradlew, gradlew.bat
└── src/main/
    ├── java/com/example/mymod/MyMod.java
    └── resources/fabric.mod.json
```

`settings.gradle.kts`——**仓库要自己声明**（工具链不会替你装仓库集）：

```kotlin
pluginManagement {
    repositories {
        // 工具链插件（cn.enaium.fabricpvz.loom）从 Gradle 插件门户解析。
        gradlePluginPortal()
        // 门户还没有的版本（自己 `cd ../loom && ./gradlew publishToMavenLocal` 打的开发版）走这里。
        mavenLocal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        // API（cn.enaium.fabricpvz:fabric-api）与版本清单里的库在 Maven Central。
        mavenCentral()
        // Fabric Loader、Mixin 与 fabric-language-kotlin 只在 Fabric 的 maven 上。
        maven {
            name = "Fabric"
            url = uri("https://maven.fabricmc.net/")
        }
    }
}

rootProject.name = "my-mod"
```

`build.gradle.kts`——插件、`pvz(...)`，以及这个模组自己用到的东西：

```kotlin
plugins {
    id("cn.enaium.fabricpvz.loom") version "1.0.14"
}

dependencies {
    // 要对哪个游戏发行版构建：GitHub Release 上的 pvz-portable-<version>-online.zip。
    // 工具链会下载一次（缓存到 ~/.gradle/caches/pvz），解包到 build/pvz/dist：游戏本体 jar
    // 以 files 方式进 compile/test/runClient 类路径，jar 旁边的版本清单里的库（loader、
    // Mixin、ASM、日志栈、LWJGL 与本机 natives）全部按 Maven 坐标解析。
    pvz("cn.enaium.fabricpvz:pvz-portable:1.2.5")

    // 写测试时：JUnit（工具链只配置 JUnit Platform 这个约定，版本由模组自己声明）。
    testImplementation(platform("org.junit:junit-bom:6.1.3"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")

    // 源码用到 API 时才声明；这个空模组没有用，所以这里没有：
    // compileOnly("cn.enaium.fabricpvz:fabric-api:1.2.2")
}

group = "com.example"
version = "1.0.0"
description = "My first PvZ mod"
```

`src/main/resources/fabric.mod.json`——元数据格式就是 Fabric 的格式：

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

`src/main/java/com/example/mymod/MyMod.java`——入口点：

```java
package com.example.mymod;

import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class MyMod implements ModInitializer {

    /** 日志器用模组 id 命名：日志行里就是这样标注你的模组的。 */
    private static final Logger LOGGER = LoggerFactory.getLogger("my-mod");

    @Override
    public void onInitialize() {
        LOGGER.info("My Mod loaded");
    }
}
```

### 构建与运行

```bash
cd my-mod
./gradlew build          # 编译 + 测试；产物 build/libs/my-mod-1.0.0.jar
./gradlew runClient      # 启动游戏（真 Loader），本模组从类路径被发现，不拷任何东西
```

`runClient` 做的事：用 `net.fabricmc.loader.impl.launch.knot.KnotClient` 启动，工作目录 `run/`，
类路径是版本包里的游戏 jar 与清单列出的库，加上你在 `pvzRunClasspath` 上声明的东西（用了 API 就是
API 聚合 jar，Kotlin 模组还有 `fabric-language-kotlin`），**再加上本模组自己的输出目录**
（`build/classes/java/main`、`build/resources/main` 等，作为同一个 `fabric.classPathGroups` 组）。
所以"改了源码重新跑一次"就够，不用先手工构建 jar。

### 预期看到什么

启动日志里应当有两处说明"它真的被加载了"：

```
Loading 2 mods:
	- my-mod 1.0.0
	- pvz-portable 1.2.5
	…
[main/INFO] (my-mod) My Mod loaded
```

- 模组列表里出现 `my-mod 1.0.0`：Loader 解析到了你的 `fabric.mod.json`；
- 你自己的那行日志：Loader 反射实例化入口点（需要**无参构造**）并调用了 `onInitialize()`；
- 如果你的模组声明了 API，列表里还会出现 `fabric-api 1.2.2` 以及它下面的五个 `api-* 1.2.2` 模块。

入口点在游戏的 `main` **之前**跑，而且 Loader 不保证模组之间的入口点顺序，所以这里只做"注册"，
不要假设别的模组（包括 API）已经初始化。

## 5. 接下来

- 想看懂工程里每个文件、以及工具链到底给了什么 → [项目结构](./structure.md)
- 想改游戏的行为 → [实验 Mixin](./mixin.md)
- 想加植物/僵尸/资源 → [用 fabric-api 做内容](./content.md)
