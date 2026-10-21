# 实例精读：`pvz-content-mod`

这一章按文件读一遍 `pvz-content-mod`——工作区里最完整的教学模组。它加三株植物
（红色豌豆射手 / 双发射手 / 机枪射手），自己不带一张贴图，全部美术都是"游戏自己画 + 运行时改色"，
并且带一个真 Loader 的端到端测试。

**它的定位**：`pvz-content-mod` 是"薄示例"——它只拥有**自己是什么**（三株红植物的数值）与
**自己选了什么**（哪些轨道、什么色相、图标怎么造），其余全部（注册、事件、游戏自己的画家、
逐轨道改色）都交给 API。

## 1. 入口点：`ContentMod.java`

```java
public final class ContentMod implements ModInitializer {

    /** Mod id, matching {@code fabric.mod.json}. */
    public static final String MOD_ID = "pvz-content-mod";

    @Override
    public void onInitialize() {
        RedPlantsArt.install();   // 游戏有 app 之后再建缓存帧；建不成就每 tick 重试
        registerRedPeashooter();
        registerRedRepeater();
        registerRedGatling();
    }
}
```

三件事，顺序有讲究：

1. **`RedPlantsArt.install()`** 先做：它只**登记**两个回调（`GameLifecycleEvents.INITIALIZED` +
   `LawnEvents.TICK`），此时游戏还没起来，什么也建不了。
2. **注册三株植物**：`PlantType.builder(...).register()` 写定义表。入口点在游戏 `main` 之前跑，
   这就是"游戏读表之前"的时序（见 [植物与僵尸](./content.md)）。
3. 三个 `registerXxx()` 各自把返回的 `PlantType` 存进静态字段——因为**后面的注册要用到前面的结果**
   （红色机枪射手的 `upgradeFrom(SEED_REPEATER, redRepeater.seedType())` 需要红色双发射手的 seed type）。

字段与常量都集中在类头部，数值一目了然：`RED_PEASHOOTER_COST = 175`、
`RED_REPEATER_COST = 225`、`RED_GATLING_COST = 275`、`RED_GATLING_REFRESH = 5000`（机枪射手自己的长充能）、
`RED_GATLING_LAUNCH_RATE = 150`，以及三段 `almanacDescription` 文案。

### 红色机枪射手的两个"额外"调用

```java
// （真实 builder 里的 name / tooltip / almanacDescription 三行与本节无关，这里省略）
redGatling = PlantType.builder(GATLING_ID)
        .name("Red Gatling Pea")
        .burst(4)                                   // 四发（不写就只有一发）
        .upgrade(true)                              // 紫色（升级卡）背景
        .upgradeFrom(SeedType.SEED_REPEATER,        // 能种在零售双发射手上……
                redRepeater.seedType())             // ……也能种在红色双发射手上，就地替换
        .unlockAfter(SeedType.SEED_GATLINGPEA)      // 商店买了机枪射手就解锁
        .projectile(ProjectileType.PROJECTILE_FIREBALL)
        .register();
```

- **解锁靠游戏自己的判断**：零售机枪射手是商店植物，所以 `unlockAfter(SEED_GATLINGPEA)` 让游戏的
  `LawnApp::hasSeedType` 在玩家买过商店那株之后自动放行——**模组自己从不进商店**。
- **`upgradeFrom` 是本模组唯一"改游戏判定"的东西**，而且它走的是 API 的接缝
  （`Plant::isUpgradableTo` 的对偶），不是自己写 Mixin：替换动作是游戏自己做的。

### `plantCopying(int)`：把"零售种子"映射回"本模组的植物"

```java
static PlantType plantCopying(int theRetailSeedType) {
    return switch (theRetailSeedType) {
        case SeedType.SEED_PEASHOOTER -> redPeashooter;
        case SeedType.SEED_REPEATER -> redRepeater;
        case SeedType.SEED_GATLINGPEA -> redGatling;
        default -> null;
    };
}
```

它是"艺术管线"与"注册"之间唯一的接口：`RedPlantsArt` 只认零售种子（"我要豌豆射手的选卡图"），
注册只认注册 id，这个函数把两者接起来。

## 2. 艺术管线：`RedPlantsArt.java`

这个类是本模组的**艺术选择**：每个红植物 = 它的零售孪生植物的选卡图 + reanimation，套一个色相映射。
两个数字就是全部"审美"：

```java
private static final float RED_PIVOT_HUE = 90.0f;      // 豌豆家族自己的绿落到这里
private static final float RED_HUE_COMPRESSION = 0.25f; // 整条色带压成红，但保留明暗
```

### 2.1 三个可调点，三种机制

| 要红的地方 | 机制 | 为什么 |
| --- | --- | --- |
| 种子包图标 | `packetArt(Supplier<Image>)`，每次绘制问一次 | 选卡界面没有任何 tick，图标又必须在零售美术加载完之后才能造 |
| 棋盘上的植物（身体 + 头） | `onPlanted` 回调里 `ModReanims.overrideTrackArt` | 种植是一次事件，一次改到位 |
| 眨眼 reanimation | `onTick` 里再 `overrideTrackArt` 一次 | 游戏**每次眨眼新建**一个 reanimation，种植那次看不到它 |
| 光标预览 / 禅境花园的帧 | `GameLifecycleEvents.INITIALIZED` + 每 tick 重试，装上 `GameArt.installCachedPlantFrame` | 游戏缓存帧是另一条绘制路径，它不知道逐轨道改色 |

### 2.2 注册回调：`install()`

```java
static void install() {
    GameLifecycleEvents.INITIALIZED.register(RedPlantsArt::installArt);
    LawnEvents.TICK.register((board, tick) -> installArt());
}
```

- `INITIALIZED`：游戏有 app 了，第一次尝试建缓存帧。
- `TICK`：还没建成的话每 tick 再试一次（`installArt()` 里是"建好了就直接返回"）。
- **图标不在这里建**：它由游戏在每次画包时通过 supplier 问（`packetImage(String)`）。

### 2.3 图标：`packetImage` → `makeRedPacket`

::: tip 关于本章的代码摘录
下面的代码摘自 `ContentMod.java` 与 `RedPlantsArt.java`：**语句与顺序与文件一致**，为了聚焦本节
去掉了与主题无关的 javadoc、部分防御性空行与个别 builder 调用（后者会注明）。完整文件在
`pvz-content-mod/src/main/java/cn/enaium/fabricpvz/contentmod/`，可以逐行对照。
:::

```java
public static Image packetImage(String thePlantId) {
    Art aArt = artOf(thePlantId);
    if (aArt.packet == null) {
        aArt.packet = makeRedPacket(aArt.retailSeedType);   // 没造好就是 null，下次再问
    }
    return aArt.packet;
}

private static MemoryImage makeRedPacket(int theRetailSeedType) {
    MemoryImage aRetail = GameArt.packetArt(theRetailSeedType);
    if (aRetail == null) {
        // 游戏什么都没画出来：这张图要的资源还没加载好。
        loadError = "the retail packet art of seed type " + theRetailSeedType + " is not drawable yet";
        return null;
    }

    MemoryImage aRed = ModImages.remapHue(aRetail, RED_PIVOT_HUE, RED_HUE_COMPRESSION);
    if (aRed == null) {
        loadError = "the retail packet art of seed type " + theRetailSeedType + " has no pixel data";
    }
    return aRed;
}
```

四个要点：

- **图是游戏自己画的**：`GameArt.packetArt(seedType)` 调用游戏自己的包绘制，用那个种子自己的偏移
  （豌豆/双发是 (5, 9)，机枪是 (2, 9)），所以图标**不可能画出与棋盘上不同的东西**。
- **`null` 是合法返回**：含义是"现在造不出来"，游戏照自己的画法画，下次绘制再问。
- **结果缓存在 `Art.packet`**：一次成本换来之后每次绘制零成本。
- **`loadError` 是可诊断的失败**：不是抛异常，而是留一句人话，供测试/日志区分"没资源"与"没生效"。

### 2.4 棋盘上的植物：`onPlanted`

```java
public static void onPlanted(Plant thePlant) {
    if (thePlant == null || thePlant.mApp == null) {
        return;
    }

    Reanimation aBody = thePlant.mApp.reanimationTryToGet(thePlant.mBodyReanimID);
    if (aBody == null || aBody.mTrackInstances == null) {
        // 没有零售 .reanim 数据时无法承载覆盖：这株植物保持零售配色。
        return;
    }

    int aRecoloured = ModReanims.overrideTrackArt(aBody, RedPlantsArt::redCopy);
    ModReanims.giveSeparateHeadLayer(thePlant);
    Reanimation aHead = thePlant.mApp.reanimationTryToGet(thePlant.mHeadReanimID);
    if (aHead != null) {
        aRecoloured += ModReanims.overrideTrackArt(aHead, RedPlantsArt::redCopy);
    }

    recolours += aRecoloured;
    if (aRecoloured > 0) {
        plantedPlants++;
    }
}
```

- **哪些轨道要换是 API 自己列的**：`overrideTrackArt(reanim, mapper)` 从 reanim 的定义里找
  "带图"的轨道（`anim_idle` / `anim_stem` 这类纯运动轨道没有图，跳过），模组**不维护轨道名清单**。
  旧做法是手抄 13/20 个轨道名，改一次游戏就漏一次。
- **头要自己补**：游戏只为它**自己的**豌豆系种子建头那一层 reanimation，所以
  `giveSeparateHeadLayer(thePlant)` 是补上它的那一步（幂等）。不补的后果是"无头红茎"。
- **缓存红图**：`redCopy` 用 `IdentityHashMap` 按**源图身份**缓存；reanim 定义是进程级的，
  同一块棋盘上多株红植物交出来的是**同一批** `Image` 实例，所以一份红图给所有株用。

### 2.5 眨眼：`onTick`

```java
public static void onTick(Plant thePlant) {
    if (thePlant == null || thePlant.mApp == null
            || thePlant.mBlinkReanimID == ReanimationID.REANIMATIONID_NULL) {
        return;   // 绝大多数 tick 都走这里
    }

    recolours += ModReanims.overrideTrackArt(
            thePlant.mApp.reanimationTryToGet(thePlant.mBlinkReanimID), RedPlantsArt::redCopy);
}
```

`Plant::doBlink` **按需新建**眨眼用的 reanimation，所以它永远不会看到种植那次做的改色。
这个回调几乎每个 tick 都在第一行返回——这正是"每 tick 的回调要能立刻返回"的样子。

### 2.6 缓存帧：`installCachedPlantFrame`

```java
private static void installCachedPlantFrame(Art theArt) {
    PlantType aType = ContentMod.plantCopying(theArt.retailSeedType);
    if (aType == null) {
        return;
    }

    if (theArt.frame == null) {
        MemoryImage aRetail = GameArt.cachedPlantFrame(theArt.retailSeedType);
        if (aRetail == null) {
            return;   // 还画不出来：下一 tick 再问
        }
        theArt.frame = ModImages.remapHue(aRetail, RED_PIVOT_HUE, RED_HUE_COMPRESSION);
    }

    if (theArt.frame != null) {
        GameArt.installCachedPlantFrame(aType.seedType(), theArt.frame);
    }
}
```

没有这一步，植物在草坪上是红的、**在鼠标指针下是绿的**：光标预览与禅境花园画的是
`ReanimatorCache#mPlantImages[seedType]` 那一格，它由游戏从 reanimation 构建，不知道逐轨道改色。

## 3. 它踩过的坑（也是你能省下的时间）

| 坑 | 症状 | 正确做法 |
| --- | --- | --- |
| 运行时造的图塞进偷来的资源 id | 图标在某些时刻变回原版/消失：模组入口点在零售美术之前，选卡界面又没有 tick 可以重试 | 用 `packetArt(Supplier<Image>)`：每次绘制问一次，`null` 就交给游戏 |
| 手画/临摹零售美术 | 图标与草坪上的植物对不上（手画的那版曾经对不上） | 用 `GameArt.packetArt` 让**游戏自己**画，再改色 |
| 以为种植一次就够了 | 眨眼时眼皮变回绿色：游戏每次眨眼新建 reanimation | `onTick` 里补一次（幂等） |
| 忘了头的 reanimation | 棋盘上"无头红茎"：游戏只为自己的豌豆系种子建它 | `ModReanims.giveSeparateHeadLayer` |
| 手抄轨道名清单 | 游戏改了 reanim，某些部件还是绿的 | `overrideTrackArt(reanim, mapper)` 的那版：轨道表从定义里读 |
| 忘了子弹数 | 注册的射击植物永远只发一发 | `.burst(2)` / `.burst(4)` |
| 运行时构建的图写进游戏资源表 | 每次资源组加载就丢一次 | 交给 supplier（这正是"资源组重载也追得上"的原因） |
| Mixin 与 API 混用分不清 | 同一个行为在两处实现，读代码的人不知道谁是权威 | 能走 API 接缝就不写 Mixin；本模组**一个 Mixin 都没有**——它的美术需求全被 API 的接缝覆盖了 |

## 4. 测试：`ContentModEndToEndTest`

它把构建出的 jar 放进一个临时 `mods/` 目录，在**第二个 JVM** 里用真正的 Fabric Loader
（`net.fabricmc.loader.impl.launch.knot.KnotClient`）启动游戏，并把游戏主类换成测试自己的 harness。
harness 把观察结果写进报告文件，测试再断言那份文件——因为 Loader 定义了自己的一份游戏/模组类，
**断言不能读那些类的静态状态**（会读到第二份拷贝）。

它断言的东西正好覆盖了本章每一节：三株植物注册进了定义表、三株的解锁门控与孪生一致、
图鉴第二页有它们、选卡第二页有它们、种子包画的是模组的植物（**在任何棋盘创建或 tick 之前**就要画出来）、
只有红色机枪射手的种子包是紫色升级卡、在无头棋盘上可种植且开火的是火焰豌豆、一次发射打 1/2/4 发、
红色机枪射手能种在零售或红色双发射手上（空地上则是 `PLANTING_NEEDS_UPGRADE`）。

机器上有零售资源时，harness 还会挂上真的 `main.pak` 并做像素级检查；没有资源时那些检查跳过，
注册与解锁检查照跑——**这正是一个"需要真资源"的测试该怎么写**。

细节见 [构建、测试与发布](./build.md)。

下一章：[构建、测试与发布](./build.md)。
