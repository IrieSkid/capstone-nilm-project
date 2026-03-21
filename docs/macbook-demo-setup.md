# MacBook Demo Setup Guide

Use this guide to move the NILM capstone MVP from this Windows PC to your MacBook and get it demo-ready.

## 1. Transfer the Project

Pick the fastest option you already have available:

- `Git`: push the repo, then clone it on the MacBook
- `USB drive` or `external SSD`: copy the whole `capstone-nilm-project` folder
- `Google Drive / OneDrive / AirDrop`: zip the folder on the PC, then extract it on the MacBook

To make the transfer smaller, you can skip these folders if they exist:

- `server/node_modules`
- `mobile/node_modules`
- `mobile/.expo`

Keep these files:

- `server/.env`
- `mobile/.env`
- everything under `server/`
- everything under `mobile/`
- everything under `docs/`
- root `package.json`

## 2. Install MacBook Prerequisites

Install these before running the project:

- `Node.js` 20+ or 22+
- `npm`
- `MySQL` or `MariaDB`
- `Expo Go` on your iPhone if you want to demo on a real phone

Optional:

- `Xcode` only if you want to use the iOS simulator

## 3. Put the Project on the MacBook

Example location:

```bash
cd ~/Desktop
unzip capstone-nilm-project.zip
cd capstone-nilm-project
```

Or if using git:

```bash
git clone <your-repo-url> capstone-nilm-project
cd capstone-nilm-project
```

## 4. Install Dependencies

From the project root:

```bash
npm run install:all
```

## 5. Configure Environment Files

### `server/.env`

Use this on the MacBook:

```env
PORT=4000
API_PREFIX=/api/v1
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=capstone-nilm-app-prototype-db
JWT_SECRET=change-this-secret
JWT_EXPIRES_IN=1d
CORS_ORIGIN=*
DETECTION_MIN_CONFIDENCE=0.65
DEVICE_OFFLINE_MINUTES=15
FEEDER_PORT=4010
FEEDER_DEFAULT_INTERVAL_MS=2000
FEEDER_AUTOSTART=true
FEEDER_INGEST_URL=http://localhost:4000/api/v1/readings/ingest
```

### `mobile/.env`

If you will demo in the MacBook browser:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
```

If you will demo on your iPhone using Expo Go on the same Wi-Fi:

```env
EXPO_PUBLIC_API_BASE_URL=http://YOUR-MACBOOK-LAN-IP:4000/api/v1
```

Get your MacBook Wi-Fi IP with:

```bash
ipconfig getifaddr en0
```

If `en0` does not return an IP, try:

```bash
ifconfig
```

Then look for the active Wi-Fi interface IP.

## 6. Start MySQL and Seed the Database

Start MySQL or MariaDB on the MacBook first.

Then from the project root:

```bash
npm run db:reset
```

This creates the schema and seeds:

- admin user
- tenant users
- rooms and devices
- device ports for tenant remote on/off control
- appliance types
- sample readings and detections

## 7. Start the App for the Demo

Open 3 terminal tabs from the project root.

### Terminal 1: Backend API

```bash
npm run dev:server
```

### Terminal 2: Readings Feeder

```bash
npm run dev:feeder
```

The feeder autostarts and pushes deterministic readings every 2 seconds.

### Terminal 3: Expo App

```bash
npm run dev:mobile
```

Then:

- press `w` for web demo in the MacBook browser, or
- scan the QR code using Expo Go on your iPhone

## 8. Quick Health Check

Open these in the MacBook browser:

- `http://localhost:4000/health`
- `http://localhost:4010/health`

If both respond, the backend and feeder are up.

## 9. Demo Credentials

- Admin: `admin@nilm.local` / `Admin123!`
- Tenant: `juan@nilm.local` / `Tenant123!`
- Tenant: `maria@nilm.local` / `Tenant123!`

## 10. Demo Flow on the MacBook

1. Log in as admin.
2. Show admin dashboard totals and latest readings.
3. Mention the feeder is generating real readings every 2 seconds.
4. Log in as tenant.
5. Show the remote port control section.
6. Turn one port off.
7. Wait one feeder cycle.
8. Show the appliance disappears from the breakdown and the room total power drops.

## 11. Common MacBook Fixes

### Expo app cannot reach the backend on iPhone

- make sure the phone and MacBook are on the same Wi-Fi
- use the MacBook LAN IP in `mobile/.env`
- restart Expo after changing the env file

### Backend starts but mobile still shows old data

- refresh the app
- if needed, restart `npm run dev:mobile`

### Feeder does not start

- make sure the backend is already running on port `4000`
- make sure `server/.env` points `FEEDER_INGEST_URL` to `http://localhost:4000/api/v1/readings/ingest`

### Database reset fails

- make sure MySQL is running
- make sure the user in `server/.env` can create databases

## 12. Best Demo Option

Safest setup for tomorrow:

- backend on MacBook
- feeder on MacBook
- Expo web in the MacBook browser

This avoids phone network issues while keeping the full NILM software flow real.
