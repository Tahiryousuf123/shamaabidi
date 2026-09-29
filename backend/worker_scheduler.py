"""
Shama Abidi — Autonomous AI Research Agent & CRM System
Cloud Worker Entrypoint (Delegates to autonomous_pipeline.py)
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List

from autonomous_pipeline import (
    run_all_scheduled_jobs,
    run_job_email_draft_generation,
    run_job_funding_and_candidate_verification,
    run_job_professor_matching,
    run_job_research_discovery,
)
from database import export_production_state_snapshot, init_database


def _load_dotenv() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip()
            if k and v and k not in os.environ:
                os.environ[k] = v


_load_dotenv()


def run_discovery_cycle(per_query: int = 10) -> List[Dict[str, Any]]:
    """Runs the autonomous discovery, matching, verification, and draft generation pipeline."""
    init_database()
    run_job_research_discovery(target_min=30, target_max=max(40, per_query * 6))
    run_job_professor_matching()
    run_job_funding_and_candidate_verification()
    run_job_email_draft_generation()
    snapshot = export_production_state_snapshot()
    return snapshot.get("professors", [])[:20]


if __name__ == "__main__":
    summary = run_all_scheduled_jobs()
    print("[Autonomous Cloud Worker] Completed all 7 scheduled jobs successfully:")
    print(json.dumps(summary, indent=2))
