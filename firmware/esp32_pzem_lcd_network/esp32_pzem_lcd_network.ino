#include <HTTPClient.h>
#include <LiquidCrystal_I2C.h>
#include <PZEM004Tv30.h>
#include <WiFi.h>
#include <Wire.h>
#include <time.h>

#include "network_config.h"

constexpr uint8_t PZEM_RX_PIN = 16;
constexpr uint8_t PZEM_TX_PIN = 17;
constexpr uint8_t LCD_SDA_PIN = 21;
constexpr uint8_t LCD_SCL_PIN = 22;
constexpr uint8_t LCD_ADDRESS = 0x27;
constexpr uint8_t LCD_COLUMNS = 16;
constexpr uint8_t LCD_ROWS = 2;

constexpr unsigned long SENSOR_INTERVAL_MS = 1000;
constexpr unsigned long DISPLAY_INTERVAL_MS = 3000;
constexpr unsigned long UPLOAD_INTERVAL_MS = 3000;
constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 10000;
constexpr uint16_t HTTP_TIMEOUT_MS = 5000;

PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN);
LiquidCrystal_I2C lcd(LCD_ADDRESS, LCD_COLUMNS, LCD_ROWS);

struct Measurement {
  float voltage = NAN;
  float current = NAN;
  float power = NAN;
  float energy = NAN;
  float frequency = NAN;
  float powerFactor = NAN;
  bool valid = false;
};

Measurement latestMeasurement;
unsigned long previousSensorMillis = 0;
unsigned long previousDisplayMillis = 0;
unsigned long previousUploadMillis = 0;
unsigned long previousWifiAttemptMillis = 0;
uint8_t screenState = 0;
int lastHttpStatus = 0;

void writeLcdLine(uint8_t row, const String& text) {
  String output = text.substring(0, LCD_COLUMNS);
  while (output.length() < LCD_COLUMNS) {
    output += ' ';
  }

  lcd.setCursor(0, row);
  lcd.print(output);
}

bool wifiConfigurationReady() {
  return String(WIFI_SSID) != "YOUR_WIFI_NAME" &&
    String(WIFI_PASSWORD) != "YOUR_WIFI_PASSWORD";
}

void beginWifiConnection() {
  if (!wifiConfigurationReady()) {
    return;
  }

  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  previousWifiAttemptMillis = millis();
}

void maintainWifiConnection() {
  if (WiFi.status() == WL_CONNECTED || !wifiConfigurationReady()) {
    return;
  }

  const unsigned long currentMillis = millis();
  if (currentMillis - previousWifiAttemptMillis >= WIFI_RETRY_INTERVAL_MS) {
    beginWifiConnection();
  }
}

bool createUtcTimestamp(char* output, size_t outputSize) {
  const time_t now = time(nullptr);
  if (now < 1700000000) {
    return false;
  }

  struct tm utcTime;
  gmtime_r(&now, &utcTime);
  return strftime(output, outputSize, "%Y-%m-%dT%H:%M:%SZ", &utcTime) > 0;
}

Measurement readMeasurement() {
  Measurement measurement;
  measurement.voltage = pzem.voltage();
  measurement.current = pzem.current();
  measurement.power = pzem.power();
  measurement.energy = pzem.energy();
  measurement.frequency = pzem.frequency();
  measurement.powerFactor = pzem.pf();
  measurement.valid =
    !isnan(measurement.voltage) &&
    !isnan(measurement.current) &&
    !isnan(measurement.power) &&
    !isnan(measurement.energy) &&
    !isnan(measurement.frequency) &&
    !isnan(measurement.powerFactor);
  return measurement;
}

void printMeasurement(const Measurement& measurement) {
  Serial.print("V: ");
  Serial.print(measurement.voltage, 1);
  Serial.print("V | A: ");
  Serial.print(measurement.current, 3);
  Serial.print("A | W: ");
  Serial.print(measurement.power, 1);
  Serial.print("W | Hz: ");
  Serial.print(measurement.frequency, 1);
  Serial.print(" | PF: ");
  Serial.print(measurement.powerFactor, 2);
  Serial.print(" | kWh: ");
  Serial.println(measurement.energy, 3);
}

void updateDisplay() {
  if (!latestMeasurement.valid) {
    writeLcdLine(0, "PZEM Error!");
    writeLcdLine(1, "Check Wiring/AC");
    return;
  }

  if (screenState == 0) {
    writeLcdLine(0, "Voltage: " + String(latestMeasurement.voltage, 1) + "V");
    writeLcdLine(1, "Current: " + String(latestMeasurement.current, 3) + "A");
  } else if (screenState == 1) {
    writeLcdLine(0, "Power: " + String(latestMeasurement.power, 1) + "W");
    writeLcdLine(1, "PF:" + String(latestMeasurement.powerFactor, 2) + " " +
      String(latestMeasurement.frequency, 1) + "Hz");
  } else {
    writeLcdLine(0, "Energy:" + String(latestMeasurement.energy, 3) + "kWh");

    if (!wifiConfigurationReady()) {
      writeLcdLine(1, "Set WiFi config");
    } else if (WiFi.status() != WL_CONNECTED) {
      writeLcdLine(1, "WiFi connecting");
    } else if (lastHttpStatus == 201) {
      writeLcdLine(1, "API upload: OK");
    } else if (lastHttpStatus != 0) {
      writeLcdLine(1, "API error: " + String(lastHttpStatus));
    } else {
      writeLcdLine(1, "WiFi connected");
    }
  }
}

bool uploadMeasurement(const Measurement& measurement) {
  if (!measurement.valid || WiFi.status() != WL_CONNECTED) {
    return false;
  }

  char timestamp[25];
  if (!createUtcTimestamp(timestamp, sizeof(timestamp))) {
    Serial.println("Upload skipped: clock is not synchronized yet.");
    return false;
  }

  String payload;
  payload.reserve(320);
  payload += "{\"device_identifier\":\"";
  payload += DEVICE_IDENTIFIER;
  payload += "\",\"timestamp\":\"";
  payload += timestamp;
  payload += "\",\"voltage\":";
  payload += String(measurement.voltage, 1);
  payload += ",\"current\":";
  payload += String(measurement.current, 3);
  payload += ",\"power_w\":";
  payload += String(measurement.power, 1);
  payload += ",\"frequency\":";
  payload += String(measurement.frequency, 1);
  payload += ",\"power_factor\":";
  payload += String(measurement.powerFactor, 2);
  payload += ",\"energy_kwh\":";
  payload += String(measurement.energy, 3);
  payload += "}";

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.begin(INGEST_URL);
  http.addHeader("Content-Type", "application/json");

  lastHttpStatus = http.POST(payload);
  const String response = lastHttpStatus > 0 ? http.getString() : http.errorToString(lastHttpStatus);
  http.end();

  Serial.print("POST ");
  Serial.print(INGEST_URL);
  Serial.print(" -> ");
  Serial.println(lastHttpStatus);
  Serial.println(response);

  return lastHttpStatus == 201;
}

void setup() {
  Serial.begin(115200);

  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  lcd.init();
  lcd.backlight();
  writeLcdLine(0, "ESP32 + PZEM V3");
  writeLcdLine(1, "Starting network");

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  beginWifiConnection();

  // Keep timestamps in UTC. The API accepts the trailing Z in the ISO timestamp.
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  delay(1500);
}

void loop() {
  const unsigned long currentMillis = millis();
  maintainWifiConnection();

  if (currentMillis - previousSensorMillis >= SENSOR_INTERVAL_MS) {
    previousSensorMillis = currentMillis;
    latestMeasurement = readMeasurement();

    if (latestMeasurement.valid) {
      printMeasurement(latestMeasurement);
    } else {
      Serial.println("Error reading from PZEM module!");
    }

    updateDisplay();
  }

  if (currentMillis - previousDisplayMillis >= DISPLAY_INTERVAL_MS) {
    previousDisplayMillis = currentMillis;
    screenState = (screenState + 1) % 3;
    updateDisplay();
  }

  if (currentMillis - previousUploadMillis >= UPLOAD_INTERVAL_MS) {
    previousUploadMillis = currentMillis;
    uploadMeasurement(latestMeasurement);
  }

  delay(20);
}
