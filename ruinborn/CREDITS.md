# RUINBORN — Credits & Licenses

All third-party assets are vendored locally (no network needed at runtime).

## 3D models (CC0 1.0 Public Domain)
| Files | Source pack | Author | License |
|---|---|---|---|
| `assets/chars/m_*.glb` (base, adventurer, casual_hoodie, punk, swat, worker) | Ultimate Modular Men Pack — https://quaternius.com/packs/ultimatemodularcharacters.html | Quaternius | CC0 1.0 |
| `assets/chars/f_*.glb` (base, adventurer, worker, soldier, punk) | Ultimate Modular Women Pack — https://quaternius.com/packs/ultimatemodularwomen.html | Quaternius | CC0 1.0 |
| `assets/creatures/bull.glb`, `wolf.glb` (Ravager / Heartspawn, Skitter) | Ultimate Animated Animal Pack — https://quaternius.com/packs/ultimateanimatedanimals.html | Quaternius | CC0 1.0 |

GLB files were obtained from the CC0 mirror https://github.com/Papyszoo/CC0-Public-Domain-Models (`packs/…`) and
processed with glTF-Transform (unused animations pruned, prop meshes removed). Hollow, Bloater and Raider bodies reuse the
modular human GLBs with in-engine mesh deformation. All mutation details (vines, thorns, moss, chitin, eyes, pustules,
veins, grime/scar shading) and the Thornling / Heart boss are procedural code in this project.

## Code
- three.js r160 (`vendor/three.module.js`, `vendor/jsm/` incl. GLTFLoader, SkeletonUtils, BufferGeometryUtils) — MIT License, © three.js authors — https://github.com/mrdoob/three.js
- Fonts: Bebas Neue (Dharma Type) and Barlow Condensed (Jeremy Tribby), `fonts/` — SIL Open Font License 1.1 (see `fonts/LICENSE.txt`).
- All other code, audio synthesis and textures: original to RUINBORN.
