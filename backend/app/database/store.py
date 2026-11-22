"""SQLite persistence for scans, findings, remediation proposals and review reminders."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from ..config import get_settings

ACTIVE = ("queued", "crawling", "analyzing")

SCHEMA = """
CREATE TABLE IF NOT EXISTS scans (
  scan_id TEXT PRIMARY KEY, target_url TEXT NOT NULL, status TEXT NOT NULL,
  title TEXT, page_url TEXT, pages_scanned INTEGER NOT NULL DEFAULT 0,
  ai_analysis_status TEXT NOT NULL DEFAULT 'disabled',
  config TEXT NOT NULL DEFAULT '{}', pages TEXT NOT NULL DEFAULT '[]',
  errors TEXT NOT NULL DEFAULT '[]', cancel_requested INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL, started_at REAL, finished_at REAL
);
CREATE TABLE IF NOT EXISTS findings (
  finding_id TEXT PRIMARY KEY, scan_id TEXT NOT NULL, rule_id TEXT NOT NULL,
  wcag TEXT NOT NULL DEFAULT '[]', severity TEXT NOT NULL, message TEXT NOT NULL,
  selector TEXT, html_snippet TEXT, page_url TEXT NOT NULL, page_index INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL, confidence TEXT NOT NULL, title TEXT, category TEXT,
  evidence TEXT NOT NULL DEFAULT '{}', screenshot_available INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);
CREATE TABLE IF NOT EXISTS remediations (
  remediation_id TEXT PRIMARY KEY, finding_id TEXT NOT NULL, scan_id TEXT NOT NULL,
  original TEXT NOT NULL, replacement TEXT NOT NULL, status TEXT NOT NULL,
  decision TEXT, model TEXT, created_at REAL NOT NULL, decided_at REAL,
  verification_scan_id TEXT
);
CREATE TABLE IF NOT EXISTS reminders (
  remediation_id TEXT PRIMARY KEY, message TEXT NOT NULL, created_at REAL NOT NULL
);
"""

_JSON_SCAN = {"config", "pages", "errors"}


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


class Store:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.executescript(SCHEMA)
            remediation_columns = {
                row["name"] for row in self._conn.execute("PRAGMA table_info(remediations)")
            }
            if "verification_scan_id" not in remediation_columns:
                self._conn.execute("ALTER TABLE remediations ADD COLUMN verification_scan_id TEXT")
            self._conn.commit()

    # ---- helpers ----
    def _one(self, sql: str, args: tuple = ()) -> dict | None:
        with self._lock:
            row = self._conn.execute(sql, args).fetchone()
        return dict(row) if row else None

    def _all(self, sql: str, args: tuple = ()) -> list[dict]:
        with self._lock:
            return [dict(r) for r in self._conn.execute(sql, args).fetchall()]

    def _run(self, sql: str, args: tuple = ()) -> None:
        with self._lock:
            self._conn.execute(sql, args)
            self._conn.commit()

    def ping(self) -> bool:
        try:
            self._one("SELECT 1 AS ok")
            return True
        except sqlite3.Error:
            return False

    # ---- scans ----
    def create_scan(self, target_url: str, config: dict) -> str:
        scan_id = _new_id("scan")
        ai = "pending" if config.get("analyze_with_ai") else "disabled"
        self._run(
            "INSERT INTO scans(scan_id,target_url,status,ai_analysis_status,config,created_at) VALUES(?,?,?,?,?,?)",
            (scan_id, target_url, "queued", ai, json.dumps(config), time.time()),
        )
        return scan_id

    @staticmethod
    def _scan_out(row: dict | None) -> dict | None:
        if not row:
            return None
        for k in _JSON_SCAN:
            row[k] = json.loads(row[k] or ("{}" if k == "config" else "[]"))
        row["cancel_requested"] = bool(row["cancel_requested"])
        return row

    def get_scan(self, scan_id: str) -> dict | None:
        return self._scan_out(self._one("SELECT * FROM scans WHERE scan_id=?", (scan_id,)))

    def list_scans(self, limit: int = 100) -> list[dict]:
        rows = self._all("SELECT * FROM scans ORDER BY created_at DESC LIMIT ?", (limit,))
        out = []
        for r in rows:
            r = self._scan_out(r)
            r["finding_count"] = self._one(
                "SELECT COUNT(*) AS n FROM findings WHERE scan_id=?", (r["scan_id"],)
            )["n"]
            out.append(r)
        return out

    def update_scan(self, scan_id: str, **fields: Any) -> None:
        if not fields:
            return
        cols, vals = [], []
        for k, v in fields.items():
            cols.append(f"{k}=?")
            vals.append(json.dumps(v) if k in _JSON_SCAN else v)
        self._run(f"UPDATE scans SET {','.join(cols)} WHERE scan_id=?", (*vals, scan_id))

    def count_active(self) -> int:
        marks = ",".join("?" * len(ACTIVE))
        return self._one(f"SELECT COUNT(*) AS n FROM scans WHERE status IN ({marks})", ACTIVE)["n"]

    def request_cancel(self, scan_id: str) -> None:
        self._run("UPDATE scans SET cancel_requested=1 WHERE scan_id=?", (scan_id,))

    def is_cancel_requested(self, scan_id: str) -> bool:
        row = self._one("SELECT cancel_requested FROM scans WHERE scan_id=?", (scan_id,))
        return bool(row and row["cancel_requested"])

    def mark_interrupted(self) -> None:
        marks = ",".join("?" * len(ACTIVE))
        self._run(
            f"UPDATE scans SET status='failed', finished_at=? WHERE status IN ({marks})",
            (time.time(), *ACTIVE),
        )

    # ---- findings ----
    def add_findings(self, scan_id: str, findings: list[dict]) -> None:
        with self._lock:
            for f in findings:
                self._conn.execute(
                    "INSERT INTO findings(finding_id,scan_id,rule_id,wcag,severity,message,selector,html_snippet,"
                    "page_url,page_index,source,confidence,title,category,evidence,screenshot_available,created_at)"
                    " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        _new_id("finding"), scan_id, f["rule_id"], json.dumps(f.get("wcag", [])),
                        f.get("severity", "unknown"), f["message"], f.get("selector"), f.get("html_snippet"),
                        f["page_url"], f.get("page_index", 0), f["source"], f["confidence"], f.get("title"),
                        f.get("category"), json.dumps(f.get("evidence", {})),
                        1 if f.get("screenshot_available") else 0, time.time(),
                    ),
                )
            self._conn.commit()

    @staticmethod
    def _finding_out(row: dict) -> dict:
        row["wcag"] = json.loads(row["wcag"])
        row["evidence"] = json.loads(row["evidence"])
        row["screenshot_available"] = bool(row["screenshot_available"])
        return row

    def list_findings(
        self, scan_id: str | None = None, severity: str | None = None, source: str | None = None,
        q: str | None = None, limit: int = 200,
    ) -> list[dict]:
        where, args = [], []
        if scan_id:
            where.append("scan_id=?"); args.append(scan_id)
        if severity:
            where.append("severity=?"); args.append(severity)
        if source:
            where.append("source=?"); args.append(source)
        if q:
            like = f"%{q}%"
            where.append("(message LIKE ? OR rule_id LIKE ? OR selector LIKE ? OR title LIKE ?)")
            args += [like, like, like, like]
        sql = "SELECT * FROM findings" + (" WHERE " + " AND ".join(where) if where else "")
        sql += (
            " ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'serious' THEN 1 WHEN 'moderate' THEN 2"
            " WHEN 'minor' THEN 3 ELSE 4 END, created_at LIMIT ?"
        )
        return [self._finding_out(r) for r in self._all(sql, (*args, limit))]

    def get_finding(self, finding_id: str) -> dict | None:
        row = self._one("SELECT * FROM findings WHERE finding_id=?", (finding_id,))
        return self._finding_out(row) if row else None

    # ---- remediations ----
    def create_remediation(self, finding: dict, replacement: str, model: str | None) -> dict:
        rid = _new_id("rem")
        self._run(
            "INSERT INTO remediations(remediation_id,finding_id,scan_id,original,replacement,status,model,created_at)"
            " VALUES(?,?,?,?,?,?,?,?)",
            (rid, finding["finding_id"], finding["scan_id"], finding["html_snippet"], replacement,
             "proposed", model, time.time()),
        )
        return self.get_remediation(rid)  # type: ignore[return-value]

    def get_remediation(self, rid: str) -> dict | None:
        return self._one("SELECT * FROM remediations WHERE remediation_id=?", (rid,))

    def list_remediations(self, scan_id: str) -> list[dict]:
        return self._all(
            "SELECT * FROM remediations WHERE scan_id=? ORDER BY created_at",
            (scan_id,),
        )

    def create_verification_scan(self, rid: str, target_url: str, config: dict) -> tuple[str | None, bool]:
        with self._lock:
            row = self._conn.execute(
                "SELECT verification_scan_id FROM remediations WHERE remediation_id=?", (rid,)
            ).fetchone()
            if not row:
                return None, False
            if row["verification_scan_id"]:
                return row["verification_scan_id"], False

            scan_id = _new_id("scan")
            now = time.time()
            self._conn.execute(
                "INSERT INTO scans(scan_id,target_url,status,ai_analysis_status,config,created_at) "
                "VALUES(?,?,?,?,?,?)",
                (scan_id, target_url, "queued", "disabled", json.dumps(config), now),
            )
            self._conn.execute(
                "UPDATE remediations SET verification_scan_id=? WHERE remediation_id=?",
                (scan_id, rid),
            )
            self._conn.commit()
            return scan_id, True

    def set_decision(self, rid: str, decision: str) -> dict | None:
        status = "accepted_for_local_review" if decision == "accept" else "rejected"
        self._run(
            "UPDATE remediations SET decision=?, status=?, decided_at=? WHERE remediation_id=?",
            (decision, status, time.time(), rid),
        )
        return self.get_remediation(rid)

    def set_reminder(self, rid: str, message: str) -> dict:
        self._run(
            "INSERT OR REPLACE INTO reminders(remediation_id,message,created_at) VALUES(?,?,?)",
            (rid, message, time.time()),
        )
        return self.get_reminder(rid)  # type: ignore[return-value]

    def get_reminder(self, rid: str) -> dict | None:
        return self._one("SELECT * FROM reminders WHERE remediation_id=?", (rid,))


_stores: dict[str, Store] = {}
_stores_lock = threading.Lock()


def get_store() -> Store:
    path = get_settings().database
    with _stores_lock:
        if str(path) not in _stores:
            _stores[str(path)] = Store(path)
        return _stores[str(path)]
