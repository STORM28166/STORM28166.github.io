# RUINBORN — design doc checklist (prototype v0.3)

Legend: [x] in the build · [~] partial / simplified · [ ] not yet

## Core loop
- [x] Wake in the ruins in rags, scavenge debris/loot piles (scrap, food, water, ammo, clothing)
- [x] Hunger / thirst / stamina / health, sickness, well-fed buff, sleep to skip night
- [x] Crafting + base building (walls, turrets, campfire, floodlights, base core, bed)
- [x] Night raids on the base, scaling with day and difficulty (Chill / Normal / Brutal)
- [x] Death drops your pack (hotbar + worn armor kept), respawn at bed / active outpost
- [x] Data logs / VERDANT lore terminals, "You caused the Fall" reveal

## Player & presentation
- [x] Third-person over-the-shoulder camera by default, first-person toggle (V / RS-click)
- [x] Detailed procedural humanoid: male and female bodies, face, hands, hair, jointed walk/run/aim/idle/sprint/reload/mount animation
- [x] Character creator on New Game (body, skin tone, 8 hair styles, 8 hair colors, scars/grime), saved with the game, controller/touch navigable
- [x] Rugged survivor look: weathered skin, scars, dirt, patched worn clothing; starts in rags
- [x] Clothing layers per item and rarity (hoods, beanies, helmets, visors, gasmasks, jackets, plated vests, chitin harness, duster, jeans, cargo, greaves) + glowing rarity trims and set bonus
- [x] Photo mode (free camera, filters, hide HUD, PNG capture, gallery in IndexedDB)
- [~] No facial animation, cloth physics, or hand-authored mocap; everything is procedural

## Controls & platforms
- [x] Xbox controller first: glyphs in every prompt, LT ADS, RT fire, light aim assist (toggle), rumble, full menu navigation
- [x] Keyboard + mouse
- [x] Touch (iPhone/iPad): joystick, drag-look, buttons, auto-hidden with gamepad; PWA manifest, icons, offline service worker
- [~] Haptics on iOS Safari depend on browser support for gamepad rumble

## Graphics
- [x] Quality presets Low/Medium/High/Ultra, dynamic resolution, bloom, ACES, MSAA, soft shadows
- [x] Procedural normal/roughness detail (concrete, rust, moss, bark, asphalt), foliage, vines, puddles
- [x] Weather: rain, storms with lightning, fog, snow with snow-covered ground
- [~] No authored textures/models; all procedural (keeps the bundle tiny and offline-ready)

## World systems
- [x] Seasons (Spring / Summer / Autumn / Winter): change weather, drain, foliage, crops
- [x] Crops + greenhouse (winter growth only under glass)
- [x] Traps (spikes), power grid (solar, generator + fuel, battery) feeding turrets, floodlights, greenhouse
- [x] Raiders (rifle raiders + captain) with ranged AI
- [x] Trader NPC with barter menu
- [x] Outposts: activate, safe zone, fast travel, tame swap
- [x] Keycard bunkers (Bronze → Silver → Gold) with blueprints, loot, next keycard
- [~] Districts are named zones on one map rather than separate streamed regions

## Mutants & taming
- [x] Ravager (charger), Thornling (burrower), Hollow (watch-freeze stalker), Skitter (packs), Bloater (gas)
- [x] Organic procedural mutant models with jointed legs, breathing, tails, opening petals, jaws (M7)
- [x] Taming by weakening + favorite food, bond, KO/revive, party at base, bestiary
- [x] Evolution into Elder forms; mounting Ravagers / Elders with charge attack
- [~] Mutant variety is 5 species + alpha/shiny/elder variants (doc lists more)

## Endgame
- [x] Final boss: the Verdant Heart (tentacle slams, spore orbs, thornling/skitter spawns, enrage)
- [x] Ending choice: Redeem (cleanse the city) or Embrace (Heartspawn companion)
- [ ] Post-ending New Game+ / credits sequence

## Saving
- [x] Autosave every 60 s and on tab hide, 3 manual slots, Continue / Load, saved look + gear + base + tames + flags

## Known gaps
- Multiplayer / co-op (not in the prototype scope)
- Voice acting, music score (everything is synthesized SFX)
- Real iOS device testing: only tested in headless iPad emulation
- Headless software rendering is slow in the dense arena/bunker areas, so the boss wake timer was forced in automated tests (it runs fine at normal frame rates)
- Base meshes are stylized low-poly CC0 packs (smoothed and grime-shaded), not photoreal; there is no dedicated jump clip (procedural pose)
- Thornling and the Heart boss are still procedural (upgraded with matte, displaced surfaces), not GLB rigs
