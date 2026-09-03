# ESP32 PZEM-004T Firmware

This folder contains two Arduino sketches for the current ESP32 + PZEM-004T V3.0 100 A + 16x2 I2C LCD prototype.

## Sketches

- `esp32_pzem_lcd_baseline`: cleaned copy of the hardware team's working local display firmware. Keep this as the recovery baseline.
- `esp32_pzem_lcd_network`: retains the display and adds Wi-Fi, NTP time, frequency readings, and HTTP ingestion into the NILM server.

## Pin map

| Function | ESP32 pin |
| --- | --- |
| PZEM TX to ESP32 RX | GPIO 16 |
| PZEM RX to ESP32 TX | GPIO 17 |
| LCD SDA | GPIO 21 |
| LCD SCL | GPIO 22 |

The LCD address is `0x27`. Confirm the physical labels before changing wiring. Disconnect AC before touching any connection.

## Arduino dependencies

- Board package: `esp32:esp32`
- `PZEM004Tv30`
- `LiquidCrystal_I2C`

`WiFi`, `HTTPClient`, `Wire`, and `time` are supplied by the ESP32 board package.

## Configure the network sketch

Edit the local `esp32_pzem_lcd_network/network_config.h` file:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* INGEST_URL = "http://PC_LAN_IP:4000/api/v1/readings/ingest";
const char* DEVICE_IDENTIFIER = "DEV-101";
```

Use the PC's Wi-Fi IPv4 address in `INGEST_URL`; `localhost` would refer to the ESP32 itself. The device identifier must already exist in the application and be assigned to a room.

`network_config.h` is ignored by Git so a real Wi-Fi password is not committed. `network_config.example.h` is the safe template to copy when setting up another computer.

The network sketch deliberately omits THD because the PZEM-004T does not measure it. For an existing database, run `npm run db:migrate:pzem` from the `server` folder once before ingesting hardware readings. Fresh databases created from `server/sql/schema.sql` already allow missing THD.

## Verify and upload

1. Select **ESP32 Dev Module** and the ESP32 COM port in Arduino IDE.
2. Compile the baseline with **Verify** first.
3. Update the four network configuration values.
4. Compile the network sketch with **Verify**.
5. Close Serial Monitor before uploading.
6. Upload the network sketch, reopening Serial Monitor at 115200 baud afterward.

Uploading replaces the firmware currently stored on the ESP32. The baseline sketch remains the readable recovery copy.
