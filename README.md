# NILM Capstone Project

Full-stack prototype for collecting residential AC energy measurements from an
ESP32 and PZEM-004T V3, storing them in MySQL, and presenting monitoring and
rule-based appliance-estimation results in a React Native application.

The repository contains the earlier landlord/tenant application, a separate
engineering monitoring application, and the working single-PZEM hardware
integration. Multi-channel support remains intentionally deferred until the
final multi-PZEM schematic is approved.

## Current capabilities

- Express and TypeScript REST API backed by MySQL
- Separate React Native and Expo applications for the IT and engineering scopes
- JWT authentication and role-based access control
- User, room, landlord, tenant, and device management
- Reading ingestion from simulation or physical ESP32 hardware
- Live and historical readings, device status, billing, and notifications
- ESP32 heartbeat telemetry and measurement-completeness diagnostics
- Rule-based appliance estimation using the measurement features available
- Arduino baseline and Wi-Fi-enabled PZEM firmware
- Optional deterministic feeder for software-only demonstrations

## Hardware boundary

The PZEM-004T V3 provides AC voltage, current, active power, energy, frequency,
and power factor. It does not provide THD, harmonic spectra, or raw waveform
samples. The API therefore accepts a missing `thd_percentage`, and the detector
renormalizes its score across the available measurements.

The committed firmware currently supports one PZEM. A multi-PZEM version should
not be implemented until the PZEM addresses, serial topology, CT placement, and
aggregate-versus-branch channel roles are confirmed.

## Repository structure

```text
capstone-nilm-project/
|-- server/              Express, TypeScript, and MySQL backend
|-- mobile/              React Native and Expo application
|-- engineering-mobile/  Monitoring-only engineering Expo application
|-- firmware/            ESP32 baseline and network Arduino sketches
|-- docs/                Architecture, papers, hardware evidence, and guides
|-- database/snapshots/  Historical development database exports
|-- package.json         Root convenience commands
`-- README.md
```

## Setup

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Create local environment files

Copy:

- `server/.env.example` to `server/.env`
- `mobile/.env.example` to `mobile/.env`
- `engineering-mobile/.env.example` to `engineering-mobile/.env`
- `firmware/esp32_pzem_lcd_network/network_config.example.h` to
  `firmware/esp32_pzem_lcd_network/network_config.h`

The real environment and firmware configuration files are ignored by Git.

For a physical phone or ESP32, replace `localhost` with the development PC's LAN
IPv4 address. The phone, ESP32, and backend computer must be reachable on the
same network.

### 3. Initialize a development database

Start MySQL, then run:

```bash
npm run db:reset
```

Warning: this command recreates the configured database and inserts simulated
demo records. Do not run it against a database containing hardware measurements
that you want to preserve.

For an existing database that predates physical PZEM ingestion, run once:

```bash
npm run db:migrate:pzem
```

For device heartbeat and hardware-health telemetry, also run once:

```bash
npm run db:migrate:health
```

### 4. Start the backend

```bash
npm run dev
```

Equivalent explicit command:

```bash
npm run dev:server
```

The default API base URL is `http://localhost:4000/api/v1`.

### 5. Start the mobile application

In a second terminal:

```bash
npm run dev:mobile
```

To start the separate engineering monitoring application instead:

```bash
npm run dev:engineering
```

### 6. Optional software feeder

```bash
npm run dev:feeder
```

The feeder generates simulated readings. Keep it stopped while recording or
demonstrating real ESP32 data so simulated and physical measurements are not
mixed.

## Validation

Run the server type check and mobile lint together:

```bash
npm run check
```

Arduino IDE instructions and the verified pin map are in
[`firmware/README.md`](firmware/README.md).

## Main API routes

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/readings/ingest`
- `POST /api/v1/readings/heartbeat`
- `GET /api/v1/readings/latest/:roomId`
- `GET /api/v1/readings/history/:roomId`
- `GET /api/v1/detections/latest/:roomId`
- `GET /api/v1/devices`
- `GET /api/v1/rooms`
- `GET /api/v1/dashboard/admin`
- `GET /api/v1/dashboard/tenant`
- `GET /api/v1/monitoring/rooms`
- `GET /api/v1/monitoring/rooms/:roomId/dashboard?range=live|1h|24h|7d|30d`
- `GET /api/v1/monitoring/rooms/:roomId/report?range=24h|7d|30d`

## Documentation

- [Architecture](docs/architecture.md)
- [Engineering monitoring application](docs/engineering-monitoring-app.md)
- [Entity relationship model](docs/erd.md)
- [Feeder guide](docs/feeder.md)
- [MacBook demonstration setup](docs/macbook-demo-setup.md)
- [Hardware evidence](docs/hardware/README.md)
- [Papers and requirements](docs/papers/README.md)
- [Historical database snapshots](database/snapshots/README.md)

## Safety and data handling

- Treat PZEM mains wiring as hazardous and have it inspected by a qualified
  person before unattended operation.
- Never commit Wi-Fi credentials, JWT secrets, database passwords, or local
  network configuration.
- Back up the live database before migrations, resets, or bulk cleanup.
- Historical SQL snapshots contain demo data and are not the canonical schema.
