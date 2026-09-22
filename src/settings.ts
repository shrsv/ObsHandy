import { App, PluginSettingTab, Setting } from "obsidian";
import type HandyPlugin from "../main";

export interface HandySettings {
	handyDataDir: string;
	attachmentFolder: string;
	insertTemplate: string;
	transcriptOnlyTemplate: string;
	preferPostProcessed: boolean;
}

export function defaultHandyDataDir(): string {
	const home = process.env.USERPROFILE || process.env.HOME || "";
	if (process.platform === "win32") {
		const appData = process.env.APPDATA || `${home}\\AppData\\Roaming`;
		return `${appData}\\com.pais.handy`;
	}
	if (process.platform === "darwin") {
		return `${home}/Library/Application Support/com.pais.handy`;
	}
	return `${home}/.local/share/com.pais.handy`;
}

export const DEFAULT_SETTINGS: HandySettings = {
	handyDataDir: defaultHandyDataDir(),
	attachmentFolder: "Handy Recordings",
	insertTemplate: "{{audio}}\n\n> [!quote] Transcript ({{date}})\n> {{transcript}}\n",
	transcriptOnlyTemplate: "> [!quote] Transcript ({{date}})\n> {{transcript}}\n",
	preferPostProcessed: true,
};

// Obsidian doesn't have a public API for a plugin to jump straight into its own
// hotkey binding, so this reaches into the internal (undocumented) Setting tab
// APIs that most plugins already rely on for this. Best-effort: degrades to
// just opening the Hotkeys tab if the internal shape ever changes.
export function openHotkeySettings(app: App): void {
	try {
		const setting = (app as any).setting;
		setting.open();
		setting.openTabById("hotkeys");
		const tab = setting.activeTab;
		if (tab?.searchComponent) {
			tab.searchComponent.setValue("ObsHandy");
			tab.searchComponent.onChanged?.();
			tab.searchComponent.inputEl?.dispatchEvent(new Event("input"));
		}
	} catch (err) {
		console.error("ObsHandy: failed to open hotkey settings", err);
	}
}

export class HandySettingTab extends PluginSettingTab {
	plugin: HandyPlugin;

	constructor(app: App, plugin: HandyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "ObsHandy settings" });

		new Setting(containerEl)
			.setName("Handy data directory")
			.setDesc(
				"Folder containing Handy's history.db and recordings/ folder. Default is auto-detected for your OS."
			)
			.addText((text) =>
				text
					.setPlaceholder(defaultHandyDataDir())
					.setValue(this.plugin.settings.handyDataDir)
					.onChange(async (value) => {
						this.plugin.settings.handyDataDir = value.trim() || defaultHandyDataDir();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Browse recordings hotkey")
			.setDesc("Default: Ctrl+Alt+Shift+H. Opens Obsidian's Hotkeys settings, filtered to ObsHandy, where you can rebind it.")
			.addButton((btn) =>
				btn.setButtonText("Customize hotkey").onClick(() => {
					openHotkeySettings(this.app);
				})
			);

		new Setting(containerEl)
			.setName("Attachment folder")
			.setDesc("Vault-relative folder where imported recordings are copied to.")
			.addText((text) =>
				text
					.setPlaceholder("Handy Recordings")
					.setValue(this.plugin.settings.attachmentFolder)
					.onChange(async (value) => {
						this.plugin.settings.attachmentFolder = value.trim() || "Handy Recordings";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Prefer post-processed transcript")
			.setDesc(
				"When a recording has a post-processed transcript, insert that instead of the raw transcription."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.preferPostProcessed).onChange(async (value) => {
					this.plugin.settings.preferPostProcessed = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Audio + transcript template")
			.setDesc(
				"Placeholders: {{audio}}, {{transcript}}, {{title}}, {{date}}. Used by the 'audio + transcript' insert commands."
			)
			.addTextArea((text) => {
				text
					.setValue(this.plugin.settings.insertTemplate)
					.onChange(async (value) => {
						this.plugin.settings.insertTemplate = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 5;
				text.inputEl.cols = 50;
			});

		new Setting(containerEl)
			.setName("Transcript-only template")
			.setDesc(
				"Placeholders: {{transcript}}, {{title}}, {{date}}. Used by the 'transcript only' insert commands."
			)
			.addTextArea((text) => {
				text
					.setValue(this.plugin.settings.transcriptOnlyTemplate)
					.onChange(async (value) => {
						this.plugin.settings.transcriptOnlyTemplate = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 4;
				text.inputEl.cols = 50;
			});
	}
}
