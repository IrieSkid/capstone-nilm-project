# Readings Feeder

The feeder is a small standalone Express server that continuously generates deterministic appliance-port readings, sums them into a device total, and posts that total to the same backend ingest endpoint used by the app simulator and external hardware.

## Why Use It

- lets you demo real-time updates without manually pressing `Send reading`
- feeds multiple room-assigned devices at once
- simulates 1 to 3 connected appliances per device using fixed room/device appliance portfolios
- keeps the NILM flow real: input -> validation -> storage -> detection -> dashboard output

## Start It

1. Start the main API first:
   - `npm run dev:server`
2. Start the feeder:
   - `npm run dev:feeder`
3. It autostarts automatically and feeds all room-assigned devices every `2000 ms`.

## Endpoints

- `GET /health`
- `GET /status`
- `GET /targets`
- `POST /start`
- `POST /tick`
- `POST /stop`

## Start Request Options

`POST /start`

```json
{
  "intervalMs": 2000,
  "deviceIdentifiers": ["DEV-101", "DEV-102"]
}
```

- `intervalMs` controls how often the feeder pushes one reading per target device
- `deviceIdentifiers` is optional; omit it to feed all room-assigned devices

## What It Simulates

Each target device keeps a fixed set of connected appliances and deterministic operating patterns:

- `Room 101 / DEV-101`: Air Conditioner, Electric Fan, LED TV
- `Room 102 / DEV-102`: Refrigerator, Rice Cooker, LED TV

The feeder computes per-appliance power, current, power factor, and THD, then posts the summed device reading every 2 seconds. The backend stores a multi-appliance detection breakdown for the latest reading so the dashboards can show the total plus the detected appliance list and confidence values.

## Demo-Friendly Flow

1. Open the admin dashboard.
2. Start the feeder server.
3. Refresh the dashboard after a few seconds.
4. Show that latest room readings, device online status, likely appliance, and cost values are changing from real backend transactions.
