# Reference: API quick tables

One page of lookups: a class, one sentence, its key methods. For the semantics (where every injection point
is, when a hook does not interfere), go to the files listed under
[Where to read the real implementations](#where-to-read-the-real-implementations).

## Coordinates and modules

| Module / mod id | Coordinate | Contents |
| --- | --- | --- |
| `fabric-api` (aggregate) | `cn.enaium.fabricpvz:fabric-api:1.2.2` | No code; depending on this coordinate brings the five modules, and the aggregate jar carries them **inside itself** (jar-in-jar), so an installation has one file |
| `api-base` | via the aggregate | `PvzFabricApi`, `ModQuery`, the event bus (`api.event`) |
| `api-events` | via the aggregate | `LawnEvents` (gameplay), `GameLifecycleEvents` (lifecycle) and the two bridges |
| `api-plant` | via the aggregate | `PlantType`, `PlantRegistry`, `PlantOverrides`, `ProjectileOverrides`, `BoardOverrides`, `CustomPlantEvents`, `PlantRules`, `PlantHooks` |
| `api-resource` | via the aggregate | `ModImages`, `ModImageSlot`, `GameArt`, `ModReanims`, `ResourceOverrides`, `ResourceDiagnostics` |
| `api-zombie` | via the aggregate | `ZombieType`, `ZombieRegistry`, `ZombieOverrides`, `CustomZombieEvents`, `ZombieHooks` |

The API is an **optional dependency**: when the sources use it, the mod declares
`cn.enaium.fabricpvz:fabric-api:1.2.2` itself (`compileOnly` / `testCompileOnly` for compilation,
`testImplementation` / `pvzRunClasspath` with `isTransitive = false` for runtime), and lists the module ids
(or `"fabric-api"`) in its `fabric.mod.json`'s `depends`. A mod that does not use the API declares no
coordinate at all. The toolchain neither supplies the API nor picks its version.

## `api-base`

| Class / method | Description |
| --- | --- |
| `PvzFabricApi.MOD_ID` / `.BASE_MOD_ID` / `.VERSION` | `"fabric-api"` / `"api-base"` / the API version |
| `PvzFabricApi.isInitialized()` / `.getVersion()` | Whether the API's own `main` entry point ran / its version |
| `PvzFabricApi.getMods()` / `.getModContainer(id)` / `.getEntrypoints(key, type)` | Wrappers around loader queries |
| `ModQuery.isModLoaded(id)` / `.getModContainer(id)` / `.getModVersion(id)` | Lightweight loader queries |
| `Event<T>#register(listener)` / `#invoker()` | Registration and the current invoker (Fabric's shape) |
| `EventFactory.createArrayBacked(type, invokerFactory)` | Creates an array-backed event; the only factory here |
| `ListenerException` | A failing listener's exception, wrapped with the event and listener context |

## `api-events`

| Class / member | Description |
| --- | --- |
| `LawnEvents.LEVEL_START` | `(Board, int level, int gameMode, int background)`: level initialisation finished |
| `LawnEvents.LEVEL_END` | `(Board, int result)`: the level ended (win/loss) |
| `LawnEvents.WAVE_START` | `(Board, int waveIndex, int[] zombieTypes)`: a wave is about to spawn; `true` cancels it |
| `LawnEvents.ZOMBIE_SPAWN` | `(Board, int zombieType, int row, boolean fromWave)`: `true` cancels the spawn |
| `LawnEvents.ZOMBIE_DEATH` / `.ZOMBIE_DAMAGE` | Death notification / damage value chain |
| `LawnEvents.PLANT_PLACED` / `.PLANT_REMOVED` / `.PLANT_DAMAGE` | Placement / removal (with a reason code) / damage value chain |
| `LawnEvents.SUN_COLLECTED` | `(Board, int amount, int source)`: the amount actually credited |
| `LawnEvents.PLANTING_VALIDATED` | `(Board, int x, int y, int seedType, int reason)`: return `PLANTING_OK` to force it through |
| `LawnEvents.TICK` | `(Board, int tick)`: every tick (100 per second) |
| `LawnEvents.PRE_DRAW` / `.POST_DRAW` | `(Board, Graphics)`: before / after the board's objects are drawn |
| `GameLifecycleEvents.INITIALIZED` | Once per process: start-up finished (assets loaded, main loop next) |
| `GameLifecycleEvents.EXITING` | Once per process: shutdown is beginning |
| `LawnHooksBridge` / `AppHooksBridge` | Wire the game's hook call sites to the event bus (installed by the module's entry point) |

## `api-plant`

| Class / method | Description |
| --- | --- |
| `PlantType.builder(String id)` → `Builder` → `register()` | Registers a new plant; `register()` returns the `PlantType` and `seedType()` is the game's integer id |
| Every `Builder` field | See the table in [Plants and zombies](./content.md): `name` / `tooltip` / `almanacDescription` / `stringKeyStem` / `cost` / `refreshTime` / `reanimation` / `subClass` / `launchRate` / `health` / `projectile` / `burst` / `unlockAfter` / `packetArt…` / `aquatic` / `fungus` / `nocturnal` / `flying` / `upgrade` / `upgradeFrom` / `chooserVisible` / `onTick` / `onPlanted` / `plantRect` / `plantAttackRect` / `plantingRule` |
| `PlantType#id()` / `#seedType()` / `#definition()` | Registration id / game id / the underlying `CustomPlantType` |
| `PlantRegistry.FIRST_SEED_TYPE` | The first id handed to registered content (`100`) |
| `PlantRegistry.get(int)` / `.get(String)` / `.all()` / `.count()` | Querying registered plants |
| `PlantRegistry.isCustomSeedType(int)` | Whether an id is inside the range reserved for registered content |
| `PlantRegistry.canPlantAt(board, x, y, seedType)` | Whether the game would allow the placement (mod rules included) |
| `PlantRegistry.place(board, x, y, seedType)` | Place a plant without a seed packet |
| `PlantRegistry.unregister(int)` / `.reset()` | Unregister / clear (tests) |
| `PlantOverrides.of(seedType)` → `PlantOverride` | Overriding an existing (retail included) plant's numbers: `cost` / `refreshTime` / `launchRate` / `bodyHealth` / `spawnCountdown` / `biteInsteadOfEatZombieType` / `digestCountdown` / `spikeRockDamage` / `explosionBlast` / `producedCoins` / `crushProof` |
| `PlantOverrides.notOnGroundState(int)` / `.extraFireSeedType(int)` | The two whole-game rules |
| `PlantOverrides.registered()` / `.rules()` / `.reset()` | Diagnostics and clearing |
| `ProjectileOverrides.of(projectileType).damage(int)` | Overriding projectile damage (one table write, no mixin) |
| `BoardOverrides.allowZombies(gameMode, zombieTypes…)` | Extra zombies a mode allows |
| `BoardOverrides.allowZombieOnLevel(type, level, boolean)` | Overrides one cell of the allowed table |
| `BoardOverrides.relaxZombieSpawnRules(boolean)` | Drops the starting-level and weight vetoes |
| `BoardOverrides.beghouledWinningScore(int)` / `.killAllZombiesDamage(int)` / `.rainSeedInterval(int, int)` / `.stageHasGraveStones(boolean)` | Per-mode level numbers |
| `BoardOverrides.sunValues(int, int, int)` / `.sunMoneyCap(int)` | Sun values (normal/small/large) / the bank cap |
| `BoardOverrides.conveyorSeed(gameMode, from, to)` / `.sunSpawning(gameMode, coinType)` / `.skyDropCoin(coinType)` | Conveyor seeds and sky drops |
| `BoardOverrides.dropLootSunBranch(boolean)` / `.dropLootCoins(int, int, int)` | The loot-sun branch and its three coins |
| `BoardOverrides.lastStandInitialSun(int)` / `.coinUsableSeedType(int)` | Last Stand's opening sun / a coin's default usable seed |
| `BoardOverrides.numWaves(retailWaves, waves)` / `.seedNotAllowedToPick(gameMode, seedTypes…)` / `.graveBusterNeedsGravesInverted(boolean)` | The wave table / chooser bans / the grave requirement bit |
| `CustomPlantEvents.TICK` / `.PLACED` | Observing **registered** plants globally |
| `PlantHooks` | The injection points themselves (used by the module, public for diagnostics and tests): `isUpgrade` / `isUpgradableTo` / `onPlanted` / `onTick` / `plantRect` / `drawPacketArt` / `fire` / `burstOf` … |
| `PlantBehaviour` / `PlantingRule` | The behaviour interfaces (the builder's callbacks are adapted into them) |

## `api-zombie`

| Class / method | Description |
| --- | --- |
| `ZombieType.builder(String id)` → `Builder` → `register()` | Registers a new zombie; `zombieType()` is the game's id |
| Every `Builder` field | See [Plants and zombies](./content.md): `name` / `almanacDescription` / `stringKeyStem` / `bodyReanimation` / `headReanimation` / `headTrack` / `headBodyTrack` / `headHiddenTrack` / `headHiddenLayer` / `headTransform` / `health` / `helm` / `shield` / `flyingHealth` / `collider` / `attackRect` / `scale` / `canGoInPool` / `wave` / `pickWeight` / `startingLevel` / `points` / `onTick` / `onSpawned` |
| `ZombieRegistry.FIRST_ZOMBIE_TYPE` | The first id handed to registered content (`64`) |
| `ZombieRegistry.get(int)` / `.get(String)` / `.all()` / `.count()` / `.isCustomZombieType(int)` | Queries |
| `ZombieRegistry.spawn(board, zombieType, row, fromWave)` | Spawns one through the game's own path |
| `ZombieRegistry.WAVE_UI` | The "not part of any wave" spawn constant |
| `ZombieOverrides.of(zombieType)` → `ZombieOverride` | Overriding an existing zombie's spawn numbers: `bodyHealth` / `helm` / `shieldHealth` / `phaseCounter` / `spawnsAs` / `bodyAnimation` / `mindControlBodyHealth` |
| `ZombieOverrides.mindControlBoost(int, int, float)` / `.burnImmunity(int, int…)` / `.coldRemovalChilledCounter(int)` / `.shieldAlwaysAbsorbs(boolean)` | The four whole-game rules |
| `ZombieOverrides.registered()` / `.rules()` / `.reset()` / `.remapType(int)` / `.apply(Zombie)` | Diagnostics and clearing / type remapping |
| `CustomZombieEvents.TICK` / `.SPAWNED` | Observing **registered** zombies globally |
| `ZombieHooks` / `ZombieBehaviour` | Injection points and the behaviour interface (diagnostics, tests) |

## `api-resource`

| Class / method | Description |
| --- | --- |
| `ModImages.load(Class, String path)` | Read a PNG from your jar |
| `ModImages.blank(w, h)` / `.painted(w, h, painter)` | A blank canvas / a canvas with a painter |
| `ModImages.remapHue(image, pivotDegrees, compression)` | Per-pixel hue remapping keeping saturation, brightness and alpha |
| `ModImageSlot.claim(modId, name)` | Take an `ImageID` slot the game never draws |
| `ModImageSlot#setImage(Image)` / `#image()` / `#bound()` / `#id()` / `#name()` | Install the image / the current image / whether it is bound / the id / the name |
| `ModImageSlot.reset()` | Clear every slot (tests) |
| `GameArt.packetArt(seedType)` | Let the game draw that seed's packet art into a 50×70 image (`null` while it cannot) |
| `GameArt.cachedPlantFrame(seedType)` | The cached frame the game builds for the cursor preview and zen garden |
| `GameArt.installCachedPlantFrame(seedType, frame)` | Put **your** frame into the game's cache |
| `ModReanims.overrideTrackArt(reanim, mapper)` | Recolour **every art-carrying** track (idempotent) |
| `ModReanims.overrideTrackArt(reanim, trackNames, mapper)` | Recolour the named tracks only |
| `ModReanims.giveSeparateHeadLayer(plant)` | Supply the extra "head" reanimation (idempotent) |
| `ResourceOverrides.addRoot(Path)` / `.addFile(pakPath, Path)` / `.addBytes(pakPath, byte[])` | Register a loose-file override (a directory / a single file / raw bytes) |
| `ResourceOverrides.overriddenNames()` / `.clear()` / `.installed()` | Diagnostics / clearing / whether the mixin is installed |
| `ResourceDiagnostics` | The module's own bookkeeping (resource-group callbacks, reinstall counts…), used by tests |

## Where to read the real implementations

What you want to confirm, and the file to open (paths relative to the repository root):

| To confirm | Open |
| --- | --- |
| Which table a registration writes, how ids are allocated | `fabric-api/api-plant/src/main/java/cn/enaium/fabricpvz/api/plant/PlantRegistry.java`, `api-zombie/.../ZombieRegistry.java` |
| Which game method every injection point targets | `fabric-api/api-plant/src/main/java/cn/enaium/fabricpvz/api/plant/PlantHooks.java` (the javadoc names the game method and the upstream `file:line` for each), `api-zombie/.../ZombieHooks.java`, and both modules' `mixin/` directories |
| When an override takes effect | `api-plant/.../mixin/PlantOverridesMixin.java`, `api-zombie/.../mixin/ZombieOverridesMixin.java`, `api-plant/.../mixin/BoardWavesMixin.java` |
| Which game call site fires an event | `PvZ-Portable/src/main/java/cn/enaium/fabricpvz/portable/lawn/hooks/LawnHooks.java` and `sexy/hooks/AppHooks.java`, plus `fabric-api/api-events/.../LawnHooksBridge.java` |
| How the game finds resources and what the pak key rules are | `PvZ-Portable/src/main/java/cn/enaium/fabricpvz/portable/sexy/pak/PakInterface.java`, `.../pvzp/ResourceLocator.java` |
| What the toolchain actually supplies | `loom/README.md`, `loom/src/main/kotlin/cn/enaium/fabricpvz/loom/PvzModPlugin.kt`, `PvzDist.kt`, `JarInJar.kt` |
| What a mod looks like as a template | `pvz-example-mod/` (minimal: events plus three mixins), `pvz-content-mod/` (content, art and an end-to-end test), `pvz-mod-95-edition/` (Kotlin, rule overrides) |
