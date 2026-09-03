#include <PZEM004Tv30.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

constexpr uint8_t PZEM_RX_PIN = 16;
constexpr uint8_t PZEM_TX_PIN = 17;
constexpr uint8_t LCD_ADDRESS = 0x27;
constexpr uint8_t LCD_COLUMNS = 16;
constexpr uint8_t LCD_ROWS = 2;
constexpr unsigned long DISPLAY_INTERVAL_MS = 3000;
constexpr unsigned long SENSOR_INTERVAL_MS = 200;

PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN);
LiquidCrystal_I2C lcd(LCD_ADDRESS, LCD_COLUMNS, LCD_ROWS);

unsigned long previousDisplayMillis = 0;
uint8_t screenState = 0;

void setup() {
  Serial.begin(115200);

  Wire.begin();
  lcd.init();
  lcd.backlight();

  lcd.setCursor(0, 0);
  lcd.print("ESP32 + PZEM V3");
  lcd.setCursor(0, 1);
  lcd.print("Initializing...");
  delay(2000);
  lcd.clear();
}

void loop() {
  const float voltage = pzem.voltage();
  const float current = pzem.current();
  const float power = pzem.power();
  const float energy = pzem.energy();
  const float powerFactor = pzem.pf();

  if (
    isnan(voltage) ||
    isnan(current) ||
    isnan(power) ||
    isnan(energy) ||
    isnan(powerFactor)
  ) {
    Serial.println("Error reading from PZEM module!");
    lcd.setCursor(0, 0);
    lcd.print("PZEM Error!     ");
    lcd.setCursor(0, 1);
    lcd.print("Check Wiring/AC ");
    delay(1000);
    return;
  }

  Serial.print("V: ");
  Serial.print(voltage, 1);
  Serial.print("V | A: ");
  Serial.print(current, 2);
  Serial.print("A | W: ");
  Serial.print(power, 1);
  Serial.print("W | PF: ");
  Serial.print(powerFactor, 2);
  Serial.print(" | kWh: ");
  Serial.println(energy, 3);

  const unsigned long currentMillis = millis();
  if (currentMillis - previousDisplayMillis >= DISPLAY_INTERVAL_MS) {
    previousDisplayMillis = currentMillis;
    screenState = (screenState + 1) % 3;
    lcd.clear();
  }

  if (screenState == 0) {
    lcd.setCursor(0, 0);
    lcd.print("Voltage: ");
    lcd.print(voltage, 1);
    lcd.print("V   ");
    lcd.setCursor(0, 1);
    lcd.print("Current: ");
    lcd.print(current, 2);
    lcd.print("A   ");
  } else if (screenState == 1) {
    lcd.setCursor(0, 0);
    lcd.print("Power: ");
    lcd.print(power, 1);
    lcd.print("W    ");
    lcd.setCursor(0, 1);
    lcd.print("P. Factor: ");
    lcd.print(powerFactor, 2);
    lcd.print("    ");
  } else {
    lcd.setCursor(0, 0);
    lcd.print("Total Energy:   ");
    lcd.setCursor(0, 1);
    lcd.print(energy, 3);
    lcd.print(" kWh       ");
  }

  delay(SENSOR_INTERVAL_MS);
}
