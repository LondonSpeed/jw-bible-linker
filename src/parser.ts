import { BOOK_NAMES } from "./books";
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
}

const fold = (s: string) =>
	s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s.]/g, "");
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
	const re = /(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?/g;
	let m: RegExpExecArray | null;
	let prevBook = 0;
	let prevEnd = 0;
	let prevName = "";
	while ((m = re.exec(t))) {
		const base = Math.max(0, m.index - 40);
		const pre = t.slice(base, m.index).trimEnd();
		const tokens = [...pre.matchAll(/\S+/g)];
		let book = 0;
		let st = 0;
		for (let k = Math.min(3, tokens.length); k >= 1; k--) {
			const x = tokens[tokens.length - k].index as number;
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
			bookText = raw.slice(lead).trim();
			prevName = bookText;
		}
		prevBook = book;
		prevEnd = m.index + m[0].length;
		out.push({
			start,
			end: prevEnd,
			text: text.slice(start, prevEnd),
			book,
			chapter: +m[1],
			verse: v1,
			endVerse: v2 > v1 ? v2 : undefined,
			inherited,
			bookText,
		});
	}
	return out;
}

export function buildUrl(r: { book: number; chapter: number; verse: number; endVerse?: number }, s: LinkSettings): string {
	let code = pad(r.book, 2) + pad(r.chapter, 3) + pad(r.verse, 3);
	if (r.endVerse) code += "-" + pad(r.book, 2) + pad(r.chapter, 3) + pad(r.endVerse, 3);
	const loc = encodeURIComponent((s.jwLocale === "custom" ? s.customLocale : s.jwLocale).trim() || "E");
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
	const nums = `${r.chapter}:${r.verse}${r.endVerse ? "–" + r.endVerse : ""}`;
	if (r.inherited) return r.text; // "5:24" stays as typed
	return `${bookLabel(r.book, s, r.bookText)} ${nums}`.trim();
}

export function toMarkdown(r: FoundRef, s: LinkSettings): string {
	return `[${buildLabel(r, s)}](${buildUrl(r, s)})`;
}

/** Convert every reference in `text`; returns new text and number of links made. */
export function linkAll(text: string, index: BookIndex, s: LinkSettings): { text: string; count: number } {
	const refs = findRefs(text, index);
	let out = text;
	for (let i = refs.length - 1; i >= 0; i--) {
		out = out.slice(0, refs[i].start) + toMarkdown(refs[i], s) + out.slice(refs[i].end);
	}
	return { text: out, count: refs.length };
}
