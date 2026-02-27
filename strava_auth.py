cd ～/running-page-source
nano strava_auth.py
# ← 粘贴上面的代码，保存
python3 strava_auth.py#!/usr/bin/env python3
import requests
import webbrowser
from urllib.parse import parse_qs, urlparse

def main():
    client_id = input("Enter your Strava Client ID: ").strip()
    client_secret = input("Enter your Strava Client Secret: ").strip()

    auth_url = (
        f"https://www.strava.com/oauth/authorize"
        f"?client_id={client_id}"
        f"&response_type=code"
        f"&redirect_uri=http://localhost/exchange_token"
        f"&approval_prompt=force"
        f"&scope=activity:read_all"
    )

    print("\nOpening browser for authorization...")
    webbrowser.open(auth_url)
    print("After authorization, you'll be redirected to a blank page.")
    full_url = input("\nPaste the full redirect URL here: ").strip()

    code = parse_qs(urlparse(full_url).query).get("code", [None])[0]
    if not code:
        print("❌ Failed to extract authorization code.")
        return

    print("\nExchanging code for tokens...")
    resp = requests.post(
        "https://www.strava.com/oauth/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
        },
    )

    if resp.status_code == 200:
        tokens = resp.json()
        print("\n✅ Success! Here are your tokens:")
        print(f"\nAccess Token (expires in 6h): {tokens['access_token']}")
        print(f"\n🔑 REFRESH TOKEN (save this!): {tokens['refresh_token']}\n")
        print("Use the REFRESH TOKEN in your config.yaml or command line.")
    else:
        print(f"❌ Error: {resp.text}")

if __name__ == "__main__":
    main()
