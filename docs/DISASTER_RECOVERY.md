# Shama Abidi PhD System — Backups & Disaster Recovery Plan (`docs/DISASTER_RECOVERY.md`)

## 1. Recovery Objectives (Section 19)
- **Recovery Point Objective (RPO)**: `< 24 hours` (automated daily hot backups + mandatory pre-migration snapshots).
- **Recovery Time Objective (RTO)**: `< 15 minutes` (automated restore and schema/foreign-key integrity verification).

---

## 2. Backup & Restore Verification Utility
The script [scripts/backup_and_restore_test.py](file:///c:/Users/Lenovo/Desktop/demo%20p/scripts/backup_and_restore_test.py) performs an end-to-end disaster recovery drill:
1. Creates an online binary backup (`backups/shama_production_orm_backup_<timestamp>.db`) and a full SQL logical dump (`backups/shama_production_orm_dump_<timestamp>.sql`).
2. Computes SHA-256 cryptographic checksums of both backup artifacts.
3. Restores the SQL logical dump into an isolated non-production verification database (`shama_restore_verification_<timestamp>.db`).
4. Runs `PRAGMA integrity_check` and `PRAGMA foreign_key_check` on the restored database.
5. Compares row counts across all **27 tables** (`26` domain entities + `alembic_version`) between the live database, binary backup, and restored verification database.
6. Writes the signed audit report to `backups/disaster_recovery_verification_report.json`.

---

## 3. Running a Backup & Restore Drill
```bash
python scripts/backup_and_restore_test.py
```
Expected verification output:
- `"integrity_check": "ok"`
- `"foreign_key_violations": 0`
- `"table_counts_match": true`
- `"total_tables_verified": 27`
- `"status": "VERIFIED_SUCCESS"`
