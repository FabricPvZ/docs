# Content with fabric-api: events and lifecycle

The `api-events` module provides two families of events: `cn.enaium.fabricpvz.api.lawn.LawnEvents`
(in-game events) and `cn.enaium.fabricpvz.api.lifecycle.GameLifecycleEvents` (process lifecycle). This is
where a mod **observes** the game. The events are fired by the game's own hook call sites, and the bridge is
installed by the module's `main` entry point (`ApiEventsInitializer`) before the game starts, so all you do
is `register`.

**Use it when** you want to know that something happened (a plant was placed, a zombie died, sun was
collected, a level ended).
**Do not use it when** you want to **rewrite** what the game itself does — that is Mixin's or a lower-level
seam's job (section 4 of this chapter).

## 1. The event bus: `Event<T>` and `EventFactory`

The events are **the same shape and names** as Fabric API's `Event<T>` / `EventFactory` — write it the Fabric
way and you are right:

```java
public interface Event<T> {

    /** Registers a listener. Listeners are called in registration order. */
    void register(T listener);

    /** Returns the invoker built from the listeners registered so far. */
    T invoker();
}
```

The semantics (each of them covered by tests):

| Semantics | Meaning |
| --- | --- |
| Registration-order dispatch | Listeners are called in registration order; registering the same object twice registers it twice |
| Snapshot dispatch | `invoker()` returns the invoker built from the listeners registered when it was read; a listener that registers another during a dispatch only affects the next `invoker()` |
| Pass-through when empty | With no listeners the invoker is the factory applied to an empty array, so **a game nobody listens to behaves exactly as before** |
| Value chaining | A value-returning event is a pipeline: each listener receives the previous one's value and returns the one the next sees |
| Boolean OR | Cancellable (boolean-returning) events are OR-ed: any listener returning `true` cancels |
| Exceptions are not swallowed | A failing listener is re-thrown wrapped in a `ListenerException` that names the event and the listener |

Fabric API's phase API (`addPhase` / `addPhaseOrdering`) is **not implemented**, and nothing here needs it.

## 2. `LawnEvents`: the gameplay event table

```java
LawnEvents.SUN_COLLECTED.register((board, amount, source) -> {
    collected++;
    return amount * 2;      // value chaining: what the next listener and the game use
});

LawnEvents.PLANT_PLACED.register((board, plant, gridX, gridY) -> plantsPlaced++);
LawnEvents.LEVEL_START.register((board, level, gameMode, background) -> levelStarts++);
```

| Event | Listener signature | When | Semantics |
| --- | --- | --- | --- |
| `LEVEL_START` | `(Board, int level, int gameMode, int background)` | Level initialisation finished, the board is built | Notification |
| `LEVEL_END` | `(Board, int result)` | The level ended (win or loss), before the fade-out | Notification |
| `WAVE_START` | `(Board, int waveIndex, int[] zombieTypes)` | A wave is about to spawn | Return `true` to cancel the wave |
| `ZOMBIE_SPAWN` | `(Board, int zombieType, int row, boolean fromWave)` | A zombie is about to be placed on the board | Return `true` to cancel the spawn |
| `ZOMBIE_DEATH` | `(Board, Zombie)` | A zombie died (loot already settled) | Notification |
| `ZOMBIE_DAMAGE` | `(Board, Zombie, int amount, int damageFlags)` | Damage is about to be applied to a zombie | Value chain: return the damage actually used |
| `PLANT_PLACED` | `(Board, Plant, int gridX, int gridY)` | A plant was placed in a square | Notification |
| `PLANT_REMOVED` | `(Board, Plant, int cause)` | A plant was removed (eaten, shovelled, blown up…), `cause` being the game's reason code | Notification |
| `PLANT_DAMAGE` | `(Board, Plant, int amount)` | Damage is about to be applied to a plant | Value chain |
| `SUN_COLLECTED` | `(Board, int amount, int source)` | Sun (or a coin value) is about to be credited | Value chain |
| `PLANTING_VALIDATED` | `(Board, int gridX, int gridY, int seedType, int reason)` | Planting validation finished | Return `PLANTING_OK` to force it through, any other reason to veto |
| `TICK` | `(Board, int tick)` | One game tick (100 per second), after the board counter advanced | Notification |
| `PRE_DRAW` | `(Board, Graphics)` | Before the board's objects are drawn | Notification |
| `POST_DRAW` | `(Board, Graphics)` | After the board's objects were drawn | Notification |

### How `LawnEvents.TICK` is used

`TICK` is the entry point for "do a little of my own work every tick". `pvz-content-mod` uses it for exactly
one thing: **the game creates a new blink reanimation on every blink**, so the recolouring done when the
plant was placed never sees it, and the tick hook re-applies it:

```java
GameLifecycleEvents.INITIALIZED.register(RedPlantsArt::installArt);   // build once the game has an app
LawnEvents.TICK.register((board, tick) -> installArt());              // ask again each tick until it can be built
```

Why it must be idempotent and must not do heavy work:

- **Once per tick (100 times a second)**: do not walk the board, allocate objects or process images in
  there. Those two lines are "return immediately unless something still has to be built".
- **Replayed semantics**: `installArt()` may be called thousands of times, so every step inside has to be
  "do nothing once it is done" (in `RedPlantsArt` that is a one-shot test such as `aArt.frame == null`).
- **It cannot help where no tick runs**: the seed chooser runs no ticks (it happens before a board), so the
  packet icons do not go through a tick hook — they go through the supplier (see
  [Resources and art](./resources.md)).

### When not to use events

| What you want | What to use |
| --- | --- |
| Observing, counting, a statistics HUD | `LawnEvents` (this chapter) |
| Adding plants, zombies, resources | The content API ([Plants and zombies](./content.md), [Resources and art](./resources.md)) |
| **Rewriting** what the game does (changing how damage is computed, how a planting decision is made) | The object's overrides and rules (`PlantOverrides`, `BoardOverrides`) or [Mixin](./mixin.md) |
| Work that would run 100 times a second | First ask whether it really needs every tick, and whether a counter can lower the rate |

Events are the convenience layer for notifications and value chains: **their return values can change
numbers, but not the game's flow**. Changing flow means plugging your own implementation into a point where
the game makes a decision — that road is Mixin or the game's own hooks (next section).

## 3. Lifecycle: `GameLifecycleEvents`

There are two events, each fired once per process, in the order `INITIALIZED` then `EXITING`:

| Event | When |
| --- | --- |
| `GameLifecycleEvents.INITIALIZED` | The end of the framework's start-up sequence: the command line is parsed, the resource directory resolved, the `Init` resource group (images, sounds, fonts, reanimation definitions) loaded and the GL interface created, and the main loop is about to start. **The window and the main menu are not necessarily displayed yet** |
| `GameLifecycleEvents.EXITING` | Shutdown is beginning, before resources and the window are torn down. Do not assume drawing or sound still works |

- `INITIALIZED` is the moment for anything that needs a running application instance: `GameArt.packetArt` /
  `cachedPlantFrame` require the game to have an app, and `pvz-content-mod` starts building cached frames
  there.
- **Timing of the registration matters**: a listener registered after `INITIALIZED` fired will never see it,
  but will see `EXITING`.
- Both fire on the main (window/render) thread, so listeners must not block it.

## 4. One boundary: when to go around `api-events`

Some rules are not observations but **rewrites of the game's own method**, for example "a zombie's bite takes
8 health instead of 4, and performs two transformations on that bite". Such a rule does **not** belong in
the `PLANT_DAMAGE` value chain: that mixes "a number" with "flow", and nobody reading the code can tell
which one is authoritative any more.

There are two answers:

1. **Check whether the content API already has the seam**: every item of `PlantOverrides` / `ZombieOverrides`
   / `BoardOverrides` is "the game's own value until a mod sets one", and changes the game's answer at the
   decision point where it matters.
2. **Write a Mixin when there is no seam**: implement the game's own hook interface, or `@Redirect` a single
   call ([Mixin experiments](./mixin.md) has a complete example). Then the rewriting is explicit in the
   code instead of hiding inside an event listener.

The workspace's `pvz-mod-95-edition` takes the second road: its bite rule and its seed-packet rewrite are
**implementations of the game's hooks**, not `api-events` listeners — because those two rules want to
*answer for the game*, not to know that something happened.

## 5. Mod queries and the API's own initialisation

```java
ModQuery.isModLoaded("fabric-api");                  // is a mod with this id there
ModQuery.getModVersion("pvz-portable");              // Optional<String>
PvzFabricApi.getMods();                              // every mod container the loader resolved
PvzFabricApi.getModContainer("api-plant");           // Optional<ModContainer>
PvzFabricApi.isInitialized();                        // has the API's own main entry point run
PvzFabricApi.getEntrypoints("main", MyType.class);    // collect other mods' entry points
```

**There is no ordering guarantee between entry points**: Fabric Loader makes no promise about the order in
which mod entry points run (it sorts mods by id in production and deliberately shuffles them in a
development environment), so never write code that assumes another mod has initialised. When you need "the
game is up", hang it on `GameLifecycleEvents.INITIALIZED` rather than asserting it inside `onInitialize()`.

Next chapter: [Walkthrough: pvz-content-mod](./content-mod.md).
