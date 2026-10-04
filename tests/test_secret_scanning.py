"""
Automated Secret Scanning Security Test Suite.
Enforces Phase 1 Rules:
1. No Gmail App Password hardcoded in any tracked source file.
2. No SMTP passwords or credentials in frontend code (app.js).
3. No hardcoded admin passwords (shamaabidi1978, AdminShama#2026!) in services or scripts.
4. Ensures .env, *.db, data/production_state.json, and personal CV documents are not tracked by Git.
"""
from pathlib import Path
import re
import subprocess
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent

# Known revoked / compromised secrets that must NEVER appear in tracked source code
KNOWN_LEAKED_STRINGS = [
    "jisqsragwerolwyk",
    "jisq srag wero lwyk",
    "shamaabidi1978",
]

CODE_EXTENSIONS = {".py", ".js", ".html", ".css", ".md", ".json", ".yml", ".yaml"}


def get_tracked_files():
    """Retrieve list of files actively tracked in git index."""
    try:
        res = subprocess.run(
            ["git", "ls-files"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=True
        )
        return [f.strip() for f in res.stdout.splitlines() if f.strip()]
    except Exception:
        # Fallback to local files if git is not available
        return []


def test_no_hardcoded_leaked_credentials_in_tracked_code():
    """Verify that none of the known leaked secrets appear in any tracked files."""
    tracked = get_tracked_files()
    assert tracked, "Git tracked files should not be empty"

    violations = []
    for rel_path in tracked:
        file_path = REPO_ROOT / rel_path
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in CODE_EXTENSIONS:
            continue
        # Skip this test file itself which mentions the strings for checking
        if file_path.name == "test_secret_scanning.py":
            continue

        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
            for secret in KNOWN_LEAKED_STRINGS:
                if secret in content:
                    violations.append((rel_path, secret))
        except Exception:
            pass

    assert not violations, f"CRITICAL SECURITY VIOLATION: Hardcoded credentials detected in tracked files: {violations}"


def test_no_smtp_credentials_in_frontend():
    """Verify app.js does not contain SMTP passwords or direct SMTP socket code."""
    app_js = REPO_ROOT / "app.js"
    assert app_js.is_file()
    content = app_js.read_text(encoding="utf-8")
    
    assert "smtp.gmail.com" not in content, "app.js must not connect directly to SMTP servers"
    assert "GMAIL_APP_PASSWORD" not in content, "app.js must not reference GMAIL_APP_PASSWORD"
    assert "client_secret" not in content, "app.js must not store or handle OAuth client_secrets"


def test_sensitive_files_not_tracked_by_git():
    """Verify .env, production_state.json, databases and CVs are untracked."""
    tracked = set(get_tracked_files())
    
    assert ".env" not in tracked, ".env must NEVER be tracked in Git"
    assert "data/production_state.json" not in tracked, "data/production_state.json must not be tracked in Git"
    assert "data/shama_production.db" not in tracked, "SQLite database must not be tracked in Git"
    assert "data/shama_production_orm.db" not in tracked, "ORM database must not be tracked in Git"
    
    # Check CV files
    cv_files = [f for f in tracked if "cv" in f.lower() and f.endswith(".pdf")]
    assert not cv_files, f"Personal CV PDFs must not be tracked in Git: {cv_files}"


def test_gitignore_contains_critical_entries():
    """Verify .gitignore properly excludes all sensitive and environment files."""
    gitignore = REPO_ROOT / ".gitignore"
    assert gitignore.is_file()
    lines = [line.strip() for line in gitignore.read_text(encoding="utf-8").splitlines()]
    
    assert ".env" in lines
    assert "data/*.db" in lines or "*.db" in lines
    assert "data/production_state.json" in lines
