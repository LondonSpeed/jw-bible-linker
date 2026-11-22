import { Editor, Modal, Notice, Plugin, App, Setting } from "obsidian";
import { EditorView } from "@codemirror/view";
import { BookIndex, LinkSettings, findInheritedTail, findRefs, linkAll, toMarkdown } from "./parser";
import { DEFAULT_SETTINGS, JWSettingTab } from "./settings";

export default class JWBibleLinker extends Plugin {
	settings: LinkSettings = { ...DEFAULT_SETTINGS };
	index!: BookIndex;
	private busy = false;

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

		// A CodeMirror extension (not the workspace "editor-change" event) so that it also works
		// in editors that are not a normal note view, e.g. text cards in Canvas.
		this.registerEditorExtension(this.autoLinkExtension());

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

	/** Watches every CodeMirror editor (notes, Canvas cards, embeds) for typed input. */
	private autoLinkExtension() {
		return EditorView.updateListener.of((u) => {
			if (!this.settings.autoLink || !u.docChanged || this.busy) return;
			if (!u.transactions.some((tr) => tr.isUserEvent("input"))) return; // typing, paste, Enter - not undo/redo or our own change
			const view = u.view;
			// dispatching inside an update listener is not allowed, so do it right after
			window.setTimeout(() => this.autoLink(view), 0);
		});
	}

	/** Links a reference that was just finished by a delimiter (space, comma, full stop, Enter ...). */
	autoLink(view: EditorView) {
		if (!this.settings.autoLink || this.busy || view.composing) return;
		const doc = view.state.doc;
		const sel = view.state.selection.main;
		if (view.state.selection.ranges.length !== 1 || !sel.empty) return;
		let line = doc.lineAt(sel.head);
		let delim: number; // offset of the delimiter inside the line
		if (sel.head === line.from) {
			if (line.number === 1) return;
			line = doc.line(line.number - 1); // Enter pressed: check the line that was just finished
			delim = line.length;
		} else {
			const c = doc.sliceString(sel.head - 1, sel.head);
			if (!/[\s,.;!?)\]"'”’»…]/.test(c)) return;
			delim = sel.head - 1 - line.from;
		}
		const text = line.text;
		if (!/\d:\d/.test(text)) return;
		if (this.inProtectedBlock((i) => doc.line(i).text, line.number)) return;

		const ref = findRefs(text, this.index).find((r) => r.end === delim) ?? findInheritedTail(text.slice(0, delim));
		if (!ref) return;
		this.busy = true;
		try {
			view.dispatch({
				changes: { from: line.from + ref.start, to: line.from + ref.end, insert: toMarkdown(ref, this.settings) },
				userEvent: "jwlinker.auto",
			});
		} finally {
			this.busy = false;
		}
	}

	/** True inside frontmatter or a fenced code block. `getLine` takes a 1-based line number. */
	private inProtectedBlock(getLine: (n: number) => string, lineNo: number): boolean {
		let frontmatter = getLine(1) === "---";
		let fence = false;
		for (let n = 1; n < lineNo; n++) {
			const l = getLine(n);
			if (frontmatter) {
				if (n > 1 && l === "---") frontmatter = false;
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
		const data = (await this.loadData()) as Partial<LinkSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
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
			window.setTimeout(() => t.inputEl.focus(), 0);
		});
		new Setting(this.contentEl).addButton((b) => b.setButtonText("Insert").setCta().onClick(go));
	}
	onClose() {
		this.contentEl.empty();
	}
}
