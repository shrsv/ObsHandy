import * as fs from "fs";
import * as path from "path";
import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { SQL_WASM_BASE64 } from "./sqlWasmBase64";

export interface HistoryEntry {
	id: number;
	fileName: string;
	timestamp: number;
	title: string;
	transcriptionText: string;
	postProcessedText: string | null;
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function getSqlJs(): Promise<SqlJsStatic> {
	if (!sqlJsPromise) {
		// The wasm binary is embedded (base64) directly in the bundle rather than
		// shipped as a sibling file: sql.js's default locateFile/fetch loading
		// can't resolve a raw OS filesystem path, and BRAT only fetches
		// main.js/manifest.json/styles.css, not extra release assets.
		const buf = Buffer.from(SQL_WASM_BASE64, "base64");
		const wasmBinary = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
		sqlJsPromise = initSqlJs({ wasmBinary });
	}
	return sqlJsPromise!;
}

function dbPath(handyDataDir: string): string {
	return path.join(handyDataDir, "history.db");
}

export function recordingsDir(handyDataDir: string): string {
	return path.join(handyDataDir, "recordings");
}

export function audioAbsolutePath(handyDataDir: string, fileName: string): string {
	return path.join(recordingsDir(handyDataDir), fileName);
}

async function openDb(handyDataDir: string): Promise<Database> {
	const file = dbPath(handyDataDir);
	if (!fs.existsSync(file)) {
		throw new Error(`Handy history database not found at: ${file}`);
	}
	const SQL = await getSqlJs();
	const buffer = fs.readFileSync(file);
	return new SQL.Database(buffer);
}

function rowToEntry(row: any[], columns: string[]): HistoryEntry {
	const get = (name: string) => row[columns.indexOf(name)];
	return {
		id: get("id") as number,
		fileName: get("file_name") as string,
		timestamp: get("timestamp") as number,
		title: get("title") as string,
		transcriptionText: get("transcription_text") as string,
		postProcessedText: (get("post_processed_text") as string) ?? null,
	};
}

function runQuery(db: Database, sql: string, params: any[]): HistoryEntry[] {
	const stmt = db.prepare(sql);
	stmt.bind(params);
	const results: HistoryEntry[] = [];
	const columns = [
		"id",
		"file_name",
		"timestamp",
		"title",
		"transcription_text",
		"post_processed_text",
	];
	while (stmt.step()) {
		results.push(rowToEntry(stmt.get(), columns));
	}
	stmt.free();
	return results;
}

const SELECT_COLS =
	"id, file_name, timestamp, title, transcription_text, post_processed_text";

export async function getLatest(handyDataDir: string): Promise<HistoryEntry | null> {
	const db = await openDb(handyDataDir);
	try {
		const rows = runQuery(
			db,
			`SELECT ${SELECT_COLS} FROM transcription_history ORDER BY timestamp DESC, id DESC LIMIT 1`,
			[]
		);
		return rows[0] ?? null;
	} finally {
		db.close();
	}
}

export async function getPage(
	handyDataDir: string,
	offset: number,
	limit: number,
	search: string
): Promise<{ entries: HistoryEntry[]; hasMore: boolean }> {
	const db = await openDb(handyDataDir);
	try {
		let rows: HistoryEntry[];
		if (search.trim()) {
			const like = `%${search.trim()}%`;
			rows = runQuery(
				db,
				`SELECT ${SELECT_COLS} FROM transcription_history
				 WHERE transcription_text LIKE ? OR title LIKE ? OR IFNULL(post_processed_text, '') LIKE ?
				 ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`,
				[like, like, like, limit + 1, offset]
			);
		} else {
			rows = runQuery(
				db,
				`SELECT ${SELECT_COLS} FROM transcription_history
				 ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`,
				[limit + 1, offset]
			);
		}
		const hasMore = rows.length > limit;
		return { entries: rows.slice(0, limit), hasMore };
	} finally {
		db.close();
	}
}
