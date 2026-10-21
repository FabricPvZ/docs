# 实验 Mixin：不改源码地改写游戏

Mixin 让你在不碰游戏源码的前提下改写游戏类的字节码。这里的 Mixin **不是自研实现**：它是 Fabric Loader
自带的 **Sponge Mixin**（随 Loader 0.19.5 一起，`net.fabricmc:sponge-mixin`），所以
`@Mixin` / `@Inject` / `@At` 的语义与 Minecraft 模组完全一致。

这个移植版的三个前提决定了写法：

1. **没有混淆映射**：游戏类名、方法名、字段名就是源码里的名字，目标直接写 `"startLevel()V"`、
   `"randRangeInt(II)I"` 这种描述符，**不需要 refmap**。
2. **游戏类必须由 Loader 的类加载器定义**：game provider 解锁了游戏类的类加载路径，这正是 Mixin
   能改写游戏类的前提（你不需要做任何事，用工具链构建就成立）。
3. **class 文件是 Java 25**：Mixin 配置里的 `compatibilityLevel` 必须是 `JAVA_25`。

## 1. 一个完整可复制的例子

这个模组叫 `sun-tuning`，做三件事：关卡开始时记一次日志、改掉开局第一次掉阳光的等待区间、
把阳光存款上限从 9990 抬到 999990。四份文件（外加前面章节里的构建脚本与 `fabric.mod.json`）。

::: tip 本页代码对应的版本
下面的例子用 JDK 25 对着 1.2.5 版本包的游戏 jar 编译通过
（`javac --release 25 -Xlint:all`）；例子里的三个注入点分别是该 jar 中的
`Board.startLevel()V`、`Board.initLevel()V` 里的 `PvzpCommon.randRangeInt(II)I` 调用，
以及 `Board.addSunMoney(I)V` 里的 `sipush 9990`。
:::

### `src/main/resources/suntuning.mixins.json`

```json
{
  "required": true,
  "minVersion": "0.8",
  "package": "com.example.suntuning.mixin",
  "compatibilityLevel": "JAVA_25",
  "mixins": [
    "BoardMixin",
    "LawnAppAccessor"
  ],
  "injectors": {
    "defaultRequire": 1
  }
}
```

### `src/main/resources/fabric.mod.json`（片段）

```json
  "entrypoints": {
    "main": [
      "com.example.suntuning.SunTuning"
    ]
  },
  "mixins": [
    "suntuning.mixins.json"
  ],
  "depends": {
    "java": ">=25",
    "fabricloader": ">=0.19.0",
    "pvz-portable": "*"
  }
```

### `src/main/java/com/example/suntuning/SunTuning.java`

Mixin 类只做注入，**模组自己的状态**放在旁边这个普通类里：这样"注入跑过没有"可以诊断，
测试也能断言。

```java
package com.example.suntuning;

import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Entry point of the example mod: it owns the switch and the counters the mixins write. */
public final class SunTuning implements ModInitializer {

    public static final String MOD_ID = "sun-tuning";

    private static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    /** Whether this mod interferes at all; {@code false} leaves every target on the game's own path. */
    public static boolean enabled = true;

    /** Counters the mixins bump, so a test can tell "the mixin ran" from "the mixin was never applied". */
    public static int levelsStarted;
    public static int sunDropsRewritten;
    public static int lastObservedSun;

    @Override
    public void onInitialize() {
        LOGGER.info("Sun tuning loaded");
    }
}
```

### `src/main/java/com/example/suntuning/mixin/BoardMixin.java`

```java
package com.example.suntuning.mixin;

import cn.enaium.fabricpvz.portable.lawn.Board;
import cn.enaium.fabricpvz.portable.pvzp.PvzpCommon;
import com.example.suntuning.SunTuning;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Constant;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyConstant;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Three injections into {@link Board}: a notification, a call rewrite and a constant rewrite. */
@Mixin(Board.class)
public final class BoardMixin {

    /** Declares that the target class has this field; the mixin class itself does not. */
    @Shadow
    private int mSunMoney;

    /** {@code @Inject} at the head of {@code Board::startLevel} (upstream {@code Board.cpp:1620}). */
    @Inject(method = "startLevel()V", at = @At("HEAD"))
    private void suntuning$onLevelStart(CallbackInfo ci) {
        SunTuning.levelsStarted++;
        SunTuning.lastObservedSun = this.mSunMoney;
    }

    /**
     * {@code @Redirect} replaces one call inside {@code Board::initLevel}: the first sky-sun delay,
     * which the game rolls as {@code PvzpCommon.randRangeInt(425, 700)}.
     */
    @Redirect(method = "initLevel()V",
            at = @At(value = "INVOKE",
                    target = "Lcn/enaium/fabricpvz/portable/pvzp/PvzpCommon;randRangeInt(II)I"))
    private int suntuning$firstSunDelay(int theMin, int theMax) {
        if (!SunTuning.enabled) {
            return PvzpCommon.randRangeInt(theMin, theMax);
        }

        SunTuning.sunDropsRewritten++;
        return PvzpCommon.randRangeInt(theMin, theMin + 100);
    }

    /** {@code @ModifyConstant} rewrites the {@code 9990} cap in {@code Board::addSunMoney}. */
    @ModifyConstant(method = "addSunMoney(I)V", constant = @Constant(intValue = 9990))
    private int suntuning$sunCap(int theCap) {
        return SunTuning.enabled ? 999_990 : theCap;
    }
}
```

### `src/main/java/com/example/suntuning/mixin/LawnAppAccessor.java`

`@Accessor` 写在一个**接口** mixin 里：Mixin 把这个接口加到目标类上，并生成桥接实现，
于是游戏没暴露的字段也能读（这里是私有的 `LawnApp.mMessageBoxDialogId`）。

```java
package com.example.suntuning.mixin;

import cn.enaium.fabricpvz.portable.lawn.LawnApp;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** Reads a field of {@link LawnApp} that the game does not expose. */
@Mixin(LawnApp.class)
public interface LawnAppAccessor {

    @Accessor("mMessageBoxDialogId")
    int suntuning$messageBoxDialogId();
}
```

用法（`LawnApp` 的引用在手边时才用得上）：

```java
LawnApp app = ...;
int dialogId = ((LawnAppAccessor) (Object) app).suntuning$messageBoxDialogId();
```

### 构建与运行

```bash
cd sun-tuning
./gradlew build          # 编译 + 测试
./gradlew runClient      # 真 Loader 启动游戏，本模组从类路径被发现
```

## 2. 怎么选目标

没有混淆，所以"选目标"就是"读游戏源码，找到那个方法/字段"，然后写下它的名字与描述符：

| 你想改的东西 | 目标怎么写 | 例子 |
| --- | --- | --- |
| 某个方法 | `"名字(参数描述符)返回描述符"` | `"startLevel()V"`、`"addSunMoney(I)V"`、`"canTakeSunMoney(I)Z"` |
| 某个字段 | 字段名 + `@Shadow` / `@Accessor` | `private int mSunMoney;`、`@Accessor("mMessageBoxDialogId")` |
| 某个方法里的调用 | `@At(value = "INVOKE", target = "L<类>;<方法><描述符>")` | `Lcn/enaium/fabricpvz/portable/pvzp/PvzpCommon;randRangeInt(II)I` |
| 某个常量 | `@ModifyConstant` + `@Constant(intValue = …)` | `Board::addSunMoney` 里的 `9990` |

查描述符的实用办法：对发行包里的 jar 用 `javap`（在线包解开后就是那个 jar，`build/pvz/dist/` 下与清单同名的那份，等于你要改的字节码）：

```bash
javap -p -cp build/pvz/dist/PvZ-Portable-1.2.5/PvZ-Portable-1.2.5.jar \
      cn.enaium.fabricpvz.portable.lawn.Board | grep -E "startLevel|addSunMoney"

javap -c -cp build/pvz/dist/PvZ-Portable-1.2.5/PvZ-Portable-1.2.5.jar \
      cn.enaium.fabricpvz.portable.lawn.Board | sed -n '/public void addSunMoney/,/^$/p'
```

挑目标的两条经验：**优先挑稳定的方法**（关卡初始化、伤害结算、绘制入口这类游戏主干，而不是
某个版本可能重命名的辅助方法），**优先只观察、少改写**（`@Inject` 到 `HEAD` 记日志几乎不会踩到副作用；
`@Redirect`/`@ModifyConstant` 会替换游戏自己的行为，必须保证"不启用时逐字节等价"）。

## 3. 配置：`*.mixins.json`

配置文件放 `src/main/resources/`，并在 `fabric.mod.json` 的 `mixins` 数组里列出来。Loader 在
**加载任何游戏类之前**把这些配置注册给 Mixin 子系统，所以入口点里不需要做任何事。

| 字段 | 含义 |
| --- | --- |
| `package` | mixin 类所在的包；`mixins` 数组里写的是**相对这个包**的类名 |
| `compatibilityLevel` | 这个移植版固定 `JAVA_25`（游戏类是 Java 25 字节码） |
| `mixins` | 通用 mixin 列表（桌面游戏没有 client/server 之分，写这里就行） |
| `injectors.defaultRequire` | 每个注入点默认要求命中几次（`1` = 目标方法/注入点必须存在） |
| `minVersion` | 需要的 Mixin 版本下限，`"0.8"` 是常规值 |
| `required` | `true`：这个配置加载失败就中止启动 |

`required: true` 是**推荐默认**：游戏改名/改签名时在启动时响亮失败，而不是静默失去功能。
`required: false` 只在"这个注入只是锦上添花的增强"时用——代价是装不上也不会有人知道。
API 自己的 `api-resource` 选了 `true`，因为重装模组贴图就是这个模块的职责本身。

## 4. 注入器与 `require` 语义

### `@Inject`

```java
@Inject(method = "startLevel()V", at = @At("HEAD"))
private void suntuning$onLevelStart(CallbackInfo ci) { … }
```

| `@At` | 注入位置 |
| --- | --- |
| `"HEAD"` | 方法体开头 |
| `"RETURN"` | **每一个** return 之前（返回值照常返回） |
| `"TAIL"` | 方法体的最后一条指令（只覆盖最后一个返回点） |
| `"INVOKE"` / `"FIELD"` / `"NEW"` | 指定调用点 / 字段访问 / 对象构造，配 `target = "…"`，可加 `shift = At.Shift.AFTER` |

- 回调签名：目标方法的参数按原顺序在前，**最后**一个是回调信息参数——目标是 `void` 用 `CallbackInfo`，
  有返回值用 `CallbackInfoReturnable<T>`。
- **静态目标方法配静态回调，实例目标方法配实例回调**（这条写错就是在启动时报
  `Invalid descriptor` / 找不到注入点）。
- `cancellable = true` 才能 `ci.cancel()` 掉整个目标方法；`CallbackInfoReturnable` 可以用
  `cir.setReturnValue(...)` 直接改返回值。

### `@Redirect`

替换目标方法里的**一次调用**（方法调用 / 字段读写 / 对象构造）。处理器的参数与被替换的调用一致，
返回值类型与被替换调用的返回值一致：

```java
@Redirect(method = "initLevel()V",
        at = @At(value = "INVOKE",
                target = "Lcn/enaium/fabricpvz/portable/pvzp/PvzpCommon;randRangeInt(II)I"))
private int suntuning$firstSunDelay(int theMin, int theMax) { … }
```

它比"重写整个方法"精细得多：方法体的其余部分（分支、别的调用、日志）都还是游戏自己的。
代价是"你得知道那次调用的语义没有别处依赖"。

### `@ModifyConstant`

改掉方法体里的一个字面常量（`@Constant` 的知识点：`intValue` / `floatValue` / `stringValue` 等）：

```java
@ModifyConstant(method = "addSunMoney(I)V", constant = @Constant(intValue = 9990))
private int suntuning$sunCap(int theCap) { … }
```

两点注意：

- **`intValue` 只匹配"编译进字节码的常量"**。如果某个数字来自静态字段，那它在字节码里是
  `getstatic`，要用 `@Redirect` 而不是 `@ModifyConstant`。
- 同一个常量值在方法里出现多次时，`@ModifyConstant` 会命中**每一处**（除非用 `ordinal` 限定）。
  这正是 `require` 该派上用场的地方（见下）。

### `@Accessor` / `@Invoker`

`@Accessor` 生成字段读写，`@Invoker` 生成方法调用；写在**接口** mixin 上，然后在代码里把目标实例
转成那个接口：

```java
@Mixin(Board.class)
public interface BoardAccessor {

    @Accessor("mSunMoney")
    int example$getSun();

    @Accessor("mSunMoney")
    void example$setSun(int value);
}
```

静态字段的 accessor 需要静态方法，而 Java 接口不能声明"抽象静态方法"，所以**静态成员的访问要走
普通类 mixin 里的 `@Shadow`**（或由目标类自己暴露的静态方法）。

### `@Shadow`

`@Shadow` 声明"目标类里有这么一个成员"，Mixin 会把 mixin 方法体里对它的引用改写成对目标类成员的引用：

```java
@Mixin(Board.class)
public final class BoardMixin {

    @Shadow
    private int mSunMoney;   // mixin 类上不存在这个字段，它指向 Board.mSunMoney
}
```

- 字段 shadow 只做**声明**，不要赋初值；实例成员用实例方法访问，静态成员用静态方法访问。
- 目标是 `final` 时加 `@Final` 更准确（不加也不会错，只是少了一层检查）。

### `require` / `expect`

每个注入点都可以写 `require`：**这个注入必须命中几次**。默认值取配置里的 `injectors.defaultRequire`。

```java
// 写成显式的 require = 1：这个常量必须在这份字节码里存在，否则启动就报错。
@ModifyConstant(method = "addSunMoney(I)V", constant = @Constant(intValue = 9990), require = 1)
```

| 写法 | 含义 |
| --- | --- |
| `require = 1`（默认） | 必须恰好命中至少 1 次；**没命中就在启动时失败**——这是"游戏改了实现，你立刻知道"的机制 |
| `require = 0` | 命中 0 次也放行（"有就改，没有就算了"）；只在增强可选时用 |
| `require = 2` | 必须命中 2 次（例如同一个常量出现两次都要改） |
| `expect = 2` | 期望 2 次，但**只在不符时警告**，不中止启动（诊断用） |
| `injectors.defaultRequire: 0`（配置里） | 把整个配置的默认值调成"可选"，然后逐个注入点写 `require = 1` 挑出必须存在的那些 |

`require = 0` 的风险与 `required: false` 一样：静默失效。所以"这个注入是不是功能本身"决定了怎么写。

## 5. 调试与排查

| 症状 | 检查 |
| --- | --- |
| 启动报 `Mixin apply failed` / `Injection failure` | 目标类名与方法描述符是否与实际一致（无混淆，直接照源码写）；`require` 与实际命中次数是否符合 |
| 报 `Invalid descriptor` / 找不到回调 | 目标 `void` 用 `CallbackInfo`，有返回值用 `CallbackInfoReturnable<T>`；它是回调的最后一个参数 |
| Mixin 静默没生效 | 配置是不是 `required: false` 或 `require = 0`；`fabric.mod.json` 的 `mixins` 里有没有列这个配置文件；jar 里到底有没有打进去（`unzip -l build/libs/*.jar`） |
| 想看 Mixin 自己的日志 | 用系统属性打开 Mixin 的详细日志：`./gradlew runClient -Dmixin.debug.verbose=true`（需要时再加 `-Dmixin.debug.export=true`，把改写后的类导出到磁盘上对比） |
| 想确认变换真的发生了 | 在回调里置一个自己类里的标志/计数器，然后在日志或测试里看它——不要靠"看起来对了" |

**"注入跑过没有"必须可诊断**：上面的 `SunTuning.levelsStarted` 就是这个用途。Mixin 失败会报错，
但"没装"（`require = 0`、配置没列、jar 里没打进去）不会报错，所以端到端测试里要有能区分
"没生效"与"没跑过"的计数。

## 6. 常见坑

| 坑 | 说明 |
| --- | --- |
| 目标方法签名 | 描述符必须逐字符一致（`"startLevel()V"` 而不是 `"startLevel"`）。**用 `javap` 对着发行包的 jar 核对**，不要凭猜 |
| 混淆 | 这个移植版**没有**混淆映射，也不生成 refmap：写的就是源码名。反之，从 Minecraft 模组抄来的 refmap 写法在这里没有意义 |
| 静态 vs 实例 | 静态目标配静态回调，实例目标配实例回调；`@Inject` 的处理器是实例方法时才允许用 `this` |
| `this` 的类型 | mixin 类不是目标类，想把 `this` 当目标类型用要显式转换：`Board self = (Board) (Object) this;` |
| `@Shadow` 的可见性 | shadow 的可见性不比目标更宽才最安全（示例里的写法是把 `public` 字段 shadow 成 `private`）；**不要** shadow 一个带编译期常量初值的 `static final` 字段并期望读到运行时值——javac 会把常量内联 |
| 常量 vs 字段 | `@ModifyConstant` 只匹配字节码里的字面常量；来自静态字段的值要 `@Redirect` |
| 注入点的副作用 | `@Redirect` / `@ModifyConstant` 是真的替换游戏行为。别在"我没启用"的路径上漏掉原实现——例子里的 `if (!SunTuning.enabled) return PvzpCommon.randRangeInt(theMin, theMax);` 就是这条 |
| 每 tick 的注入点 | `Board::update`、`LawnEvents.TICK` 这类每 tick / 每帧的入口里别做重活 |
| 改游戏类而不是加行为 | 能用 [事件与生命周期](./events.md) 或 API 的注入点解决的事，不要用 Mixin 重写游戏方法：API 的钩子保证"没人用时逐字节等价"，自己写的方法重写不保证 |

## 7. 改了游戏行为之后怎么验证

按"最小可信证据"排，从便宜到贵：

1. **启动日志**：`./gradlew runClient`，看目标是"注入了"还是"没注入"，以及你自己的计数/日志行。
2. **诊断计数 + 单元/端到端测试**：像上面的 `SunTuning.levelsStarted` / `sunDropsRewritten` 那样把
   "注入跑过"变成可断言的状态；`pvz-example-mod` 就是这么做的——它的
   `LawnCommonMixin` 把一个静态标志置位，测试据此断言字节码变换跑过。
3. **真 Loader 的端到端测试**：把模组 jar 放进一个临时 `mods/` 目录，在第二个 JVM 里用真正的
   `net.fabricmc.loader.impl.launch.knot.KnotClient` 启动，让游戏主类被换成测试的 harness，
   断言写完的结果文件。`pvz-content-mod` 的端到端测试就是这样做的（见
   [构建、测试与发布](./build.md)）。这条贵，但它是唯一能证明"安装形态下真的成立"的验证。
4. **行为验证而不是外观验证**：改数值就断言那个数值（读游戏自己的定义表/字段），改绘制就断言像素，
   改状态机就断言状态。不要用"看起来对了"当证据。

## 8. 为什么 Mixin 用 Java 写

模组主体可以是 Kotlin，但 **Mixin 类一律 Java**（放 `src/main/java/.../mixin/`）。
原因不在工具链，而在 Mixin 本身的机制：它的注解由 Mixin 自己的处理器读，`@Shadow` 等语义依赖
"把 mixin 类里的成员引用改写到目标类"这套 Java 字节码规则。Kotlin 生成属性访问器、协变返回、
内联函数会让这套规则难以推理；四个模组、十几个 mixin 类全部用 Java 写，就是为了不在这上面赌。

Java Mixin 要访问 Kotlin 主体时，走 Kotlin 的伴生实例（例如 `SpeedMod.Companion.controlsOf(board)`），
或者让 Kotlin 侧暴露一个 `@JvmStatic` 方法——两种都只是"一条入口"，别两边都留。
