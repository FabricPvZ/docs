# 参考：API 速查

一页纸的速查表：类名 + 一句话 + 关键方法。要看实现的语义（每个注入点在哪、什么时候不干预），
去 [去哪看真实实现](#去哪看真实实现) 列出的文件。

## 依赖坐标与模块

| 模块 / 模组 id | 坐标 | 内容 |
| --- | --- | --- |
| `fabric-api`（聚合器） | `cn.enaium.fabricpvz:fabric-api:1.2.2` | 不含代码；模组依赖这个坐标就拿五个模块，聚合 jar 把五个模块**装在自己里面**（jar-in-jar），所以安装时只有一个文件 |
| `api-base` | 同上，随聚合器带出 | `PvzFabricApi`、`ModQuery`、事件总线（`api.event`） |
| `api-events` | 同上 | `LawnEvents`（游戏事件）、`GameLifecycleEvents`（生命周期）与两个桥 |
| `api-plant` | 同上 | `PlantType`、`PlantRegistry`、`PlantOverrides`、`ProjectileOverrides`、`BoardOverrides`、`CustomPlantEvents`、`PlantRules`、`PlantHooks` |
| `api-resource` | 同上 | `ModImages`、`ModImageSlot`、`GameArt`、`ModReanims`、`ResourceOverrides`、`ResourceDiagnostics` |
| `api-zombie` | 同上 | `ZombieType`、`ZombieRegistry`、`ZombieOverrides`、`CustomZombieEvents`、`ZombieHooks` |

API 是**可选依赖**：源码用到它时，模组自己在 Gradle 里声明 `cn.enaium.fabricpvz:fabric-api:1.2.2`
（编译用 `compileOnly` / `testCompileOnly`，运行时用 `testImplementation` / `pvzRunClasspath` 且
`isTransitive = false`），并在 `fabric.mod.json` 的 `depends` 里写模块 id（或 `"fabric-api"`）。
不用 API 的模组不需要声明任何坐标。工具链不提供 API，也不替你选它的版本。

## `api-base`

| 类 / 方法 | 说明 |
| --- | --- |
| `PvzFabricApi.MOD_ID` / `.BASE_MOD_ID` / `.VERSION` | `"fabric-api"` / `"api-base"` / API 版本 |
| `PvzFabricApi.isInitialized()` / `.getVersion()` | API 自己的 `main` 入口点跑过没有 / 它的版本 |
| `PvzFabricApi.getMods()` / `.getModContainer(id)` / `.getEntrypoints(key, type)` | Loader 查询的包装 |
| `ModQuery.isModLoaded(id)` / `.getModContainer(id)` / `.getModVersion(id)` | 轻量的 Loader 查询 |
| `Event<T>#register(listener)` / `#invoker()` | 事件注册与取当前 invoker（Fabric 同形） |
| `EventFactory.createArrayBacked(接口, invoker 工厂)` | 创建数组驱动的事件；只有这一个工厂 |
| `ListenerException` | 监听器抛出的异常被包成它，带事件与监听器上下文 |

## `api-events`

| 类 / 成员 | 说明 |
| --- | --- |
| `LawnEvents.LEVEL_START` | `(Board, int level, int gameMode, int background)`：关卡初始化结束 |
| `LawnEvents.LEVEL_END` | `(Board, int result)`：关卡结束（胜/负） |
| `LawnEvents.WAVE_START` | `(Board, int waveIndex, int[] zombieTypes)`：一波即将生成，返回 `true` 取消 |
| `LawnEvents.ZOMBIE_SPAWN` | `(Board, int zombieType, int row, boolean fromWave)`：返回 `true` 取消生成 |
| `LawnEvents.ZOMBIE_DEATH` / `.ZOMBIE_DAMAGE` | 死亡通知 / 伤害值链 |
| `LawnEvents.PLANT_PLACED` / `.PLANT_REMOVED` / `.PLANT_DAMAGE` | 种植通知 / 移除通知（带原因码）/ 伤害值链 |
| `LawnEvents.SUN_COLLECTED` | `(Board, int amount, int source)`：值链，返回实际入账的数量 |
| `LawnEvents.PLANTING_VALIDATED` | `(Board, int x, int y, int seedType, int reason)`：返回 `PLANTING_OK` 强制放行 |
| `LawnEvents.TICK` | `(Board, int tick)`：每 tick（每秒 100 次） |
| `LawnEvents.PRE_DRAW` / `.POST_DRAW` | `(Board, Graphics)`：棋盘对象绘制之前 / 之后 |
| `GameLifecycleEvents.INITIALIZED` | 每个进程一次：框架启动完成（资源已加载，即将进主循环） |
| `GameLifecycleEvents.EXITING` | 每个进程一次：开始关闭之前 |
| `LawnHooksBridge` / `AppHooksBridge` | 把游戏的钩子调用点接到事件总线上（由模块入口点安装） |

## `api-plant`

| 类 / 方法 | 说明 |
| --- | --- |
| `PlantType.builder(String id)` → `Builder` → `register()` | 注册一株新植物；`register()` 返回 `PlantType`，`seedType()` 是游戏用的整型 id |
| `Builder` 全部字段 | 见[植物与僵尸](./content.md)的表：`name` / `tooltip` / `almanacDescription` / `stringKeyStem` / `cost` / `refreshTime` / `reanimation` / `subClass` / `launchRate` / `health` / `projectile` / `burst` / `unlockAfter` / `packetArt…` / `aquatic` / `fungus` / `nocturnal` / `flying` / `upgrade` / `upgradeFrom` / `chooserVisible` / `onTick` / `onPlanted` / `plantRect` / `plantAttackRect` / `plantingRule` |
| `PlantType#id()` / `#seedType()` / `#definition()` | 注册 id / 游戏 id / 底层 `CustomPlantType` |
| `PlantRegistry.FIRST_SEED_TYPE` | 注册内容的 id 起点（`100`） |
| `PlantRegistry.get(int)` / `.get(String)` / `.all()` / `.count()` | 查询已注册植物 |
| `PlantRegistry.isCustomSeedType(int)` | id 是否落在留给注册内容的区间 |
| `PlantRegistry.canPlantAt(board, x, y, seedType)` | 游戏会不会允许这次种植（含模组规则） |
| `PlantRegistry.place(board, x, y, seedType)` | 绕过种子包直接种一株 |
| `PlantRegistry.unregister(int)` / `.reset()` | 注销 / 清空（测试用） |
| `PlantOverrides.of(seedType)` → `PlantOverride` | 覆盖已有植物（零售也算）的数值：`cost` / `refreshTime` / `launchRate` / `bodyHealth` / `spawnCountdown` / `biteInsteadOfEatZombieType` / `digestCountdown` / `spikeRockDamage` / `explosionBlast` / `producedCoins` / `crushProof` |
| `PlantOverrides.notOnGroundState(int)` / `.extraFireSeedType(int)` | 两条整局规则 |
| `PlantOverrides.registered()` / `.rules()` / `.reset()` | 诊断与清理 |
| `ProjectileOverrides.of(projectileType).damage(int)` | 覆盖抛射物伤害（一次表写入，无需 Mixin） |
| `BoardOverrides.allowZombies(gameMode, zombieTypes…)` | 某模式额外允许的僵尸 |
| `BoardOverrides.allowZombieOnLevel(type, level, boolean)` | 覆盖允许表的一格 |
| `BoardOverrides.relaxZombieSpawnRules(boolean)` | 去掉起始关与权重的两个否决 |
| `BoardOverrides.beghouledWinningScore(int)` / `.killAllZombiesDamage(int)` / `.rainSeedInterval(int, int)` / `.stageHasGraveStones(boolean)` | 各模式的关卡数值 |
| `BoardOverrides.sunValues(int, int, int)` / `.sunMoneyCap(int)` | 阳光面值（普通/小/大）/ 存款上限 |
| `BoardOverrides.conveyorSeed(gameMode, from, to)` / `.sunSpawning(gameMode, coinType)` / `.skyDropCoin(coinType)` | 传送带与天降物 |
| `BoardOverrides.dropLootSunBranch(boolean)` / `.dropLootCoins(int, int, int)` | 敲僵尸掉阳光的分支与掉的三枚币 |
| `BoardOverrides.lastStandInitialSun(int)` / `.coinUsableSeedType(int)` | Last Stand 开局阳光 / 金币的默认可用种子包 |
| `BoardOverrides.numWaves(retailWaves, waves)` / `.seedNotAllowedToPick(gameMode, seedTypes…)` / `.graveBusterNeedsGravesInverted(boolean)` | 波数表 / 选卡禁选 / 墓碑需求位取反 |
| `CustomPlantEvents.TICK` / `.PLACED` | 全局观察**注册过的**植物 |
| `PlantHooks` | 注入点本身（模块内部使用，公开以便诊断与测试）：`isUpgrade` / `isUpgradableTo` / `onPlanted` / `onTick` / `plantRect` / `drawPacketArt` / `fire` / `burstOf` … |
| `PlantBehaviour` / `PlantingRule` | 行为的接口形态（builder 的回调被适配成它） |

## `api-zombie`

| 类 / 方法 | 说明 |
| --- | --- |
| `ZombieType.builder(String id)` → `Builder` → `register()` | 注册一个新僵尸；`zombieType()` 是游戏用的 id |
| `Builder` 全部字段 | 见[植物与僵尸](./content.md)：`name` / `almanacDescription` / `stringKeyStem` / `bodyReanimation` / `headReanimation` / `headTrack` / `headBodyTrack` / `headHiddenTrack` / `headHiddenLayer` / `headTransform` / `health` / `helm` / `shield` / `flyingHealth` / `collider` / `attackRect` / `scale` / `canGoInPool` / `wave` / `pickWeight` / `startingLevel` / `points` / `onTick` / `onSpawned` |
| `ZombieRegistry.FIRST_ZOMBIE_TYPE` | 注册内容的 id 起点（`64`） |
| `ZombieRegistry.get(int)` / `.get(String)` / `.all()` / `.count()` / `.isCustomZombieType(int)` | 查询 |
| `ZombieRegistry.spawn(board, zombieType, row, fromWave)` | 走游戏自己的生成路径生成一个 |
| `ZombieRegistry.WAVE_UI` | "不属于任何波次"的生成常量 |
| `ZombieOverrides.of(zombieType)` → `ZombieOverride` | 覆盖已有僵尸的出生数值：`bodyHealth` / `helm` / `shieldHealth` / `phaseCounter` / `spawnsAs` / `bodyAnimation` / `mindControlBodyHealth` |
| `ZombieOverrides.mindControlBoost(int, int, float)` / `.burnImmunity(int, int…)` / `.coldRemovalChilledCounter(int)` / `.shieldAlwaysAbsorbs(boolean)` | 四条整局规则 |
| `ZombieOverrides.registered()` / `.rules()` / `.reset()` / `.remapType(int)` / `.apply(Zombie)` | 诊断与清理 / 类型替换查询 |
| `CustomZombieEvents.TICK` / `.SPAWNED` | 全局观察**注册过的**僵尸 |
| `ZombieHooks` / `ZombieBehaviour` | 注入点与行为接口（诊断、测试） |

## `api-resource`

| 类 / 方法 | 说明 |
| --- | --- |
| `ModImages.load(Class, String path)` | 从你的 jar 读一张 PNG |
| `ModImages.blank(w, h)` / `.painted(w, h, painter)` | 空白/带笔刷的画布 |
| `ModImages.remapHue(image, pivotDegrees, compression)` | 逐像素改色相，保留饱和度/明度/alpha |
| `ModImageSlot.claim(modId, name)` | 取一个游戏从不绘制的 `ImageID` 槽位 |
| `ModImageSlot#setImage(Image)` / `#image()` / `#bound()` / `#id()` / `#name()` | 装图 / 当前图 / 是否已绑好 / id / 名字 |
| `ModImageSlot.reset()` | 清空全部槽位（测试用） |
| `GameArt.packetArt(seedType)` | 让游戏把该种子的选卡图画进一张 50×70 的图（没好返回 `null`） |
| `GameArt.cachedPlantFrame(seedType)` | 游戏为光标预览/禅境花园构建的缓存帧 |
| `GameArt.installCachedPlantFrame(seedType, frame)` | 把**你的**帧放进游戏的缓存 |
| `ModReanims.overrideTrackArt(reanim, mapper)` | 换掉**每一条带图**轨道的图（幂等） |
| `ModReanims.overrideTrackArt(reanim, trackNames, mapper)` | 只换指定名字的轨道 |
| `ModReanims.giveSeparateHeadLayer(plant)` | 补上"头"那一层 reanimation（幂等） |
| `ResourceOverrides.addRoot(Path)` / `.addFile(pakPath, Path)` / `.addBytes(pakPath, byte[])` | 登记散包覆盖（目录 / 单文件 / 字节） |
| `ResourceOverrides.overriddenNames()` / `.clear()` / `.installed()` | 诊断 / 清空 / Mixin 是否已装 |
| `ResourceDiagnostics` | 模块自己的记账（资源组回调、重装次数……），测试用 |

## 去哪看真实实现

按"想确认什么"找文件（路径相对仓库根）：

| 想确认 | 打开 |
| --- | --- |
| 注册写进了哪张表、id 怎么分配 | `fabric-api/api-plant/src/main/java/cn/enaium/fabricpvz/api/plant/PlantRegistry.java`、`api-zombie/.../ZombieRegistry.java` |
| 每个注入点注入到游戏的哪个方法 | `fabric-api/api-plant/src/main/java/cn/enaium/fabricpvz/api/plant/PlantHooks.java`（javadoc 逐个写了游戏方法名与上游 `file:line`）、`api-zombie/.../ZombieHooks.java`、两个模块的 `mixin/` 目录 |
| 覆盖是在什么时候生效的 | `api-plant/.../mixin/PlantOverridesMixin.java`、`api-zombie/.../mixin/ZombieOverridesMixin.java`、`api-plant/.../mixin/BoardWavesMixin.java` |
| 事件由游戏的哪个调用点触发 | `PvZ-Portable/src/main/java/cn/enaium/fabricpvz/portable/lawn/hooks/LawnHooks.java` 与 `sexy/hooks/AppHooks.java`、`fabric-api/api-events/.../LawnHooksBridge.java` |
| 游戏本身怎么找资源、pak 的键规则 | `PvZ-Portable/src/main/java/cn/enaium/fabricpvz/portable/sexy/pak/PakInterface.java`、`.../pvzp/ResourceLocator.java` |
| 工具链到底给了什么 | `loom/README.md`、`loom/src/main/kotlin/cn/enaium/fabricpvz/loom/PvzModPlugin.kt`、`PvzDist.kt`、`JarInJar.kt` |
| 一个模组"长什么样"的模板 | `pvz-example-mod/`（最小：事件 + 三个 mixin）、`pvz-content-mod/`（内容 + 艺术 + 端到端测试）、`pvz-mod-95-edition/`（Kotlin + 规则覆盖） |
