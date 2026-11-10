# RUINBORN: vertical slice

A browser prototype of RUINBORN's core loop. Everything is procedural (geometry, textures, audio), and Three.js is vendored, so it works offline.

## Run
    cd ruinborn
    python3 -m http.server 8000
    # open http://localhost:8000 in Chrome / Edge / Firefox

(Opening index.html directly via file:// won't work because ES modules need a server.)

## Controls
Keyboard & mouse: WASD move · Mouse aim · LMB fire · R reload · Shift sprint · Space jump · E interact (loot / read / feed / revive / sleep) ·
C craft & inventory · B build mode (LMB place, Q / wheel rotate, 1-5 switch piece, RMB exit) · Q eat · Z drink · H medicine · F flashlight · P hide HUD · Esc pause

Controller: L-stick move · R-stick aim · RT fire · A jump · X interact · Y reload · L3 sprint · RB build · LB rotate · D-pad up craft / down light / left eat / right drink · Start pause.
Aim assist is ON by default. It's light and controller only (slowdown plus gentle pull near targets). Toggle it in Settings.

## Tips
- A day is 5 minutes. At dusk a raid hits your Base Core. Build walls and turrets around it.
- Bring a mutant to 25% HP and it collapses. Feed it its favorite food (see the Bestiary) to tame it.
- Four VERDANT data logs are hidden in the city. There are no markers.

## v0.3 additions
- New Game opens a **character creator** (male / female survivor, skin tone, hair style and color, scars and grime). Your look is saved with every save slot. Controller: D-pad/LS choose, left/right change, right stick rotates. Touch: tap options, drag to rotate.
- Detailed procedural survivor models with jointed animation. You start in rags, and every scavenged clothing item and rarity changes the look.
- Organic, jointed mutant models (Ravager, Thornling, Hollow, Heartspawn).
- See MILESTONES.md and DESIGN_CHECKLIST.md for everything in this build.

## v0.4 additions (M8)
- Rigged, animated CC0 GLB survivors (male/female) with modular gear outfits and cross-faded animation; see CREDITS.md.
- Mutants rebuilt on rigged CC0 GLB creatures, realistic scale vs the 1.8 m player, retuned hitboxes and speeds; lumpy, matte boss.
- Assets live in `assets/` (~17 MB) and load with a progress line on start; works offline after the first load (service worker v4).
