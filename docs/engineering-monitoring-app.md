# Engineering monitoring application

`engineering-mobile/` is a separate Expo application for the engineering team.
It shares the existing API, users, rooms, devices, and measurements with the IT
application but exposes only the monitoring workflow:

1. Sign in.
2. Select an accessible room.
3. Inspect the latest PZEM measurement.
4. Select live, 1-hour, 24-hour, 7-day, or 30-day history.
5. Review measured energy, estimated cost, and monthly projection.
6. Export a 24-hour, 7-day, or 30-day CSV or PDF report.

## Run locally

Create `engineering-mobile/.env` from `.env.example` and set the backend URL.
Use the development PC's LAN IPv4 address when testing on a physical phone:

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:4000/api/v1
```

Then start the backend and engineering application in separate terminals:

```bash
npm run dev:server
npm run dev:engineering
```

## Monitoring API

All monitoring routes require the same bearer token as the existing app. Room
access follows the existing account rules: administrators see all rooms,
landlords see their rooms, and tenants see their assigned rooms.

- `GET /api/v1/monitoring/rooms`
- `GET /api/v1/monitoring/rooms/:roomId/dashboard?range=live`
- `GET /api/v1/monitoring/rooms/:roomId/report?range=24h`

Historical data is downsampled for display. Report exports use the server's
downsampled readings and summary calculations rather than querying the database
from the phone.

## Calculation boundaries

- Apparent power is calculated as `voltage × current`.
- Range energy is the difference between the first and last cumulative PZEM kWh
  values. A falling counter is treated as a reset and the result is withheld.
- Cost is measured energy multiplied by the room's configured rate per kWh.
- Monthly projection uses current-month measured energy divided by observed
  days, then multiplied by the number of days in the month.
- At least 24 observed hours are required for a projection. Projections based on
  fewer than seven days are explicitly marked provisional.
- PZEM-004T V3 does not provide raw waveform, harmonic, or THD measurements.

## Deferred multi-PZEM work

The current data model treats a room as a single channel. Do not add channel IDs
or modify the ESP32 firmware until the schematic confirms PZEM addresses, UART
topology, CT placement, channel meaning, and whether one channel is an aggregate
feed or all channels are branch submeters.
