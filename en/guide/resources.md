# Content with fabric-api: resources and art

`api-resource` (`cn.enaium.fabricpvz.api.resource`) solves four things:

| What you want to do | What to use |
| --- | --- |
| Ship an image you drew yourself (art that *is* a resource file) | `ModImages.load` plus `ModImageSlot.claim` |
| Use an image built at runtime (recolouring, compositing, rendering the game's own art) | `ModImages` (canvases and hue remapping) plus `PlantType.Builder#packetArt(Supplier)` / `GameArt` |
| Change a plant's look while keeping its animation | `ModReanims.overrideTrackArt` / `giveSeparateHeadLayer` |
| Let loose files shadow the same-named members of `main.pak` (a loose-package re-skin) | `ResourceOverrides` |

## 1. Image source one: a file inside your mod

`ModImages.load(Class<?> owner, String path)` reads a PNG out of **your jar** and hands back the game's own
image type (`MemoryImage`), which the game can draw and release like any other image:

```java
MemoryImage icon = ModImages.load(MyMod.class, "assets/my-mod/packet.png");
```

There are three ways to hand it to the seed packet, chosen by "is this art a resource file":

| Way | When |
| --- | --- |
| `PlantType.Builder#packetArt(int imageId, int celIndex)` | The image already lives in an `ImageID` slot (usually the one from `ModImageSlot` below) |
| `PlantType.Builder#packetArt(Supplier<Image>)` | The image is built **at runtime** (section 3) — the supplier is asked once per packet draw |
| `PlantType.Builder#packetArtFromReanimation()` | The icon should come from the plant's own reanimation (the upstream way) |

### `ModImageSlot`: claiming an image id the game never draws

The game reserves no image-id space for mods and has no "(re-)loading finished" event, so a mod that ships
its own art has to borrow an id the game owns but never draws, and put its image back whenever the game
rebinds that id. `ModImageSlot` is that slot:

```java
ModImageSlot slot = ModImageSlot.claim("my-mod", "red-packet");   // take an id (never reused in a process)
slot.setImage(ModImages.load(MyMod.class, "assets/my-mod/packet.png"));
int imageId = slot.id();                                          // hand it to packetArt(imageId, cel)
```

- The ids come from the game's `LoadingImages` resource group and are ids **this port never reads** (the
  upstream particle system that drew them was not ported), so they are real resource entries, in range, and
  never drawn by the game itself.
- The module's own entry point (`ResourceInitializer`) re-installs the image after every initialisation,
  every resource-group load and every tick, so **that bookkeeping is not yours**: `slot.image()` is the
  image currently installed and `slot.bound()` says "it is yours right now".
- The price is "somebody else's id": if another resource group rebinds it, the reinstall is the only
  guarantee. **When the art is built at runtime, prefer the supplier (section 3) and leave this path alone.**

## 2. Pixels and images: `ModImages`

| Method | Effect |
| --- | --- |
| `load(Class<?> owner, String path)` | Read a PNG from `owner`'s class path, i.e. from your jar |
| `blank(int w, int h)` | A fully transparent canvas |
| `painted(int w, int h, Consumer<Graphics> painter)` | A blank canvas plus a painter: `ModImages.painted(50, 70, g -> g.drawImage(...))` |
| `remapHue(MemoryImage src, float pivotDegrees, float compression)` | Per-pixel hue remapping, keeping saturation, brightness and alpha |

`remapHue` is the tool for "recolour the retail art": `pivotDegrees` is where the original hues land and
`compression` is how far they are squeezed around that pivot (smaller means more concentrated). The
peashooter family is yellow-green (roughly 60–180 degrees), so `pivot = 90` and `compression = 0.25` turn
the whole band red while keeping the shading — the two numbers `pvz-content-mod` uses
(`RedPlantsArt.RED_PIVOT_HUE` / `RED_HUE_COMPRESSION`).

## 3. Image source two: an image built at runtime

**Preferred approach**: let the game draw it, then recolour. `GameArt` exposes two of the game's own
painters:

| Method | What it draws |
| --- | --- |
| `GameArt.packetArt(int seedType)` | That seed's **seed-packet art**: it calls the game's own `SeedPacket::seedPacketDrawSeed` at that seed's own packet placement, into a blank 50×70 image; answers `null` while the assets are not loaded yet |
| `GameArt.cachedPlantFrame(int seedType)` | The **cached frame** the game builds for the cursor preview and the zen garden (`ReanimatorCache`); `null` for the same reason |
| `GameArt.installCachedPlantFrame(int seedType, Image frame)` | Puts **your** frame into that cache cell, so the cursor preview and the zen garden draw your art |

"Built at runtime" means handing it to the supplier — **not** parking it under a claimed resource id:

```java
redPeashooter = PlantType.builder("red_peashooter")
        …
        .packetArt(() -> RedPlantsArt.packetImage("red_peashooter"))
        .register();
```

What `packetArt(Supplier<Image>)` means (the easiest thing in this API to get wrong):

- the game asks the supplier **once per draw of that seed packet**;
- a non-null image is drawn **1:1 at the packet origin** and the game's own drawing of that packet is
  cancelled;
- `null` means "not built yet": the game draws the packet itself (background and price) and asks again next
  time;
- so the supplier must be **idempotent and cheap to ask** (cache the result inside, exactly like
  `RedPlantsArt.packetImage` does).

Two reasons it beats `ModImageSlot`:

1. **A mod's entry point runs before the retail art is loaded**, so a runtime-built image has a window in
   which it cannot be built at all; and **the seed chooser runs no ticks** (it happens before any board), so
   a mechanism that only retried from a tick hook cannot save you at the moment the player actually looks at
   the packet.
2. **The game owns its image table**: a resource-group load overwrites ids it owns, while a supplier is
   asked again on every draw and is therefore unaffected.

## 4. Changing a plant's look: `ModReanims`

Hand-authoring a `.reanim` is not a mod's job, so "a new plant's look" means **reuse the retail skeleton and
replace the images it draws**.

| Method | Effect |
| --- | --- |
| `overrideTrackArt(Reanimation reanim, String[] trackNames, Function<Image, Image> mapper)` | Replaces the art of the **named** tracks |
| `overrideTrackArt(Reanimation reanim, Function<Image, Image> mapper)` | Replaces the art of **every track that carries art** (the track list is read from the reanimation's own definition; motion-only tracks have no image and are skipped) |
| `giveSeparateHeadLayer(Plant plant)` | Gives the plant the extra "head" reanimation the game builds only for its own peashooter seeds |

Semantics:

- A mapper returning `null` keeps the original image; a track already holding the mapped image is skipped.
  Both make the methods **idempotent**, which is what a per-tick or per-blink re-application needs.
- The image is read from the reanim's **definition** frames (`mDefinition.mTracks`), not from
  `Reanimation#getCurrentTrackImage`: the latter answers `null` for frames packed into the reanimation's
  atlas (which the game does for the peashooter family) and only covers the frame the plant happens to be on.

```java
// A plant's body and head: every art-carrying track becomes a red copy
int recoloured = ModReanims.overrideTrackArt(body, RedPlantsArt::redCopy);
ModReanims.giveSeparateHeadLayer(plant);
Reanimation head = plant.mApp.reanimationTryToGet(plant.mHeadReanimID);
if (head != null) {
    recoloured += ModReanims.overrideTrackArt(head, RedPlantsArt::redCopy);
}
```

`setImageOverride` only affects **that one plant**: an original peashooter on the same board stays green. The
full use is walked through in the [walkthrough](./content-mod.md).

## 5. Loose files above the pak: `ResourceOverrides`

The engine resolves a resource name as **pak → filesystem**: the pak member first, and only if there is none
does it build a path under the resource directory. That is, **the pak always wins**, so loose files cannot
shadow it. A re-skin like the "95 Edition" puts `images/`, `reanim/` and `properties/LawnStrings.txt` into
the game directory to shadow same-named resources, and this layer is what makes that possible.

`ResourceOverrides` inserts a lookup at the **head** of `PakInterface.open` (read modes only) and
`PakInterface.exists`; a hit returns your content, anything else passes through unchanged. The resolution
order:

1. **Single file / byte overrides** registered for that exact pak path;
2. **Root directories**, in registration order, as `root/<pak path>`;
3. **The pak member** — the engine's own lookup;
4. **The filesystem** — the engine's own fallback.

```java
// Treat a whole loose-package directory as a high-priority resource root:
// 95-edition/reanim/… shadows the same-named members of main.pak
ResourceOverrides.addRoot(Path.of("95-edition"));

// A single file overriding one pak path (pak spelling, case-insensitive)
ResourceOverrides.addFile("PROPERTIES/LAWNSTRINGS.TXT", Path.of("overrides/LawnStrings.txt"));

// A small file the mod itself carries: hand over the bytes, no need to unpack to disk
ResourceOverrides.addBytes("REANIM/FOO.PNG", Files.readAllBytes(Path.of("foo.png")));
```

| Method | Effect |
| --- | --- |
| `addRoot(Path)` | Register a root directory (tried in registration order, first hit wins) |
| `addFile(String pakPath, Path file)` | Shadow one pak path with a file on disk |
| `addBytes(String pakPath, byte[] data)` | Shadow one pak path with a byte array |
| `overriddenNames()` | Diagnostics: the pak paths registered explicitly (upper case, `/`-separated, sorted; root directory contents are not listed) |
| `clear()` | Drop every override (tests, or switching resource sets) |
| `installed()` | Whether the module's Mixin is in the engine (diagnostics) |

**The key rules** are the engine's own: **case-insensitive**, `\\` equivalent to `/`, `.` / `..` resolved
lexically, upper case and `/` internally. So these three spellings are one resource:

```text
reanim\foo.png   ==   REANIM/FOO.PNG   ==   ./reanim/./foo.png
```

Root directory lookups match the real case of the file on disk segment by segment, so the behaviour is the
retail one on a case-sensitive filesystem such as Linux. When the same pak path is registered twice, **the
later registration wins**.

**When this is the better tool** (rather than writing Java):

- your art **is** resource files already (an edited `images/` tree, a `.reanim`, a `LawnStrings.txt`);
- you are changing **something that already has a name** (a re-skin, a translation, a texture pack) rather
  than adding content;
- you want to swap a whole set of files instead of describing each image in code.

**When it is the wrong tool**: adding content (a new plant's or zombie's icon, anything built at runtime) —
those go through `ModImageSlot` or `packetArt(Supplier)`; and do not use it to change the pak's structure
itself (write modes, mounting, `resourceNames()` / `resourceCount()` are untouched: an override is not a pak
member and never appears in those tables).

Scope and cost:

- **Only reads are affected** (`open` in a read mode, and `exists`), and **only the first lookup is
  expensive**: the first `open` of a path walks the roots and the answer (including "no override") is
  remembered; registering a new override clears that cache.
- **With nothing registered** the Mixin is one volatile read away from the engine's original code path, so an
  installation that registers no override behaves byte for byte as before.
- Registration and lookup are guarded by one lock, idempotent and thread-safe: register once in the mod
  entry point (which runs before the game's main).

## 6. Diagnostics

`ResourceDiagnostics` records the module's own bookkeeping (resource-group load callbacks, reinstall counts
and so on); an end-to-end test uses it to prove the module really ran — the same idea as the diagnostic
counters of the Mixin chapter: **tell "did not work" apart from "never ran"**.

## 7. Where this lives in `pvz-content-mod`

| What you are looking at | File |
| --- | --- |
| The three plants' art choices (which seeds, which hue, where the icons come from) | `src/main/java/cn/enaium/fabricpvz/contentmod/RedPlantsArt.java` |
| Icons: `GameArt.packetArt` plus `ModImages.remapHue`, handed over through `packetArt(Supplier)` | `RedPlantsArt#makeRedPacket`, `RedPlantsArt#packetImage` |
| The red plants on the board: `ModReanims.overrideTrackArt` plus `giveSeparateHeadLayer` | `RedPlantsArt#onPlanted` |
| The blink reanimation (the game creates a new one per blink) | `RedPlantsArt#onTick` |
| The cursor preview and zen garden frame | `RedPlantsArt#installCachedPlantFrame` (`GameArt.cachedPlantFrame` + `installCachedPlantFrame`) |

**The mod ships not one image file**: its jar carries no textures at all, and every piece of art is
"the game draws it, the mod recolours it at runtime".

Next chapter: [Events and lifecycle](./events.md).
