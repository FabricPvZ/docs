# 用 fabric-api：资源与美术

`api-resource`（`cn.enaium.fabricpvz.api.resource`）解决四件事：

| 你要做的事 | 用什么 |
| --- | --- |
| 用一张自己画的图（图是资源文件） | `ModImages.load` + `ModImageSlot.claim` |
| 用一张运行时算出来的图（改色、合成、渲染游戏自己的画） | `ModImages`（画与改色）+ `PlantType.Builder#packetArt(Supplier)` / `GameArt` |
| 改一株植物的外观但保留它的动画 | `ModReanims.overrideTrackArt` / `giveSeparateHeadLayer` |
| 让散装文件覆盖 `main.pak` 里的同名资源（散包改版） | `ResourceOverrides` |

## 1. 图片来源一：模组自带的图片文件

`ModImages.load(Class<?> owner, String path)` 从**你的 jar** 里读一张 PNG，得到游戏自己的图片类型
（`MemoryImage`，游戏能像画自己的图一样画它、释放它）：

```java
MemoryImage icon = ModImages.load(MyMod.class, "assets/my-mod/packet.png");
```

把它交给种子包有三种方式，按"图是不是资源文件"选：

| 方式 | 什么时候用 |
| --- | --- |
| `PlantType.Builder#packetArt(int imageId, int celIndex)` | 图已经在一个 `ImageID` 槽里（通常是下面 `ModImageSlot` 拿到的） |
| `PlantType.Builder#packetArt(Supplier<Image>)` | 图是**运行时**造出来的（见第 3 节）——每次画包问一次 supplier |
| `PlantType.Builder#packetArtFromReanimation()` | 图就该由植物自己的 reanimation 决定（上游做法） |

### `ModImageSlot`：占一个游戏从不读的图片 id

游戏没有给模组预留图片 id 空间，也没有"资源（重新）加载完了"的事件。所以自带图片的模组必须借用
一个**游戏拥有但从不绘制**的 id，并在游戏重新绑定那个 id 之后把图放回去。`ModImageSlot` 就是那个槽位：

```java
ModImageSlot slot = ModImageSlot.claim("my-mod", "red-packet");   // 取一个 id（进程内不重复）
slot.setImage(ModImages.load(MyMod.class, "assets/my-mod/packet.png"));
int imageId = slot.id();                                          // 交给 packetArt(imageId, cel)
```

- id 来自游戏 `LoadingImages` 资源组里某个**这个移植版从不读取**的 id（上游画它们的粒子系统没被移植），
  所以是真实存在的资源项、在范围内、又不会被游戏自己画出来。
- 模块自己的入口点（`ResourceInitializer`）会在每次初始化、每次资源组加载之后与每 tick 把图重新装回去，
  **这部分记账不需要你写**：`slot.image()` 拿到当前装好的图，`slot.bound()` 表示"现在绑着的就是你那张"。
- 代价是"用别人的 id"：如果游戏的另一个资源组把它绑成别的东西，回装是唯一保证。
  **图是运行时造出来的话优先用 supplier（第 3 节），不要走这条路**。

## 2. 图片与像素工具：`ModImages`

| 方法 | 作用 |
| --- | --- |
| `load(Class<?> owner, String path)` | 从 `owner` 的类路径（也就是你的 jar）读 PNG |
| `blank(int w, int h)` | 全透明画布 |
| `painted(int w, int h, Consumer<Graphics> painter)` | 空白画布 + 一支画笔：`ModImages.painted(50, 70, g -> g.drawImage(...))` |
| `remapHue(MemoryImage src, float pivotDegrees, float compression)` | 逐像素重映射色相，保留饱和度、明度与 alpha |

`remapHue` 是"把零售美术换个颜色"的那把刀：`pivotDegrees` 是"原来的色相要落到哪里"，
`compression` 是围绕这个轴压多少（越小颜色越集中）。豌豆家族是黄绿色（大约 60–180 度），
所以 `pivot = 90`、`compression = 0.25` 会把整个色带压成红色，同时保留明暗——`pvz-content-mod`
用的就是这两个数（`RedPlantsArt.RED_PIVOT_HUE` / `RED_HUE_COMPRESSION`）。

## 3. 图片来源二：运行时造出来的图

**首选做法**：让游戏自己画，你再改。`GameArt` 提供两个"游戏自己的画家"：

| 方法 | 画出来的东西 |
| --- | --- |
| `GameArt.packetArt(int seedType)` | 该种子的**选卡图**：调用游戏自己的 `SeedPacket::seedPacketDrawSeed`，用那个种子自己的摆放偏移，画进一张 50×70 的空白图；资源还没加载好时返回 `null` |
| `GameArt.cachedPlantFrame(int seedType)` | 游戏为光标预览/禅境花园构建的**缓存帧**（`ReanimatorCache`）；同上，没好就返回 `null` |
| `GameArt.installCachedPlantFrame(int seedType, Image frame)` | 把**你的**帧放进游戏那一格缓存，于是光标预览与禅境花园画的是你的美术 |

"图是运行时造出来的"就把它交给 supplier，**不要**塞进偷来的资源 id：

```java
redPeashooter = PlantType.builder("red_peashooter")
        …
        .packetArt(() -> RedPlantsArt.packetImage("red_peashooter"))
        .register();
```

`packetArt(Supplier<Image>)` 的语义（这是这个 API 里最容易用错的一处）：

- 游戏**每次画这个种子包**时问一次 supplier；
- 返回一张图 → **按 1:1 画在种子包原点**，并取消游戏自己对这张包的原版绘制；
- 返回 `null` → "还没造好"，游戏照自己的画法画（背景 + 价格），下次再问；
- 所以 supplier 必须**幂等且能重复问**（自己缓存结果，像 `RedPlantsArt.packetImage` 那样）。

两个理由让它优先于 `ModImageSlot`：

1. **模组的入口点在零售美术载入之前**，运行时造出来的图有一段"造不出来"的窗口期；而**选卡界面没有任何
   tick**（选卡发生在棋盘之前），靠 tick 重试的机制在玩家真正看包的那一刻救不了你。
2. **游戏自己拥有图片表**：资源组重新加载会覆盖它拥有的 id，而 supplier 每次绘制重新问一次，
   天然不受影响。

## 4. 改一株植物的外观：`ModReanims`

手写一份 `.reanim` 不是模组该做的事，所以"想要一个新植物的外观"= **复用零售骨架 + 换掉它画的图**。

| 方法 | 作用 |
| --- | --- |
| `overrideTrackArt(Reanimation reanim, String[] trackNames, Function<Image, Image> mapper)` | 换掉**指定名字**轨道的图 |
| `overrideTrackArt(Reanimation reanim, Function<Image, Image> mapper)` | 换掉**每一条带图**轨道的图（轨道表从 reanim 自己的定义里读，纯运动轨道没有图、跳过） |
| `giveSeparateHeadLayer(Plant plant)` | 给植物补上"头"那一层 reanimation（游戏只为自己的豌豆系种子建它） |

语义：

- mapper 返回 `null` → 保持原图；已经是目标图 → 跳过。所以这两个方法**幂等**，可以每 tick / 每次眨眼重复调用。
- 取图走的是 reanim **定义**里的帧（`mDefinition.mTracks`），不是 `Reanimation#getCurrentTrackImage`：
  后者对进过图集的帧返回 `null`（游戏确实给豌豆家族建图集），而且只覆盖"当前这一帧"。

```java
// 一株植物的身体 + 头：所有带图轨道换成红色副本
int recoloured = ModReanims.overrideTrackArt(body, RedPlantsArt::redCopy);
ModReanims.giveSeparateHeadLayer(plant);
Reanimation head = plant.mApp.reanimationTryToGet(plant.mHeadReanimID);
if (head != null) {
    recoloured += ModReanims.overrideTrackArt(head, RedPlantsArt::redCopy);
}
```

`setImageOverride` 只影响**这一株**：同一块棋盘上的原版豌豆射手还是绿的。完整的用法在
[实例精读](./content-mod.md) 里逐行走。

## 5. 散装文件覆盖 pak：`ResourceOverrides`

引擎解析一个资源名是 **pak → 文件系统**：先查 pak 成员，没有才按资源目录拼路径兜底，也就是
**pak 永远赢**，散装文件覆盖不了它。"95 版"这种改版把 `images/`、`reanim/`、
`properties/LawnStrings.txt` 放在游戏目录里覆盖同名资源，需要的就是这一层。

`ResourceOverrides` 在 `PakInterface.open`（只对读模式）与 `PakInterface.exists` 的**最前面**插入查找，
命中就用你的内容，否则原样放行。解析顺序：

1. **单文件 / 字节覆盖**：为那个 pak 路径直接登记的文件或字节；
2. **root 目录**：按登记顺序，`root/<pak 路径>` 存在就用它；
3. **pak 成员**：引擎自己的查找；
4. **文件系统**：引擎自己的兜底。

```java
// 把整个"散包"目录当作高优先级资源根：95-edition/reanim/… 覆盖 main.pak 里的同名资源
ResourceOverrides.addRoot(Path.of("95-edition"));

// 单个文件覆盖一个 pak 路径（pak 内写法，大小写不敏感）
ResourceOverrides.addFile("PROPERTIES/LAWNSTRINGS.TXT", Path.of("overrides/LawnStrings.txt"));

// 自带的小文件：直接给字节，不必解包到磁盘
ResourceOverrides.addBytes("REANIM/FOO.PNG", Files.readAllBytes(Path.of("foo.png")));
```

| 方法 | 作用 |
| --- | --- |
| `addRoot(Path)` | 登记一个覆盖根目录（按登记顺序尝试，先命中的赢） |
| `addFile(String pakPath, Path file)` | 用磁盘上的文件覆盖一个 pak 路径 |
| `addBytes(String pakPath, byte[] data)` | 用一段字节覆盖一个 pak 路径 |
| `overriddenNames()` | 诊断：显式登记过的 pak 路径（大写、`/` 分隔、已排序；root 目录里的内容不在此列） |
| `clear()` | 清空全部覆盖（测试或换资源集） |
| `installed()` | 模块的 Mixin 是否已装进引擎（诊断） |

**键的规则**与引擎一致：**大小写不敏感**、`\\` 与 `/` 等价、`.` / `..` 按词法归一，内部统一大写并用 `/` 分隔。
所以这三种写法是同一个资源：

```text
reanim\foo.png   ==   REANIM/FOO.PNG   ==   ./reanim/./foo.png
```

root 目录里的查找**逐段大小写不敏感**地匹配磁盘上的真实文件名，所以在 Linux 这种大小写敏感的文件系统上
行为与零售一致。同一个 pak 路径重复登记时**后登记的生效**。

**什么时候更适合用它**（而不是写 Java）：

- 你的美术**本来就是资源文件**（一张改过的 `images/`、一份 `.reanim`、一份 `LawnStrings.txt`）；
- 你要改的是**已经有名字的资源**（散包改版、汉化、材质包），而不是新增内容；
- 你希望"整套文件直接换"，而不是在代码里描述每一张图。

**什么时候不该用它**：新增内容（新植物/新僵尸的图标、运行时算出来的图）——那些走 `ModImageSlot`
或 `packetArt(Supplier)`；也不要用它去覆盖 pak 的结构本身（写模式、pak 挂载、`resourceNames()` /
`resourceCount()` 都不受影响，覆盖不是 pak 成员，也不进那两张表）。

生效范围与代价：

- **只影响读取**（`open` 的读模式与 `exists`），而且**只在加载期查找一次**：同一次 `open` 的第一次查找会走一遍
  root，答案（包括"没有覆盖"）会被记住；登记新的覆盖会清掉缓存。
- **没登记任何覆盖时**，Mixin 只做一次 volatile 读就放行：安装与没装这个模块逐字节一致。
- 登记与查找由一把锁守护，幂等、线程安全：在模组入口点登记一次即可（入口点在游戏 `main` 之前跑）。

## 6. 诊断

`ResourceDiagnostics` 记录模块自己的记账（资源组加载回调次数、重装次数等），端到端测试用它证明
"这个模块真的跑过"——和 Mixin 那一章说的诊断计数是同一件事：**能区分"没生效"与"没跑过"**。

## 7. 在 `pvz-content-mod` 里的对应位置

| 你看到的 | 文件 |
| --- | --- |
| 三株植物的艺术选择（哪些种子、什么色相、图标怎么来） | `src/main/java/cn/enaium/fabricpvz/contentmod/RedPlantsArt.java` |
| 图标：`GameArt.packetArt` + `ModImages.remapHue`，交给 `packetArt(Supplier)` | `RedPlantsArt#makeRedPacket`、`RedPlantsArt#packetImage` |
| 棋盘上的红植物：`ModReanims.overrideTrackArt` + `giveSeparateHeadLayer` | `RedPlantsArt#onPlanted` |
| 眨眼 reanim 的补色（每次眨眼游戏新建一个） | `RedPlantsArt#onTick` |
| 光标预览/禅境花园的缓存帧 | `RedPlantsArt#installCachedPlantFrame`（`GameArt.cachedPlantFrame` + `installCachedPlantFrame`） |

这个模组**一个图片文件都不带**：它的 jar 里没有贴图，所有美术都是"游戏自己画 + 运行时改色"。

下一章：[事件与生命周期](./events.md)。
