# ChatGPT image prompts: Rossen Reports

**Optional.** The site works without these. If you make them, they go on the four items in **"Your week with Jeff"** (the yellow band). Right now those items are type only.

The style is a 1950s newspaper-circular engraving: one ink colour on a flat background, so the art reads as printed matter and not stock illustration.

## How to run them

1. Open **one new ChatGPT chat** for this set.
2. Send prompt 0 by itself first. It locks the style.
3. Send prompts 1–4 one at a time in **that same chat**.
4. Download each result as a file, named to match: `1-envelope.png`, `2-tv.png`, `3-tv-friday.png`, `4-magnifier.png`.
5. Send me the files. Attachments are fine; pasted images often can't be saved.

There are no logos, brand names or text in any prompt. Generated lettering comes out garbled, so the words stay in the site's own text.

---

### 0. Style lock (send first, by itself)

> For this whole conversation, match this house style: a 1950s American newspaper ad engraving, like spot illustrations in a Sunday grocery circular. Fine parallel-line and cross-hatch shading, confident outlines. Single ink colour: navy #0B2C6B on a plain flat background of #FFD100 (bright yellow). No text, no letters, no numbers, no logos, no borders, no watermarks. Square, 1024 by 1024, highest resolution you can produce. Reply only with the image.

### 1. The deals email → `1-envelope.png`

> Same engraving style as the set: a paper envelope tilted slightly, flap open, with a few clipped coupons with scalloped edges fanning out of it. Single navy ink (#0B2C6B) on plain yellow (#FFD100), centered with lots of empty space around it. No text, no logos, no frame.

### 2. Wednesday episode → `2-tv.png`

> Same engraving style as the set: a 1950s console television set seen at a three-quarter angle, rabbit-ear antenna, the screen showing only soft horizontal scan lines. Single navy ink (#0B2C6B) on plain yellow (#FFD100), centered with lots of empty space. No text, no logos, no frame.

### 3. Friday episode → `3-tv-friday.png`

> Same engraving style as the set: a small vintage tabletop radio-television combo with a round dial, seen straight on, screen showing soft scan lines. Single navy ink (#0B2C6B) on plain yellow (#FFD100), centered with lots of empty space. No text, no logos, no frame.

### 4. Scam alerts → `4-magnifier.png`

> Same engraving style as the set: a magnifying glass held over a long paper receipt that curls at the bottom, the lens slightly enlarging the dotted lines on the receipt. Single navy ink (#0B2C6B) on plain yellow (#FFD100), centered with lots of empty space. No text, no numbers, no logos, no frame.

---

**When they come back,** I'll check each one: no stray lettering, no extra objects, and the ink matches. Then I'll trace them into crisp single-colour SVGs and place them above each line in the week strip.

---

## Results (Nov 23, 2026)

Received five images. All passed the check: no lettering, no invented objects, and the ink matches.

| Original (`design-source/art-2026-11/`) | On the site (`art/`) | Where |
|---|---|---|
| `0-grocery-bag.webp`, an extra one made beyond these prompts | `grocery-bag-360/720.webp` | Beside "This week's circular" |
| `1-envelope.webp` | `envelope-120/240.webp` | Week strip: the deals email |
| `2-tv.webp` | `tv-120/240.webp` | Week strip: Wednesday |
| `3-tv-friday.webp` | `tv-friday-120/240.webp` | Week strip: Friday |
| `4-magnifier.webp` | `magnifier-120/240.webp` | Week strip: scam alerts |

**Processing:** `design-source/knockout.py` removes only the yellow ground connected to the edges, so yellow inside the drawings (the TV bodies) stays. It then trims each image and exports WebP at 1x and 2x.
