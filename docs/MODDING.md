# Making mods for Sky War Shooter 3D

A mod is one JSON file. It can add **missions**, **paint schemes**, **nose art** and **crew names**.
Players add it in **Hangar → Aircraft & Armory → Mods** (pick the file, drop it on the screen, or paste
its text), switch it on or off there, and fly its missions from its card. Paint schemes and nose art
from enabled mods appear in **Hangar → Customize** with a `MOD` tag, free to use.

Mods are data only. The game reads them with a JSON parser, checks every field against the schema below
and drops anything it doesn't know. They can't run code or load anything from the web.

Start from the template (Mods screen → *How to make a mod* → *Download template*) or from the examples in
`public/mods/` (built by `node tools/mods/build_examples.mjs`).

## The file

```json
{
  "format": "sws3d-mod",
  "version": 1,
  "id": "my-first-mod",
  "name": "My first mod",
  "author": "Your name",
  "description": "A short line about what this mod adds.",
  "missions": [],
  "paints": [],
  "noseArt": [],
  "crew": {}
}
```

| Field | Rules |
|---|---|
| `format` | must be `"sws3d-mod"` |
| `version` | `1` |
| `id` | 2–24 characters: lowercase letters, digits, dashes. A mod with the same id replaces the installed one (it stays on or off as it was). |
| `name` | up to 40 characters (required) |
| `author`, `description` | optional, up to 40 / 240 characters |

A mod must hold at least one mission, paint scheme, nose art design or crew name. A file can be up to
1 MB, and up to 12 mods can be installed (3 MB together).

## Missions (up to 12)

The same choices as the Mission Editor. Every field except `id` is optional; missing fields take the
editor's defaults.

```json
{ "id": "dawn-strike", "name": "Dawn Strike", "target": "Docks, Bremen", "route": "short",
  "weather": "clear", "sunElevation": 12, "seat": "tail", "bombers": 12, "skill": "veteran",
  "escorts": "late", "flak": "heavy",
  "waves": [ { "leg": "in", "from": "front", "count": 4, "types": ["fw190"] } ] }
```

| Field | Values |
|---|---|
| `id` | 2–24 lowercase letters, digits, dashes; unique in the mod |
| `name` | up to 24 characters (letters, digits, spaces, `- . , ! ? # ( ) :`) |
| `target` | one of the ten editor targets by name (`"U-boat pens, Wilhelmshaven"`, `"Docks, Bremen"`, `"Ball-bearing plants, Schweinfurt"`, `"Aircraft works, Regensburg"`, `"Oil refinery, Merseburg"`, `"Rail yards, Hamm"`, `"Chemical works, Ludwigshafen"`, `"Tank factory, Kassel"`, `"Airfield, Rheine"`, `"Government quarter, Berlin"`) or index 0–9 |
| `route` | `short`, `medium`, `long` |
| `weather` | `clear`, `overcast`, `storm`, `dusk`, `lightRain`, `heavyRain`, `snow`, `fog`, `thunderstorm` |
| `sunElevation` | whole degrees, the Custom Battle range |
| `seat` | `waistL`, `waistR`, `top`, `ball`, `tail` |
| `bombers` | 6, 9, 12, 15 or 18 |
| `skill` | `recruit`, `veteran`, `ace`, `insane` |
| `escorts` | `none`, `early`, `late` |
| `flak` | `none`, `light`, `heavy`, `deadly` (or 0–3) |
| `waves` | 1–8 waves: `leg` (`in`, `target`, `home`), `from` (`front`, `rear`, `left`, `right`, `high`, `mixed`), `count` 1–12, `types` (`fw190`, `bf109`, `bf110`, `ju88`, `ju88g`, `me262`, `me163`, `me410`, `do335`, `he111`) |

Or paste a Mission Editor code: `{ "id": "jet-hunt", "code": "…", "name": "Optional new name" }`.

Mod missions are flown like player missions: they earn merit and career progress but never post scores to
the online leaderboards.

## Paint schemes (up to 8)

```json
{ "id": "desert-camo", "name": "Desert Camo", "top": "#b08a5a", "under": "#c7c9c2",
  "metal": false, "scale": 1, "pattern": "data:image/png;base64,…" }
```

- `top`, `under`: `#rrggbb` colours of the upper surfaces and the underside. A scheme needs `top` or `pattern`.
- `pattern` (optional): a tileable camouflage image. It replaces the top colour, tiled across the hull.
  The national markings, numbers and panel shading stay.
- `scale` (0.25–8, default 1): more tiles (smaller blotches) above 1.
- `metal`: `true` for a polished finish.

## Nose art (up to 12)

```json
{ "id": "checkertail", "name": "Checkertail", "image": "data:image/png;base64,…", "showName": true }
```

The image is fitted into the 2:1 decal on the left side of the nose (512 × 256 works best; use a
transparent background). With `showName` (default `true`) the bomber's name is painted under it.

## Crew names

New names for the ten crewmen, by id: `brenner` (pilot), `doyle` (co-pilot), `stern` (navigator),
`kessler` (bombardier), `mendez` (top turret), `gallo` (radio), `reilly` (ball), `price` (left waist),
`walsh` (right waist), `dawson` (tail).

```json
"crew": { "dawson": { "first": "Sam", "last": "Becker", "nick": "Owl", "bio": "Optional, up to 160 characters." } }
```

`first` / `last` / `nick`: up to 16 letters, spaces, apostrophes, dots or dashes. Names show on the crew
screens; recorded radio calls keep the original voices and names. With several mods on, later mods win.

## Images

Images are embedded in the file as `data:image/png;base64,…`, `image/jpeg` or `image/webp` data URLs,
at most ~220 KB each and 1024 pixels a side. SVG and web addresses are not accepted. An image that can't
be decoded is skipped (the card says so), the rest of the mod still works.
