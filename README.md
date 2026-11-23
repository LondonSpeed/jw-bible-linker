# JW Bible Linker (Obsidian)
This is not an official app and is not related to jw.org or any other organisation.
Use at your own risk. 
Type a Bible reference in **any supported language** (Estonian, English, Russian, Finnish, German) and turn it into a link that opens in **JW Library in the language you choose** in the settings.

- `Joh 3:16`, `Apostlite teod 2:1`, `Mt 24:14-15`, `Иоанна 3:16; 5:24` -> clickable links
- Commands: *Link Bible references* (selection or whole note), *Insert Bible reference link…*, editor right-click menu
- Verse lists: `Joh 1:1,2` (one link for neighbouring verses), `Mt 1:1; 1:5; 3:1` (a link each, book remembered)
- Works in notes and in Canvas text cards (the automatic link-while-typing is a CodeMirror extension)
- Settings: JW Library language, app link vs jw.org link, link text style, recognised languages, custom abbreviations

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
