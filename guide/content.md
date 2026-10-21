# 用 fabric-api：植物与僵尸

`fabric-api` 的内容注册是**纯 Java 方法调用**：builder 描述一个定义，`register()` 把它写进游戏的
定义表，你从 `seedType()` / `zombieType()` 拿到游戏使用的整型 id。模组侧没有反射、没有注解处理器、
没有生成代码。

- 植物：`cn.enaium.fabricpvz.api.plant`（Gradle 模块 / 模组 id `api-plant`）
- 僵尸：`cn.enaium.fabricpvz.api.zombie`（`api-zombie`）
- 只看别人的模组内容：`CustomPlantEvents` / `CustomZombieEvents`

## 0. 一次注册发生了什么

**两件事**，缺一不可：

1. **一行数据**。游戏按 id 索引的定义表是定容数组（`Plant.gPlantDefs` 宽 `SeedType.MAX_SEED_TYPES` = 200，
   `Zombie.gZombieDefs` 宽 `ZombieType.MAX_ZOMBIE_TYPES` = 100），下标就是 id，零售行在底部，
   上面全是 `null`（= 没人定义）。`register()` 分配第一个空闲 id（`PlantRegistry.FIRST_SEED_TYPE` = 100 /
   `ZombieRegistry.FIRST_ZOMBIE_TYPE` = 64 起）并把 `new PlantDefinition(...)` / `new ZombieDefinition(...)`
   写进那一行。之后游戏的每个读取入口（`Plant::getPlantDefinition`、种子包价格与充能、波次编排、
   资源预加载）都像对待零售内容一样对待它，因为表里就是有那一行。
2. **行为派发**。定义行放不下的部分（名字与提示、图鉴文案、种植/碰撞矩形、每 tick 回调、发射物、
   解锁门控、种子包贴图、僵尸属性与挂头）由 API 自带的 **Mixin** 注入游戏方法派发。对没注册的 id
   每个钩子都回答"不干预"，游戏因此走自己的原版代码路径——**装了 API 但没用它的进程，行为与未装一致**。

游戏本身没有任何模组概念、也没有注册表：这是为什么"注册内容"落在**一个 Builders + 一组注入点**上，
而不是一个游戏侧的 API。

## 1. 注册一株植物

```java
private static void registerRedPeashooter() {
    redPeashooter = PlantType.builder("red_peashooter")
            .name("Red Peashooter")
            .tooltip("Fires burning peas instead of plain ones.")
            .almanacDescription(RED_PEASHOOTER_ALMANAC_DESCRIPTION)
            .cost(RED_PEASHOOTER_COST)
            .refreshTime(RED_PEASHOOTER_REFRESH)
            .reanimation(ReanimationType.REANIM_PEASHOOTER)
            .subClass(PlantSubClass.SUBCLASS_SHOOTER)
            .launchRate(RED_PEASHOOTER_LAUNCH_RATE)
            .projectile(ProjectileType.PROJECTILE_FIREBALL)
            .unlockAfter(SeedType.SEED_SNOWPEA)
            .packetArt(() -> RedPlantsArt.packetImage("red_peashooter"))
            .onPlanted(RedPlantsArt::onPlanted)
            .onTick(RedPlantsArt::onTick)
            .register();
}
```

**在 `pvz-content-mod` 里的位置**：`src/main/java/cn/enaium/fabricpvz/contentmod/ContentMod.java`
的 `registerRedPeashooter()`（顺序与上面一致）；常量在同一个类的头部
（`PEASHOOTER_ID`、`RED_PEASHOOTER_COST = 175`、`RED_PEASHOOTER_REFRESH = 750`、
`RED_PEASHOOTER_LAUNCH_RATE = 150`、`RED_PEASHOOTER_ALMANAC_DESCRIPTION`）。

### `PlantType.Builder` 的全部字段

| 方法 | 作用 |
| --- | --- |
| `name(String)` | 种子包与提示里显示的名字（不走游戏字符串表） |
| `tooltip(String)` | 种子包提示（默认取 name） |
| `almanacDescription(String)` | 图鉴植物页卡片上的描述（默认取 tooltip，再空则回退游戏的 `[<KEY_STEM>_DESCRIPTION]`） |
| `stringKeyStem(String)` | 游戏字符串表的 key 词干（`"PEASHOOTER"` 对应 `[PEASHOOTER]`）；默认 id 大写 |
| `cost(int)` | 一张种子包的阳光价格 |
| `refreshTime(int)` | 种子包充能，单位**厘秒**（750 = 短，3000 = 长，其他 = 很长） |
| `reanimation(int)` | 绘制用的 `ReanimationType`；`REANIM_NONE` 表示静态植物 |
| `subClass(int)` | 上游能力族 `PlantSubClass`（`SUBCLASS_SHOOTER` 等） |
| `launchRate(int)` | 两次"发射"之间的 tick 数（豌豆射手 150） |
| `health(int)` | 最大生命值（默认 300） |
| `projectile(int)` | 开火时发射的 `ProjectileType`（火焰豌豆 `PROJECTILE_FIREBALL`）；`SUBCLASS_SHOOTER` 植物不写它会在开火时抛 "no projectile" |
| `burst(int)` | 一次发射打几发：`2` 或 `4`，**其他值抛 `IllegalArgumentException`**；不写就是单发（见下） |
| `unlockAfter(int)` | **玩家可用性的唯一答案**：`LawnApp::hasSeedType` 对该种子返回真才解锁；也决定选卡里出不出现与要不要预加载 |
| `packetArtFromReanimation()` | 种子包图取自植物自己的 reanimation（上游做法） |
| `packetArt(int imageId, int celIndex)` | 种子包图钉死在某个 `ImageID` + cel（图**是游戏资源表里的**且马上能拿到时用） |
| `packetArt(Supplier<Image>)` | 种子包图钉死在**运行时构建**的图上；每次画包问一次，返回 `null` 就交给游戏自己画（见 [资源与美术](./resources.md)） |
| `aquatic(boolean)` / `fungus(boolean)` / `nocturnal(boolean)` / `flying(boolean)` / `upgrade(boolean)` | 分别对应游戏的 `Plant::isAquatic` / `isFungus` / `isNocturnal` / `isFlying` / `isUpgrade` |
| `upgradeFrom(int...)` | 本种子能种在**哪些**植物上（把它们替换成自己） |
| `chooserVisible(boolean)` | 是否把种子交给玩家（默认 `true`） |
| `onTick(Consumer<Plant>)` | 每 tick 一次，在植物自身 update 之后 |
| `onPlanted(Consumer<Plant>)` | 刚被放到棋盘上（`Plant::plantInitialize` 返回时）。**读档时也会对棋盘上已有的每株再跑一次**，所以必须幂等 |
| `plantRect(Function<Plant, Rect>)` | 碰撞矩形；返回 `null` 保留上游矩形 |
| `plantAttackRect(BiFunction<Plant, Integer, Rect>)` | 攻击矩形；返回 `null` 保留上游矩形 |
| `plantingRule(PlantingRule)` | 该 seed type 专属的种植规则（由 `Board::canPlantAt` 询问）；返回 `PLANTING_OK` 放行，其他 `PlantingReason` 否决 |
| `register()` | 注册并返回 `PlantType` |

### 连发：`.burst(int)`

游戏把"一次发射打几发"**按零售种子硬编码**在三个方法里（`Plant::FindTargetAndFire` 的射击窗口与动画速率、
`Plant::UpdateShooter` 在 `mLaunchCounter == 25` 补的第二发、`Plant::UpdateShooting` 在 68/51/35/18
补的四发）。注册的种子落不到那些分支，默认只有单发——所以射击植物必须自己声明：

```java
redRepeater = PlantType.builder("red_repeater")
        .name("Red Repeater")
        .cost(225)
        .reanimation(ReanimationType.REANIM_REPEATER)
        .subClass(PlantSubClass.SUBCLASS_SHOOTER)
        .launchRate(150)
        .burst(2)   // 两发；不写就只有单发
        .projectile(ProjectileType.PROJECTILE_FIREBALL)
        .unlockAfter(SeedType.SEED_REPEATER)
        .register();
```

`burst(2)` / `burst(4)` 让 API 用孪生种子的同一套数字复现，而且**只在真的开火时**才覆盖窗口
（没找到目标的植物不该被动计时器）。`pvz-content-mod` 的三株分别是 1（不写）/ 2 / 4。

### 升级种植：`.upgradeFrom(int...)`

零售的升级植物能直接种在它升级的那株上（原株被替换、新株就地种下），判定只有一处
`Plant::isUpgradableTo`，而它内部是一串按零售种子硬编码的对——注册种子一律返回 false。
`.upgradeFrom(...)` 就是这串硬编码对的对偶：

```java
redGatling = PlantType.builder("red_gatling")
        .burst(4)
        .upgrade(true)                                            // 紫色（升级卡）种子包背景
        .upgradeFrom(SeedType.SEED_REPEATER, redRepeater.seedType())  // 能种在零售或红色双发射手上
        .register();
```

- 命中时 `Board::canPlantAt` 对该格返回 `PLANTING_OK`（鼠标下的格子变绿），种植执行路径先 `die()`
  掉原来那株再 `addPlant` 本株——**替换是游戏自己做的**，模组不写任何回调。
- **`upgrade` 与 `upgradeFrom` 是两件事**：`upgrade(true)` 只让 `Plant::isUpgrade` 为真（紫卡背景）；
  `upgradeFrom` 才是"能种在哪些植物上"。两者可以各自单独写。

### `PlantOverrides`：覆盖**已有**植物的数值

`PlantType` 是"加一株新植物"，`PlantOverrides` 是"改掉一株植物已有的数值"——**零售种子一样能改**，
这正是平衡性改版（"95 版"那种）要的能力：它改的是游戏里的一串初始化常量与定义表常量，不是内容。

```java
PlantOverrides.of(SeedType.SEED_MARIGOLD).cost(75).refreshTime(1500);
PlantOverrides.of(SeedType.SEED_SPIKEROCK).bodyHealth(16200);
PlantOverrides.of(SeedType.SEED_POTATOMINE).spawnCountdown(1000).explosionBlast(115, 1, true);
PlantOverrides.of(SeedType.SEED_TALLNUT).crushProof(true);        // 免疫碾压
PlantOverrides.notOnGroundState(PlantState.STATE_SCAREDYSHROOM_SCARED);  // 整局规则
PlantOverrides.extraFireSeedType(SeedType.SEED_GATLINGPEA);       // 整局规则
```

| 方法 | 作用 | 生效时机 |
| --- | --- | --- |
| `PlantOverrides.of(int seedType)` | 取（首次用时创建）该种子的覆盖副柄；按 id 查表，常数时间，幂等 | — |
| `#cost(int)` / `#refreshTime(int)` / `#launchRate(int)` | 价格 / 充能 / 发射间隔 | **立即**写进 `Plant.gPlantDefs[seed]` |
| `#bodyHealth(int)` | 出生血量（同时写最大值） | `Plant::plantInitialize` 返回时（模块的 Mixin） |
| `#spawnCountdown(int)` | 出生时的状态计数（单位 10ms） | 同上 |
| `#biteInsteadOfEatZombieType(int)` / `#digestCountdown(int)` | 大嘴花"只咬不吞"的类型 / 咀嚼计数 | `Plant::updateChomper` 的读取点 |
| `#spikeRockDamage(int, int, int)` | 地刺王每击伤害与两道裂纹阈值 | `Plant::spikeRockTakeDamage` 的三处常量 |
| `#explosionBlast(int radius, int rowRange, boolean burn)` | 爆炸的半径/行范围/是否点火 | `Plant::doSpecial` 那次调用 |
| `#producedCoins(int common, int rare, int rarePercent)` | 产币植物的两枚币与稀有比例 | `Plant::updateProductionPlant` |
| `#crushProof(boolean)` | 免疫碾压（巨人砸、车压都是反弹而不是压扁） | `Zombie::updateZombieGargantuar` / `squishAllInSquare` |
| `PlantOverrides.notOnGroundState(int)`（整局规则） | 让 `Plant::notOnGround` 按"`mState` == 该值"回答 | `Plant::notOnGround` |
| `PlantOverrides.extraFireSeedType(int)`（整局规则） | `Plant::updateShooter` 在 `mLaunchCounter == 50` 额外开火的那个种子 | `Plant::updateShooter` |
| `registered()` / `rules()` / `reset()` | 诊断快照 / 整局规则快照 / 清空并把定义表写回原值 | — |

三条必须记住的：

1. **定义表字段是"表写入"，要在游戏读表之前发生**。模组入口点（`ModInitializer`）在游戏主类之前跑，
   所以"在入口点里调用"就是安全的时序。游戏每次用这些数都重新读表，晚写只是"晚生效"，不会写坏。
2. **出生血量是"每株"的**：注入点在 `Plant::plantInitialize` 的返回点，游戏自己的分支
   （按种子的 switch、Big Time 翻倍、把当前血量复制成最大值）都跑完之后才轮到覆盖。读档不会重放出生血量。
3. **与注册的优先级**：同一个字段两边都写时**覆盖赢**（注册是类型的"底"，覆盖是模组的"最后一句"）。

### `ProjectileOverrides`：覆盖抛射物伤害

抛射物伤害不是"每发对象上的字段"，而是 `Projectile.gProjectileDefinition` 这张按 `ProjectileType`
索引的表里的 `mDamage`；游戏**在命中时**才读它。所以这也是一次表写入，**不需要任何 Mixin**：

```java
ProjectileOverrides.of(ProjectileType.PROJECTILE_STAR).damage(40);
ProjectileOverrides.of(ProjectileType.PROJECTILE_SPIKE).damage(1);
```

### `BoardOverrides`：关卡、波次与全局数值

改的是**关卡**那一层：某个模式允许哪些僵尸、某僵尸能不能在某关出现、棋盘上那几个全局常数
（阳光面值、存款上限、掉币、波数……）。前一类是立即写进 `Challenge.gZombieAllowedLevels`；
后一类是**登记值**，由模块的 Mixin 在游戏的读取点交给它，**默认值就是游戏自己的值**。

```java
BoardOverrides.allowZombies(GameMode.GAMEMODE_CHALLENGE_SPEED,
        ZombieType.ZOMBIE_FOOTBALL, ZombieType.ZOMBIE_JACK_IN_THE_BOX);
BoardOverrides.relaxZombieSpawnRules(true);
BoardOverrides.sunValues(50, 25, 75);          // 普通 / 小 / 大阳光面值
BoardOverrides.sunMoneyCap(20000);             // 存款上限（游戏里是 9990）
BoardOverrides.numWaves(40, 50);               // 游戏自己那条分支给 40 波时改成 50 波
```

`registered()` / `reset()` 与上面两个覆盖类同形；完整方法表见 [API 速查](./reference.md)。

## 2. 注册一个僵尸

::: tip 这段代码的出处
示例模组里目前**没有**注册新僵尸的，所以下面这段取自 `api-zombie` 自己的用法说明，并与 1.2.5 的版本包
（游戏 jar 与 `cn.enaium.fabricpvz:fabric-api:1.2.2`）一起以 `javac --release 25` 编译通过。真正的"改僵尸"
用法是 `pvz-mod-95-edition` 的 `ZombieOverrides`（见下），它改的是零售僵尸的出生数值。
:::

```java
public static final ZombieType PORTER = ZombieType.builder("porter_zombie")
        .name("Porter Zombie")
        .bodyReanimation(ReanimationType.REANIM_ZOMBIE)
        .health(400)
        .helm(HelmType.HELMTYPE_PAIL, 1100)
        .attackRect(new Rect(50, 0, 40, 115))
        .scale(0.92f)
        .wave(3, 1, 1, 2000)
        .onSpawned(zombie -> zombie.mHelmHealth = PORTER_HELM_HEALTH)
        .register();
```

### `ZombieType.Builder` 的字段

| 方法 | 作用 |
| --- | --- |
| `name(String)` / `stringKeyStem(String)` | 名字 / 字符串表 key 词干（默认 id 大写） |
| `almanacDescription(String)` | 图鉴僵尸页卡片上的描述 |
| `bodyReanimation(int)` / `headReanimation(int)` | 身体（与头）的 `ReanimationType`；`headReanimation` 是"额外挂一个 reanimation 当头"（豌豆头僵尸那种做法） |
| `headTrack` / `headBodyTrack` / `headHiddenTrack` / `headHiddenLayer` / `headTransform(x, y, rotate, scale)` | 覆盖挂头的默认轨道与位移 |
| `health(int)` | 身体血量（普通僵尸 270） |
| `helm(int helmType, int helmHealth)` / `shield(int shieldType, int shieldHealth)` / `flyingHealth(int)` | 头盔、盾牌、飞行配件血量（`0` = 不会飞） |
| `collider(Rect)` / `attackRect(Rect)` | 碰撞矩形 / 啃食矩形；`null` 保留普通僵尸的 |
| `scale(float)` | 渲染缩放 |
| `canGoInPool(boolean)` | 能否走进泳池行 |
| `wave(int points, int startingLevel, int firstAllowedWave, int pickWeight)` | 参与波次编排：消耗点数 / 最早出现的冒险关卡 / 最早的波 / 权重。**权重非零就是"会出波"** |
| `pickWeight(int)` / `startingLevel(int)` / `points(int)` | 只设置上面某一项 |
| `onTick(Consumer<Zombie>)` | 每 tick 一次，在僵尸自身 update 之后 |
| `onSpawned(Consumer<Zombie>)` | 初始化结束（可能还没上棋盘）。**读档时也会对已有的每个再跑一次**，必须幂等 |
| `register()` | 注册并返回 `ZombieType` |

在回调里直接读写僵尸字段即可，例如"走路时把铁桶重新拧上"（两个常量就是上面 `helm(...)` 的 1100 与这个模组自己的修理周期）：

```java
/** The pail's own health and the repair cadence this mod's zombie uses. */
private static final int PORTER_HELM_HEALTH = 1100;
private static final int PORTER_HELM_REPAIR_TICKS = 200;

/** One zombie tick: bolt the pail back on while the zombie is walking. */
private static void tickPorter(Zombie theZombie) {
    boolean aCanRepair = theZombie.mHelmType == HelmType.HELMTYPE_PAIL
            && !theZombie.mIsEating
            && theZombie.mHelmHealth > 0
            && theZombie.mHelmHealth < PORTER_HELM_HEALTH
            && theZombie.mZombieAge % PORTER_HELM_REPAIR_TICKS == 0;
    if (!aCanRepair) {
        return;
    }

    theZombie.mHelmHealth++;
}
```

`ZombieRegistry.spawn(board, zombieType, row, fromWave)` 走的是游戏自己的波次生成同一条路径
（`Board::addZombieInRow`），`ZombieRegistry.WAVE_UI` 是"不属于任何波次"的常量。

### `ZombieOverrides`：覆盖**已有**僵尸（零售类型也算）

```java
ZombieOverrides.of(ZombieType.ZOMBIE_DOOR).spawnsAs(ZombieType.ZOMBIE_PAIL);
ZombieOverrides.of(ZombieType.ZOMBIE_FLAG)
        .bodyHealth(820)
        .helm(HelmType.HELMTYPE_PAIL, 1100)
        .bodyAnimation("anim_bucket");
ZombieOverrides.mindControlBoost(200, 200, 1.25f);       // 整局规则：被魅惑时的加成
ZombieOverrides.burnImmunity(1800, ZombiePhase.PHASE_NEWSPAPER_READING);   // 整局规则：灰烬判据
ZombieOverrides.shieldAlwaysAbsorbs(true);               // 整局规则：伤害一律先过盾
```

| 方法 | 作用 | 生效时机 |
| --- | --- | --- |
| `ZombieOverrides.of(int zombieType)` | 取该类型的覆盖副柄 | — |
| `#bodyHealth(int)` / `#helm(int, int)` / `#shieldHealth(int)` / `#phaseCounter(int)` | 出生血量 / 头盔 / 盾牌血量 / 阶段计数 | `Zombie::zombieInitialize` 的返回点 |
| `#spawnsAs(int)` | 出生时换成另一个类型 | 初始化**最开头**改掉类型参数，此后整段初始化按新类型跑 |
| `#bodyAnimation(String)` | 出生后显示该名字的身体动画（走游戏的 `ReanimShowPrefix`） | 初始化结束时 |
| `#mindControlBodyHealth(int)` | 该类型被魅惑后的固定本体血量 | `Zombie::startMindControlled` |
| `ZombieOverrides.mindControlBoost(int, int, float)` | 被魅惑时的本体/头盔加成与缩放 | 同上 |
| `ZombieOverrides.burnImmunity(int totalHealth, int... immunePhases)` | 灰烬/窝瓜的免疫判据改成"本体+头盔+盾牌 ≥ 阈值"，并给出无条件豁免的阶段 | `Zombie::applyBurn` |
| `ZombieOverrides.coldRemovalChilledCounter(int)` | `Zombie::removeColdEffects` 改写冰冻计数 | 同上 |
| `ZombieOverrides.shieldAlwaysAbsorbs(boolean)` | 伤害一律先过 `takeShieldDamage` | `Zombie::takeDamage` |
| `registered()` / `rules()` / `reset()` | 诊断 / 整局规则 / 清空 | — |

与注册的优先级同样是"注册是底，覆盖是最后一句"。`spawnsAs` 是唯一在初始化**开头**生效的字段：
替换之后，之后所有读 `mZombieType` 的行为分支都按新类型跑，等价于游戏自己生成了那个类型。

## 3. 只看别人的模组内容：`CustomPlantEvents` / `CustomZombieEvents`

`PlantType.Builder#onTick` 只作用于**你自己注册的那个植物**。想让全局逻辑（HUD、统计、成就）
看到"某个模组植物被放下 / 每 tick 一次"，用这两个全局事件：

| 事件 | 时机 |
| --- | --- |
| `CustomPlantEvents.TICK` | 注册植物的一个 tick（植物自身 update 之后） |
| `CustomPlantEvents.PLACED` | 注册植物被放到棋盘（已在格子里、血量已应用） |
| `CustomZombieEvents.TICK` | 注册僵尸的一个 tick |
| `CustomZombieEvents.SPAWNED` | 注册僵尸初始化结束（属性与 reanimation 已应用，可能还没上棋盘） |

它们只对**注册过的** seed type / zombie type 触发（按定义表里那一行是否存在判断），
零售植物与僵尸永远不会走到模组代码路径。任何僵尸（模组僵尸也算）的受伤与死亡请用
[事件与生命周期](./events.md) 里的 `LawnEvents.ZOMBIE_DAMAGE` / `ZOMBIE_DEATH`。

## 4. 几个必须知道的坑

1. **种子包贴图不要自己画**：图是 50×70（`SEED_PACKET_WIDTH` × `SEED_PACKET_HEIGHT`，按 1:1 画在
   种子包原点）。正确做法是让**游戏自己**把零售孪生种子的选卡图画进一张空白图
   （`GameArt.packetArt(seedType)`），再改色。手写一个 reanim 渲染器去"临摹"零售画法很容易画错。
   图从哪里来决定用哪个方法，见 [资源与美术](./resources.md)。
2. **`onPlanted` / `onSpawned` 会在读档时重放**：`Board::loadGame` 成功后会对象棋上已有的每株/每个
   再跑一次，所以回调必须幂等（不要在里面"再加一个"东西）。
3. **解锁门控只有 `LawnApp::hasSeedType` 一个答案**：`unlockAfter(...)` 指定的种子在玩家手里，
   你的种子才算"拿到"。它同时决定选卡里出不出现与要不要预加载资源。
4. **名字与提示不走游戏字符串表**：想用游戏的字符串表（多语言）就写 `stringKeyStem(...)`，
   再在**你自己模组的** `src/main/resources/i18n/<语言>.json` 里给出这些键的译文——i18n 支持会收集
   每个已加载模组自己 jar 里的这份表，所以你的文字跟着你的 jar 走，不写进别人的表里。
5. **`register()` 之后才是内容**：从 `register()` 返回起，种子包、图鉴、`Board::canPlantAt`、
   `Board::addPlant`、选卡界面与 `Plant::fire` 都像对待内置植物一样对待它。

下一章：[资源与美术](./resources.md)。
