import { App, Editor, Modal, Setting } from "obsidian";
import { pathToFileURL } from "url";
import { HistoryEntry, audioAbsolutePath, getPage } from "./handyDb";
import { insertRecording } from "./insert";
import { HandySettings } from "./settings";

const PAGE_SIZE = 25;

export class RecordingBrowserModal extends Modal {
	private settings: HandySettings;
	private editor: Editor;
	private offset = 0;
	private search = "";
	private listEl!: HTMLElement;
	private loadMoreBtn!: HTMLButtonElement;

	constructor(app: App, settings: HandySettings, editor: Editor) {
		super(app);
		this.settings = settings;
		this.editor = editor;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("obs-handy-browser");
		contentEl.createEl("h2", { text: "Handy recordings" });

		new Setting(contentEl).setName("Search").addText((text) =>
			text.setPlaceholder("Filter by transcript or title...").onChange((value) => {
				this.search = value;
				this.offset = 0;
				this.reload();
			})
		);

		this.listEl = contentEl.createDiv({ cls: "obs-handy-list" });
		this.loadMoreBtn = contentEl.createEl("button", { text: "Load more" });
		this.loadMoreBtn.onclick = () => this.loadPage(false);
		this.loadMoreBtn.style.display = "none";

		this.reload();
	}

	private reload(): void {
		this.listEl.empty();
		this.offset = 0;
		this.loadPage(true);
	}

	private async loadPage(replace: boolean): Promise<void> {
		try {
			const { entries, hasMore } = await getPage(
				this.settings.handyDataDir,
				this.offset,
				PAGE_SIZE,
				this.search
			);
			if (replace) {
				this.listEl.empty();
			}
			for (const entry of entries) {
				this.renderRow(entry);
			}
			this.offset += entries.length;
			this.loadMoreBtn.style.display = hasMore ? "block" : "none";
		} catch (err) {
			console.error("ObsHandy: failed to load recordings", err);
			this.listEl.createEl("p", {
				text: `Failed to load recordings: ${(err as Error).message}`,
			});
		}
	}

	private renderRow(entry: HistoryEntry): void {
		const row = this.listEl.createDiv({ cls: "obs-handy-row" });
		row.createEl("div", { cls: "obs-handy-row-title", text: entry.title });

		const transcript = entry.postProcessedText || entry.transcriptionText;
		row.createEl("div", {
			cls: "obs-handy-row-snippet",
			text: transcript.length > 200 ? transcript.slice(0, 200) + "…" : transcript,
		});

		const audio = row.createEl("audio");
		audio.controls = true;
		try {
			const absPath = audioAbsolutePath(this.settings.handyDataDir, entry.fileName);
			audio.src = pathToFileURL(absPath).href;
		} catch (err) {
			console.error("ObsHandy: failed to build preview URL", err);
		}

		const actions = row.createDiv({ cls: "obs-handy-row-actions" });

		const insertAudioBtn = actions.createEl("button", { text: "Insert audio" });
		insertAudioBtn.onclick = async () => {
			await insertRecording(this.app, this.editor, this.settings, entry, false);
			this.close();
		};

		const insertBothBtn = actions.createEl("button", { text: "Insert audio + transcript" });
		insertBothBtn.onclick = async () => {
			await insertRecording(this.app, this.editor, this.settings, entry, true);
			this.close();
		};
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
