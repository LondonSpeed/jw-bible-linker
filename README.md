# JW Bible Linker (Obsidian)
This is not an official app and is not related to jw.org or any other organisation.
Use at your own risk. 
Type a Bible reference in **any supported language** (Estonian, English, Russian, Finnish, German) and turn it into a link that opens in **JW Library in the language you choose** in the settings.

- `Joh 3:16`, `Apostlite teod 2:1`, `Mt 24:14-15`, `Иоанна 3:16; 5:24` -> clickable links
- Commands: *Link Bible references* (selection or whole note), *Insert Bible reference link…*, editor right-click menu
- Verse lists: `Joh 1:1,2` (one link for neighbouring verses), `Mt 1:1; 1:5; 3:1` (a link each, book remembered)
- Works in notes and in Canvas text cards (the automatic link-while-typing is a CodeMirror extension)
- Settings: JW Library language, app link vs jw.org link, link text style, recognised languages, custom abbreviations

## Publications
Magazine issues are linked when the code and the numbers are written **together, without a space**:

| Type | Result |
|---|---|
| `w24.01` | The Watchtower (Study Edition), 2024-01 |
| `wp25.09` | The Watchtower (Public Edition), issue 2025-09 |
| `g26.11` | Awake!, issue 2026-11 |
| `mwb24.03`, `km15.02` | Meeting workbook, Our Kingdom Ministry |
| `w08.09.15` | Older issues with a day: study edition of 2008-09-15 |
| `w08.09.01` | 2008-2015, dated the 1st: the public edition (the plugin uses `wp` for you) |

Citation style for the Watchtower (code and year stay together, then a space): `w01 8/15` (English: month/day) or `w01 15/8` (Estonian: day/month). The order is always clear because semi-monthly issues are dated the 1st or the 15th. From 2008 to 2015 the issue of the 1st is the public edition and the plugin uses `wp` for it.

Page and paragraph are not part of the link and stay as plain text next to it: `w25.12 3, lõik 4`, `w01 8/15 31`. The link opens the issue.

`w 24.01`, a bare `w` or `Watchtower` are never turned into links. The number is the issue code used by jw.org (for Awake! and the public Watchtower it is not always the calendar month). Page and paragraph stay plain text: `w24.01 lk 12`.

Link format: `jwlibrary:///finder?bible=BBCCCVVV&wtlocale=CODE` (BB book 01-66, CCC chapter, VVV verse; ranges as `start-end`).

## Develop
```
npm install
npm run dev     # watch build -> main.js
npm test        # parser tests
```
Copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/jw-bible-linker/`.

## Release
Bump version in `manifest.json`, `package.json`, `versions.json`, then on GitHub: Releases -> Draft a new release -> new tag (same as version) -> Publish. GitHub Actions attaches main.js, manifest.json and styles.css.
