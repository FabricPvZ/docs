# 用 fabric-api：事件与生命周期

`api-events` 模块提供两组事件：`cn.enaium.fabricpvz.api.lawn.LawnEvents`（游戏内事件）与
`cn.enaium.fabricpvz.api.lifecycle.GameLifecycleEvents`（进程生命周期），这是模组**观察游戏**的地方。
事件由游戏自己的钩子调用点触发，桥由这个模块的 `main` 入口点（`ApiEventsInitializer`）在游戏启动前装好，
所以你只要 `register`。

**用它的时机**：想知道"发生了什么事"（种下了、死了、收集了阳光、过关了）。
**别用它的时机**：想**改写**游戏自己的动作（那是 Mixin 或更底层的钩子的活，见本章第 4 节）。

## 1. 事件总线：`Event<T>` 与 `EventFactory`

事件与 Fabric API 的 `Event<T>` / `EventFactory` **同名同形**——按 Fabric 的写法写就对了：

```java
public interface Event<T> {

    /** Registers a listener. Listeners are called in registration order. */
    void register(T listener);

    /** Returns the invoker built from the listeners registered so far. */
    T invoker();
}
```

语义（每条都有测试覆盖）：

| 语义 | 含义 |
| --- | --- |
| 注册顺序派发 | 监听器按注册顺序被调用；同一个对象注册两次就被叫两次 |
| 快照派发 | `invoker()` 返回的是"读它的那一刻"的监听器集合构建的 invoker；派发中有人注册只影响下一次 |
| 空事件透传 | 没有监听器时 invoker 是"工厂作用于空数组"的结果，所以**没有模组监听时游戏行为原样不变** |
| 值链 | 有返回值的事件是管道：每个监听器收到上一个的返回值并返回给下一个 |
| 布尔 OR | 可取消（返回 `boolean`）的事件按 OR 合并：任一监听器返回 `true` 即取消 |
| 异常不吞 | 监听器抛出的异常会包成 `ListenerException`（带事件与监听器上下文）从游戏调用点抛出 |

Fabric API 的 phase API（`addPhase` / `addPhaseOrdering`）**没有实现**，也不需要。

## 2. `LawnEvents`：游戏事件全表

```java
LawnEvents.SUN_COLLECTED.register((board, amount, source) -> {
    collected++;
    return amount * 2;      // 值链：返回给下一个监听器/游戏使用的数量
});

LawnEvents.PLANT_PLACED.register((board, plant, gridX, gridY) -> plantsPlaced++);
LawnEvents.LEVEL_START.register((board, level, gameMode, background) -> levelStarts++);
```

| 事件 | 监听器签名 | 触发时机 | 语义 |
| --- | --- | --- | --- |
| `LEVEL_START` | `(Board, int level, int gameMode, int background)` | 关卡初始化结束，棋盘已建好 | 通知 |
| `LEVEL_END` | `(Board, int result)` | 关卡结束（胜或负），淡出之前 | 通知 |
| `WAVE_START` | `(Board, int waveIndex, int[] zombieTypes)` | 一波僵尸即将生成 | 返回 `true` 取消这一波 |
| `ZOMBIE_SPAWN` | `(Board, int zombieType, int row, boolean fromWave)` | 僵尸即将被放到棋盘上 | 返回 `true` 取消生成 |
| `ZOMBIE_DEATH` | `(Board, Zombie)` | 僵尸死亡（掉落已结算） | 通知 |
| `ZOMBIE_DAMAGE` | `(Board, Zombie, int amount, int damageFlags)` | 伤害即将结算到僵尸 | 值链：返回实际使用的伤害 |
| `PLANT_PLACED` | `(Board, Plant, int gridX, int gridY)` | 植物被放进格子 | 通知 |
| `PLANT_REMOVED` | `(Board, Plant, int cause)` | 植物被移除（被吃、被铲、爆炸……） | 通知 |
| `PLANT_DAMAGE` | `(Board, Plant, int amount)` | 伤害即将结算到植物 | 值链 |
| `SUN_COLLECTED` | `(Board, int amount, int source)` | 阳光（或金币面值）即将入账 | 值链 |
| `PLANTING_VALIDATED` | `(Board, int gridX, int gridY, int seedType, int reason)` | 种植校验结束 | 返回 `PLANTING_OK` 强制放行，返回其他 reason 否决 |
| `TICK` | `(Board, int tick)` | 一次游戏 tick（每秒 100 次），棋盘计数器前进之后 | 通知 |
| `PRE_DRAW` | `(Board, Graphics)` | 棋盘对象绘制之前 | 通知 |
| `POST_DRAW` | `(Board, Graphics)` | 棋盘对象绘制之后 | 通知 |

### `LawnEvents.TICK` 怎么用

`TICK` 是"每 tick 做一点自己的事"的入口，`pvz-content-mod` 用它做一件事：
**游戏每次眨眼都会新建一个 blink reanimation**，`onPlanted` 那次改色看不到它，所以 tick 里补一次：

```java
GameLifecycleEvents.INITIALIZED.register(RedPlantsArt::installArt);   // 游戏有 app 之后建一次
LawnEvents.TICK.register((board, tick) -> installArt());              // 还没建成的话每 tick 再问一次
```

它为什么必须幂等、为什么不能做重活：

- **每 tick 一次（每秒 100 次）**：别在里面遍历棋盘、分配对象或做图像处理。上面这两行只是
  "条件不满足就立刻返回"。
- **重放语义**：`installArt()` 可能被调用成千上万次，所以里面的每一步都必须是"已经做过就什么都不做"
  （`RedPlantsArt` 用 `aArt.frame == null` 这样的一次性判断）。
- **它不能救"没 tick 的时刻"**：选卡界面没有 tick（棋盘之前），所以种子包图标不走 tick，
  走 supplier（见 [资源与美术](./resources.md)）。

### 什么时候不该用事件

| 你想做的事 | 该用什么 |
| --- | --- |
| 观察/统计/统计型 HUD | `LawnEvents`（这一章） |
| 加植物、僵尸、资源 | 内容 API（[植物与僵尸](./content.md)、[资源与美术](./resources.md)） |
| **改写**游戏自己的动作（改一次伤害的算法、改一次种植的判定） | 该对象的覆盖/规则（`PlantOverrides`、`BoardOverrides`）或 [Mixin](./mixin.md) |
| 每秒 100 次的重活 | 先问"真的需要每 tick 吗"，要不要降频 |

事件是"通知/值链"的便利层：**它的返回值能改数值，但改不了游戏的流程**。要改流程就得在游戏的
决策点上插自己的实现，那条路是 Mixin 或游戏自己的钩子（下一节）。

## 3. 生命周期：`GameLifecycleEvents`

只有两个事件，每个进程各触发一次，顺序固定 `INITIALIZED` → `EXITING`：

| 事件 | 时机 |
| --- | --- |
| `GameLifecycleEvents.INITIALIZED` | 框架启动序列结尾：命令行已解析、资源目录已确定、`Init` 资源组（图片、音效、字体、reanimation）已加载、GL 接口已创建，即将进入主循环。**窗口与主菜单不一定已经显示** |
| `GameLifecycleEvents.EXITING` | 开始关闭、资源与窗口销毁之前。此时不要再假设还能绘制或播放声音 |

- `INITIALIZED` 是"需要应用实例才能做的事"的时机：`GameArt.packetArt` / `cachedPlantFrame`
  都要求游戏已经有一个运行中的 app，`pvz-content-mod` 就在这里开始建缓存帧。
- **注册时机很重要**：`INITIALIZED` 之后注册的监听器永远看不到本次 `INITIALIZED`，但能看到 `EXITING`。
- 两个事件都在主线程（窗口/渲染线程）上触发，监听器不能阻塞它。

## 4. 一条边界：什么时候要绕过 `api-events`

有些规则不是"观察"而是**改写游戏自己的方法**，例如"每被僵尸啃一口扣 8 点血而不是 4 点，并在这一口上
做两个变形"。这类规则**不适合**塞进 `PLANT_DAMAGE` 的值链里——那会把"数值"和"流程"混在一起，
读代码的人再也说不清哪一个才是权威。

处理办法有两条：

1. **看内容 API 有没有现成的接缝**：`PlantOverrides` / `ZombieOverrides` / `BoardOverrides` 里的每一项
   都是"游戏自己的值，直到模组设了一个"，改的就是游戏在某个决策点上的答案。
2. **没有接缝就自己写 Mixin**：直接实现游戏那个方法的钩子接口、或者用 `@Redirect` 改一次调用
   （[实验 Mixin](./mixin.md) 有完整例子）。这时"改写"这件事在代码里是显式的，而不是藏在事件监听器里。

`pvz-mod-95-edition` 就走在第 2 条上：它的啃咬规则与选卡改写是**游戏钩子的实现**，
而不是 `api-events` 的监听器——因为那两条规则要的是"替游戏回答"，不是"知道发生了什么"。

## 5. 模组查询与 API 自身的初始化

```java
ModQuery.isModLoaded("fabric-api");                  // 这个 id 的模组在不在
ModQuery.getModVersion("pvz-portable");              // Optional<String>
PvzFabricApi.getMods();                              // Loader 解析出的全部模组容器
PvzFabricApi.getModContainer("api-plant");           // Optional<ModContainer>
PvzFabricApi.isInitialized();                        // API 自己的 main 入口点跑过没有
PvzFabricApi.getEntrypoints("main", MyType.class);    // 收集别的模组的入口点
```

**入口点之间没有顺序保证**：Fabric Loader 对模组入口点的执行顺序不作承诺（线上按 id 排序，
开发环境里会故意打乱），所以不要写"等另一个模组的初始化解完再注册"的代码。需要"游戏已经起来"的语义时，
把它挂在 `GameLifecycleEvents.INITIALIZED` 上，而不是在 `onInitialize()` 里断言别人已经跑过。

下一章：[实例精读：pvz-content-mod](./content-mod.md)。
