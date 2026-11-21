import { App, PluginSettingTab, Setting } from "obsidian";
import type JWBibleLinker from "./main";
import { JW_LOCALES, LANGUAGES, LangId } from "./books";
import { LinkSettings } from "./parser";

export const DEFAULT_SETTINGS: LinkSettings = {
	linkType: "app",
	jwLocale: "ST",
	customLocale: "",
	labelStyle: "asTyped",
	labelLang: "et",
	recognizedLangs: ["et", "en", "ru", "fi", "de"],
	priorityLang: "et",
	customAliases: "",
};

export class JWSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: JWBibleLinker) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;
		const save = async () => {
			await this.plugin.saveSettings();
		};

		new Setting(containerEl).setName("JW Library").setHeading();

		new Setting(containerEl)
			.setName("Open verses in this language")
			.setDesc("The Bible language JW Library opens when you tap a link. Independent of the language you type the reference in.")
			.addDropdown((d) => {
				JW_LOCALES.forEach((l) => d.addOption(l.code, `${l.label} (${l.code})`));
				d.addOption("custom", "Custom code…");
				d.setValue(s.jwLocale).onChange(async (v) => {
					s.jwLocale = v;
					await save();
					this.display();
				});
			});

		if (s.jwLocale === "custom") {
			new Setting(containerEl)
				.setName("Custom language code")
				.setDesc("The wtlocale value from a jw.org link in your language.")
				.addText((t) =>
					t.setValue(s.customLocale).onChange(async (v) => {
						s.customLocale = v;
						await save();
					})
				);
		}

		new Setting(containerEl)
			.setName("Link type")
			.setDesc("App link opens JW Library directly (phone, Windows, Mac). Web link opens jw.org, which offers to open the app.")
			.addDropdown((d) =>
				d
					.addOption("app", "jwlibrary:// (app)")
					.addOption("web", "https://www.jw.org (web)")
					.setValue(s.linkType)
					.onChange(async (v) => {
						s.linkType = v as LinkSettings["linkType"];
						await save();
					})
			);

		new Setting(containerEl).setName("Link text").setHeading();

		new Setting(containerEl)
			.setName("Link text style")
			.addDropdown((d) =>
				d
					.addOption("asTyped", "As I typed it")
					.addOption("full", "Full book name")
					.addOption("short", "Short book name")
					.setValue(s.labelStyle)
					.onChange(async (v) => {
						s.labelStyle = v as LinkSettings["labelStyle"];
						await save();
					})
			);

		new Setting(containerEl)
			.setName("Book name language")
			.setDesc("Used when the style above is full or short.")
			.addDropdown((d) => {
				LANGUAGES.forEach((l) => d.addOption(l.id, l.label));
				d.setValue(s.labelLang).onChange(async (v) => {
					s.labelLang = v as LangId;
					await save();
				});
			});

		new Setting(containerEl).setName("Recognition").setHeading();

		LANGUAGES.forEach((l) =>
			new Setting(containerEl).setName(`Recognise ${l.label}`).addToggle((t) =>
				t.setValue(s.recognizedLangs.includes(l.id)).onChange(async (v) => {
					s.recognizedLangs = s.recognizedLangs.filter((x) => x !== l.id);
					if (v) s.recognizedLangs.push(l.id);
					await save();
					this.plugin.rebuildIndex();
				})
			)
		);

		new Setting(containerEl)
			.setName("Priority language")
			.setDesc("Wins when an abbreviation exists in several languages (for example Jn = Joona in Estonian, John in English).")
			.addDropdown((d) => {
				LANGUAGES.forEach((l) => d.addOption(l.id, l.label));
				d.setValue(s.priorityLang).onChange(async (v) => {
					s.priorityLang = v as LangId;
					await save();
					this.plugin.rebuildIndex();
				});
			});

		new Setting(containerEl)
			.setName("Custom abbreviations")
			.setDesc("One per line, as abbreviation=book number (1-66). Example: Jn=43")
			.addTextArea((t) =>
				t.setValue(s.customAliases).onChange(async (v) => {
					s.customAliases = v;
					await save();
					this.plugin.rebuildIndex();
				})
			);
	}
}
