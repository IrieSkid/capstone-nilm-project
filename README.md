# NILM Capstone MVP

Defense-ready MVP for a software-based Non-Intrusive Load Monitoring (NILM) system focused on the minimum vertical slice needed for the `40% system development` checklist.

## Implemented Scope

- JWT login with bcrypt password hashing
- role-based access control for `admin` and `tenant`
- session persistence in the mobile app
- admin CRUD for users, rooms, and devices
- real MySQL-backed reading ingest flow
- rule-based NILM appliance detection
- estimated cost calculation using room rate per kWh
- tenant dashboard with latest reading, appliance, confidence, cost, and history
- tenant remote port on/off control backed by MySQL state
- admin dashboard with totals, latest room summaries, highest consuming room, and device status
- simulator screen that posts to the same ingest endpoint as external hardware
- optional feeder server that continuously pushes deterministic multi-appliance readings into the ingest API

## Project Structure

```text
capstone-nilm-project/
├─ server/   # Express + TypeScript + MySQL API
├─ mobile/   # React Native + Expo + TypeScript app
├─ docs/     # ERD, architecture, and demo script
└─ README.md
```

## Quick Setup

### 1. Install all dependencies

```bash
npm run install:all
```

### 2. Configure environment files

Copy these templates:

- `server/.env.example` -> `server/.env`
- `mobile/.env.example` -> `mobile/.env`

Suggested backend values for XAMPP:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=nilm_capstone_mvp
JWT_SECRET=change-this-secret
```

For Expo:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
```

Use `http://10.0.2.2:4000/api/v1` for Android emulator or your LAN IP for a real phone.

### 3. Reset and seed the database

Make sure MySQL is running, then execute:

```bash
npm run db:reset
```

This creates the schema and seeds:

- 1 admin
- 1 landlord
- 2 tenants
- 2 rooms
- 3 devices
- appliance categories and types
- sample readings and detections

### 4. Start the backend

```bash
npm run dev:server
```

Backend base URL:

```text
http://localhost:4000/api/v1
```

### 5. Start the mobile app

```bash
npm run dev:mobile
```

### 6. Optional: start the readings feeder

This gives you a separate fake data source outside the app and can replace the Simulator screen during the defense.

```bash
npm run dev:feeder
```

By default, it autostarts and feeds all room-assigned devices every `2000 ms`.

Default feeder URL:

```text
http://localhost:4010
```

If you want to restart it manually or override the interval:

```bash
curl -X POST http://localhost:4010/start -H "Content-Type: application/json" -d "{}"
```

PowerShell alternative:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:4010/start -ContentType "application/json" -Body "{}"
```

Useful feeder endpoints:

- `GET /health`
- `GET /status`
- `GET /targets`
- `POST /start`
- `POST /tick`
- `POST /stop`

Example `POST /start` body:

```json
{
  "intervalMs": 2000,
  "deviceIdentifiers": ["DEV-101", "DEV-102"]
}
```

## Demo Credentials

- Admin: `admin@nilm.local` / `Admin123!`
- Tenant: `juan@nilm.local` / `Tenant123!`
- Tenant: `maria@nilm.local` / `Tenant123!`
- Landlord: `landlord@nilm.local` / `Landlord123!`

## Key API Endpoints

### Auth

- `POST /auth/login`
- `GET /auth/me`

### Admin CRUD

- `GET /users`
- `POST /users`
- `PATCH /users/:id`
- `GET /rooms`
- `POST /rooms`
- `PATCH /rooms/:id`
- `GET /devices`
- `POST /devices`
- `PATCH /devices/:id`

### Readings and Detections

- `POST /readings/ingest`
- `GET /readings/latest/:roomId`
- `GET /readings/history/:roomId`
- `GET /detections/latest/:roomId`

### Tenant Port Control

- `GET /device-ports/room/:roomId`
- `PATCH /device-ports/:portId`

### Dashboards

- `GET /dashboard/admin`
- `GET /dashboard/tenant`

## NILM Rule-Based Detection

The MVP uses weighted scoring against appliance reference profiles:

- power similarity
- power factor similarity
- frequency similarity
- THD similarity

Only matches above the minimum confidence threshold are stored and returned.

## Documentation

- ERD: [docs/erd.md](docs/erd.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Feeder: [docs/feeder.md](docs/feeder.md)
- MacBook setup: [docs/macbook-demo-setup.md](docs/macbook-demo-setup.md)
- Demo flow: [docs/demo-script.md](docs/demo-script.md)

## Checklist Coverage

- Functional login authentication
- Password hashing with bcrypt
- JWT-based session management
- Unauthorized API restriction with `401` and `403`
- Role-based mobile navigation and route protection
- Normalized tables with PK/FK relationships
- Referential integrity in MySQL
- Backend DTO/schema validation
- Functional CRUD for users, rooms, and devices
- Complete input -> processing -> storage -> output NILM flow
- Real business rules for device uniqueness, room mapping, active users, and cost computation
- Clean empty states and user-facing error messages
