# Mixin experiments: rewriting the game without its source

Mixin lets you rewrite the bytecode of the game's classes without touching the game's source. The Mixin
here is **not a home-grown implementation**: it is **Sponge Mixin**, which ships with Fabric Loader
(`net.fabricmc:sponge-mixin`, together with Loader 0.19.5), so `@Mixin` / `@Inject` / `@At` behave exactly
as they do in Minecraft mods.

Three properties of this workspace shape how you write it:

1. **There is no obfuscation mapping.** Class, method and field names are the names in the source, so a
   target is written directly as `"startLevel()V"` or `"randRangeInt(II)I"` — **no refmap**.
2. **The game's classes must be defined by the loader's class loader.** The game provider unlocks that
   path, which is what makes Mixin able to rewrite game classes at all (nothing for you to do; it holds
   as soon as you build with the toolchain).
3. **The class files are Java 25**, so a mixin config's `compatibilityLevel` must be `JAVA_25`.

## 1. A complete, copyable example

The mod is called `sun-tuning` and does three things: it logs once per level start, changes the delay
before the first sky sun of a level, and raises the sun bank cap from 9990 to 999990. Four files (plus the
build script and `fabric.mod.json` from the previous chapters).

::: tip The versions this page is written against
The example below compiles with JDK 25 against the game jar of the 1.2.5 version package
(`javac --release 25 -Xlint:all`); its three injection points are `Board.startLevel()V`, the
`PvzpCommon.randRangeInt(II)I` call inside `Board.initLevel()V`, and the `sipush 9990` inside
`Board.addSunMoney(I)V` of that jar.
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

### `src/main/resources/fabric.mod.json` (excerpt)

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

A mixin class only injects; **the mod's own state** lives in an ordinary class next to it, so that "did
the injection run" is diagnosable and a test can assert on it.

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

`@Accessor` goes into an **interface** mixin: Mixin adds that interface to the target class and generates
the bridge implementation, which is how a field the game does not expose (here the private
`LawnApp.mMessageBoxDialogId`) becomes readable.

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

Usage (once you have hold of a `LawnApp`):

```java
LawnApp app = ...;
int dialogId = ((LawnAppAccessor) (Object) app).suntuning$messageBoxDialogId();
```

### Building and running

```bash
cd sun-tuning
./gradlew build          # compile + tests
./gradlew runClient      # the real loader starts the game; this mod is discovered on the class path
```

## 2. Choosing a target

With no obfuscation, "choosing a target" means "read the game's source, find that method or field, and
write down its name and descriptor":

| What you want to change | How the target is written | Example |
| --- | --- | --- |
| A method | `"name(parameterDescriptors)returnDescriptor"` | `"startLevel()V"`, `"addSunMoney(I)V"`, `"canTakeSunMoney(I)Z"` |
| A field | its name plus `@Shadow` / `@Accessor` | `private int mSunMoney;`, `@Accessor("mMessageBoxDialogId")` |
| A call inside a method | `@At(value = "INVOKE", target = "L<class>;<method><descriptor>")` | `Lcn/enaium/fabricpvz/portable/pvzp/PvzpCommon;randRangeInt(II)I` |
| A constant | `@ModifyConstant` with `@Constant(intValue = …)` | the `9990` inside `Board::addSunMoney` |

The practical way to look a descriptor up: `javap` on the jar in the distribution — it *is* the bytecode
you are changing:

```bash
javap -p -cp build/pvz/dist/PvZ-Portable-1.2.5/PvZ-Portable-1.2.5.jar \
      cn.enaium.fabricpvz.portable.lawn.Board | grep -E "startLevel|addSunMoney"

javap -c -cp build/pvz/dist/PvZ-Portable-1.2.5/PvZ-Portable-1.2.5.jar \
      cn.enaium.fabricpvz.portable.lawn.Board | sed -n '/public void addSunMoney/,/^$/p'
```

Two rules of thumb when picking a target: **prefer stable methods** (level initialisation, damage
resolution, the draw entry points — the game's trunk rather than a helper a later version may rename), and
**prefer observing over rewriting** (an `@Inject` at `HEAD` that logs a line is nearly free of side
effects; `@Redirect` and `@ModifyConstant` replace the game's own behaviour, so they must stay byte-for-byte
equivalent when your mod is not enabled).

## 3. Configuration: `*.mixins.json`

The config file goes into `src/main/resources/` and is listed in the `mixins` array of `fabric.mod.json`.
The loader registers these configs with the Mixin subsystem **before any game class is loaded**, so the
entry point has nothing to do here.

| Field | Meaning |
| --- | --- |
| `package` | The package the mixin classes live in; the `mixins` array names classes **relative to it** |
| `compatibilityLevel` | Fixed to `JAVA_25` here (the game's class files are Java 25) |
| `mixins` | The general mixin list (a desktop game has no client/server split) |
| `injectors.defaultRequire` | How many hits every injection point requires by default (`1` = the target method or injection point must exist) |
| `minVersion` | The minimum Mixin version needed; `"0.8"` is the usual value |
| `required` | `true`: a config that fails to load aborts start-up |

`required: true` is the recommended default: when the game renames something or changes a signature, you
find out loudly at start-up instead of silently losing a feature. `required: false` is for injections that
are genuinely optional enhancements — the price is that nobody notices when they stop working. The API's own
`api-resource` chose `true`, because re-installing mod images is what that module *is*.

## 4. Injectors and the `require` semantics

### `@Inject`

```java
@Inject(method = "startLevel()V", at = @At("HEAD"))
private void suntuning$onLevelStart(CallbackInfo ci) { … }
```

| `@At` | Where it injects |
| --- | --- |
| `"HEAD"` | The start of the method body |
| `"RETURN"` | Before **every** return (the return value is still returned) |
| `"TAIL"` | The last instruction of the body (only the final return point) |
| `"INVOKE"` / `"FIELD"` / `"NEW"` | A chosen call site / field access / constructor, with `target = "…"`; `shift = At.Shift.AFTER` to land after it |

- Handler signature: the target method's parameters in order, and **last** the callback info — `CallbackInfo`
  for a `void` target, `CallbackInfoReturnable<T>` when the target returns something.
- **A static target method takes a static handler; an instance target takes an instance handler.** Getting
  this wrong is an `Invalid descriptor` or "injection point not found" error at start-up.
- Only `cancellable = true` allows `ci.cancel()` to skip the whole target method, and a
  `CallbackInfoReturnable` can replace the return value with `cir.setReturnValue(...)`.

### `@Redirect`

Replaces **one call** inside the target method (a method call, a field read/write, a constructor). The
handler takes the replaced call's arguments and returns the replaced call's return type:

```java
@Redirect(method = "initLevel()V",
        at = @At(value = "INVOKE",
                target = "Lcn/enaium/fabricpvz/portable/pvzp/PvzpCommon;randRangeInt(II)I"))
private int suntuning$firstSunDelay(int theMin, int theMax) { … }
```

It is far more surgical than rewriting a method: the rest of the body (branches, other calls, logging) is
still the game's own. The price is that you have to be sure nothing else depends on that call.

### `@ModifyConstant`

Rewrites a literal constant in a method body (`@Constant` knows `intValue`, `floatValue`, `stringValue`
and friends):

```java
@ModifyConstant(method = "addSunMoney(I)V", constant = @Constant(intValue = 9990))
private int suntuning$sunCap(int theCap) { … }
```

Two notes:

- **`intValue` only matches constants compiled into the bytecode.** When a number comes from a static
  field it is a `getstatic` in the bytecode and you need `@Redirect`, not `@ModifyConstant`.
- When the same constant value appears several times in a method, `@ModifyConstant` hits **all** of them
  unless you narrow it with `ordinal`. That is exactly where `require` earns its keep (see below).

### `@Accessor` / `@Invoker`

`@Accessor` generates field reads and writes, `@Invoker` generates method calls; both go into an
**interface** mixin, and the code then casts the target instance to that interface:

```java
@Mixin(Board.class)
public interface BoardAccessor {

    @Accessor("mSunMoney")
    int example$getSun();

    @Accessor("mSunMoney")
    void example$setSun(int value);
}
```

An accessor for a *static* field needs a static method, and a Java interface cannot declare an abstract
static method, so **static members are reached through `@Shadow` in a class mixin** (or through a static
method the target class exposes itself).

### `@Shadow`

`@Shadow` declares "the target class has this member"; Mixin rewrites the references to it inside the mixin
body into references to the target's member:

```java
@Mixin(Board.class)
public final class BoardMixin {

    @Shadow
    private int mSunMoney;   // this field does not exist on the mixin class; it points at Board.mSunMoney
}
```

- A field shadow is a **declaration** only — never give it an initialiser. Instance members are accessed
  from instance methods, static ones from static methods.
- When the target is `final`, adding `@Final` is more accurate (omitting it is not an error, just one
  fewer check).

### `require` / `expect`

Every injection point can carry `require`: **how many times this injection must hit**. The default comes
from the config's `injectors.defaultRequire`.

```java
// Spelled out as require = 1: this constant must exist in that bytecode, or start-up fails.
@ModifyConstant(method = "addSunMoney(I)V", constant = @Constant(intValue = 9990), require = 1)
```

| Form | Meaning |
| --- | --- |
| `require = 1` (the default) | Must hit at least once; **a miss fails at start-up** — the mechanism that tells you "the game changed its implementation" immediately |
| `require = 0` | Zero hits is fine ("change it if it is there"); use it only for genuinely optional enhancements |
| `require = 2` | Must hit twice (e.g. the same constant appears twice and both must change) |
| `expect = 2` | Expects two hits but only **warns** when it is wrong, without aborting start-up (diagnostics) |
| `injectors.defaultRequire: 0` (in the config) | Makes the whole config "optional" by default, then `require = 1` on the injection points that must exist |

`require = 0` carries the same risk as `required: false`: silent failure. So "is this injection the feature
itself" decides how you write it.

## 5. Debugging

| Symptom | Check |
| --- | --- |
| `Mixin apply failed` / `Injection failure` at start-up | Is the target class name and method descriptor actually what you wrote (no obfuscation — copy it from the source); does `require` match how many times it really hits |
| `Invalid descriptor` / injection point not found | A `void` target takes `CallbackInfo`, a value-returning one takes `CallbackInfoReturnable<T>`, and it is the handler's last parameter |
| The mixin quietly does nothing | Is the config `required: false` or the injector `require = 0`; is the config listed in `fabric.mod.json`'s `mixins`; did it end up in the jar (`unzip -l build/libs/*.jar`) |
| You want Mixin's own log | Turn on Mixin's verbose logging: `./gradlew runClient -Dmixin.debug.verbose=true` (add `-Dmixin.debug.export=true` to dump the transformed classes to disk and compare them) |
| You want to prove the transform happened | Set a flag or bump a counter on your own class inside the handler and watch it in a log line or a test — never "it looks right" |

**"Did the injection run" has to be diagnosable.** The `SunTuning.levelsStarted` counter above exists for
that. A failed mixin reports an error, but a mixin that was never applied (`require = 0`, config not listed,
jar missing the file) reports nothing, so an end-to-end test needs a counter that separates "did not work"
from "never ran".

## 6. Common pitfalls

| Pitfall | Explanation |
| --- | --- |
| The target signature | The descriptor must match character for character (`"startLevel()V"`, not `"startLevel"`). **Check it with `javap` against the distribution's jar**, never from memory |
| Obfuscation | There is **no** mapping and no refmap here: you write the source name. Conversely, a refmap copied from a Minecraft mod is meaningless here |
| Static vs instance | A static target takes a static handler, an instance target an instance handler; only an instance handler may use `this` |
| The type of `this` | A mixin class is not the target class, so to use `this` as the target type you must cast: `Board self = (Board) (Object) this;` |
| `@Shadow` visibility | A shadow is safest when it is no more visible than the target (the workspace's example shadows a `public` field as `private`); **never** shadow a `static final` field with a compile-time constant initialiser and expect to read the runtime value — javac inlines constants |
| Constants vs fields | `@ModifyConstant` matches only literals in the bytecode; a value that comes from a static field needs `@Redirect` |
| Side effects of an injection point | `@Redirect` / `@ModifyConstant` really do replace the game's behaviour. Never lose the original on the "I am not enabled" path — `if (!SunTuning.enabled) return PvzpCommon.randRangeInt(theMin, theMax);` in the example is exactly that |
| Per-tick injection points | Do not do heavy work in `Board::update`, `LawnEvents.TICK` and the like |
| Rewriting game classes when adding behaviour would do | Anything the [events](./events.md) or the API's seams can express should not be a rewritten game method: an API hook guarantees "byte-for-byte equivalent when nobody uses it", a hand-written method rewrite does not |

## 7. Verifying a behaviour change

Ordered from cheap to expensive, "smallest credible evidence" first:

1. **The start-up log**: `./gradlew runClient` and look for whether the target was injected and what your
   own counter or log line says.
2. **A diagnostic counter plus a unit or end-to-end test**: turn "the injection ran" into assertable state
   the way `SunTuning.levelsStarted` / `sunDropsRewritten` do. The workspace's `pvz-example-mod` does
   exactly this — its `LawnCommonMixin` sets a static flag and a test asserts the bytecode transform ran.
3. **An end-to-end test on the real loader**: put the built jar into a temporary `mods/` directory, start
   the real `net.fabricmc.loader.impl.launch.knot.KnotClient` in a second JVM with the game's main class
   replaced by a test harness, and assert on the report file it writes. `pvz-content-mod`'s end-to-end test
   does this (see [Building, testing, publishing](./build.md)). It is expensive, and it is the only
   verification that proves "this holds in an installation".
4. **Verify behaviour, not appearance**: a number change asserts on that number (read the game's own
   definition table or field), a drawing change asserts on pixels, a state machine change asserts on the
   state. "It looks right" is not evidence.

## 8. Why mixins are written in Java

A mod's own code may be Kotlin, but **mixin classes are always Java** (`src/main/java/.../mixin/`). The
reason is Mixin's mechanism, not the toolchain: its annotations are read by Mixin's own processor, and
`@Shadow` and friends rely on the Java bytecode rule "a member reference inside the mixin class is rewritten
to the target class". Kotlin's generated property accessors, covariant returns and inline functions make
that rule hard to reason about; four mods and a dozen mixin classes are all Java precisely so that nothing
has to be gambled on it.

When a Java mixin needs to reach Kotlin code, it goes through the Kotlin companion instance (for example
`SpeedMod.Companion.controlsOf(board)`) or a `@JvmStatic` method on the Kotlin side — either way, keep one
entry point rather than two.
