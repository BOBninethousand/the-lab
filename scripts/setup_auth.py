#!/usr/bin/env python3
"""Generate authentication credentials for The Lab.

Run once, then paste the output into backend/.env
"""
import secrets

try:
    import bcrypt
except ImportError:
    print("bcrypt not installed. Run: pip install bcrypt")
    raise SystemExit(1)

email = "team@irislab.com"
password = secrets.token_urlsafe(24)
password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
jwt_secret = secrets.token_hex(32)

print()
print("=" * 60)
print("  The Lab — Authentication Credentials")
print("=" * 60)
print()
print(f"  Email:    {email}")
print(f"  Password: {password}")
print()
print("  SAVE THIS PASSWORD NOW — it cannot be recovered.")
print()
print("-" * 60)
print("  Add these lines to backend/.env:")
print("-" * 60)
print()
print(f"LAB_AUTH_EMAIL={email}")
print(f"LAB_AUTH_HASH={password_hash}")
print(f"LAB_JWT_SECRET={jwt_secret}")
print()
print("=" * 60)
