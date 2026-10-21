# 构建、测试与发布

## 1. 日常命令

全部在模组工程目录下执行：

| 命令 | 作用 |
| --- | --- |
| `./gradlew build` | 编译 + 跑测试；产物 `build/libs/<mod>-<version>.jar` |
| `./gradlew test` | 只跑测试 |
| `./gradlew runClient` | 用真 Fabric Loader 启动游戏（开发运行：本模组从类路径被发现，不拷任何东西） |
| `./gradlew pvzDist` | 取得游戏版本包并解包到 `build/pvz/dist`（游戏 jar 与旁边的 JSON 清单就是类路径） |
| `./gradlew publishToMavenLocal` | 把模组 jar 发布到 `mavenLocal`（别的工程想依赖你时用） |
| `./gradlew clean` | 清掉 `build/` |

`build` 的产物是一个**只装你自己的东西**的 jar：类、资源、（可选）Mixin 配置。
游戏、Loader、Mixin、ASM 由工具链以 `compileOnly` 提供，API、Kotlin stdlib 之类由你自己声明，
**一个字节都不打进去**——它们来自玩家的安装；重复打包是 bug（工具链的 jar 任务把重复当失败）。

## 2. 单元测试能测什么

能测的：**纯数据与纯逻辑**。例如"我的植物注册了多少钱""覆盖表里写了什么""这个色相映射把
绿变成了红"——这些不需要 Loader，也不需要游戏在跑。

不太能测的：**"装了之后游戏里真的成立"**。因为模组的关键行为发生在 Loader 解析、入口点执行、
Mixin 应用之后，而这套环境在普通的 JUnit 进程里不存在。这就是端到端测试存在的原因。

## 3. 端到端测试：真 Loader + 真资源 + 报告文件

`pvz-content-mod` 与 `pvz-mod-95-edition` 都写了这种测试。它的形状是固定的：

1. **打包**：`./gradlew test` 依赖 `jar`（工具链把 jar 的绝对路径放进测试 fork 的系统属性
   `pvz.test.modJar`），测试把这个 jar 复制进一个临时 `mods/` 目录。JUnit 本身由模组声明
   （`testImplementation` 的 `junit-bom` + `junit-jupiter`，`testRuntimeOnly` 的
   `junit-platform-launcher`）；工具链只配置 JUnit Platform 这个约定。
2. **启动第二个 JVM**：主类是 Loader 自己的 `net.fabricmc.loader.impl.launch.knot.KnotClient`，
   类路径来自 `pvz.test.forkClasspath`（版本包的 jar + 你声明在测试类路径上的 API / 语言模块），
   **故意不含被测模组自己的输出**：模组只能从 `mods/` 来，和玩家的安装一样。
3. **把游戏主类换成 harness**：`-Dpvz.game.mainClass=<your.test.GameMain>`，
   于是游戏起来之后执行的是你的测试主类而不是真的窗口循环。
4. **让 harness 与游戏看到同一份类**：`-Dpvz.extraClasspath=<测试类目录>`，
   provider 把这些目录加进 Loader 自己的类加载器——否则断言会读到**第二份**静态状态
   （Loader 定义了自己的一份游戏类），这是这种测试最容易踩的坑。
5. **报告文件**：harness 把观察到的每个事实写进 `-Dpvz.test.report=<文件>`，测试读完再断言。
   报告是必须的：跨越 JVM 边界拿不到内存里的状态，而 class loader 的隔离又让"读静态字段"不可靠。
6. **资源**：可选的零售资源目录用 `-Dpvz.test.resources=<dir>` 传进去；没有资源时，
   需要资源的断言用跳过（而不是失败）——**这样测试在没装游戏的机器上也是绿的**。

`pvz-content-mod` 的启动命令（`ContentModEndToEndTest#launch`）长这样：

```java
command.add(java);
command.add("--enable-native-access=ALL-UNNAMED");
command.add("-XstartOnFirstThread");                       // macOS：SDL 需要首线程
command.add("-cp");
command.add(forkClasspath());                              // pvz.test.forkClasspath
command.add("-Dpvz.extraClasspath=" + harnessDirectory());  // harness 与游戏/模组同一个类加载器
command.add("-Dfabric.development=true");                   // 类路径上的模组（API 模块）也被发现
command.add("-Dfabric.skipMcProvider=true");
command.add("-Dfabric.noGui=true");                         // 崩溃就退出，不开 Swing 错误窗
command.add("-Dpvz.gameDir=" + runDir);
command.add("-Dfabric.modsFolder=" + mods);                 // 被测模组只能来自这里
command.add("-Dpvz.game.mainClass=cn.enaium.fabricpvz.contentmod.test.ContentModGameMain");
command.add("-Dpvz.test.report=" + report);
command.add(LAUNCHER_CLASS);                                // net.fabricmc.loader.impl.launch.knot.KnotClient
command.add("-savedir");
command.add(runDir.resolve("userdata").toString());
```

那些断言应该长什么样（按价值排序）：

1. **注册是否真的进了游戏的定义表**：`Plant.getPlantDefinition(seedType)` 报出你写的价格、
   充能、发射间隔、reanimation、子类与连发数。
2. **门控/解锁**：`LawnApp.hasSeedType(...)` 在"没解锁"与"解锁后"两个状态下的答案。
3. **界面里出没出现**：图鉴第二页、选卡第二页（模组内容在零售网格之后的一页）。
4. **行为**：在无头棋盘上种一株、打一个僵尸，断言发射的是哪一种抛射物、一次发射几发。
5. **像素**：图标的尺寸、与孪生种子包图在掩码上一致、红像素数——**需要真资源**，没有就跳过。

这类测试跑得慢（要起一个新 JVM、真 Loader、有时还要加载零售资源），但它是唯一能证明
"安装形态下成立"的验证。**改模组行为时优先扩这个测试，而不是只加日志。**

## 4. 发布

### 给别人本地用：`publishToMavenLocal`

```bash
./gradlew publishToMavenLocal
```

把 `cn.enaium.fabricpvz:<your-mod>:<version>` 发布到 `~/.m2/repository`，
别的工程就能 `dependencies { modImplementation(...) }` 式地依赖它（`PvZ-Portable` 的
端到端测试就是拿 mavenLocal 里的模组 jar 用的）。POM 元数据（MIT 许可等）由工具链的约定提供。

### 给玩家：把 jar 放进 `mods/`

```
<game directory>/
├── mods/
│   ├── my-mod-1.0.0.jar
│   └── fabric-api-1.2.2.jar      # 可选：你用了 API 才需要；API 只有这一个 jar
└── userdata/
```

- 玩家要有**你的 `fabric.mod.json` 里声明的每一个依赖**。少一个 Loader 会拒绝启动并说清缺谁。
- 版本范围写 `"pvz-portable": "*"` 这类"版本无关"的约束，游戏升版就不用重发模组。
- 需要存档兼容时，别在 `onPlanted` / `onSpawned` 里做"每株只做一次"的假设（读档会重放），
  也别把模组状态塞进游戏的存档格式里——那不是你的字段。

### 发布前自查

| 检查 | 为什么 |
| --- | --- |
| `./gradlew build` 绿 | 测试是唯一的回归网 |
| jar 里只有自己的东西（`unzip -l build/libs/*.jar`） | 打包了 Loader/API 就会与玩家的安装冲突 |
| `fabric.mod.json` 的 `depends` 与 `version` 与实际一致 | 玩家侧解析依赖就靠它 |
| `mixins` 配置文件名与 jar 里的路径一致 | 打错名字 = Mixin 静默不生效（除非 `required: true` 会报错） |
| 在**发行包形态**下手动装一次并启动 | `runClient` 与安装形态的差别（类路径 vs `mods/`）只有这一步能确认 |

## 5. 排错入口

| 现象 | 先看 |
| --- | --- |
| 游戏起不来、报缺依赖 | 启动日志的 Loader 错误信息（feeding mods list）：谁缺、谁被禁用 |
| 模组没出现在列表里 | jar 在不在 `mods/`；`fabric.mod.json` 的 `id` 是否合法 |
| 入口点没跑 | 日志里的异常；入口点类是否 `public` 且有**无参构造** |
| Mixin 没生效 | [实验 Mixin](./mixin.md) 的排查表（`required`、`require`、jar 里有没有配置文件） |
| 内容没出现 | 是不是在入口点里注册的（注册要在游戏读表之前）；`unlockAfter` 的种子玩家拿到了吗 |
| 资源每次加载就丢 | 运行时建出来的图不要塞进游戏资源 id，走 `packetArt(Supplier)` |

下一章：[API 速查](./reference.md)。
