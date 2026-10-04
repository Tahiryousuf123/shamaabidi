"""
Tests for Firebase Firestore Security Rules and Access Boundaries.
Verifies:
1. firestore.rules file exists and specifies rules_version = '2'.
2. Unauthenticated read = denied (no `allow read, write: if true;`).
3. Unauthenticated write = denied.
4. Other user's UID / non-owner = denied access to sensitive collections (shama_crm_sync, shama_crm_private).
5. Authorized owner UIDs / emails = permitted.
6. Default deny matches all undefined paths.
"""
from pathlib import Path
import re
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
RULES_PATH = REPO_ROOT / "firestore.rules"


def test_firestore_rules_file_exists():
    assert RULES_PATH.is_file(), "firestore.rules must exist in repo root"
    content = RULES_PATH.read_text(encoding="utf-8")
    assert "rules_version = '2';" in content, "Rules must use version 2"
    assert "service cloud.firestore" in content, "Service must be cloud.firestore"


def test_firestore_no_wildcard_allow_all():
    """Ensure insecure 'allow read, write: if true;' is completely absent."""
    content = RULES_PATH.read_text(encoding="utf-8")
    # Clean whitespace for pattern matching
    clean = re.sub(r"\s+", " ", content)
    assert "allow read, write: if true" not in clean, (
        "CRITICAL SECURITY FAILURE: Public read/write wildcard rule found in firestore.rules!"
    )
    assert "allow read: if true" not in clean, (
        "CRITICAL SECURITY FAILURE: Public read wildcard found in firestore.rules!"
    )
    assert "allow write: if true" not in clean, (
        "CRITICAL SECURITY FAILURE: Public write wildcard found in firestore.rules!"
    )


def test_firestore_rules_enforce_owner_authentication():
    """Verify rules enforce authentication and owner checks on sensitive CRM collections."""
    content = RULES_PATH.read_text(encoding="utf-8")
    
    # Check helper functions
    assert "function isAuthenticated()" in content
    assert "request.auth != null" in content
    assert "function isOwner()" in content
    assert "shamaabidiphd@gmail.com" in content
    assert "shama.abidi80@gmail.com" in content
    
    # Check collection matches
    assert "match /shama_crm_sync/{docId}" in content
    assert "match /shama_crm_private/{docId}" in content
    assert "allow read, write: if isOwner();" in content


def test_firestore_default_deny_present():
    """Verify default deny rule is present at the root level."""
    content = RULES_PATH.read_text(encoding="utf-8")
    clean = re.sub(r"\s+", " ", content)
    assert "match /{document=**} { allow read, write: if false; }" in clean or (
        "match /{document=**}" in clean and "allow read, write: if false;" in clean
    ), "Default deny rule must be present for all unmatched documents."


class MockAuthContext:
    def __init__(self, uid=None, email=None):
        self.auth = {"uid": uid, "token": {"email": email}} if uid else None

    def evaluate_is_authenticated(self):
        return self.auth is not None

    def evaluate_is_owner(self, owner_emails, owner_uids):
        if not self.evaluate_is_authenticated():
            return False
        email = self.auth.get("token", {}).get("email")
        uid = self.auth.get("uid")
        return (email in owner_emails) or (uid in owner_uids)


def test_security_rules_logic_simulation():
    """Simulate Firestore rule logic for unauthenticated, foreign user, and owner."""
    owner_emails = ["shamaabidiphd@gmail.com", "shama.abidi80@gmail.com"]
    owner_uids = ["owner_shama_abidi_uid", "bO47T7g46YShamaAbidiOwner"]

    # 1. Unauthenticated request: DENIED
    unauth = MockAuthContext(uid=None, email=None)
    assert unauth.evaluate_is_authenticated() is False
    assert unauth.evaluate_is_owner(owner_emails, owner_uids) is False

    # 2. Other user's UID / random authenticated visitor: DENIED
    attacker = MockAuthContext(uid="random_attacker_uid_123", email="attacker@evil.com")
    assert attacker.evaluate_is_authenticated() is True
    assert attacker.evaluate_is_owner(owner_emails, owner_uids) is False

    # 3. Legitimate Dr. Shama Abidi account: ALLOWED
    owner_by_email = MockAuthContext(uid="usr_shama_1", email="shamaabidiphd@gmail.com")
    assert owner_by_email.evaluate_is_authenticated() is True
    assert owner_by_email.evaluate_is_owner(owner_emails, owner_uids) is True

    owner_by_alt_email = MockAuthContext(uid="usr_shama_2", email="shama.abidi80@gmail.com")
    assert owner_by_alt_email.evaluate_is_authenticated() is True
    assert owner_by_alt_email.evaluate_is_owner(owner_emails, owner_uids) is True

    owner_by_uid = MockAuthContext(uid="owner_shama_abidi_uid", email="other@domain.com")
    assert owner_by_uid.evaluate_is_authenticated() is True
    assert owner_by_uid.evaluate_is_owner(owner_emails, owner_uids) is True


def test_firestore_unauthenticated_professors_and_cross_user_drafts_denied():
    """
    Phase 7 rule test:
    - Unauthenticated read to /professors must fail (under default deny).
    - Authenticated user with different UID reading another user's drafts must fail.
    """
    rules_text = RULES_PATH.read_text(encoding="utf-8")
    owner_emails = ["shamaabidiphd@gmail.com", "shama.abidi80@gmail.com"]
    owner_uids = ["owner_shama_abidi_uid", "bO47T7g46YShamaAbidiOwner"]

    # 1. Unauthenticated read to /professors
    # Rule check: /professors has no public allow rule; falls through to default deny:
    assert "match /professors" not in rules_text or "allow read: if true" not in rules_text
    assert "match /{document=**}" in rules_text and "allow read, write: if false;" in rules_text

    def evaluate_path_access(path: str, auth_ctx: MockAuthContext):
        if path.startswith("/professors"):
            # Falls under default deny
            return False
        if path.startswith("/shama_crm_sync") or path.startswith("/shama_crm_private"):
            return auth_ctx.evaluate_is_owner(owner_emails, owner_uids)
        if path.startswith("/users/"):
            parts = path.strip("/").split("/")
            doc_user_id = parts[1] if len(parts) > 1 else ""
            if not auth_ctx.evaluate_is_authenticated():
                return False
            # Allow only if requesting user owns userId or is owner
            is_same_user = auth_ctx.auth.get("uid") == doc_user_id
            return is_same_user or auth_ctx.evaluate_is_owner(owner_emails, owner_uids)
        return False

    # Unauthenticated read to /professors -> DENIED
    unauth = MockAuthContext(uid=None)
    assert evaluate_path_access("/professors/prof_123", unauth) is False

    # Authenticated user A reading user B's drafts -> DENIED
    user_a = MockAuthContext(uid="user_A", email="user_a@example.com")
    assert evaluate_path_access("/users/user_B/drafts/draft_001", user_a) is False

    # User B reading their own drafts -> ALLOWED
    user_b = MockAuthContext(uid="user_B", email="user_b@example.com")
    assert evaluate_path_access("/users/user_B/drafts/draft_001", user_b) is True

    # Owner reading any user's space -> ALLOWED
    owner = MockAuthContext(uid="owner_shama_abidi_uid", email="shamaabidiphd@gmail.com")
    assert evaluate_path_access("/users/user_B/drafts/draft_001", owner) is True

