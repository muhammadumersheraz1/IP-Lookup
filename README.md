# IP Lookup

Vercel app that detects the visitor IP and looks up city with **IP2Location LITE** on the server.

## Deploy on Vercel

1. Import [github.com/muhammadumersheraz1/IP-Lookup](https://github.com/muhammadumersheraz1/IP-Lookup).
2. Framework Preset: **Other**.
3. Add environment variable (Production, Preview, and Development):

   - **Name:** `IP2LOCATION_TOKEN`
   - **Value:** your download token from [lite.ip2location.com](https://lite.ip2location.com/)

4. Deploy.

Build downloads `IP2LOCATION-LITE-DB3.BIN`. The token is required at **build** time, not in the browser.

## Local

```bash
npm install
npm run download-db -- YOUR_TOKEN
npm run dev
```

Open http://127.0.0.1:3000/

## API

- `GET /api/ip` — current visitor IP
- `GET /api/geo?ip=` — city from IP2Location LITE
- `POST /api/visits` — save a lookup

This site uses the IP2Location LITE database for IP geolocation.
