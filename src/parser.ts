import { BOOK_NAMES, CHAPTERS } from "./books";
import type { LangId } from "./books";

export interface LinkSettings {
	linkType: "app" | "web"; // jwlibrary:// deep link or https://www.jw.org/finder link
	jwLocale: string; // wtlocale code JW Library should open the verse in
	customLocale: string; // used when jwLocale === "custom"
	labelStyle: "asTyped" | "full" | "short";
	labelLang: LangId;
	recognizedLangs: LangId[]; // languages in which references are recognised
	priorityLang: LangId; // wins when an abbreviation exists in several languages
	customAliases: string; // lines like "Jn=43"
	autoLink: boolean; // convert references while typing
}

export interface FoundRef {
	start: number; // offset in the scanned text
	end: number;
	text: string; // the original text that will be replaced
	book: number; // 1-66
	chapter: number;
	verse: number;
	endVerse?: number;
	inherited: boolean; // "; 5:24" after "John 3:16" - book taken from previous ref
	bookText: string; // book name as typed
	rawNums?: string; // numbers as typed when a verse list was merged, e.g. "1:1,2"
}

const fold = (s: string) =>
	s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]/gu, "");
const squash = (s: string) => s.replace(/(.)\1+/g, "$1");
const pad = (n: number, w: number) => String(n).padStart(w, "0");

export class BookIndex {
	private exact = new Map<string, number>();
	private squashed = new Map<string, number>();
	private prefixes: [string, number][] = [];

	constructor(langs: LangId[], priority: LangId, customAliases: string) {
		// later insertions overwrite earlier ones, so insert the priority language last
		const order = langs.filter((l) => l !== priority);
		if (langs.includes(priority)) order.push(priority);
		for (const lang of order) {
			BOOK_NAMES[lang].forEach((row, i) => {
				for (const alias of row.split(",")) this.add(alias, i + 1);
			});
		}
		for (const line of customAliases.split("\n")) {
			const m = /^\s*(.+?)\s*=\s*(\d{1,2})\s*$/.exec(line);
			if (m && +m[2] >= 1 && +m[2] <= 66) this.add(m[1], +m[2]);
		}
		for (const [k, v] of this.exact) if (k.length >= 3) this.prefixes.push([squash(k), v]);
	}

	private add(alias: string, book: number) {
		const k = fold(alias);
		if (!k) return;
		this.exact.set(k, book);
		this.squashed.set(squash(k), book);
	}

	find(word: string): number {
		const k = fold(word);
		if (!k) return 0;
		const e = this.exact.get(k);
		if (e) return e;
		const q = squash(k);
		const s = this.squashed.get(q);
		if (s) return s;
		if (q.length < 3) return 0;
		const books = new Set(this.prefixes.filter((x) => x[0].startsWith(q)).map((x) => x[1]));
		return books.size === 1 ? [...books][0] : 0;
	}
}

/** Replace spans we must not touch (code, links, wikilinks, URLs, frontmatter) with spaces of equal length. */
export function maskProtected(text: string): string {
	const blank = (m: string) => m.replace(/[^\n]/g, " ");
	return text
		.replace(/^---\n[\s\S]*?\n---(?=\n|$)/, blank)
		.replace(/```[\s\S]*?```/g, blank)
		.replace(/~~~[\s\S]*?~~~/g, blank)
		.replace(/`[^`\n]*`/g, blank)
		.replace(/\[\[[^\]]*\]\]/g, blank)
		.replace(/\[[^\]]*\]\([^)]*\)/g, blank)
		.replace(/<[^>\n]+>/g, blank)
		.replace(/(?:https?|jwlibrary|jwpub):\/\/\S+/g, blank);
}

export function findRefs(text: string, index: BookIndex): FoundRef[] {
	const t = maskProtected(text);
	const out: FoundRef[] = [];
	const re = /(?<!\d)(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?(?!\d)/g;
	let m: RegExpExecArray | null;
	let prevBook = 0;
	let prevEnd = 0;
	let prevName = "";
	while ((m = re.exec(t))) {
		const base = Math.max(0, m.index - 40);
		const pre = t.slice(base, m.index).trimEnd();
		const tokens: { index: number }[] = [];
		const tokenRe = /[\p{L}\p{N}]+\.?/gu;
		let tm: RegExpExecArray | null;
		while ((tm = tokenRe.exec(pre))) tokens.push({ index: tm.index });
		let book = 0;
		let st = 0;
		for (let k = Math.min(3, tokens.length); k >= 1; k--) {
			const x = tokens[tokens.length - k].index;
			book = index.find(pre.slice(x));
			if (book) {
				st = x;
				break;
			}
		}
		let inherited = false;
		if (!book && prevBook && /^\s*;\s*$/.test(t.slice(prevEnd, m.index))) {
			book = prevBook;
			inherited = true;
		}
		if (book && (+m[1] < 1 || +m[1] > CHAPTERS[book - 1])) book = 0; // chapter does not exist
		if (!book) {
			prevBook = 0;
			continue;
		}
		const v1 = +m[2];
		const v2 = m[3] ? +m[3] : 0;
		let start: number;
		let bookText: string;
		if (inherited) {
			start = m.index;
			bookText = prevName;
		} else {
			const raw = t.slice(base + st, m.index);
			const lead = raw.match(/^[^\p{L}\p{N}]*/u)![0].length;
			start = base + st + lead;
			if (t[start - 1] === "#") start--; // "#Gen 1:1" -> plain link, "#" removed
			bookText = raw.slice(lead).trim();
			prevName = bookText;
		}

		// verse list after the first verse: "1:1,2", "1:1-3,5,7-9" (a comma followed by a number that is not a chapter)
		type Item = { a: number; b: number; s: number; e: number };
		let lastEnd = m.index + m[0].length;
		const items: Item[] = [{ a: v1, b: v2 > v1 ? v2 : v1, s: m.index, e: lastEnd }];
		const cont = /,\s?(\d{1,3})(?:[-–](\d{1,3}))?(?![\d:\p{L}])/uy;
		for (;;) {
			cont.lastIndex = lastEnd;
			const c = cont.exec(t);
			if (!c) break;
			const a = +c[1];
			const z = c[2] ? +c[2] : a;
			const e = c.index + c[0].length;
			items.push({ a, b: z > a ? z : a, s: c.index + c[0].indexOf(c[1]), e });
			lastEnd = e;
		}
		// neighbouring verses become one link (1,2 -> 1-2), the others get a link each
		const runs: Item[][] = [[items[0]]];
		for (const it of items.slice(1)) {
			const run = runs[runs.length - 1];
			if (it.a === run[run.length - 1].b + 1) run.push(it);
			else runs.push([it]);
		}
		const chapterNo = +m[1];
		const numsStart = m.index;
		runs.forEach((run, k) => {
			const first = run[0];
			const last = run[run.length - 1];
			const a = first.a;
			const z = last.b;
			const s0 = k === 0 ? start : first.s;
			out.push({
				start: s0,
				end: last.e,
				text: text.slice(s0, last.e),
				book,
				chapter: chapterNo,
				verse: a,
				endVerse: z > a ? z : undefined,
				inherited: k > 0 || inherited,
				bookText,
				rawNums: k === 0 && run.length > 1 ? text.slice(numsStart, last.e) : undefined,
			});
		});
		prevBook = book;
		prevEnd = lastEnd;
		re.lastIndex = lastEnd;
	}
	return out;
}

const localeOf = (s: LinkSettings) => encodeURIComponent((s.jwLocale === "custom" ? s.customLocale : s.jwLocale).trim() || "E");

export function buildUrl(r: { book: number; chapter: number; verse: number; endVerse?: number }, s: LinkSettings): string {
	let code = pad(r.book, 2) + pad(r.chapter, 3) + pad(r.verse, 3);
	if (r.endVerse) code += "-" + pad(r.book, 2) + pad(r.chapter, 3) + pad(r.endVerse, 3);
	const loc = localeOf(s);
	return s.linkType === "app"
		? `jwlibrary:///finder?bible=${code}&wtlocale=${loc}`
		: `https://www.jw.org/finder?srcid=jwlshare&wtlocale=${loc}&prefer=lang&bible=${code}`;
}

function bookLabel(book: number, s: LinkSettings, typed: string): string {
	if (s.labelStyle === "asTyped") return typed;
	const aliases = BOOK_NAMES[s.labelLang][book - 1].split(",");
	return s.labelStyle === "short" ? aliases[1] ?? aliases[0] : aliases[0];
}

export function buildLabel(r: FoundRef, s: LinkSettings): string {
	if (r.inherited) return r.text; // "5:24" stays as typed
	const nums = r.rawNums ?? `${r.chapter}:${r.verse}${r.endVerse ? "–" + r.endVerse : ""}`;
	return `${bookLabel(r.book, s, r.bookText)} ${nums}`.trim();
}

export function toMarkdown(r: FoundRef, s: LinkSettings): string {
	return `[${buildLabel(r, s)}](${buildUrl(r, s)})`;
}

// ---------- publications: "w24.01", "wp25.09", "g26.11", "w08.09.01" ----------
// Code and numbers are written together, without a space. "w 24.01" is deliberately not a link.
export const PUB_CODES = ["w", "wp", "g", "mwb", "km"];

export interface PubRef {
	start: number;
	end: number;
	text: string;
	pub: string;
	issue: string; // YYYYMM or YYYYMMDD
	hasDay: boolean;
}

const PUB_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${PUB_CODES.join("|")})(\\d{2})\\.(\\d{1,2})(?:\\.(\\d{1,2}))?(?![\\p{L}\\p{N}])(?!\\.\\d)`, "giu");

/**
 * Citation style with a space after code+year: "w01 8/15" (English: month/day) or "w01 15/8" (Estonian: day/month).
 * Only the Watchtower, whose semi-monthly issues are dated the 1st or the 15th, so the order is always clear:
 * "9/1" can only be September 1 and "1/9" only 1 September.
 */
const PUB_CITE_RE = /(?<![\p{L}\p{N}])(wp|w)(\d{2}) (\d{1,2})\/(\d{1,2})(?![\p{L}\p{N}\/])/giu;

function dayMonth(a: number, b: number): { month: number; day: number } | null {
	const isDay = (n: number) => n === 1 || n === 15;
	const isMonth = (n: number) => n >= 1 && n <= 12;
	if (isMonth(a) && isDay(b)) return { month: a, day: b }; // 8/15, 9/1
	if (isDay(a) && isMonth(b)) return { month: b, day: a }; // 15/8, 1/9
	return null;
}

export function findPubRefs(text: string): PubRef[] {
	const t = maskProtected(text);
	const out: PubRef[] = [];
	const yearOf = (yy: number) => (yy >= 50 ? 1900 + yy : 2000 + yy);
	PUB_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = PUB_RE.exec(t))) {
		const mo = +m[3];
		const day = m[4] ? +m[4] : 0;
		if (mo < 1 || mo > 12 || (m[4] && (day < 1 || day > 31))) continue;
		out.push({
			start: m.index,
			end: m.index + m[0].length,
			text: text.slice(m.index, m.index + m[0].length),
			pub: m[1].toLowerCase(),
			issue: `${yearOf(+m[2])}${pad(mo, 2)}${day ? pad(day, 2) : ""}`,
			hasDay: !!day,
		});
	}
	PUB_CITE_RE.lastIndex = 0;
	while ((m = PUB_CITE_RE.exec(t))) {
		const dm = dayMonth(+m[3], +m[4]);
		if (!dm) continue;
		out.push({
			start: m.index,
			end: m.index + m[0].length,
			text: text.slice(m.index, m.index + m[0].length),
			pub: m[1].toLowerCase(),
			issue: `${yearOf(+m[2])}${pad(dm.month, 2)}${pad(dm.day, 2)}`,
			hasDay: true,
		});
	}
	return out.sort((x, y) => x.start - y.start);
}

/**
 * From January 2008 to December 2015 The Watchtower had two editions: the issue dated the 1st is the public edition
 * (pub "wp", e.g. wp20080101) and the one dated the 15th is the study edition (pub "w", e.g. w20080115).
 * So "w08.09.01" means the public edition of 1 September 2008.
 */
export function pubCode(r: PubRef): string {
	const year = +r.issue.slice(0, 4);
	if (r.pub === "w" && r.hasDay && r.issue.slice(6) === "01" && year >= 2008 && year <= 2015) return "wp";
	return r.pub;
}

export function pubUrl(r: PubRef, s: LinkSettings): string {
	const loc = localeOf(s);
	const pub = pubCode(r);
	return s.linkType === "app"
		? `jwlibrary:///finder?wtlocale=${loc}&pub=${pub}&issue=${r.issue}`
		: `https://www.jw.org/finder?srcid=jwlshare&wtlocale=${loc}&prefer=lang&pub=${pub}&issue=${r.issue}`;
}

export const pubToMarkdown = (r: PubRef, s: LinkSettings): string => `[${r.text}](${pubUrl(r, s)})`;

/** Convert every reference in `text`; returns new text and number of links made. */
export function linkAll(text: string, index: BookIndex, s: LinkSettings): { text: string; count: number } {
	const refs = findRefs(text, index);
	const pubs = findPubRefs(text).filter((p) => !refs.some((r) => p.start < r.end && r.start < p.end));
	const all: { start: number; end: number; md: string }[] = [
		...refs.map((r) => ({ start: r.start, end: r.end, md: toMarkdown(r, s) })),
		...pubs.map((p) => ({ start: p.start, end: p.end, md: pubToMarkdown(p, s) })),
	].sort((x, y) => x.start - y.start);
	let out = text;
	for (let i = all.length - 1; i >= 0; i--) out = out.slice(0, all[i].start) + all[i].md + out.slice(all[i].end);
	return { text: out, count: all.length };
}

/**
 * Finds a continuation like "; 5:24" at the very end of `before` when the previous
 * reference is already a JW Library link, e.g. "[Joh 3:16](jwlibrary:///finder?bible=43003016&wtlocale=ST); 5:24".
 */
export function findInheritedTail(before: string): FoundRef | null {
	const m =
		/\]\((?:jwlibrary:\/\/\/finder\?bible=|https:\/\/www\.jw\.org\/finder\?[^)\s]*?bible=)(\d{2})\d{6}(?:-\d{8})?[^)]*\)\s*;\s*(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?$/.exec(
			before
		);
	if (!m) return null;
	const book = +m[1];
	const chapter = +m[2];
	if (book < 1 || book > 66 || chapter < 1 || chapter > CHAPTERS[book - 1]) return null;
	const tail = /(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?$/.exec(before)!;
	const v1 = +m[3];
	const v2 = m[4] ? +m[4] : 0;
	return {
		start: tail.index,
		end: before.length,
		text: tail[0],
		book,
		chapter,
		verse: v1,
		endVerse: v2 > v1 ? v2 : undefined,
		inherited: true,
		bookText: "",
	};
}

/**
 * A verse continuation right after a link: "[Joh 1:1](...),2" -> one link for verses 1-2
 * (neighbouring verse), otherwise the new number gets a link of its own.
 */
export function findVerseTail(before: string): { start: number; end: number; insert: string } | null {
	const m =
		/\[([^\]]*)\]\(((?:jwlibrary:\/\/\/finder\?bible=|https:\/\/www\.jw\.org\/finder\?[^)\s]*?bible=))(\d{2})(\d{3})(\d{3})(?:-\d{2}\d{3}(\d{3}))?([^)]*)\)(\s*,\s?)(\d{1,3})(?:([-–])(\d{1,3}))?$/.exec(
			before
		);
	if (!m) return null;
	const [, label, prefix, book, chapter, v1s, vEndS, suffix, sep, n1s, dash, n2s] = m;
	const v1 = +v1s;
	const last = vEndS ? +vEndS : v1;
	const n1 = +n1s;
	const n2 = n2s ? +n2s : 0;
	const typed = n1s + (n2s ? dash + n2s : "");
	const urlFor = (a: number, z: number) => `${prefix}${book}${chapter}${pad(a, 3)}${z > a ? "-" + book + chapter + pad(z, 3) : ""}${suffix}`;
	const end = n2 > n1 ? n2 : n1;
	if (n1 === last + 1) {
		return { start: m.index, end: before.length, insert: `[${label}${sep.trimStart()}${typed}](${urlFor(v1, end)})` };
	}
	const at = before.length - typed.length;
	return { start: at, end: before.length, insert: `[${typed}](${urlFor(n1, end)})` };
}

export interface Edit {
	start: number;
	end: number;
	insert: string;
}

/**
 * What to change in `line` after a delimiter was typed at offset `delim`.
 * Returns edits in ascending order (apply them from the last to the first).
 */
export function autoLinkEdits(line: string, delim: number, index: BookIndex, s: LinkSettings): Edit[] {
	if (!/\d/.test(line)) return [];
	// publication: link when the delimiter follows it. A "." right after "w08.09" may still become "w08.09.01", so wait;
	// a sentence-final "." ("see w24.01.") is linked when the next delimiter (space, Enter) comes.
	const pub = findPubRefs(line).find(
		(p) => (p.end === delim && !(line[delim] === "." && !p.hasDay)) || (p.end === delim - 1 && line[p.end] === ".")
	);
	if (pub) return [{ start: pub.start, end: pub.end, insert: pubToMarkdown(pub, s) }];
	const refs = findRefs(line, index);
	let i = refs.findIndex((r) => r.end === delim);
	if (i >= 0) {
		const out: Edit[] = [];
		for (;;) {
			const r = refs[i];
			out.unshift({ start: r.start, end: r.end, insert: toMarkdown(r, s) });
			if (!r.inherited || i === 0) break;
			i--; // "Joh 3:16; 5:24" or "Joh 1:1,3": the earlier parts belong to the same group
		}
		return out;
	}
	const before = line.slice(0, delim);
	const tail = findInheritedTail(before);
	if (tail) return [{ start: tail.start, end: tail.end, insert: toMarkdown(tail, s) }];
	const verse = findVerseTail(before);
	return verse ? [verse] : [];
}
