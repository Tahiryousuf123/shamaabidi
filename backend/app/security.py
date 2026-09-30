"""
Shama Abidi PhD System — Application Security, Argon2id Auth, JWT & RBAC (`backend/app/security.py`)
Implements Section 5 (Security), Section 7 (Authentication & RBAC), and Section 30 (File Upload Security).
"""

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import re
import struct
import time
from typing import Any, Callable, Dict, Optional, Set
import uuid

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.db_session import get_db
from backend.app.models import User


ph = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=2)
bearer_scheme = HTTPBearer(auto_error=False)

# In-memory revoked token JTI store (supports logout & token invalidation)
REVOKED_TOKEN_JTIS: Set[str] = set()

ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".txt", ".md"}
FORBIDDEN_EXECUTABLE_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".sh", ".ps1", ".php", ".py", ".js", ".jsp", ".asp", ".aspx", ".dll", ".so", ".msi", ".vbs"
}
ALLOWED_MIME_TYPES = {"application/pdf", "text/plain", "text/markdown"}


def validate_password_policy(password: str) -> None:
    """Enforces strong password policy: >=10 chars, upper, lower, digit, and special character."""
    if not password or len(password) < 10:
        raise ValueError("Password must be at least 10 characters long.")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter.")
    if not re.search(r"[0-9]", password):
        raise ValueError("Password must contain at least one digit.")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise ValueError("Password must contain at least one special character.")


def hash_password(plain_password: str) -> str:
    """Hashes a password using Argon2id."""
    return ph.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verifies a plaintext password against an Argon2id hash."""
    try:
        return ph.verify(password_hash, plain_password)
    except (VerifyMismatchError, Exception):
        return False


def create_jwt_token(
    user_id: str,
    email: str,
    role: str,
    token_type: str = "access",
    expires_delta: Optional[timedelta] = None,
) -> str:
    now = datetime.now(timezone.utc)
    if expires_delta is None:
        if token_type == "refresh":
            expires_delta = timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        else:
            expires_delta = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": token_type,
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_jwt_token(token: str, expected_type: str = "access") -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_EXPIRED", "message": "Authentication token has expired."},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Invalid authentication token."},
        )

    if payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN_TYPE", "message": f"Expected {expected_type} token."},
        )

    jti = payload.get("jti", "")
    if jti in REVOKED_TOKEN_JTIS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_REVOKED", "message": "Token has been logged out / revoked."},
        )
    return payload


def revoke_token_jti(token: str) -> None:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False},
        )
        if payload.get("jti"):
            REVOKED_TOKEN_JTIS.add(payload["jti"])
    except Exception:
        pass


def generate_totp_code(secret_base32: str, timestamp: Optional[int] = None) -> str:
    """RFC 6238 TOTP generator for optional Administrator 2FA."""
    if timestamp is None:
        timestamp = int(time.time())
    key = base64.b32decode(secret_base32.upper() + "=" * ((8 - len(secret_base32) % 8) % 8))
    counter = struct.pack(">Q", timestamp // 30)
    mac = hmac.new(key, counter, hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    binary = struct.unpack(">L", mac[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(binary % 1000000).zfill(6)


def verify_totp_code(secret_base32: str, code: str) -> bool:
    now_ts = int(time.time())
    for drift in (-30, 0, 30):
        if hmac.compare_digest(generate_totp_code(secret_base32, now_ts + drift), str(code).strip()):
            return True
    return False


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Missing bearer authentication token."},
        )
    payload = decode_jwt_token(credentials.credentials, expected_type="access")
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_INACTIVE_OR_NOT_FOUND", "message": "User account is inactive or does not exist."},
        )
    request.state.user_id = user.id
    request.state.user_email = user.email
    request.state.user_role = user.role
    return user


def require_roles(*allowed_roles: str) -> Callable:
    """RBAC dependency factory enforcing that current user has one of `allowed_roles`."""
    def _role_guard(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FORBIDDEN_INSUFFICIENT_ROLE",
                    "message": f"Role '{current_user.role}' is not authorized. Required: {', '.join(allowed_roles)}.",
                },
            )
        return current_user

    return _role_guard


def validate_safe_file_upload(
    filename: str,
    mime_type: str,
    content_bytes: bytes,
) -> str:
    """
    Section 5 & Section 30 File Upload Validation:
    - Sanitizes filename (prevents path traversal `../`)
    - Blocks executable extensions
    - Enforces allowed extensions & MIME types
    - Enforces MAX_UPLOAD_SIZE_BYTES
    - Verifies PDF magic header (`%PDF-`) when uploading `.pdf`
    """
    if not filename or "/" in filename or "\\" in filename or ".." in filename:
        raise ValueError("Invalid or unsafe filename (path traversal blocked).")

    clean_name = re.sub(r"[^A-Za-z0-9._\-]", "_", filename.strip())
    lower_name = clean_name.lower()

    for bad_ext in FORBIDDEN_EXECUTABLE_EXTENSIONS:
        if lower_name.endswith(bad_ext) or f"{bad_ext}." in lower_name:
            raise ValueError(f"Executable or script file upload is strictly prohibited ({bad_ext}).")

    ext = "." + lower_name.rsplit(".", 1)[-1] if "." in lower_name else ""
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise ValueError(f"Unsupported file extension '{ext}'. Allowed: {sorted(ALLOWED_UPLOAD_EXTENSIONS)}")

    if mime_type not in ALLOWED_MIME_TYPES:
        raise ValueError(f"Unsupported MIME type '{mime_type}'. Allowed: {sorted(ALLOWED_MIME_TYPES)}")

    if len(content_bytes) == 0:
        raise ValueError("Uploaded file is empty.")

    if len(content_bytes) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise ValueError(f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_BYTES} bytes.")

    if ext == ".pdf" and not content_bytes.startswith(b"%PDF-"):
        raise ValueError("Invalid PDF file: missing '%PDF-' magic header.")

    return clean_name


def sanitize_text_against_xss(value: str) -> str:
    """Strips dangerous script/event handler injection vectors from user input."""
    if not value:
        return ""
    cleaned = re.sub(r"(?is)<script.*?>.*?</script>", "", value)
    cleaned = re.sub(r"(?i)javascript\s*:", "", cleaned)
    cleaned = re.sub(r"(?i)\bon\w+\s*=", "", cleaned)
    return cleaned.strip()
