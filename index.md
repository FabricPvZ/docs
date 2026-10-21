---
layout: home

hero:
  name: 植物大战僵尸移植 · 模组开发
  text: 从零写一个模组，到用 Mixin 与内容 API 改写游戏
  tagline: 《植物大战僵尸》GOTY 的 Java 桌面移植，跑在真正的 Fabric Loader 上
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
