# Reference research (Nov 22, 2026)

I captured 26 sites at 1440×900 with Playwright: one shot on load, then five more scrolling like a visitor. The shots are in `refs/` and the contact sheets are `refs/sheet-1..7.jpg`.

Cookie walls covered most of Oatly, Liquid Death, Aldi and The Hustle, so I've left them out of the notes. MSCHF only showed its homepage gimmick.

## The pattern

The memorable sites build their character from **their own printed matter and voice**:

- Trader Joe's draws its whole site from the *Fearless Flyer* engravings.
- Costco's site is its warehouse price signs.
- Semafor and Puck are newspapers with an attitude.
- MoneySavingExpert puts Martin Lewis's face and a yellow "free weekly email" band everywhere.

The forgettable ones (The Penny Hoarder, NerdWallet, RetailMeNot, Ramsey, Krazy Coupon Lady) are interchangeable grids of white cards with stock photos. **The Rossen site today sits in that second group.**

Jeff's own printed matter is the **Sunday deals circular** (what his newsletter is) and the **TV news lower third** (what made him known).

**Direction:** *a Sunday-paper deals circular crossed with a TV news lower third.*

## One borrow per reference

| Reference | Does | Borrow as |
|---|---|---|
| **moneysavingexpert.com** (closest analog: a famous consumer journalist plus a deals newsletter) | A yellow "Get our free weekly Money Tips email" band that sits on every scroll position, next to the journalist's face | The signup next to Jeff's face, in his yellow, early and repeated with the same words |
| **clark.com** (Clark Howard, same audience) | The newsletter signup is the first block on the page, with a subscriber count | The signup moves up into the hero |
| **traderjoes.com / Fearless Flyer** | The whole identity comes from its own printed flyer: engravings, a newspaper column voice, a side nav like a printed index | Build from Jeff's own printed thing, the weekly circular: a dated issue line and a column voice |
| **costco.com** | Huge red price bursts ("$100–500 OFF") as the loudest element, everything else quiet | One sale-tag red burst per deal, used sparingly |
| **publix.com weekly ad** | "BOGO" chips and "Save $2.10" lines under every item | Each pick says what you save, in plain words |
| **slickdeals.net / bradsdeals.com** | Date and store stamps on every deal ("2 hours ago · Amazon") | Mono date stamps on deal tags, so picks feel current |
| **dealnews.com** | Plain text deal headlines with the saving pulled out | Headlines first, images second |
| **consumerreports.org** | Trust stats placed right under the main pitch (130+ / 90 years / 5M) | Credentials stay, but as a story ("the receipts"), not a stat band |
| **nytimes.com/wirecutter** | A calm editorial column; deals sit inside reporting, not banners | Deal picks read as reporting with Jeff's byline |
| **semafor.com** | Tinted newsprint ground, hairline rules, dense type | Newsprint ground and double rules from newspaper layout |
| **puck.news** | A single loud red block for the lead story against a quiet page | The lead deal gets the one loud block; the others stay quiet |
| **theverge.com** | A rotated masthead and one enormous type moment | One huge headline in the hero ("Never pay full price again.") |
| **morningbrew.com** | The signup repeats in the same blue band, with the same words, three times down the page | The same "Get the Deals" label in the header, hero, mid-page and closer |
| **thepennyhoarder.com** (what to avoid) | Generic card grid, stock photos, a different call-to-action wording each time | Exactly what we're leaving behind |

## Palette, from real objects

| Token | From | Job | Contrast |
|---|---|---|---|
| `--navy #0B2C6B` | Rossen Reports logo | Headlines, main button | white on it 13.4:1 |
| `--yellow #FFD100` | Logo / TV lower-third bar | Highlight, lead deal ground | navy on it 10.6:1. Never small text on paper |
| `--newsprint #F4EFE3` | Sunday circular stock | Page ground | — |
| `--press #16181D` | Press-black ink | Body text | 16:1 on newsprint |
| `--press-2 #4A4D55` | Second ink | Small text | 7.6:1 on newsprint |
| `--tag-red #C3102D` | Sale-tag red | Bursts, kicker, focus ring | white on it 6.2:1; as small text on newsprint 5.4:1 |
| `--thermal #FBFAF6` | Receipt paper | Inputs, the receipt | — |

**Texture:** newsprint fiber grain on the page, and halftone dots on navy bands (cheap color printing).

**Type:**

- **Big Shoulders Display:** TV lower thirds and price cards
- **Archivo:** circular section labels
- **Newsreader:** the newspaper column
- **Courier Prime:** register tape and date stamps
