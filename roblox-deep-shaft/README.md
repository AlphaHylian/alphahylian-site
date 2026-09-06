# Deep Shaft — a Roblox mining simulator

A complete, server-authoritative mining simulator: dig ore, haul it to a sell
pad, upgrade the pickaxe and backpack, unlock deeper shafts, rebirth for a
permanent multiplier.

Everything is built in code. The place file can be completely empty — the
world, the UI and the remotes are all created at runtime.

```
src/
  shared/Config.lua            every tunable number + the monetisation IDs
  shared/Net.lua               remote bootstrap (server creates, client waits)
  server/init.server.lua       entry point, player lifecycle, pads
  server/DataService.lua       DataStore load/save, autosave, BindToClose
  server/WorldService.lua      builds the zones, ore grid, pads, spawn
  server/MiningService.lua     swing validation + the Auto Mine pass
  server/EconomyService.lua    ore, coins, upgrades, rebirth, leaderstats
  server/MonetizationService.lua  game passes + ProcessReceipt
  client/init.client.lua       input, mining requests, break effects
  client/Ui.lua                HUD, shop, shaft list, toasts
```

## Installing

**With Rojo** (recommended)

```bash
rojo serve            # then connect from the Roblox Studio plugin
```

**Without Rojo** — recreate this tree by hand in Studio:

| File | Goes in | As |
|---|---|---|
| `src/shared/*.lua` | `ReplicatedStorage/Shared` | ModuleScripts |
| `src/server/init.server.lua` | `ServerScriptService` | Script named `Server` |
| `src/server/*.lua` (the rest) | children of that `Server` script | ModuleScripts |
| `src/client/init.client.lua` | `StarterPlayer/StarterPlayerScripts` | LocalScript named `Client` |
| `src/client/Ui.lua` | child of that `Client` script | ModuleScript |

Then in **Game Settings → Security**, turn on **Enable Studio Access to API
Services** so the DataStore works.

## Making it earn

The game runs fine with the IDs left at `0` — the shop just marks those rows
as "not set up yet". To switch monetisation on:

1. Publish the place.
2. On the Creator Dashboard, create the **game passes** and **developer
   products** below.
3. Paste each ID into `Config.GamePasses` / `Config.Products`.

**Game passes** (one-off purchases — these are the steady earners)

| Key | Suggested price | What it does |
|---|---|---|
| `DoubleCoins` | 99 R$ | every sale pays double |
| `DoubleCapacity` | 99 R$ | twice the backpack size |
| `AutoMine` | 199 R$ | swings for you automatically |
| `VipZone` | 249 R$ | a private shaft with Ancient ore |

**Developer products** (repeatable — these are the impulse buys)

| Key | Suggested price | What it does |
|---|---|---|
| `Coins1k` / `Coins10k` / `Coins100k` | 25 / 99 / 499 R$ | coin packs |
| `Boost2x` | 49 R$ | 2x sale value for 10 minutes |

Prices in `Config` are only shop labels — the real price is whatever you set
on the dashboard, so keep the two in sync.

A note on the money: the plumbing here is the part code can guarantee —
purchases are granted exactly once, survive a server crash, and can't be
spoofed by the client. What it earns after that is down to how many people
play it, which is a marketing problem rather than a code one.

## Balancing

`Config.lua` is the only file you should need. Ore values and hardness,
pickaxe power and swing speed, backpack sizes, zone unlock requirements, ore
weights per zone and the rebirth curve all live there. The usual first tweaks:

- Grind too slow → raise `Config.Ores[*].value` or lower `hardness`.
- Players stuck in zone 1 → lower `Config.Pickaxes[2].cost`.
- Rebirth too far away → lower `Config.Rebirth.baseCost`.

## How the anti-cheat works

The client never sends a number that lands in anyone's balance. It only ever
says *"I swung at that part"*, and the server independently checks that the
block exists and is unmined, that the player is within `Config.MaxReach`
studs of it, that their pickaxe tier unlocks the zone, that enough time has
passed since their last swing for their pickaxe, and that their backpack has
room. Coins are only ever produced by `EconomyService.sell`, server-side.

## Status

Written and syntax-checked with `luau-analyze`, but **not yet run in Roblox
Studio** — I had no Studio to open it in. Expect to shake out a couple of
first-run issues (part counts, pad placement, UI scale on phones). The
balance numbers are a starting point, not a tuned economy.
