import { App, Editor, Modal, Setting } from "obsidian";
import * as fs from "fs";
import { shell } from "electron";
import { HistoryEntry, audioAbsolutePath, getPage, recordingsDir } from "./handyDb";
import { InsertMode, insertRecording } from "./insert";
import { HandySettings } from "./settings";

const PAGE_SIZE = 25;

function mimeTypeFor(fileName: string): string {
	const ext = fileName.split(".").pop()?.toLowerCase();
	switch (ext) {
		case "wav":
			return "audio/wav";
		case "mp3":
			return "audio/mpeg";
		case "ogg":
			return "audio/ogg";
		case "flac":
			return "audio/flac";
		case "m4a":
			return "audio/mp4";
		default:
			return "audio/wav";
	}
}

interface RowState {
	entry: HistoryEntry;
	rowEl: HTMLElement;
	audio: HTMLAudioElement;
	previewBtn: HTMLButtonElement;
	loaded: boolean;
}

export class RecordingBrowserModal extends Modal {
	private settings: HandySettings;
	private editor: Editor;
	private offset = 0;
	private search = "";
	private listEl!: HTMLElement;
	private loadMoreBtn!: HTMLButtonElement;
	private searchInputEl!: HTMLInputElement;
	private objectUrls: string[] = [];
	private rows: RowState[] = [];
	private selectedIndex = -1;
	private hasMore = false;

	constructor(app: App, settings: HandySettings, editor: Editor) {
		super(app);
		this.settings = settings;
		this.editor = editor;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("obs-handy-browser");
		contentEl.tabIndex = -1;
		const header = contentEl.createDiv({ cls: "obs-handy-header" });
		header.createEl("h2", { text: "Handy recordings" });
		const openFolderBtn = header.createEl("button", { text: "📁 Open recordings folder" });
		openFolderBtn.onclick = () => {
			shell.openPath(recordingsDir(this.settings.handyDataDir));
		};

		contentEl.createEl("div", {
			cls: "obs-handy-shortcuts-hint",
			text: "↑/↓ or j/k select · p preview · a audio · t transcript · c combined · Enter = combined · / search",
		});

		new Setting(contentEl).setName("Search").addText((text) => {
			this.searchInputEl = text.inputEl;
			text.setPlaceholder("Filter by transcript or title...").onChange((value) => {
				this.search = value;
				this.reload();
			});
		});

		this.listEl = contentEl.createDiv({ cls: "obs-handy-list" });
		this.loadMoreBtn = contentEl.createEl("button", { text: "Load more" });
		this.loadMoreBtn.onclick = () => this.loadPage();
		this.loadMoreBtn.style.display = "none";

		contentEl.addEventListener("keydown", this.handleKeydown);

		this.reload();
		// Obsidian auto-focuses the first input in a modal on open; defer our
		// focus to the next tick so row navigation wins by default instead of
		// the search box.
		window.setTimeout(() => contentEl.focus(), 0);
	}

	private reload(): void {
		this.revokeObjectUrls();
		this.listEl.empty();
		this.rows = [];
		this.selectedIndex = -1;
		this.offset = 0;
		this.loadPage();
	}

	private revokeObjectUrls(): void {
		for (const url of this.objectUrls) {
			URL.revokeObjectURL(url);
		}
		this.objectUrls = [];
	}

	private async loadPage(): Promise<void> {
		try {
			const { entries, hasMore } = await getPage(
				this.settings.handyDataDir,
				this.offset,
				PAGE_SIZE,
				this.search
			);
			for (const entry of entries) {
				this.renderRow(entry);
			}
			this.offset += entries.length;
			this.hasMore = hasMore;
			this.loadMoreBtn.style.display = hasMore ? "block" : "none";
			if (this.selectedIndex === -1 && this.rows.length > 0) {
				this.selectRow(0);
			}
		} catch (err) {
			console.error("ObsHandy: failed to load recordings", err);
			this.listEl.createEl("p", {
				text: `Failed to load recordings: ${(err as Error).message}`,
			});
		}
	}

	private renderRow(entry: HistoryEntry): void {
		const rowEl = this.listEl.createDiv({ cls: "obs-handy-row" });
		rowEl.createEl("div", { cls: "obs-handy-row-title", text: entry.title });

		const transcript = entry.postProcessedText || entry.transcriptionText;
		rowEl.createEl("div", {
			cls: "obs-handy-row-snippet",
			text: transcript.length > 200 ? transcript.slice(0, 200) + "…" : transcript,
		});

		// Don't read/blob the audio file until the user actually asks to preview
		// it: with hundreds of recordings paginated in, eagerly loading every
		// rendered row's full audio bytes would waste memory on rows never played.
		const previewBtn = rowEl.createEl("button", { text: "▶ Preview", cls: "obs-handy-preview-btn" });
		const audio = rowEl.createEl("audio");
		audio.controls = true;
		audio.style.display = "none";

		const rowState: RowState = { entry, rowEl, audio, previewBtn, loaded: false };
		const index = this.rows.length;
		this.rows.push(rowState);

		previewBtn.onclick = () => {
			this.selectRow(index);
			this.loadOrTogglePreview(rowState);
		};

		rowEl.addEventListener("click", (evt) => {
			if (evt.target === previewBtn || evt.target === audio) return;
			this.selectRow(index);
		});

		const actions = rowEl.createDiv({ cls: "obs-handy-row-actions" });

		const insertAudioBtn = actions.createEl("button", { text: "Insert audio" });
		insertAudioBtn.onclick = () => this.insertForRow(rowState, "audio");

		const insertTranscriptBtn = actions.createEl("button", { text: "Insert transcript" });
		insertTranscriptBtn.onclick = () => this.insertForRow(rowState, "transcript");

		const insertBothBtn = actions.createEl("button", { text: "Insert audio + transcript" });
		insertBothBtn.onclick = () => this.insertForRow(rowState, "both");
	}

	private selectRow(index: number): void {
		if (this.rows.length === 0) return;
		const clamped = Math.max(0, Math.min(index, this.rows.length - 1));
		if (this.selectedIndex >= 0 && this.rows[this.selectedIndex]) {
			this.rows[this.selectedIndex].rowEl.removeClass("obs-handy-row-selected");
		}
		this.selectedIndex = clamped;
		const row = this.rows[this.selectedIndex];
		row.rowEl.addClass("obs-handy-row-selected");
		row.rowEl.scrollIntoView({ block: "nearest" });
	}

	private async moveSelection(delta: number): Promise<void> {
		if (this.rows.length === 0) return;
		const next = this.selectedIndex + delta;
		if (next >= this.rows.length && this.hasMore) {
			await this.loadPage();
		}
		this.selectRow(next);
	}

	private loadOrTogglePreview(row: RowState): void {
		if (!row.loaded) {
			try {
				const absPath = audioAbsolutePath(this.settings.handyDataDir, row.entry.fileName);
				const data = fs.readFileSync(absPath);
				const blob = new Blob([data], { type: mimeTypeFor(row.entry.fileName) });
				const url = URL.createObjectURL(blob);
				this.objectUrls.push(url);
				row.audio.src = url;
				row.audio.style.display = "block";
				row.previewBtn.style.display = "none";
				row.loaded = true;
				row.audio.play();
			} catch (err) {
				console.error("ObsHandy: failed to load preview audio", err);
			}
		} else if (row.audio.paused) {
			row.audio.play();
		} else {
			row.audio.pause();
		}
	}

	private insertForRow(row: RowState, mode: InsertMode): void {
		insertRecording(this.app, this.editor, this.settings, row.entry, mode).then(() => {
			this.close();
		});
	}

	private handleKeydown = (evt: KeyboardEvent): void => {
		if (evt.target === this.searchInputEl) {
			if (evt.key === "ArrowDown") {
				evt.preventDefault();
				this.searchInputEl.blur();
				this.contentEl.focus();
				this.selectRow(this.selectedIndex === -1 ? 0 : this.selectedIndex);
			}
			return;
		}

		if (evt.ctrlKey || evt.metaKey || evt.altKey) {
			return;
		}

		switch (evt.key) {
			case "ArrowDown":
				evt.preventDefault();
				void this.moveSelection(1);
				return;
			case "ArrowUp":
				evt.preventDefault();
				void this.moveSelection(-1);
				return;
			case "Home":
				evt.preventDefault();
				this.selectRow(0);
				return;
			case "End":
				evt.preventDefault();
				this.selectRow(this.rows.length - 1);
				return;
			case "Enter":
				evt.preventDefault();
				this.triggerAction("both");
				return;
			case "/":
				evt.preventDefault();
				this.searchInputEl.focus();
				return;
		}

		const key = evt.key.toLowerCase();
		if (key === "j") {
			evt.preventDefault();
			void this.moveSelection(1);
		} else if (key === "k") {
			evt.preventDefault();
			void this.moveSelection(-1);
		} else if (key === "p") {
			evt.preventDefault();
			const row = this.rows[this.selectedIndex];
			if (row) this.loadOrTogglePreview(row);
		} else if (key === "a") {
			evt.preventDefault();
			this.triggerAction("audio");
		} else if (key === "t") {
			evt.preventDefault();
			this.triggerAction("transcript");
		} else if (key === "c") {
			evt.preventDefault();
			this.triggerAction("both");
		}
	};

	private triggerAction(mode: InsertMode): void {
		const row = this.rows[this.selectedIndex];
		if (!row) return;
		this.insertForRow(row, mode);
	}

	onClose(): void {
		this.contentEl.removeEventListener("keydown", this.handleKeydown);
		this.revokeObjectUrls();
		this.contentEl.empty();
	}
}
