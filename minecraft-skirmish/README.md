# Skirmish

A PvP heads-up display for Minecraft **26.2** (Fabric, client-side only).

Keystrokes with per-button CPS, FPS and ping, armour and tool durability,
active effects, and an attack-charge bar under the crosshair.

## What it deliberately does not do

This is a **read-only overlay**. It draws information your own client already
has and already shows you somewhere else — nothing more.

It does not, and will not:

- change your reach, hitbox or attack timing
- aim, track or snap to anyone
- click for you, or automate any input
- show players through walls, or reveal anything the server hasn't sent you
- touch movement, knockback or velocity
- send a single packet the vanilla client wouldn't send

Every module reads local client state and calls a draw function. If a server
can detect this mod at all, it's only because you told them.

## Modules

| Module | Shows |
|---|---|
| Keystrokes | WASD, jump, and both mouse buttons with live CPS |
| Stats | FPS and your ping, colour-coded |
| Armour | worn armour and held tool with durability remaining |
| Effects | active potion effects with time left |
| Attack bar | your attack cooldown, under the crosshair, only while it's charging |

`]` toggles the whole HUD. Rebind it in Options → Controls → Miscellaneous.

## Building

Needs **JDK 25** — Minecraft 26.2 requires it, and Loom refuses to configure
on anything older.

```bash
./gradlew build
```

The mod lands in `build/libs/skirmish-1.0.0.jar`.

To run it in a dev client:

```bash
./gradlew runClient
```

## Installing

1. Install [Fabric Loader](https://fabricmc.net/use/installer) 0.19.5+ for 26.2.
2. Drop [Fabric API](https://modrinth.com/mod/fabric-api) `0.159.0+26.2` into `mods/`.
3. Drop `skirmish-1.0.0.jar` into `mods/`.

## Config

`.minecraft/config/skirmish.properties`, written on first launch.

Each module has `enabled`, `x` and `y`. **A negative coordinate anchors from
the opposite edge** — `armour.x=-6` means six pixels in from the right.

```properties
hud.enabled=true
keystrokes.enabled=true
keystrokes.x=6
keystrokes.y=-80
stats.enabled=true
armour.x=-6
attackbar.enabled=true
```

## A note on 26.x

Modding changed shape in this version, and most guides you'll find are still
written for 1.21.x:

- **Mojang stopped publishing obfuscation mappings.** 1.21.11 and earlier ship
  `client_mappings`; 26.1 onward ship only `client` and `server`.
- **There is no yarn for 26.x** (it stops at 1.21.11), and Fabric's intermediary
  for it is a placeholder `0.0.0`.
- The reason is that **the game now ships deobfuscated** — the 26.2 client jar
  contains 10,372 readable `net/minecraft/**` classes and zero obfuscated ones.

So there's no `mappings` line in `build.gradle`, and `fabric-loader` and
`fabric-api` are plain `implementation` dependencies rather than
`modImplementation` — nothing needs remapping any more. The plugin id is
`net.fabricmc.fabric-loom`.

A few APIs moved too: `HudElement` is now
`extractRenderState(GuiGraphicsExtractor, DeltaTracker)`, keybindings live in
`fabric-key-mapping-api-v1`, and `Options.hideGui` no longer exists.

## Status

Built and **launched in a real 26.2 client** — Fabric reports it among the
loaded mods and it initialises without errors. The individual modules have not
been eyeballed in an actual fight yet, so positions and sizes may want nudging;
that's all in the config file.
