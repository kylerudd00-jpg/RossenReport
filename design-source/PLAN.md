# Rossen Reports redesign plan

Branch: `redesign`. Nothing here goes live until Kyle/Jeff say "push it".

## The site's job

- **Who visits:** Jeff's TV and YouTube audience. Mostly adults who run a household budget, arriving from a video, a Substack email or a search for his name.
- **What they need to believe:** Jeff is a real, award-winning journalist who has done the work, so his deal picks are worth acting on.
- **The one action:** join the free newsletter ("Get the Deals"). Second: watch the latest episode. Third: shop his storefronts (affiliate revenue).
- **Jeff's brief (Nov 22):** lead with deals, saving money and shopping smart, not with scams.

## Stack (keep it)

Express app (`server.js`) on Vercel as a single function (`api/index.js`), one big `index.html`, an `admin.html` control board. Live data: YouTube (latest episode, subscriber count), federal scam-alert feeds, Substack signup. Storage: Vercel Blob for admin edits. **There's no Blob store on the new Vercel project yet, so admin edits can't save.**

## Inventory (keep / rewrite / cut / unclear)

| Section | What it is now | Call |
|---|---|---|
| Hero | Name, tagline, 2 buttons, 3 stats, a photo card like a TV lower third, a strip of 2 federal alerts | **Rewrite**: lead with this week's deal and the signup. The alert strip moves down. |
| "As seen on" logos | NBC, TODAY, Dateline, Hearst, ABC, CBS | **Keep**: real proof. |
| Latest episode | YouTube player plus an archive carousel | **Keep**, restyle |
| Deals of the week | 4 cards for general categories, set in the admin | **Rewrite**: they aren't deals, they're category links. Replace them with real dated picks (from Substack deal posts or the admin). |
| Shop & save | Amazon, Walmart, DealSeek cards | **Keep**: merge into the deals area as "Where Jeff shops" |
| Scam alerts | Long live feed of federal alerts, with filters | **Rewrite**: keep it, but shorter (5 items plus "see all"), placed after deals |
| Viewer wins | Scrolling testimonials, all about scams | **Unclear**: are these real viewers? We need real quotes, ideally about savings. |
| Newsletter band | Email form (Substack) | **Keep**: becomes the main call to action, placed about 1/5 of the way down |
| Follow | Social link cards | **Keep**, make it smaller |
| About | Quote plus 4 credentials | **Rewrite**: the story section, with real facts only (verified: NBC 2008–2019, Hearst 2019–2024, Peabody/Murrow for 9/11 coverage at WABC, book in 2017) |
| Work with Jeff | 3 cards (speaking, partnerships, press) | **Keep**, make it smaller. The contact form was already cut. |
| Newsletter popup and sticky bar | | **Keep**, same label everywhere |
| Phone bottom nav | | **Keep** |

## AI tells on the current site

- Every section uses the same pattern: eyebrow, then a big condensed heading, then a grid of white cards.
- A stat band of big yellow numbers.
- Icon grids: deals, shop, credentials and work-with-Jeff are all "icon + title + one line".
- Flat fills (paper grain was only added on Nov 22).
- Every card is the same style.

## Open questions for the owner

See the direction board. Asked once, in one message.

## Phases

1. Audit (this file, `before/`) ✅
2. Reference research (`refs/`, `REFERENCES.md`)
3. Direction board plus prototype → **owner's go**
4. Art: real photos first, ChatGPT prompts for anything generated
5. Full build on `redesign`
6. QA: 9 widths, axe, console, keyboard, an independent review
7. Iterate with the owner
8. Launch on "push it"
