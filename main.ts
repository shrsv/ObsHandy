import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import * as path from "path";
import { getLatest } from "./src/handyDb";
import { insertRecording } from "./src/insert";
import { DEFAULT_SETTINGS, HandySettings, HandySettingTab } from "./src/settings";
import { RecordingBrowserModal } from "./src/browserModal";

export default class HandyPlugin extends Plugin {
	settings!: HandySettings;

	get pluginDir(): string {
		// @ts-ignore - basePath exists on the desktop FileSystemAdapter
		const basePath: string = this.app.vault.adapter.basePath ?? this.app.vault.adapter.getBasePath?.();
		return path.join(basePath, this.app.vault.configDir, "plugins", this.manifest.id);
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new HandySettingTab(this.app, this));

		this.addRibbonIcon("mic", "Browse Handy recordings", () => {
			const editor = this.getActiveEditor();
			if (editor) {
				new RecordingBrowserModal(this.app, this.settings, this.pluginDir, editor).open();
			}
		});

		this.addCommand({
			id: "insert-latest-audio",
			name: "Insert latest recording (audio)",
			editorCallback: (editor: Editor) => this.insertLatest(editor, false),
		});

		this.addCommand({
			id: "insert-latest-audio-transcript",
			name: "Insert latest recording (audio + transcript)",
			editorCallback: (editor: Editor) => this.insertLatest(editor, true),
		});

		this.addCommand({
			id: "browse-recordings",
			name: "Browse recordings...",
			editorCallback: (editor: Editor) => {
				new RecordingBrowserModal(this.app, this.settings, this.pluginDir, editor).open();
			},
		});
	}

	private getActiveEditor(): Editor | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view ? view.editor : null;
	}

	private async insertLatest(editor: Editor, withTranscript: boolean): Promise<void> {
		try {
			const entry = await getLatest(this.settings.handyDataDir, this.pluginDir);
			if (!entry) {
				new Notice("ObsHandy: no recordings found in Handy history.");
				return;
			}
			await insertRecording(this.app, editor, this.settings, entry, withTranscript);
		} catch (err) {
			console.error("ObsHandy: failed to fetch latest recording", err);
			new Notice(`ObsHandy: ${(err as Error).message}`);
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
