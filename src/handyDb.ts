import * as fs from "fs";
import * as path from "path";
import initSqlJs, { Database, SqlJsStatic } from "sql.js";

export interface HistoryEntry {
	id: number;
	fileName: string;
	timestamp: number;
	title: string;
	transcriptionText: string;
	postProcessedText: string | null;
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function getSqlJs(pluginDir: string): Promise<SqlJsStatic> {
	if (!sqlJsPromise) {
		// Read the wasm binary ourselves rather than relying on sql.js's default
		// locateFile/fetch loading, which can't resolve a raw OS filesystem path.
		const buf = fs.readFileSync(path.join(pluginDir, "sql-wasm.wasm"));
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

async function openDb(handyDataDir: string, pluginDir: string): Promise<Database> {
	const file = dbPath(handyDataDir);
	if (!fs.existsSync(file)) {
		throw new Error(`Handy history database not found at: ${file}`);
	}
	const SQL = await getSqlJs(pluginDir);
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

export async function getLatest(
	handyDataDir: string,
	pluginDir: string
): Promise<HistoryEntry | null> {
	const db = await openDb(handyDataDir, pluginDir);
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
	pluginDir: string,
	offset: number,
	limit: number,
	search: string
): Promise<{ entries: HistoryEntry[]; hasMore: boolean }> {
	const db = await openDb(handyDataDir, pluginDir);
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
