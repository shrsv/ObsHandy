import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { getLatest } from "./src/handyDb";
import { InsertMode, insertRecording } from "./src/insert";
import { DEFAULT_SETTINGS, HandySettings, HandySettingTab } from "./src/settings";
import { RecordingBrowserModal } from "./src/browserModal";

export default class HandyPlugin extends Plugin {
	settings!: HandySettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new HandySettingTab(this.app, this));

		this.addRibbonIcon("mic", "Browse Handy recordings", () => {
			const editor = this.getActiveEditor();
			if (editor) {
				new RecordingBrowserModal(this.app, this.settings, editor).open();
			}
		});

		this.addCommand({
			id: "insert-latest-audio",
			name: "Insert latest recording (audio)",
			editorCallback: (editor: Editor) => this.insertLatest(editor, "audio"),
		});

		this.addCommand({
			id: "insert-latest-transcript",
			name: "Insert latest recording (transcript only)",
			editorCallback: (editor: Editor) => this.insertLatest(editor, "transcript"),
		});

		this.addCommand({
			id: "insert-latest-audio-transcript",
			name: "Insert latest recording (audio + transcript)",
			editorCallback: (editor: Editor) => this.insertLatest(editor, "both"),
		});

		this.addCommand({
			id: "browse-recordings",
			name: "Browse recordings...",
			editorCallback: (editor: Editor) => {
				new RecordingBrowserModal(this.app, this.settings, editor).open();
			},
		});
	}

	private getActiveEditor(): Editor | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view ? view.editor : null;
	}

	private async insertLatest(editor: Editor, mode: InsertMode): Promise<void> {
		try {
			const entry = await getLatest(this.settings.handyDataDir);
			if (!entry) {
				new Notice("ObsHandy: no recordings found in Handy history.");
				return;
			}
			await insertRecording(this.app, editor, this.settings, entry, mode);
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
