"""
Shama Abidi PhD System — Production Backup, Restore & Verification Utility (Section 19).
Creates a point-in-time backup of the SQLAlchemy relational database, restores it into
an isolated verification database instance, and verifies table counts, row integrity,
and SHA-256 checksums.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from backend.app.config import BACKUP_DIR, DATA_DIR


def compute_sha256(file_path: Path) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def get_table_counts(db_path: Path) -> dict[str, int]:
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
        tables = [r[0] for r in cur.fetchall()]
        counts: dict[str, int] = {}
        for t in tables:
            cur.execute(f'SELECT COUNT(*) FROM "{t}";')
            counts[t] = cur.fetchone()[0]
        return counts
    finally:
        conn.close()


def run_backup_and_restore_verification() -> dict:
    src_db = DATA_DIR / "shama_production_orm.db"
    if not src_db.exists():
        raise FileNotFoundError(f"Source database not found at {src_db}")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_db = BACKUP_DIR / f"shama_production_orm_backup_{ts}.db"
    sql_dump_path = BACKUP_DIR / f"shama_production_orm_dump_{ts}.sql"
    restored_test_db = BACKUP_DIR / f"shama_restore_verification_{ts}.db"

    # 1. Online hot backup using SQLite backup API + SQL logical dump
    src_conn = sqlite3.connect(str(src_db))
    bkp_conn = sqlite3.connect(str(backup_db))
    try:
        src_conn.backup(bkp_conn)
        with open(sql_dump_path, "w", encoding="utf-8") as dump_file:
            for line in src_conn.iterdump():
                dump_file.write(f"{line}\n")
    finally:
        bkp_conn.close()
        src_conn.close()

    # 2. Restore from SQL logical dump into an isolated non-production database
    if restored_test_db.exists():
        restored_test_db.unlink()
    restore_conn = sqlite3.connect(str(restored_test_db))
    try:
        sql_script = sql_dump_path.read_text(encoding="utf-8")
        restore_conn.executescript(sql_script)
        restore_conn.commit()
        # Run PRAGMA integrity_check and foreign_key_check
        cur = restore_conn.cursor()
        cur.execute("PRAGMA integrity_check;")
        integrity_result = cur.fetchone()[0]
        cur.execute("PRAGMA foreign_key_check;")
        fk_violations = cur.fetchall()
    finally:
        restore_conn.close()

    # 3. Compare table counts between production DB, binary backup, and restored DB
    src_counts = get_table_counts(src_db)
    bkp_counts = get_table_counts(backup_db)
    restored_counts = get_table_counts(restored_test_db)

    counts_match = (src_counts == bkp_counts == restored_counts)
    report = {
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "source_database": str(src_db),
        "binary_backup_path": str(backup_db),
        "binary_backup_sha256": compute_sha256(backup_db),
        "sql_dump_path": str(sql_dump_path),
        "sql_dump_sha256": compute_sha256(sql_dump_path),
        "restored_verification_db": str(restored_test_db),
        "integrity_check": integrity_result,
        "foreign_key_violations": len(fk_violations),
        "table_counts_match": counts_match,
        "total_tables_verified": len(restored_counts),
        "table_row_counts": restored_counts,
        "rpo_target": "24 hours (daily automated backup + pre-migration snapshot)",
        "rto_target": "< 15 minutes",
        "status": "VERIFIED_SUCCESS" if (counts_match and integrity_result == "ok" and len(fk_violations) == 0) else "FAILED",
    }

    report_path = BACKUP_DIR / "disaster_recovery_verification_report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    # Clean up temporary restored test DB file after verification while keeping backup and dump
    if restored_test_db.exists():
        restored_test_db.unlink()

    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    res = run_backup_and_restore_verification()
    if res["status"] != "VERIFIED_SUCCESS":
        sys.exit(1)
