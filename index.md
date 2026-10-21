---
layout: home

hero:
  name: 植物大战僵尸移植 · 模组开发
  text: 从零写一个模组，到用 Mixin 与内容 API 改写游戏
  tagline: PvZ-Portable（Java 移植版）的模组作者文档，中文与英文各一份
  actions:
    - theme: brand
      text: 开始
      link: /guide/index
    - theme: alt
      text: API 速查
      link: /guide/reference

features:
  - title: 1. 开始
    details: 前置条件、怎么把游戏跑起来、mods/ 目录在哪、第一个能跑起来的空模组
  - title: 2. 项目结构
    details: 以 pvz-content-mod 为例的工程骨架、两个构建脚本、fabric.mod.json 的每个字段、run/ 的语义
  - title: 3. 实验 Mixin
    details: 选目标类、写 mixin 配置、@Inject/@Redirect/@ModifyConstant/@Accessor 的完整可复制例子与 require 语义
  - title: 4. 用 fabric-api 做内容
    details: 注册植物与僵尸、覆盖已有数值、图片与 reanimation、资源覆盖、事件与生命周期
  - title: 5. 实例精读
    details: 按文件走一遍 pvz-content-mod：注册、艺术管线、种子包绘制、解锁门控
  - title: 6. 构建、测试与发布
    details: build/test/runClient、端到端测试的思路、publishToMavenLocal、把 jar 交给玩家
  - title: 7. API 速查
    details: 各模块的公开 API 一览，以及去哪读真实实现
---

## 这份文档是什么

这个站点只讲一件事：**给 PvZ-Portable 写模组**。PvZ-Portable 是《植物大战僵尸》GOTY 的
Java 桌面移植版（JDK 25 + Gradle + LWJGL/SDL3），它**跑在真正的 Fabric Loader 上**，所以模组就是
普通的 Fabric 模组：一份 `fabric.mod.json`、一个 `ModInitializer` 入口点、一个 jar。

内容按"从零到能改游戏"的顺序组织：

| 章节 | 读它是为了 |
| --- | --- |
| [1. 开始](./guide/index.md) | 把环境和游戏准备好，让第一个空模组跑起来 |
| [2. 项目结构](./guide/structure.md) | 看懂一个模组工程的每个文件，以及工具链替你做了什么 |
| [3. 实验 Mixin](./guide/mixin.md) | 不改游戏源码地改写游戏类，含完整可复制的例子 |
| [4. 植物与僵尸](./guide/content.md) | 用 `api-plant` / `api-zombie` 注册内容与覆盖已有数值 |
| [5. 资源与美术](./guide/resources.md) | 图片、reanimation、散包覆盖 pak |
| [6. 事件与生命周期](./guide/events.md) | 用 `api-events` 观察游戏，以及什么时候不该用它 |
| [7. 实例精读](./guide/content-mod.md) | `pvz-content-mod` 逐个文件读完：三株红植物是怎么长出来的 |
| [8. 构建、测试与发布](./guide/build.md) | 把模组构建、测试、发布并交给玩家 |
| [9. API 速查](./guide/reference.md) | 需要查类名与方法时翻这一页 |

英文版在 `/en/`，与中文一一对应。

## 工作区里真实存在的东西

文档里的每一段代码都来自工作区里的真实工程，可以照着读、照着跑：

| 工程 | 是什么 |
| --- | --- |
| `PvZ-Portable/` | 游戏本体（模组 id `pvz-portable`），**不是**模组 |
| `fabric-api/` | 模组 API：`api-base`、`api-events`、`api-plant`、`api-resource`、`api-zombie`，聚合坐标 `cn.enaium.fabricpvz:fabric-api` |
| `loom/` | 工具链 Gradle 插件 `cn.enaium.fabricpvz.loom`：一行插件给你游戏本体与版本包清单里的库（Loader、Mixin、ASM、日志栈、LWJGL）、`runClient` 与 jar-in-jar |
| `pvz-example-mod/` | 最小可运行示例：事件 + 三个 mixin |
| `pvz-content-mod/` | 教学实例：三株红植物，注册 + 艺术管线 + 端到端测试 |
| `pvz-mod-95-edition/` | 大型改版实例：以规则与数值覆盖为主的 Kotlin 模组 |

表中的每个工程都能直接打开对照；文档里的构建脚本与代码片段以它们的当前内容为准。
工具链只提供游戏本身与版本包清单里的库，Kotlin、JUnit、`fabric-language-kotlin` 与 API 都由每个模组自己声明。
