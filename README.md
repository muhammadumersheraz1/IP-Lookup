# IP Lookup

Vercel app that detects the visitor IP and looks up city with **IP2Location LITE** on the server.

## Deploy on Vercel

1. Import [github.com/muhammadumersheraz1/IP-Lookup](https://github.com/muhammadumersheraz1/IP-Lookup).
2. Framework Preset: **Other**.
3. Deploy. No environment variables are required; the download token is in `lib/token.js`.

## Local

```bash
npm install
npm run download-db
npm run dev
```

Open http://127.0.0.1:3000/

## API

- `GET /api/ip` — current visitor IP
- `GET /api/geo?ip=` — city from IP2Location LITE
- `POST /api/visits` — save a lookup

This site uses the IP2Location LITE database for IP geolocation.
