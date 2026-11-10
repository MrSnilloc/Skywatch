# Sky Watch relay (free, ~10 minutes, once)

Web browsers won't let a web app read the live plane feeds directly. This tiny relay runs free on
Cloudflare, fetches the planes for Sky Watch, and only answers your app. No credit card, no command line.

1. Go to **https://dash.cloudflare.com/sign-up** and make a free account (verify your email).
2. In the left menu click **Compute (Workers)** → **Workers & Pages** → **Create** → **Start with Hello World!**
   (Cloudflare sometimes renames these; look for "Create Worker").
3. Name it **skywatch-relay** and click **Deploy**.
4. Click **Edit code**. Select everything in the editor and delete it.
5. Open `skywatch-relay.js` (this folder) in Notepad, copy all of it, paste it into the Cloudflare editor.
6. Click **Deploy** (top right).
7. Copy the address shown, like `https://skywatch-relay.YOURNAME.workers.dev`.
8. In Sky Watch: **Settings (gear) → Plane data → Relay address**, paste it. You should see "Relay works ✓".

The free plan allows 100,000 requests a day — Sky Watch uses a few hundred at most.
When the Android app is built it can use the feeds directly, but it will still use the relay if one is set.
