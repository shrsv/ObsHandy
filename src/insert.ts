import { App, Editor, normalizePath, Notice } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { HistoryEntry, audioAbsolutePath } from "./handyDb";
import { HandySettings } from "./settings";

function chooseTranscript(entry: HistoryEntry, settings: HandySettings): string {
	if (settings.preferPostProcessed && entry.postProcessedText) {
		return entry.postProcessedText;
	}
	return entry.transcriptionText;
}

function formatDate(timestamp: number): string {
	// Handy stores unix seconds.
	return new Date(timestamp * 1000).toLocaleString();
}

async function ensureAttachmentFolder(app: App, folder: string): Promise<string> {
	const normalized = normalizePath(folder);
	if (!(await app.vault.adapter.exists(normalized))) {
		await app.vault.createFolder(normalized);
	}
	return normalized;
}

/**
 * Copies the recording's audio file into the vault's attachment folder if not
 * already present there, and returns the vault-relative path to embed.
 */
export async function copyRecordingIntoVault(
	app: App,
	settings: HandySettings,
	entry: HistoryEntry
): Promise<string> {
	const folder = await ensureAttachmentFolder(app, settings.attachmentFolder);
	const destVaultPath = normalizePath(`${folder}/${entry.fileName}`);

	if (await app.vault.adapter.exists(destVaultPath)) {
		return destVaultPath;
	}

	const srcAbsPath = audioAbsolutePath(settings.handyDataDir, entry.fileName);
	if (!fs.existsSync(srcAbsPath)) {
		throw new Error(`Recording audio file not found: ${srcAbsPath}`);
	}

	const destAbsPath = getVaultAbsolutePath(app, destVaultPath);
	fs.mkdirSync(path.dirname(destAbsPath), { recursive: true });
	fs.copyFileSync(srcAbsPath, destAbsPath);

	return destVaultPath;
}

function getVaultAbsolutePath(app: App, vaultRelativePath: string): string {
	// @ts-ignore - basePath exists on the desktop FileSystemAdapter
	const basePath: string = app.vault.adapter.basePath ?? app.vault.adapter.getBasePath?.();
	return path.join(basePath, vaultRelativePath);
}

export function buildAudioBlock(vaultAudioPath: string): string {
	const fileName = vaultAudioPath.split("/").pop();
	return `![[${fileName}]]\n`;
}

export function buildAudioTranscriptBlock(
	settings: HandySettings,
	entry: HistoryEntry,
	vaultAudioPath: string
): string {
	const fileName = vaultAudioPath.split("/").pop();
	const transcript = chooseTranscript(entry, settings);
	return settings.insertTemplate
		.replace(/{{audio}}/g, `![[${fileName}]]`)
		.replace(/{{transcript}}/g, transcript)
		.replace(/{{title}}/g, entry.title)
		.replace(/{{date}}/g, formatDate(entry.timestamp));
}

export function buildTranscriptBlock(settings: HandySettings, entry: HistoryEntry): string {
	const transcript = chooseTranscript(entry, settings);
	return settings.transcriptOnlyTemplate
		.replace(/{{transcript}}/g, transcript)
		.replace(/{{title}}/g, entry.title)
		.replace(/{{date}}/g, formatDate(entry.timestamp));
}

export function insertAtCursor(editor: Editor, text: string): void {
	const cursor = editor.getCursor();
	editor.replaceRange(text, cursor);
	const lines = text.split("\n");
	const newLine = cursor.line + lines.length - 1;
	const newCh = lines.length === 1 ? cursor.ch + text.length : lines[lines.length - 1].length;
	editor.setCursor({ line: newLine, ch: newCh });
}

export type InsertMode = "audio" | "transcript" | "both";

export async function insertRecording(
	app: App,
	editor: Editor,
	settings: HandySettings,
	entry: HistoryEntry,
	mode: InsertMode
): Promise<void> {
	try {
		let text: string;
		if (mode === "transcript") {
			text = buildTranscriptBlock(settings, entry);
		} else {
			const vaultAudioPath = await copyRecordingIntoVault(app, settings, entry);
			text =
				mode === "both"
					? buildAudioTranscriptBlock(settings, entry, vaultAudioPath)
					: buildAudioBlock(vaultAudioPath);
		}
		insertAtCursor(editor, text);
	} catch (err) {
		console.error("ObsHandy: failed to insert recording", err);
		new Notice(`ObsHandy: ${(err as Error).message}`);
	}
}
