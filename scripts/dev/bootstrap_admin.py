#!/usr/bin/env python3
"""
Shama Abidi PhD System — Secure Administrator Bootstrap Utility (`scripts/bootstrap_admin.py`)
Usage:
    python scripts/bootstrap_admin.py --email shamaabidiphd@gmail.com --password "YourStrongPassword123!"
Or interactively:
    python scripts/bootstrap_admin.py
"""
import argparse
import getpass
import os
from pathlib import Path
import sys

# Ensure repository root is on sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.config import settings
from backend.app.db_session import SessionLocal, init_orm_schema
from backend.app.enums import RoleEnum
from backend.app.models import User
from backend.app.security import hash_password, validate_password_policy


def bootstrap_admin(email: str, password: str, full_name: str = "Dr. Shama Abidi", force_reset: bool = False):
    init_orm_schema()
    db = SessionLocal()
    try:
        clean_email = email.strip().lower()
        validate_password_policy(password)

        existing = db.query(User).filter(User.email == clean_email).first()
        if existing:
            if not force_reset:
                print(f"[!] User '{clean_email}' already exists. Pass --force-reset to update password.")
                return False
            existing.password_hash = hash_password(password)
            existing.role = RoleEnum.ADMIN.value
            existing.is_active = True
            existing.failed_login_attempts = 0
            existing.locked_until = None
            db.commit()
            print(f"[+] Password successfully updated for existing administrator '{clean_email}'.")
            return True

        new_admin = User(
            id="user_admin_" + os.urandom(6).hex(),
            email=clean_email,
            full_name=full_name,
            password_hash=hash_password(password),
            role=RoleEnum.ADMIN.value,
            is_active=True,
            degree_title="PharmD, MPhil in Pharmacy Practice",
            institution="Liaquat National Hospital & University of Karachi",
        )
        db.add(new_admin)
        db.commit()
        print(f"[+] Successfully created new administrator account for '{clean_email}'.")
        return True
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Bootstrap or reset the administrator account.")
    parser.add_argument("--email", default="", help="Administrator email address")
    parser.add_argument("--password", default="", help="Administrator password (meeting policy)")
    parser.add_argument("--name", default="Dr. Shama Abidi", help="Administrator display name")
    parser.add_argument("--force-reset", action="store_true", help="Force update password if user already exists")
    args = parser.parse_args()

    email = args.email or input("Enter Administrator Email [shamaabidiphd@gmail.com]: ").strip() or "shamaabidiphd@gmail.com"
    password = args.password
    if not password:
        password = getpass.getpass("Enter Administrator Password: ").strip()

    try:
        success = bootstrap_admin(email=email, password=password, full_name=args.name, force_reset=args.force_reset)
        if not success:
            sys.exit(1)
    except Exception as exc:
        print(f"[-] Error bootstrapping admin: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
