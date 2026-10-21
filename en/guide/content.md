# Content with fabric-api: plants and zombies

Content registration in `fabric-api` is **plain Java method calls**: a builder describes a definition,
`register()` writes it into the game's definition table, and `seedType()` / `zombieType()` give you the
integer id the game uses. There is no reflection, no annotation processor and no generated code on the
mod's side.

- Plants: `cn.enaium.fabricpvz.api.plant` (Gradle module / mod id `api-plant`)
- Zombies: `cn.enaium.fabricpvz.api.zombie` (`api-zombie`)
- Observing *other* mods' content: `CustomPlantEvents` / `CustomZombieEvents`

## 0. What one registration does

**Two things**, and both are needed:

1. **One row of data.** The game's id-indexed definition tables are fixed-capacity arrays
   (`Plant.gPlantDefs` is `SeedType.MAX_SEED_TYPES` = 200 wide, `Zombie.gZombieDefs` is
   `ZombieType.MAX_ZOMBIE_TYPES` = 100 wide), indexed by id, with the retail rows at the bottom and `null`
   ("nobody defined this") above them. `register()` allocates the first free id
   (`PlantRegistry.FIRST_SEED_TYPE` = 100 / `ZombieRegistry.FIRST_ZOMBIE_TYPE` = 64 and up) and writes a
   `new PlantDefinition(...)` / `new ZombieDefinition(...)` into that row. Every read the game does
   afterwards — `Plant::getPlantDefinition`, packet cost and recharge, wave scheduling, asset preloading —
   treats it exactly like retail content, because the row is simply there.
2. **Behaviour dispatch.** Everything a definition row cannot hold (name and tooltip, almanac text, the
   planting and collision rectangles, the per-tick callback, a shooting plant's projectile, the unlock
   gate, seed-packet art, a zombie's stats and head attachment) is dispatched by **Mixins this API ships**.
   For an id nobody registered, every hook answers "do not interfere", so the game takes its own retail
   path — **a process with the API installed but unused behaves like one without it**.

The game itself has no notion of mods and no content registry: that is why "registering content" is a set
of Builders plus a set of injection points, rather than a game-side API.

## 1. Registering a plant

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

**Where it lives in `pvz-content-mod`**: `registerRedPeashooter()` in
`src/main/java/cn/enaium/fabricpvz/contentmod/ContentMod.java` (in the order shown), with the constants at
the top of the same class (`PEASHOOTER_ID`, `RED_PEASHOOTER_COST = 175`, `RED_PEASHOOTER_REFRESH = 750`,
`RED_PEASHOOTER_LAUNCH_RATE = 150`, `RED_PEASHOOTER_ALMANAC_DESCRIPTION`).

### Every field of `PlantType.Builder`

| Method | Effect |
| --- | --- |
| `name(String)` | The name shown on the seed packet and its tooltip (it does not go through the game's string table) |
| `tooltip(String)` | The packet tooltip (defaults to the name) |
| `almanacDescription(String)` | The almanac card text (defaults to the tooltip, then to the game's `[<KEY_STEM>_DESCRIPTION]`) |
| `stringKeyStem(String)` | The game string table's key stem (`"PEASHOOTER"` for `[PEASHOOTER]`); defaults to the upper-cased id |
| `cost(int)` | Sun cost of one seed packet |
| `refreshTime(int)` | Packet recharge in **centiseconds** (750 = short, 3000 = long, anything else = very long) |
| `reanimation(int)` | The `ReanimationType` used to draw it; `REANIM_NONE` for a static plant |
| `subClass(int)` | The upstream capability family (`PlantSubClass.SUBCLASS_SHOOTER` and the like) |
| `launchRate(int)` | Ticks between two "launches" (the peashooter's 150) |
| `health(int)` | Maximum health (300 by default) |
| `projectile(int)` | The `ProjectileType` fired (`PROJECTILE_FIREBALL` for the fire pea); a `SUBCLASS_SHOOTER` plant without it throws "no projectile" when it fires |
| `burst(int)` | Shots per launch: `2` or `4`, **any other value throws `IllegalArgumentException`**; omitting it means one shot (below) |
| `unlockAfter(int)` | **The only answer to player availability**: the seed exists once `LawnApp::hasSeedType` says so; it also decides whether the chooser offers it and whether its assets are preloaded |
| `packetArtFromReanimation()` | The packet icon comes from the plant's own reanimation (the upstream way) |
| `packetArt(int imageId, int celIndex)` | The packet icon is pinned to an `ImageID` and cel — for art that **is** in the game's resource table and available right away |
| `packetArt(Supplier<Image>)` | The packet icon is pinned to a **runtime-built** image; the supplier is asked once per packet draw, and `null` means "the game draws it itself" (see [Resources and art](./resources.md)) |
| `aquatic(boolean)` / `fungus(boolean)` / `nocturnal(boolean)` / `flying(boolean)` / `upgrade(boolean)` | The game's `Plant::isAquatic` / `isFungus` / `isNocturnal` / `isFlying` / `isUpgrade` |
| `upgradeFrom(int...)` | Which plants this seed may be planted on (replacing them) |
| `chooserVisible(boolean)` | Whether the seed is handed to the player (default `true`) |
| `onTick(Consumer<Plant>)` | Once per tick, after the plant's own update |
| `onPlanted(Consumer<Plant>)` | Right after the plant was placed (`Plant::plantInitialize` returning). **It also runs again for every plant already on the board when a save is loaded**, so it must be idempotent |
| `plantRect(Function<Plant, Rect>)` | The collision rectangle; `null` keeps the upstream one |
| `plantAttackRect(BiFunction<Plant, Integer, Rect>)` | The attack rectangle; `null` keeps the upstream one |
| `plantingRule(PlantingRule)` | A rule for this seed type (asked by `Board::canPlantAt`); return `PLANTING_OK` to allow, any other `PlantingReason` to veto |
| `register()` | Registers and returns the `PlantType` |

### Bursts: `.burst(int)`

The game hard-codes "how many shots one launch fires" **per retail seed** in three methods
(`Plant::FindTargetAndFire` for the firing window and animation rate, `Plant::UpdateShooter` for the second
shot at `mLaunchCounter == 25`, `Plant::UpdateShooting` for the four shots at 68/51/35/18). A registered
seed never reaches those branches and therefore fires a single shot unless it says otherwise:

```java
redRepeater = PlantType.builder("red_repeater")
        .name("Red Repeater")
        .cost(225)
        .reanimation(ReanimationType.REANIM_REPEATER)
        .subClass(PlantSubClass.SUBCLASS_SHOOTER)
        .launchRate(150)
        .burst(2)   // two shots; without it, one
        .projectile(ProjectileType.PROJECTILE_FIREBALL)
        .unlockAfter(SeedType.SEED_REPEATER)
        .register();
```

`burst(2)` / `burst(4)` reproduce the twin seed's own numbers, and they only take over the window **when a
shot actually happens** (a plant that found no target should not have its counters advanced). The three
plants of `pvz-content-mod` use 1 (omitted), 2 and 4.

### Upgrade planting: `.upgradeFrom(int...)`

Retail upgrade plants can be planted directly on the plant they upgrade (the old one is replaced and the
new one goes into that square). The decision lives in exactly one place, `Plant::isUpgradableTo`, and it is
a list of retail seed pairs — a registered seed always answers false. `.upgradeFrom(...)` is the dual of
that list:

```java
redGatling = PlantType.builder("red_gatling")
        .burst(4)
        .upgrade(true)                                            // the purple (upgrade) packet background
        .upgradeFrom(SeedType.SEED_REPEATER, redRepeater.seedType())  // plantable on a retail or red repeater
        .register();
```

- On a hit, `Board::canPlantAt` reports `PLANTING_OK` for that square (the square turns green under the
  cursor) and the planting path kills the replaced plant before `addPlant` — **the replacement is the
  game's own work**, the mod writes no callback.
- **`upgrade` and `upgradeFrom` are two different things**: `upgrade(true)` only makes `Plant::isUpgrade`
  true (the purple packet background); `upgradeFrom` is "which plants this may be planted on". Each can be
  set without the other.

### `PlantOverrides`: overriding the numbers of **existing** plants

`PlantType` adds a new plant; `PlantOverrides` changes the numbers an existing plant has — **retail seeds
included**, which is what a rebalance (the "95 Edition" kind) needs: it changes a set of initialisation
constants and definition-table constants, not content.

```java
PlantOverrides.of(SeedType.SEED_MARIGOLD).cost(75).refreshTime(1500);
PlantOverrides.of(SeedType.SEED_SPIKEROCK).bodyHealth(16200);
PlantOverrides.of(SeedType.SEED_POTATOMINE).spawnCountdown(1000).explosionBlast(115, 1, true);
PlantOverrides.of(SeedType.SEED_TALLNUT).crushProof(true);        // immune to being squashed
PlantOverrides.notOnGroundState(PlantState.STATE_SCAREDYSHROOM_SCARED);  // a whole-game rule
PlantOverrides.extraFireSeedType(SeedType.SEED_GATLINGPEA);       // a whole-game rule
```

| Method | Effect | When it applies |
| --- | --- | --- |
| `PlantOverrides.of(int seedType)` | The (lazily created) override handle of that seed; one per seed type, constant-time by id, idempotent | — |
| `#cost(int)` / `#refreshTime(int)` / `#launchRate(int)` | Cost / recharge / launch rate | **Immediately** into `Plant.gPlantDefs[seed]` |
| `#bodyHealth(int)` | Spawn health (and the maximum with it) | At the return of `Plant::plantInitialize` (the module's Mixin) |
| `#spawnCountdown(int)` | The spawn state counter (in 10 ms units) | Same |
| `#biteInsteadOfEatZombieType(int)` / `#digestCountdown(int)` | A chomper's "bite only" type / its digest counter | The read points in `Plant::updateChomper` |
| `#spikeRockDamage(int, int, int)` | A spikerock's damage per hit and its two crack thresholds | Three constants in `Plant::spikeRockTakeDamage` |
| `#explosionBlast(int radius, int rowRange, boolean burn)` | An explosion's radius, row range and whether it burns | That call in `Plant::doSpecial` |
| `#producedCoins(int common, int rare, int rarePercent)` | A coin-producing plant's two coins and the rare roll | `Plant::updateProductionPlant` |
| `#crushProof(boolean)` | Immune to being squashed (a gargantuar's smash or a vehicle bounces off) | `Zombie::updateZombieGargantuar` / `squishAllInSquare` |
| `PlantOverrides.notOnGroundState(int)` (whole-game rule) | Makes `Plant::notOnGround` answer "yes" for `mState == that value` | `Plant::notOnGround` |
| `PlantOverrides.extraFireSeedType(int)` (whole-game rule) | The seed `Plant::updateShooter` fires an extra shot for at `mLaunchCounter == 50` | `Plant::updateShooter` |
| `registered()` / `rules()` / `reset()` | Diagnostics snapshots / clearing and writing the original values back | — |

Three things to remember:

1. **The definition-table fields are table writes and must happen before the game reads the table.** A mod
   entry point (`ModInitializer`) runs before the game's main class, so "call it in the entry point" is
   safe timing. The game re-reads those numbers whenever it uses them, so a late write is "late to take
   effect", not corruption.
2. **Spawn health is per plant**: the injection is at the return of `Plant::plantInitialize`, after the
   game's own branches (the per-seed switch, the Big Time doubling, copying the current health into the
   maximum), so the override is the mod's last word. Loading a save does not replay spawn health.
3. **Precedence against a registration**: when both write the same field, **the override wins** (a
   registration is the type's base, an override the mod's final word).

### `ProjectileOverrides`: overriding projectile damage

A projectile's damage is not a field on each projectile object; it is `mDamage` in
`Projectile.gProjectileDefinition`, a table indexed by `ProjectileType`, and the game reads it **when the
hit happens**. So this too is a table write that needs **no Mixin at all**:

```java
ProjectileOverrides.of(ProjectileType.PROJECTILE_STAR).damage(40);
ProjectileOverrides.of(ProjectileType.PROJECTILE_SPIKE).damage(1);
```

### `BoardOverrides`: levels, waves and whole-game numbers

This one works at the **level** layer: which zombies a mode allows, whether a zombie may appear on a given
level, and the handful of global numbers of a board (sun values, the bank cap, loot drops, wave counts…).
The first kind is written straight into `Challenge.gZombieAllowedLevels`; the rest are **registered
answers** the module's Mixins hand to the game at its own read points, and **the default is the game's own
value**.

```java
BoardOverrides.allowZombies(GameMode.GAMEMODE_CHALLENGE_SPEED,
        ZombieType.ZOMBIE_FOOTBALL, ZombieType.ZOMBIE_JACK_IN_THE_BOX);
BoardOverrides.relaxZombieSpawnRules(true);
BoardOverrides.sunValues(50, 25, 75);          // normal / small / large sun
BoardOverrides.sunMoneyCap(20000);             // the bank cap (9990 in the game)
BoardOverrides.numWaves(40, 50);               // where the game's own branch says 40 waves, use 50
```

`registered()` / `reset()` mirror the other two override classes; the full method list is in the
[API reference](./reference.md).

## 2. Registering a zombie

::: tip Where this code comes from
No mod of the workspace registers a new zombie today, so the example below is the one from
`api-zombie`'s own usage notes; it compiles against the 1.2.5 version package (the game jar with
`cn.enaium.fabricpvz:fabric-api:1.2.2`) at `javac --release 25`. The real "changing a zombie" usage in the
workspace is `pvz-mod-95-edition`'s `ZombieOverrides` (below), which changes retail zombies' spawn numbers.
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

### The fields of `ZombieType.Builder`

| Method | Effect |
| --- | --- |
| `name(String)` / `stringKeyStem(String)` | Name / string-table key stem (the id upper-cased by default) |
| `almanacDescription(String)` | The almanac zombie page's card text |
| `bodyReanimation(int)` / `headReanimation(int)` | Body (and head) `ReanimationType`; `headReanimation` attaches an extra reanimation as a head (the peashooter-headed zombie's trick) |
| `headTrack` / `headBodyTrack` / `headHiddenTrack` / `headHiddenLayer` / `headTransform(x, y, rotate, scale)` | Overriding the head attachment's default tracks and transform |
| `health(int)` | Body health (a plain zombie has 270) |
| `helm(int helmType, int helmHealth)` / `shield(int shieldType, int shieldHealth)` / `flyingHealth(int)` | Helmet, shield and flying-gear health (`0` = it does not fly) |
| `collider(Rect)` / `attackRect(Rect)` | Collision and eating rectangles; `null` keeps a plain zombie's |
| `scale(float)` | Render scale |
| `canGoInPool(boolean)` | Whether it may walk into the pool rows |
| `wave(int points, int startingLevel, int firstAllowedWave, int pickWeight)` | Wave participation: points consumed, first adventure level, first wave, relative weight. **A non-zero weight means "it can spawn in waves"** |
| `pickWeight(int)` / `startingLevel(int)` / `points(int)` | Setting one of those on its own |
| `onTick(Consumer<Zombie>)` | Once per tick, after the zombie's own update |
| `onSpawned(Consumer<Zombie>)` | The end of initialisation (it may not be on the board yet). **It also runs again for every zombie already there when a save is loaded**, so it must be idempotent |
| `register()` | Registers and returns the `ZombieType` |

Read and write the zombie's own fields inside the callbacks, for example "bolt the pail back on while it
walks" (the two constants are the `helm(...)` value above and this mod's own repair cadence):

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

`ZombieRegistry.spawn(board, zombieType, row, fromWave)` spawns through the game's own wave path
(`Board::addZombieInRow`), and `ZombieRegistry.WAVE_UI` is the "not part of any wave" constant.

### `ZombieOverrides`: overriding **existing** zombies (retail types included)

```java
ZombieOverrides.of(ZombieType.ZOMBIE_DOOR).spawnsAs(ZombieType.ZOMBIE_PAIL);
ZombieOverrides.of(ZombieType.ZOMBIE_FLAG)
        .bodyHealth(820)
        .helm(HelmType.HELMTYPE_PAIL, 1100)
        .bodyAnimation("anim_bucket");
ZombieOverrides.mindControlBoost(200, 200, 1.25f);       // whole-game rule: the mind-control boost
ZombieOverrides.burnImmunity(1800, ZombiePhase.PHASE_NEWSPAPER_READING);   // whole-game rule: the ash test
ZombieOverrides.shieldAlwaysAbsorbs(true);               // whole-game rule: damage goes through the shield first
```

| Method | Effect | When it applies |
| --- | --- | --- |
| `ZombieOverrides.of(int zombieType)` | The override handle of that type | — |
| `#bodyHealth(int)` / `#helm(int, int)` / `#shieldHealth(int)` / `#phaseCounter(int)` | Spawn health / helmet / shield health / phase counter | At the return of `Zombie::zombieInitialize` |
| `#spawnsAs(int)` | Spawn as another type instead | The type parameter is replaced at the **very start** of initialisation, so everything after it runs as the new type |
| `#bodyAnimation(String)` | Show the body animation of that name after spawning (through the game's `ReanimShowPrefix`) | At the end of initialisation |
| `#mindControlBodyHealth(int)` | The fixed body health this type has while mind-controlled | `Zombie::startMindControlled` |
| `ZombieOverrides.mindControlBoost(int, int, float)` | Body and helmet bonus plus scale while mind-controlled | Same |
| `ZombieOverrides.burnImmunity(int totalHealth, int... immunePhases)` | The ash/squash immunity test becomes "body + helm + shield ≥ threshold", plus the phases that are always immune | `Zombie::applyBurn` |
| `ZombieOverrides.coldRemovalChilledCounter(int)` | `Zombie::removeColdEffects` writes the chilled counter instead of clearing it | Same |
| `ZombieOverrides.shieldAlwaysAbsorbs(boolean)` | Damage always goes through `takeShieldDamage` first | `Zombie::takeDamage` |
| `registered()` / `rules()` / `reset()` | Diagnostics / whole-game rules / clearing | — |

Precedence against a registration is the same rule: a registration is the base, an override the mod's last
word. `spawnsAs` is the only field that applies at the **start** of initialisation: after the replacement,
every later branch that reads `mZombieType` behaves as the new type, which is equivalent to the game having
spawned that type itself.

## 3. Observing other mods' content: `CustomPlantEvents` / `CustomZombieEvents`

`PlantType.Builder#onTick` only applies to **the plant you registered**. When global logic (HUD, statistics,
achievements) wants to see "some mod plant was placed / ticks once", use these two global events:

| Event | When |
| --- | --- |
| `CustomPlantEvents.TICK` | One tick of a registered plant (after its own update) |
| `CustomPlantEvents.PLACED` | A registered plant was placed on the board (already in its square, health applied) |
| `CustomZombieEvents.TICK` | One tick of a registered zombie |
| `CustomZombieEvents.SPAWNED` | A registered zombie finished initialising (stats and reanimation applied, possibly still off-board) |

They only fire for **registered** seed types / zombie types (decided by whether that row of the definition
table exists), so retail plants and zombies never reach mod code. Damage and death of any zombie (mod ones
included) belong to `LawnEvents.ZOMBIE_DAMAGE` / `ZOMBIE_DEATH` from
[Events and lifecycle](./events.md).

## 4. Pitfalls worth knowing

1. **Do not draw the seed-packet art yourself.** The icon is 50×70 (`SEED_PACKET_WIDTH` ×
   `SEED_PACKET_HEIGHT`, drawn 1:1 at the packet origin). The right way is to let **the game** draw the
   retail twin's packet art into a blank image (`GameArt.packetArt(seedType)`) and then recolour it.
   A hand-written reanim renderer that tries to copy the retail drawing gets it wrong easily. Where the art
   comes from decides which method to use — see [Resources and art](./resources.md).
2. **`onPlanted` / `onSpawned` are replayed when a save is loaded**: `Board::loadGame` runs them again for
   every plant and zombie already on the board, so they must be idempotent (never "add one more" inside).
3. **The unlock gate has exactly one answer, `LawnApp::hasSeedType`**: your seed exists once the seed named
   in `unlockAfter(...)` is the player's. It also decides whether the chooser offers it and whether its
   assets are preloaded.
4. **Names and tooltips do not go through the game's string table** unless you use `stringKeyStem(...)`
   (which is how you get the game's own localisation) - and then you ship their translations yourself,
   as `src/main/resources/i18n/<language>.json` in your own mod (the workspace's `pvz-i18n-mod/README.md`
   has the full description): the i18n mod collects every loaded mod's table, so your text travels in your
   jar instead of being written into someone else's table.
5. **Only after `register()` returns is it content**: from there on, seed packets, the almanac,
   `Board::canPlantAt`, `Board::addPlant`, the seed chooser and `Plant::fire` treat it like a built-in.

Next chapter: [Resources and art](./resources.md).
