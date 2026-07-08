# Icon inventory — canonical SVG paths from the user's design files

Source of truth: `unpacked/Vidra App.dc.html`, `unpacked/Vidra Desktop.dc.html`,
`unpacked/Vidra Admin.dc.html` (+ desktop-admin facts in `DESIGN-NOTES-index.md`).
These are the EXACT paths the design uses. Vendor these — do not substitute a library's
variant when the design's path differs (heart, library, create). All are feather-style:
`viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"`,
stroke-width 1.8 default (see per-icon notes). Sizes are rendered via width/height on a 24
viewBox; the design renders 8px–30px from the same paths.

Attribution: several paths are identical or near-identical to Feather Icons (MIT,
Copyright (c) 2013-2023 Cole Bemis). Include the MIT notice with the vendored set.

## Conventions observed in the design

| Property | Value |
|---|---|
| viewBox | `0 0 24 24` (one exception: IPFS cube, `0 0 12 14`) |
| stroke | `currentColor` (explicit `var(--fgs)`/`var(--fgm)`/`#fff` when the icon must not inherit) |
| stroke-width | 1.8 default; 1.9 desktop sidebar (17px); 2.0–2.4 at ≤16px render sizes; 3 for the 8–9px verified check |
| caps/joins | `round`/`round` on nearly all |
| fill exceptions | play triangle, playlist glyph, more-horizontal dots, library's inner play — these are filled shapes by design |
| decorative dots | LIVE dot, status dots, red badge dot are `<span>` circles, NOT icons — do not convert |

## Path table (icon name → mapped feather name → exact SVG inner markup)

| # | Design meaning | Feather name | Inner SVG (verbatim) | Notes |
|---|---|---|---|---|
| 1 | Notifications | `bell` | `<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>` | 20–23px, sw 1.8 |
| 2 | Search | `search` | `<circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/>` | 15–23px, sw 1.8–2 |
| 3 | Close / clear | `x` | `<path d="M18 6 6 18M6 6l12 12"/>` | sw 2–2.2 |
| 4 | Back | `chevron-left` | `<path d="M15 4l-8 8 8 8"/>` | 15–18px, sw 2.2–2.4 |
| 5 | Disclosure / row nav | `chevron-right` | `<path d="m9 5 7 7-7 7"/>` | 13–15px, sw 2–2.2 |
| 6 | Expand / select / player minimize | `chevron-down` | `<path d="m6 9 6 6 6-6"/>` | 11–14px, sw 2–2.4; replies toggle rotates 180° when expanded |
| 7 | Add / Save action | `plus` | `<path d="M12 5v14M5 12h14"/>` | sw 2–2.4 |
| 8 | Create (tab bar) | `plus-square` (rounded) | `<rect x="2.5" y="2.5" width="19" height="19" rx="6"/><path d="M12 8v8M8 12h8"/>` | 30px, sw 1.5, rx6 — NOT feather's rx2 |
| 9 | Home | `home` | `<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>` | tab 23px sw 1.8; sidebar 17px sw 1.9 |
| 10 | Inbox (tab) | `bell` | same as #1 | |
| 11 | Library | `layers`-ish custom | `<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m9 9.5 4 2.5-4 2.5z" fill="currentColor" stroke="none"/><path d="M19 5h2v14"/>` | inner play is FILLED |
| 12 | Studio / video content | `video`-ish | `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>` | |
| 13 | Trending (desktop nav) | `trending-up` | `<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>` | 17px, sw 1.9 |
| 14 | Subscriptions (desktop nav) | `tv` | `<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 5h10M9 2h6"/>` | |
| 15 | History (desktop nav) | `clock` | `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>` | |
| 16 | Messages / comment | `message-circle` | `<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.4-1.2L3 20l1.2-5.1A8.5 8.5 0 1 1 21 11.5z"/>` | |
| 17 | E2EE / 2FA lock | `lock` | `<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>` | 11–22px |
| 18 | Attachment / doc | `file` | `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>` | |
| 19 | Send (DM) | `arrow-up` | `<path d="M12 19V5M5 12l7-7 7 7"/>` | 15px, sw 2.2 |
| 20 | Upload | `upload` (variant) | `<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 20h16"/>` | flat base bar, not feather's tray |
| 21 | Download | `download` (variant) | `<path d="M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>` | tray + arrow down |
| 22 | Share | `share` (variant) | `<path d="M12 5v9M8.5 8.5 12 5l3.5 3.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>` | tray + arrow up |
| 23 | Support / donate | `heart` (custom draw) | `<path d="M12 21s-7.5-4.6-9.5-8.6C.9 9 2.7 5.5 6.2 5.5c2 0 3.3 1 4 2.1.7-1.1 2-2.1 4-2.1 3.5 0 5.3 3.5 3.7 6.9-2 4-9.9 8.6-9.9 8.6z"/>` | vendored path differs from feather's heart — use this one |
| 24 | Report | `flag` (variant) | `<path d="M4 21V5a1 1 0 0 1 1-1h13l-3 5 3 5H5"/>` | pennant-style |
| 25 | Save-to-playlist glyph | custom filled | `<path d="M4 5h12v2H4zM4 9h12v2H4zM4 13h8v2H4zM17 12v6.5a2.5 2.5 0 1 1-2-2.45V10l6-1.5V12z" fill="currentColor" stroke="none"/>` | filled, list+note |
| 26 | Overflow menu | `more-horizontal` (filled) | `<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>` | `fill="currentColor"`, no stroke |
| 27 | Play (player, filled) | `play` (filled) | `<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>` | |
| 28 | Spinner | `loader` (arc) | `<path d="M21 12a9 9 0 1 1-6.2-8.56"/>` | sw 2.4 + `animation: spin 1s linear infinite` |
| 29 | Re-fetch / retry | `rotate-cw` | `<path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/>` | sw 2 |
| 30 | Copy | `copy` | `<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>` | sw 1.8 |
| 31 | Check / verified / done | `check` | `<path d="m4.5 12.5 5 5 10-11"/>` | sw 2.2; sw 3 at 8–9px in VERIFIED pill |
| 32 | Info | `info` | `<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>` | sw 2 |
| 33 | Warning / error | `alert-triangle` | `<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>` | sw 1.8–2 |
| 34 | User / follower | `user` | `<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>` | notification glyph, 16px |
| 35 | Moderation / held | `shield` | `<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>` | admin Queues tab + "held for review" |
| 36 | Captions | custom `message-square` variant | `<path d="M4 5h16v12H8l-4 4z"/>` | speech box, sharp corner |
| 37 | Admin overview | `grid`-ish (mixed rects) | `<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>` | dashboard masonry |
| 38 | Admin users | `users` (custom) | `<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 3-5.5 6.5-5.5s6.5 1.9 6.5 5.5"/><path d="M16 5a3.5 3.5 0 0 1 0 6.5M18.5 14.5c2 .8 3 2.4 3 4.5"/>` | |
| 39 | Admin instance | `server` | `<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>` | |
| 40 | Blocked overlay | `slash`-in-circle | `<circle cx="12" cy="12" r="9"/><path d="M5.5 5.5l13 13"/>` | over 55% black scrim on thumbs |
| 41 | IPFS | custom cube | `<svg viewBox="0 0 12 14" ...><path d="M6 1l5 3v6l-5 3-5-3V4z"/><path d="M6 7l5-3M6 7L1 4M6 7v6"/></svg>` | ONLY non-24 viewBox; sw 1.4; 10x11 render |

## NOT icons (do not convert to SVG)

- LIVE pulse dot: `<span>` 6px circle `#ff453a` + `vpulse` animation, inside the LIVE pill — typography+dot, keep as-is.
- Status dots (health rows, IPFS bar, quarantine scan, "waiting for encoder", Go-live button's red dot): plain circles via border-radius, colored by `--ok/--wrn/--dng/--fgs`.
- Duration chips ("24:16"), resolution chips ("1080p", "CC"): text chips, tabular-nums.
- Unread dot / unread-count pill, tab-bar badge count: text/em-dot elements.
- Avatar initials, `[deleted]` author's `·` placeholder initial: text.
- QR code in Support sheet/dialog: data graphic built from `<path>` grid, not an icon component (implementer should generate QR from the address string).
