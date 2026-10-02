"""
One-Time Helper Script to Generate GMAIL_OAUTH_REFRESH_TOKEN for shamaabidiphd@gmail.com
Zero Password Storage — Official Google OAuth 2.0 Flow

Usage:
  1. Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET in your .env (or enter when prompted)
  2. Run: python backend/gmail_oauth_setup.py
  3. Log in with shamaabidiphd@gmail.com in the browser window that opens
  4. Copy the printed GMAIL_OAUTH_REFRESH_TOKEN into your .env file!
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
import urllib.parse
import urllib.request
import webbrowser

REDIRECT_PORT = 8765
REDIRECT_URI = f"http://localhost:{REDIRECT_PORT}"
SCOPES = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose"

auth_code_holder = {"code": None}


class OAuthCallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        if "code" in params:
            auth_code_holder["code"] = params["code"][0]
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                b"<html><body style='font-family:sans-serif;padding:40px;text-align:center;'>"
                b"<h2 style='color:#059669;'>&#10003; Gmail OAuth 2.0 Authorized Successfully!</h2>"
                b"<p>You can close this browser tab and return to your terminal to copy the Refresh Token.</p>"
                b"</body></html>"
            )
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Authorization failed or cancelled.")

    def log_message(self, format, *args):
        return


def main():
    print("=" * 72)
    print("  Shama Abidi PhD AI System — Gmail OAuth 2.0 Refresh Token Generator")
    print("=" * 72)

    client_id = os.getenv("GMAIL_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.getenv("GMAIL_OAUTH_CLIENT_SECRET", "").strip()

    if not client_id or client_id.startswith("your_"):
        client_id = input("Enter your GMAIL_OAUTH_CLIENT_ID: ").strip()
    if not client_secret or client_secret.startswith("your_"):
        client_secret = input("Enter your GMAIL_OAUTH_CLIENT_SECRET: ").strip()

    auth_params = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": REDIRECT_URI,
            "response_type": "code",
            "scope": SCOPES,
            "access_type": "offline",
            "prompt": "consent",
            "login_hint": "shamaabidiphd@gmail.com",
        }
    )
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{auth_params}"

    print("\n1. Opening your browser for Google OAuth2 login (shamaabidiphd@gmail.com)...")
    print(f"   If it does not open automatically, visit:\n   {auth_url}\n")
    webbrowser.open(auth_url)

    server = HTTPServer(("localhost", REDIRECT_PORT), OAuthCallbackHandler)
    print(f"2. Waiting for Google OAuth callback on {REDIRECT_URI} ...")
    server.handle_request()

    code = auth_code_holder.get("code")
    if not code:
        raise SystemExit("Error: Did not receive authorization code from Google.")

    token_data = urllib.parse.urlencode(
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=token_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        tokens = json.loads(resp.read().decode("utf-8"))

    refresh_token = tokens.get("refresh_token")
    print("\n" + "=" * 72)
    print("  SUCCESS! Copy these 3 lines into your .env file:")
    print("=" * 72)
    print(f"GMAIL_OAUTH_CLIENT_ID={client_id}")
    print(f"GMAIL_OAUTH_CLIENT_SECRET={client_secret}")
    print(f"GMAIL_OAUTH_REFRESH_TOKEN={refresh_token}")
    print("=" * 72)


if __name__ == "__main__":
    main()
