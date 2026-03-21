# Tomorrow Demo Script

## 1. Opening

Explain that this is a defense-optimized MVP focused on the `40% system development` checklist:

- real authentication
- real role-based access
- real CRUD
- real MySQL persistence
- one complete NILM transaction from input to output

## 2. Login and Security

1. Open the app.
2. Log in as `admin@nilm.local / Admin123!`.
3. Mention that passwords are stored using bcrypt and the app keeps a JWT session locally.
4. Mention that only active users can log in.

## 3. Admin CRUD

1. Open `Users` and show existing admin and tenant accounts.
2. Create or update one tenant account.
3. Open `Devices` and show unique device identifiers.
4. Open `Rooms` and show that each room is linked to a tenant, device, and room rate.

## 4. End-to-End NILM Transaction

1. Start `npm run dev:feeder`.
2. Mention that it autostarts and posts simulated readings every 2 seconds to the exact same ingest endpoint as hardware would.
3. Mention that each device is simulating 1 to 3 connected appliances, and the backend now returns a per-appliance NILM breakdown plus the total device reading.
4. If you prefer manual backup, open `Simulator`, pick `DEV-101`, tap `Aircon sample`, and send the reading.
5. Explain the backend steps:
   - payload validation
   - registered device check
   - room resolution
   - reading header/detail insert
   - rule-based appliance detection
   - detection header/detail insert
   - estimated cost calculation

## 5. Outputs

1. Go back to `Admin Dashboard`.
2. Show the latest reading per room and device status.
3. Log out.
4. Log in as `juan@nilm.local / Tenant123!`.
5. Show the tenant dashboard:
   - current power usage
   - latest energy kWh
   - likely appliance
   - confidence
   - estimated cost
   - remote port on/off buttons
   - recent reading history
6. Turn one tenant port off and wait one feeder cycle.
7. Show that the appliance disappears from the breakdown and the total room power drops.

## 6. Closing Talking Points

- The MVP uses normalized relational tables with foreign keys.
- Backend validation prevents invalid login, invalid forms, and invalid reading payloads.
- Role-based access is enforced in both the mobile navigation and API routes.
- The NILM detection service is modular and can later be replaced with a more advanced model.
