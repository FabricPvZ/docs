# Walkthrough: `pvz-content-mod`

This chapter reads `pvz-content-mod` file by file — the most complete teaching mod in these chapters. It adds
three plants (a Red Peashooter, a Red Repeater and a Red Gatling Pea), ships not a single texture, builds all
of its art by "the game draws it, the mod recolours it at runtime", and comes with an end-to-end test on the
real loader.

**What it is**: a deliberately **thin example** — it owns **what it is** (the three red plants' numbers) and
**what it chooses** (which tracks, which hue mapping, how the icon is built), and leaves everything else
(registration, events, the game's own painters, per-track recolouring) to the API.

## 1. The entry point: `ContentMod.java`

```java
public final class ContentMod implements ModInitializer {

    /** Mod id, matching {@code fabric.mod.json}. */
    public static final String MOD_ID = "pvz-content-mod";

    @Override
    public void onInitialize() {
        RedPlantsArt.install();   // build the cached frames once the game has an app; retry per tick
        registerRedPeashooter();
        registerRedRepeater();
        registerRedGatling();
    }
}
```

Three steps, and the order matters:

1. **`RedPlantsArt.install()`** comes first: it only **registers two callbacks**
   (`GameLifecycleEvents.INITIALIZED` + `LawnEvents.TICK`). The game is not up yet, so nothing can be built
   at this point.
2. **The three registrations** write the definition rows. The entry point runs before the game's `main`,
   which is exactly the "before the game reads the table" timing (see [Plants and zombies](./content.md)).
3. Each `registerXxx()` stores its `PlantType` in a static field, because **a later registration needs an
   earlier result**: the red gatling pea's `upgradeFrom(SEED_REPEATER, redRepeater.seedType())` needs the red
   repeater's seed type.

The constants sit at the top of the class and read like a spec: `RED_PEASHOOTER_COST = 175`,
`RED_REPEATER_COST = 225`, `RED_GATLING_COST = 275`, `RED_GATLING_REFRESH = 5000` (the shop plant's long
recharge), `RED_GATLING_LAUNCH_RATE = 150`, plus the three `almanacDescription` strings.

### The two extra calls of the red gatling pea

```java
// (the name / tooltip / almanacDescription calls of the real builder are left out here)
redGatling = PlantType.builder(GATLING_ID)
        .name("Red Gatling Pea")
        .burst(4)                                   // four shots (without it: one)
        .upgrade(true)                              // the purple (upgrade) packet background
        .upgradeFrom(SeedType.SEED_REPEATER,        // plantable on a retail repeater …
                redRepeater.seedType())             // … and on a red repeater, replacing it
        .unlockAfter(SeedType.SEED_GATLINGPEA)      // buying the shop plant releases it
        .projectile(ProjectileType.PROJECTILE_FIREBALL)
        .register();
```

- **The unlock uses the game's own answer**: the retail gatling pea is a shop plant, so
  `unlockAfter(SEED_GATLINGPEA)` makes the game's `LawnApp::hasSeedType` let this seed through the moment
  the player bought the shop plant — **the mod itself never enters the shop**.
- **`upgradeFrom` is the only thing in this mod that changes a game decision**, and it does so through the
  API's seam (the dual of `Plant::isUpgradableTo`) rather than a hand-written mixin: the replacement is the
  game's own work.

### `plantCopying(int)`: mapping a retail seed back to this mod's plant

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

It is the only interface between the art pipeline and the registrations: `RedPlantsArt` only knows retail
seeds ("I want the peashooter's packet art") and the registrations only know registration ids, and this
function joins the two.

## 2. The art pipeline: `RedPlantsArt.java`

This class is the mod's **art choices**: every red plant is its retail twin's packet art and reanimation
under one hue mapping. Two numbers are the whole of it:

```java
private static final float RED_PIVOT_HUE = 90.0f;       // where the peashooter family's own green lands
private static final float RED_HUE_COMPRESSION = 0.25f; // squeeze the band into red but keep the shading
```

### 2.1 Three things to turn red, three mechanisms

| What turns red | Mechanism | Why |
| --- | --- | --- |
| The seed-packet icon | `packetArt(Supplier<Image>)`, asked once per draw | The seed chooser runs no ticks, and the icon can only be built after the retail art loaded |
| The plant on the board (body and head) | `ModReanims.overrideTrackArt` inside the `onPlanted` callback | Planting is one event; recolour once, right there |
| The blink reanimation | one more `overrideTrackArt` from `onTick` | The game **creates a new reanimation per blink**, so the planting pass never sees it |
| The cursor preview and zen-garden frame | `GameLifecycleEvents.INITIALIZED` plus a per-tick retry, installing through `GameArt.installCachedPlantFrame` | The game's cached frame is a separate drawing path and knows nothing about per-track recolouring |

### 2.2 Registering the callbacks: `install()`

```java
static void install() {
    GameLifecycleEvents.INITIALIZED.register(RedPlantsArt::installArt);
    LawnEvents.TICK.register((board, tick) -> installArt());
}
```

- `INITIALIZED`: the game has an app, so take the first shot at building the cached frames.
- `TICK`: keep asking every tick until it worked (`installArt()` returns immediately once it did).
- **The icons are not built here**: the game asks for them through the supplier on every packet draw
  (`packetImage(String)`).

### 2.3 The icons: `packetImage` → `makeRedPacket`

::: tip About the excerpts in this chapter
The code below is quoted from `ContentMod.java` and `RedPlantsArt.java`: **the statements and their order
match the files**; javadoc unrelated to the point at hand, some blank lines and the odd builder call have
been left out (anything left out is called out where it matters). The complete files live in
`pvz-content-mod/src/main/java/cn/enaium/fabricpvz/contentmod/` and can be compared line by line.
:::

```java
public static Image packetImage(String thePlantId) {
    Art aArt = artOf(thePlantId);
    if (aArt.packet == null) {
        aArt.packet = makeRedPacket(aArt.retailSeedType);   // still null while it cannot be built
    }
    return aArt.packet;
}

private static MemoryImage makeRedPacket(int theRetailSeedType) {
    MemoryImage aRetail = GameArt.packetArt(theRetailSeedType);
    if (aRetail == null) {
        // The game drew nothing: the art this icon is made of is not loaded yet.
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

Four things worth noticing:

- **The game draws the image**: `GameArt.packetArt(seedType)` calls the game's own packet drawing at that
  seed's own placement (5, 9 for the peashooter and repeater, 2, 9 for the gatling pea), so the icon
  **cannot** depict something different from the plant on the lawn.
- **`null` is a legitimate return**: it means "not buildable yet"; the game draws the packet itself and asks
  again on the next draw.
- **The result is cached in `Art.packet`**: one cost, then zero per draw.
- **`loadError` is a diagnosable failure**: no exception, but a human sentence a test or a log can use to
  tell "no assets" apart from "nothing ran".

### 2.4 The plant on the board: `onPlanted`

```java
public static void onPlanted(Plant thePlant) {
    if (thePlant == null || thePlant.mApp == null) {
        return;
    }

    Reanimation aBody = thePlant.mApp.reanimationTryToGet(thePlant.mBodyReanimID);
    if (aBody == null || aBody.mTrackInstances == null) {
        // No retail .reanim data loaded: this plant keeps its retail colours.
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

- **The API lists the tracks on its own**: `overrideTrackArt(reanim, mapper)` finds the art-carrying tracks
  in the reanimation's definition (motion-only tracks such as `anim_idle` / `anim_stem` have no image and are
  skipped), so the mod **maintains no list of track names**. The old way was to copy 13 or 20 names by hand,
  and to miss one every time the game changed.
- **The head has to be supplied**: the game creates that extra head reanimation only for **its own**
  peashooter-family seed types, so `giveSeparateHeadLayer(thePlant)` is the step that supplies it
  (idempotently). Without it the plant is a headless red stalk.
- **Red copies are cached**: `redCopy` keeps them in an `IdentityHashMap` keyed by the **source image**; the
  reanimation definitions are process-global, so every red plant on a board hands in the very same `Image`
  instances and one red copy serves all of them.

### 2.5 Blinking: `onTick`

```java
public static void onTick(Plant thePlant) {
    if (thePlant == null || thePlant.mApp == null
            || thePlant.mBlinkReanimID == ReanimationID.REANIMATIONID_NULL) {
        return;   // almost every tick takes this path
    }

    recolours += ModReanims.overrideTrackArt(
            thePlant.mApp.reanimationTryToGet(thePlant.mBlinkReanimID), RedPlantsArt::redCopy);
}
```

`Plant::doBlink` **builds its reanimation on demand**, so it never sees the recolouring the planting did.
This callback returns on its first line on almost every tick — which is exactly what a per-tick callback
should look like.

### 2.6 The cached frame: `installCachedPlantFrame`

```java
private static void installCachedPlantFrame(Art theArt) {
    PlantType aType = ContentMod.plantCopying(theArt.retailSeedType);
    if (aType == null) {
        return;
    }

    if (theArt.frame == null) {
        MemoryImage aRetail = GameArt.cachedPlantFrame(theArt.retailSeedType);
        if (aRetail == null) {
            return;   // not drawable yet: ask again next tick
        }
        theArt.frame = ModImages.remapHue(aRetail, RED_PIVOT_HUE, RED_HUE_COMPRESSION);
    }

    if (theArt.frame != null) {
        GameArt.installCachedPlantFrame(aType.seedType(), theArt.frame);
    }
}
```

Without this step the plant is red on the lawn and **green under the mouse pointer**: the cursor preview and
the zen garden draw `ReanimatorCache#mPlantImages[seedType]`, a cell the game builds from the reanimation and
which knows nothing about per-track recolouring.

## 3. The pitfalls it went through (and you can skip)

| Pitfall | Symptom | The right way |
| --- | --- | --- |
| Parking a runtime-built image under a borrowed resource id | The icon reverts or vanishes at some moments: a mod's entry point runs before the retail art, and the seed chooser runs no tick that could retry | Use `packetArt(Supplier<Image>)`: asked once per draw, `null` hands the drawing back to the game |
| Drawing or copying the retail art by hand | The icon does not match the plant on the lawn (a hand-rendered version did not) | Let **the game** draw it with `GameArt.packetArt` and recolour that |
| Assuming one planting pass is enough | The blinking eyelid turns green again: the game builds a new reanimation per blink | Re-apply from `onTick` (idempotently) |
| Forgetting the head reanimation | A headless red stalk: the game creates that layer only for its own peashooter seeds | `ModReanims.giveSeparateHeadLayer` |
| Keeping a hand-written list of track names | After a game change some parts stay green | The `overrideTrackArt(reanim, mapper)` form, which reads the track table from the definition |
| Forgetting the shot count | A registered shooting plant fires one pea forever | `.burst(2)` / `.burst(4)` |
| Writing a runtime-built image into the game's resource table | It is lost on every resource-group load | Hand it over as a supplier (which is why it survives those loads) |
| Mixing Mixin and API without a rule | One behaviour implemented in two places, and nobody can tell which is authoritative | Use an API seam whenever one exists; this mod has **no mixin at all**, because the API's seams cover its whole art requirement |

## 4. The test: `ContentModEndToEndTest`

It copies the built jar into a temporary `mods/` directory and starts the game in a **second JVM** on the real
Fabric Loader (`net.fabricmc.loader.impl.launch.knot.KnotClient`), with the game's main class replaced by the
test's own harness. The harness writes its observations into a report file and the test asserts on that file —
because the loader defines its own copy of the game and mod classes, **assertions cannot read those classes'
static state** (they would read a second copy).

What it asserts covers every section of this chapter: the three plants are in the definition table with the
registered numbers, each one's unlock gate behaves like its twin's, the almanac's second page shows them, the
seed chooser offers them on a second page, the packets draw the mod's plants (**before any board is created or
ticked**), only the red gatling pea's packet is the purple upgrade card, each is placeable on a headless
board and fires fire peas, a volley is 1 / 2 / 4 shots, and the red gatling pea is plantable on a retail
**and** a red repeater (while an empty square reports `PLANTING_NEEDS_UPGRADE`).

When the machine has retail assets, the harness also mounts the real `main.pak` and does pixel-level checks;
without them those checks are skipped and the registration and unlock checks still run — **which is how a test
that needs real assets should be written**.

The details are in [Building, testing, publishing](./build.md).

Next chapter: [Building, testing, publishing](./build.md).
