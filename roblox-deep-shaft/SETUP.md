# Deep Shaft — zero to worldwide, step by step

Follow this top to bottom. Nothing is assumed to exist beforehand.

Times are rough: **Part 1–4 is about an hour**, most of it copy-paste.
Part 5 (monetisation) is another 20 minutes. Part 6+ is ongoing.

---

## Part 1 — Accounts and Studio

1. **Roblox account.** roblox.com → sign up. Use a real birth date; some
   settings below are age-gated and you cannot change it easily later.
2. **Verify your email.** Account Settings → Account Info → add and confirm an
   email. You need this before you can be paid, so do it now.
3. **Install Roblox Studio.** Go to <https://create.roblox.com> → *Start
   Creating* → it prompts you to download Studio. Install and sign in.

---

## Part 2 — Create the place

4. Open Studio → **New** → **Baseplate**.
5. `File → Save to Roblox As…`
   - Name: `Deep Shaft`
   - Description: anything for now.
   - Save. This creates the experience on your account.

> From here on, `File → Publish to Roblox` (Alt+P / ⌥P) pushes your changes live.

---

## Part 3 — Get the code in

Two options. **Option A needs no extra tools — start there if unsure.**

### Option A — by hand (~20 min)

In Studio, open the **Explorer** (View → Explorer) and build this exact tree.
Right-click a container → *Insert Object* → pick the class.

**Names must match exactly** — the code looks these up by name.

```
ReplicatedStorage
└── Shared                    (Folder)
    ├── Config                (ModuleScript)  <- src/shared/Config.lua
    └── Net                   (ModuleScript)  <- src/shared/Net.lua

ServerScriptService
└── Server                    (Script)        <- src/server/init.server.lua
    ├── DataService           (ModuleScript)  <- src/server/DataService.lua
    ├── WorldService          (ModuleScript)  <- src/server/WorldService.lua
    ├── EconomyService        (ModuleScript)  <- src/server/EconomyService.lua
    ├── MiningService         (ModuleScript)  <- src/server/MiningService.lua
    └── MonetizationService   (ModuleScript)  <- src/server/MonetizationService.lua

StarterPlayer
└── StarterPlayerScripts
    └── Client                (LocalScript)   <- src/client/init.client.lua
        └── Ui                (ModuleScript)  <- src/client/Ui.lua
```

For each one: create it, double-click to open, select-all, and paste the whole
contents of the matching file.

Three things people get wrong here:

- The five server modules are **children of the `Server` Script**, not siblings.
  `init.server.lua` does `require(script.DataService)`.
- `Ui` is a **child of the `Client` LocalScript**, same reason.
- `Server` is a **Script**, `Client` is a **LocalScript**. Different classes.

### Option B — Rojo (faster, and how you'll want to work later)

1. Install Rojo: download the binary for your OS from
   <https://github.com/rojo-rbx/rojo/releases> and put it on your PATH.
   (Or, if you have Rust: `cargo install rojo`.)
2. Install the Studio plugin: `rojo plugin install`
3. From this folder: `rojo serve`
4. In Studio: **Plugins → Rojo → Connect**. The tree above appears
   automatically and stays in sync as you edit files.

---

## Part 4 — Switch on DataStores, then test

6. `File → Game Settings → Security` → enable
   **Enable Studio Access to API Services** → Save.
   Without this, saving throws and nobody's progress persists.

7. Press **Play**. You should see in the Output window:

   ```
   [Deep Shaft] server ready — 6 zones
   ```

   and in game: a HUD top-left, buttons along the bottom, and a grid of ore
   blocks. Click a block repeatedly to break it.

8. Walk onto the green **Sell** pad — coins go up. Then the blue **Shop** pad,
   buy the Stone pickaxe. Then the orange pad to open the shaft list.

9. Test with more than one player: **Test → Clients and Servers → 2 players →
   Start**. This is the only way to catch server-side mistakes; single-player
   Play mode hides a lot.

> Progress does **not** save in Studio by default, on purpose — Studio writes to
> the same live DataStore as the real game. If you want it to save while
> testing, set `DataService.saveInStudio = true` in `DataService.lua`.

---

## Part 5 — Make it public

10. `File → Game Settings → Basic Info`: set a name, a description, and a
    genre. Add an icon (512×512) and at least one thumbnail (1920×1080) — the
    icon is the single biggest factor in whether anyone clicks your game.

11. **Content Maturity questionnaire.** Creator Dashboard → your experience →
    *Settings → Content Maturity*. Fill it in. Roblox will not let an
    experience go public until this is answered.

12. Make it public, either:
    - Studio: `File → Game Settings → Permissions` → **Public**, or
    - Dashboard: <https://create.roblox.com/dashboard/creations> → your
      experience → **⋯ → Configure → Permissions → Public**.

13. `File → Publish to Roblox`.

At this point the URL under the experience on the dashboard is playable by
anyone in the world. Test it in a browser while signed out.

---

## Part 6 — Turn on the money

The game runs fine with the IDs at `0`; the shop just shows those rows as
"not set up yet". To enable them:

14. Creator Dashboard → your experience → **Monetization → Passes → Create a
    Pass**. Make these four (name them whatever you like — only the ID matters):

    | Create a pass for | Suggested price |
    |---|---|
    | 2x Coins | 99 R$ |
    | 2x Backpack | 99 R$ |
    | Auto Mine | 199 R$ |
    | VIP Shaft | 249 R$ |

15. Open each pass → copy the **ID from the URL**
    (`.../game-pass/**1234567890**/...`).

16. Paste into `src/shared/Config.lua`:

    ```lua
    Config.GamePasses = {
        DoubleCoins    = { id = 1234567890, ... },
        DoubleCapacity = { id = 1234567891, ... },
        AutoMine       = { id = 1234567892, ... },
        VipZone        = { id = 1234567893, ... },
    }
    ```

17. Dashboard → **Monetization → Developer Products → Create**. Make four:

    | Product | Suggested price |
    |---|---|
    | 1,000 Coins | 25 R$ |
    | 10,000 Coins | 99 R$ |
    | 100,000 Coins | 499 R$ |
    | 2x Coins (10 min) | 49 R$ |

18. Copy each product ID into `Config.Products` the same way.

19. Publish again. In game, open the Shop — those rows should now say a price
    instead of "not set up yet". Buy one with your own account to confirm the
    grant lands (you get your own Robux back on your own game, minus nothing —
    it's a round trip).

> The prices written in `Config` are only shop labels. The real price is the
> one set on the dashboard, so keep the two in sync or the UI will lie.

---

## Part 7 — Getting paid

Robux you earn sits in your account balance. Selling it for real money goes
through **DevEx** (Developer Exchange), which requires, broadly:

- being 13+,
- an active **Roblox Premium** subscription,
- a verified email,
- a minimum Robux balance before you can cash out,
- a DevEx application on the Creator Dashboard.

The exact minimum and rate change, so read the current terms at
<https://create.roblox.com/dashboard/devex> rather than trusting a number
written here.

Note that earnings hold for a period before they clear, and Roblox takes a
platform cut of every sale — you do not receive the full sticker price.

---

## Part 8 — Actually getting players

This is the part code can't do for you, and it's the part that decides whether
the game earns anything at all.

- **The icon and title do most of the work.** Swap them and watch the click
  rate change more than any gameplay tweak will.
- **First 60 seconds matter most.** A player who hasn't broken a block and
  earned a coin within a minute leaves. Watch a friend play without helping
  them and fix whatever confuses them.
- **Post it where you already have an audience** — you have a channel and a
  Discord, which is a real advantage most new Roblox devs don't have.
- **Update it.** The algorithm rewards experiences that keep shipping. New
  zones and ores are a few lines in `Config.lua` each.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Server ready` never prints | `Server` is a LocalScript, or it's not in ServerScriptService |
| `attempt to index nil with 'DataService'` | server modules aren't children of the `Server` Script |
| HUD never appears | `Client` is a Script, not a LocalScript, or `Ui` isn't its child |
| Nothing happens when clicking blocks | you're further than 30 studs away (`Config.MaxReach`) |
| Coins reset every rejoin | API Services not enabled (Part 4 step 6) |
| Shop rows say "not set up yet" | that pass/product ID is still `0` |
| Purchase takes Robux but grants nothing | product ID in `Config` doesn't match the dashboard |
| Players spawn in the void | the `DeepShaftSpawn` part didn't build — check Output for errors |
