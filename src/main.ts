import { Editor, MarkdownView, Modal, Notice, Plugin, App, Setting } from "obsidian";
import { BookIndex, LinkSettings, findInheritedTail, findRefs, linkAll, toMarkdown } from "./parser";
import { DEFAULT_SETTINGS, JWSettingTab } from "./settings";

export default class JWBibleLinker extends Plugin {
	settings: LinkSettings = { ...DEFAULT_SETTINGS };
	index!: BookIndex;
	private busy = false;
	private lastAuto: { line: number; raw: string } | null = null;

	async onload() {
		await this.loadSettings();
		this.rebuildIndex();
		this.addSettingTab(new JWSettingTab(this.app, this));

		this.addCommand({
			id: "link-references",
			name: "Link Bible references (selection, or whole note if nothing is selected)",
			editorCallback: (editor) => this.linkEditor(editor),
		});

		this.addCommand({
			id: "insert-reference",
			name: "Insert Bible reference link…",
			editorCallback: (editor) => {
				new RefModal(this.app, (text) => {
					const refs = findRefs(text, this.index);
					if (!refs.length) {
						new Notice("No Bible reference recognised. Example: Joh 3:16");
						return;
					}
					editor.replaceSelection(refs.map((r) => toMarkdown(r, this.settings)).join("; "));
				}).open();
			},
		});

		this.registerEvent(this.app.workspace.on("editor-change", (editor) => this.autoLink(editor)));

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				menu.addItem((item) =>
					item
						.setTitle("Link Bible references")
						.setIcon("book-open")
						.onClick(() => this.linkEditor(editor))
				);
			})
		);
	}

	/** Called after every edit: links a reference that was just finished by a delimiter. */
	autoLink(editor: Editor) {
		if (!this.settings.autoLink || this.busy || editor.somethingSelected()) return;
		const cur = editor.getCursor();
		let lineNo = cur.line;
		let delim: number;
		if (cur.ch === 0) {
			if (cur.line === 0) return;
			lineNo = cur.line - 1; // Enter pressed: check the line that was just finished
			delim = editor.getLine(lineNo).length;
		} else {
			const c = editor.getLine(lineNo)[cur.ch - 1];
			if (!c || !/[\s,.;!?)\]"'”’»…]/.test(c)) return;
			delim = cur.ch - 1;
		}
		const line = editor.getLine(lineNo);
		if (!/\d:\d/.test(line)) return;
		if (this.inProtectedBlock(editor, lineNo)) return;

		const ref = findRefs(line, this.index).find((r) => r.end === delim) ?? findInheritedTail(line.slice(0, delim));
		if (!ref) return;
		// right after an undo the raw text comes back: do not link the same thing again
		if (this.lastAuto && this.lastAuto.line === lineNo && this.lastAuto.raw === ref.text) {
			this.lastAuto = null;
			return;
		}
		this.lastAuto = { line: lineNo, raw: ref.text };
		this.busy = true;
		try {
			editor.replaceRange(toMarkdown(ref, this.settings), { line: lineNo, ch: ref.start }, { line: lineNo, ch: ref.end });
		} finally {
			this.busy = false;
		}
	}

	/** True inside frontmatter or a fenced code block. */
	private inProtectedBlock(editor: Editor, lineNo: number): boolean {
		let frontmatter = editor.getLine(0) === "---";
		let fence = false;
		for (let i = 0; i < lineNo; i++) {
			const l = editor.getLine(i);
			if (frontmatter) {
				if (i > 0 && l === "---") frontmatter = false;
				continue;
			}
			if (/^\s*(```|~~~)/.test(l)) fence = !fence;
		}
		return frontmatter || fence;
	}

	linkEditor(editor: Editor) {
		const hasSel = editor.somethingSelected();
		const original = hasSel ? editor.getSelection() : editor.getValue();
		const { text, count } = linkAll(original, this.index, this.settings);
		if (!count) {
			new Notice("No Bible references found.");
			return;
		}
		if (hasSel) editor.replaceSelection(text);
		else {
			// keep cursor/scroll: replace whole doc as a single change
			const last = editor.lastLine();
			editor.transaction({
				changes: [{ from: { line: 0, ch: 0 }, to: { line: last, ch: editor.getLine(last).length }, text }],
			});
		}
		new Notice(`Linked ${count} Bible reference${count === 1 ? "" : "s"}.`);
	}

	rebuildIndex() {
		const s = this.settings;
		const langs = s.recognizedLangs.length ? s.recognizedLangs : [s.priorityLang];
		this.index = new BookIndex(langs, s.priorityLang, s.customAliases);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class RefModal extends Modal {
	private value = "";
	constructor(app: App, private onSubmit: (text: string) => void) {
		super(app);
	}
	onOpen() {
		this.titleEl.setText("Insert Bible reference");
		const go = () => {
			this.close();
			this.onSubmit(this.value);
		};
		new Setting(this.contentEl).setName("Reference").addText((t) => {
			t.setPlaceholder("Joh 3:16; Ps 23:1–4").onChange((v) => (this.value = v));
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") go();
			});
			setTimeout(() => t.inputEl.focus(), 0);
		});
		new Setting(this.contentEl).addButton((b) => b.setButtonText("Insert").setCta().onClick(go));
	}
	onClose() {
		this.contentEl.empty();
	}
}
