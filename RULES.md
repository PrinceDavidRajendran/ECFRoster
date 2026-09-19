# ECF Roster — Rules Reference

## Exclusions

| Person | Rule |
|--------|------|
| Adrian | **Global skip** — on break, not rostered anywhere (kept in list) |
| Dino | Not rostered on **Freeshow** |
| Wan Ying | Only used for **Counting** and **3rd HC Server** |

---

## Preaching Rotation (Sundays)

| Week | Preacher |
|------|----------|
| 1st | Ps Ludwig |
| 2nd | Chris / Donald (alternate) |
| 3rd | Ps Ludwig |
| 4th | Donald |
| 5th | Grace |

---

## Worship Leaders

**Cycle order:** Ps Ludwig → Deepi → Grace → Lee → Amy

- Adrian is skipped (on break)
- Leaders rotate across both Saturday and Sunday services
- If a leader does Saturday, they skip the following Sunday
- **Preaching priority**: whoever is preaching that week cannot also lead worship

---

## Musicians (Piano, Guitar, Bass, Drums, Freeshow)

- **No back-to-back**: If possible, don't roster the same person in the same slot two weeks in a row
- **Guitar skipped** when worship leader plays guitar themselves (Ps Ludwig, Amy, Lee)
- **Drums priority**: Mathias preferred, max **3 times per month**; after that others fill in
- **Freeshow**: Mathias deprioritized (only if no other role); Dino excluded entirely
- Freeshow pool: Mathias, Izaac, Jullianne, Elizabeth, Suzanna, Ammon, Jarrod

---

## Singers

- **2 singers per week**
- **Gender balance**: 1 male + 1 female where possible; fall back to same-gender only if no option
- Avoid same singers back-to-back weeks
- **Male singers**: Lee, Izaac, Hock, Pax
- **Female singers**: Deepi, Grace, Jullianne, Elizabeth, Amy, Suzanna

---

## Sound

- Avoid same person back-to-back weeks
- Pool: Ps Ludwig, Jullianne, Elizabeth, Suzanna, David

---

## HC Conductor

**Priority order:** Alvin → Chris → Donald → Dino

| Rule | Detail |
|------|--------|
| Alvin prioritized | Max **2 times per month** |
| No back-to-back | Same conductor won't do consecutive weeks unless necessary |
| Chris/Donald alternate | Won't pick the same one two weeks in a row |
| Can't conduct if preaching | Conductor excluded on their preaching week |
| Saturday | Uncle Hock only |

---

## HC Servers (3 per week)

### First 2 servers — Fixed pairs

| Pair | Constraint |
|------|-----------|
| Chris + Karen | — |
| Alvin + Deepi | Deepi only if not doing anything else |
| Donald + Puay Choo | — |
| Lee + Sally | Lee only if not doing anything else |

- Pairs rotate fairly (least-used pair picked each week)
- If no pair is fully available, fallback to legacy pool

### 3rd server

Pool: **Aira, Wan Ying, Dino**

- If Dino is 3rd server → Amy is removed from worship team that week
- HC Conductor cannot also be HC Server the same week

---

## HC Setup

Fixed: **Ezekiel, Ammon** (every week they're available)

---

## Ushers

- **2 per week** (1 expert + 1 young)
- **No back-to-back** weeks
- Experts: Sally, Anne, Puay Choo, Katherine, Karen
- Young: Jullianne, Aira, Alif, Ammon, Pax, Richard, Jarrod

---

## Counting

- **2 per week** (1 senior + 1 junior)
- Can overlap with ushers/HC servers (different time during service)
- **Conflict**: Karen and Wan Ying cannot count together
- Seniors: Karen, Hock, Puay Choo, Alvin
- Juniors: Katrina, Francisca, Wanying

---

## Hospitality (Team A / Team B rotation)

- **Team A (11, head Molly):** Molly, Katrina, Peter, Deepi, Katherine, Aira, Elizabeth, Puay Choo, Caroline, Grace, Suzanna
- **Team B (9, head Rosalind):** Rosalind, Amy, Jullianne, Sally, Wanying, Karen, Anne, Ida, Francisca
- **Sundays only** — Saturdays are always empty
- **1st Sunday defaults to break** (`none`); any week can be manually set to `none` (recess / rare off-weeks) or `combined` (special Sundays, e.g. Evangel Day → Molly, Rosalind, Karen)
- Remaining active Sundays **alternate A/B**, continuing from the previous month's last A/B serving (break/combined weeks don't consume rotation)
- **3 `^` setup leads** per serving, round-robin through the team (rendered in hospitality column 1, bold)
- **Allows overlaps** — hospitality members may also be on worship team / ushers / HC / camera the same week, and away people stay listed (no hard warnings)

---

## Kitchen & Cafe (Sundays where hospitality serves)

- **Cafe (fixed 5, every serving Sunday):** Elizabeth, Aira, Richard, Jarrod, Ammon
- **Kitchen (5 per week):** David (lead, every week) + 4 fairness-rotated from Suzanna, Alif, Pax, Jullianne, Grace, Amy, Ida, Deepi
- **Sundays only** — Saturdays are always empty
- **Follows hospitality:** Team A/B weeks get both crews; `combined` gets kitchen only; `none` (break/recess) gets neither
- **Allows overlaps** — crew may also sing, play, usher, etc. the same week (e.g. Grace); only away-dates filter auto-fill
- Editable in Admin → Rules → Kitchen & Cafe; dropdowns list everyone with the `kitchen` / `cafe` capability (Admin → People)

---

## Saturday (1st Saturday) Unavailable

Aira, Jarrod, Ammon, Alif, Molly, Francisca

---

## General Algorithm Rules

1. **Fairness**: Least-busy person is preferred (fewest total assignments that month)
2. **Cross-month fairness**: When generating a new month, the previous month's roster is loaded — people who were **not** rostered last month are prioritised, and heavy servers are eased off
3. **No back-to-back**: Musicians, singers, sound, HC conductor avoid consecutive weeks (carried across the month boundary too)
4. **Varied combinations**: Ushers avoid repeating the same pairings; worship-leader rotation continues from where last month ended so the same people don't always open the month
5. **Clash prevention**: Worship team members can't also be ushers, HC servers, or camera the same week
6. **Away dates**: Anyone marked away is automatically excluded for those dates
