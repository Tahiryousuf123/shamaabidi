"""
Reset Shama Abidi PhD System to Clean Zero State
Clears all prototype professors, publications, and drafts,
while strictly preserving Dr. Shama Abidi's verified knowledge base,
publications, credentials, CV document, and system settings.
"""

import os
import sys
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

import sqlite3
from backend.database import export_production_state_snapshot, DB_PATH

def reset_to_clean_slate():
    db_path = str(DB_PATH)
    print(f"Connecting to database: {db_path}")
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    # Tables to clear
    tables_to_clear = [
        "email_drafts",
        "email_threads",
        "email_replies",
        "followups",
        "verification_records",
        "funding_evidence",
        "professor_publications",
        "professors",
        "activity_logs",
        "whatsapp_notifications",
    ]

    for tbl in tables_to_clear:
        cur.execute(f"DELETE FROM {tbl}")
        print(f"Cleared table: {tbl}")

    # Reset discovery cursor
    cur.execute("UPDATE system_settings SET setting_value = '1' WHERE setting_key = 'discovery_cursor_page'")
    con.commit()
    con.close()

    print("\nDatabase cleared successfully. Now exporting fresh production snapshot...")
    snapshot = export_production_state_snapshot()
    
    print(f"Fresh Snapshot Professors: {len(snapshot.get('professors', []))}")
    print(f"Fresh Snapshot Drafts: {len(snapshot.get('email_drafts', []))}")
    print(f"Fresh Snapshot KPIs: {snapshot.get('dashboard_kpis', {})}")
    print("SUCCESS: System reset to pristine zero state!")

if __name__ == "__main__":
    reset_to_clean_slate()
