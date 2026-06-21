import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDir = path.resolve(__dirname, '..', 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, 'lab.db')

const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  time_start TEXT NOT NULL,
  time_end TEXT NOT NULL,
  rows INTEGER NOT NULL DEFAULT 5,
  cols INTEGER NOT NULL DEFAULT 8,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'completed')),
  roster_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (roster_id) REFERENCES rosters(id)
);

CREATE TABLE IF NOT EXISTS seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  row_num INTEGER NOT NULL,
  col_num INTEGER NOT NULL,
  seat_number TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, row_num, col_num)
);

CREATE TABLE IF NOT EXISTS rosters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  student_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roster_id INTEGER NOT NULL,
  student_no TEXT NOT NULL,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  group_name TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (roster_id) REFERENCES rosters(id) ON DELETE CASCADE,
  UNIQUE(roster_id, student_no)
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  seat_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE(session_id, seat_id),
  UNIQUE(session_id, student_id)
);

CREATE TABLE IF NOT EXISTS swap_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  from_student_id INTEGER NOT NULL,
  to_student_id INTEGER NOT NULL,
  from_seat_id INTEGER NOT NULL,
  to_seat_id INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  approved_by TEXT,
  approval_role TEXT CHECK(approval_role IN ('admin', 'ta')),
  approval_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  processed_at TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (from_student_id) REFERENCES students(id),
  FOREIGN KEY (to_student_id) REFERENCES students(id),
  FOREIGN KEY (from_seat_id) REFERENCES seats(id),
  FOREIGN KEY (to_seat_id) REFERENCES seats(id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  seat_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_checked_in' CHECK(status IN ('not_checked_in', 'checked_in', 'late', 'absent')),
  check_in_time TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (seat_id) REFERENCES seats(id),
  UNIQUE(session_id, student_id)
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  operation_type TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT 'admin',
  operator_role TEXT NOT NULL DEFAULT 'admin' CHECK(operator_role IN ('admin', 'ta')),
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS seating_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'applied', 'abandoned')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seating_draft_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER NOT NULL,
  seat_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (draft_id) REFERENCES seating_drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_seats_session ON seats(session_id);
CREATE INDEX IF NOT EXISTS idx_students_roster ON students(roster_id);
CREATE INDEX IF NOT EXISTS idx_assignments_session ON assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_swap_requests_session ON swap_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_swap_requests_status ON swap_requests(status);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_logs_session ON operation_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_logs_created ON operation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_seating_drafts_session ON seating_drafts(session_id);
CREATE INDEX IF NOT EXISTS idx_seating_draft_items_draft ON seating_draft_items(draft_id);
`)

export function logOperation(
  sessionId: number | null,
  operationType: string,
  operator: string = 'admin',
  operatorRole: 'admin' | 'ta' = 'admin',
  details: string = ''
) {
  db.prepare(
    `INSERT INTO operation_logs (session_id, operation_type, operator, operator_role, details)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sessionId, operationType, operator, operatorRole, details)
}

export default db
