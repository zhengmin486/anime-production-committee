Cozy Interiors Lite (free)  (v1.5)
============================================
27 pixel art interior assets for cozy top-down games, drawn on a 16x16 grid.
Free sample of Cozy Interiors (full pack: 280 assets).
- Floor tiles: 3
- Rugs and mats: 1
- Walls, windows and doors: 8
- Furniture: 8
- Kitchen: 2
- Bathroom: 1
- Lighting: 1
- Plants: 1
- Decor props: 1
- Small tabletop props: 1

CONTENTS
- assets/outline/16px|32px/<category>/     main style (transparent PNG)
- assets/no_outline/16px|32px/<category>/  variant without the dark outline
- spritesheets/  one sheet per category + all_*.png. Each asset sits in a 32x32 cell (64x64 at 32px),
                 top-left aligned. index.json / index.csv give name, category, variant, size, x, y, w, h,
                 size in tiles (tiles_w, tiles_h) and seamless_tile (true for repeating floor/wall tiles).
- previews/      labeled previews per category
- palette.png / palette.hex   the 28-colour palette shared with the other Cozy packs by glintapps

SIZES
Most props are 16x16. Multi-tile pieces are 16x32 (wardrobe, fridge, doors, tall plants...),
32x16 (sofas, dining tables, bathtub...) or 32x32 (double beds, round table, fireplace, piano...).
Small tabletop props (tabletop/) keep their art in the lower part of a 16x16 cell, about 8x8 to 10x10 pixels,
so they can be placed on a table, desk or nightstand top at the right scale (shift them up a few pixels).
The 32px files are exact 2x nearest-neighbour upscales.

TILES
- Floors (wood, tile, stone, carpet, tatami) are seamless 16x16 tiles.
- Walls are 2 tiles high: wall_<style>_upper on top of wall_<style>_lower (with baseboard).
  Windows replace an upper tile; doors are 16x32 (or 32x32 for the double door) and replace both.
- walltop_* is a 16-piece set for the top of walls seen from above: 3x3 block (top_left ... bottom_right),
  single, horizontal and vertical runs (h_end_left, h_mid, h_end_right, v_end_top, v_mid, v_end_bottom)
  and 4 inner corners. That covers the cases a 4-neighbour autotile rule needs; it is not a 47-tile blob set.
- Floor, wall and walltop tiles are identical in the outline and no_outline folders (an outline would break the tiling).

PROJECTION RULE (v1.5, one rule for every piece)
Cozy 3/4 top-down, orthographic, seen from about 45 degrees above. At 16 px = 1 m:
- widths (x) are never scaled
- top surfaces are foreshortened to half their real depth (DEPTH_RATIO 0.5: 1 m deep shows as 8 px)
- front faces show at three quarters of their real height (HEIGHT_RATIO 0.75: 1 m tall shows as 12 px)
- only the top and the front face are visible, never the left or right side; light comes from the top left
Floors, rugs and wall tiles stay on the square tile grid. Reference heights used: chair seat 0.45 m,
sofa seat 0.4 m, sofa arm 0.55 m (armchairs 0.45 m: a small deliberate cheat so the cushion stays visible at 1x in every view), sofa back 0.9 m, sofa and armchair depth 0.65 m, table 0.7 m, bed mattress 0.45 m, wardrobe 2 m.
listing screenshot 9 (perspective check) shows the pieces next to a 1 m reference cube.

ORIENTATION VARIANTS (added in v1.3, redrawn in v1.5 with the projection rule)
Many seats and wall pieces come in several facings. The suffix says which way the piece FACES:
- no suffix: faces the viewer (front view, the default for every piece)
- _back: faces away from the viewer, for example a sofa facing a fireplace or TV on the top wall
- _right: faces right, its back or wall side is on the left (place it against a left wall)
- _left: faces left (place it against a right wall). _left is the mirror of _right.
Variants: armchair_green and armchair_mustard (_back, _left, _right), sofa_green, sofa_blue, sofa_red
(_back, plus _left and _right as 16x32 side views), chair_side (faces right) and chair_left,
chair_red_left and chair_red_right (chair_up is the back view), bed_single_red and bed_single_blue
(_left, _right, 32x16 with the headboard against the side wall), wardrobe, bookshelf and nightstand (_left, _right).
Every variant keeps the footprint and scale of the front view.

SCALE REFERENCE (v1.2, every asset was measured against this)
Cozy top-down scale: 1 tile = 16 px, about 1 m. Small props are drawn about 1.5x larger than
strict scale so they stay readable, but always smaller than the furniture they sit on.
- Doors 16x32 (art 14 wide). Windows about 12x12. Wall frames, clocks, mirrors 8 to 10 px.
- Beds: single 16x32, double 32x32. Nightstand about 10x10. Wardrobe and bookshelf 14x30.
- Chairs about 8 to 10 px wide (seat about 8), stool 8x9, armchair 14x14, sofa 30x14.
- Tables: small 14x14, dining 30x14 (two chairs per side), round table 24 px across,
  coffee table 22x10.
- Rugs 30x30 (round or square) or 30x16 (runners). Doormat 14x8.
- Fridge 14x30, about twice the height of a 16x16 counter.
- Floor lamps 26 to 28 px tall. Table lamps about 7x9.
- Plants: floor pot 10x13, tabletop plants 6 to 8 wide, tall plants 16x24 to 16x28.
- Cat 11x9, plushies 8x10, cushions 8x6 (two fit on a sofa).
- Countertop items (kettle, pot, fruit basket, microwave) 8 to 12 px wide.
- Tabletop props (tabletop/ folder): mug 4x6, book 6x5, plate 8x3, laptop 8x6.
Most small props are bottom-anchored in their 16x16 cell: place the cell so its bottom edge
sits on the floor or on the furniture top (the tabletop and countertop art ends at row 14).
listing screenshot 7 (scale lineup) shows every piece on one baseline.

HOW THEY WERE MADE
Every asset was drawn in code (Python + Pillow) with rectangles, lines, ellipses and single pixels.
No AI image generation was used.

LICENSE (summary, see LICENSE.txt)
Use in personal and commercial projects, modified or not; no attribution required (credit appreciated).
Do NOT resell, redistribute or re-upload the assets themselves, standalone or inside another asset pack,
and do not use them to train AI / machine-learning models.
