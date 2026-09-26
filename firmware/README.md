# ESP32-C3 Firmware Guide & Hardware Documentation
**Turn-by-Turn Navigation System (IoT Motorcycle Rider Assistant)**  
*Department of Information Technology — Mini Project II*

---

## 1. Hardware Bill of Materials (BOM)

| Component | Specification | Operating Voltage | Interface | Purpose |
|---|---|---|---|---|
| **ESP32-C3 SuperMini / DevKit** | 32-bit RISC-V @ 160MHz, 4MB Flash | 3.3V / 5V USB | Wi-Fi 802.11 b/g/n, BLE 5.0 | Central MCU & Wi-Fi Gateway |
| **NEO-6M GPS Module** | u-blox 50-channel receiver, ceramic antenna | 3.3V – 5.0V | Hardware UART (9600 baud) | Real-time GPS location tracking |
| **SSD1306 OLED Display** | 0.96" Monochrome (128x64 pixels) | 3.3V | I2C (Address: 0x3C) | Distraction-free turn instruction HUD |
| **HC-SR04 Sensor** | Ultrasonic Proximity Range (2cm – 400cm) | 5.0V (VCC) / 3.3V Echo | Digital GPIO Pulse | Collision / Obstacle alert |
| **Momentary Push Button** | Waterproof handlebar tactile switch | 3.3V | Digital GPIO (Internal Pullup) | Emergency SOS trigger |
| **Vibration Motor / Buzzer** | 3V Coin Disc Haptic Motor | 3.3V | Digital GPIO / PWM | Tactile turn & hazard notification |
| **Resistor Divider** | 1kΩ and 2kΩ resistors | Passive | N/A | Level-shifts HC-SR04 5V Echo to 3.3V |

---

## 2. ESP32-C3 Pinout & Wiring Table

| ESP32-C3 Pin | Peripheral | Peripheral Pin | Wiring Notes |
|---|---|---|---|
| **3.3V** | All 3.3V modules | VCC | Connect to OLED, GPS, Button pullup |
| **5.0V / VIN** | HC-SR04 | VCC | HC-SR04 requires 5V power for ultrasonic transducers |
| **GND** | All peripherals | GND | Common ground bus |
| **GPIO 8** | SSD1306 OLED | SDA | Default hardware I2C Data |
| **GPIO 9** | SSD1306 OLED | SCL | Default hardware I2C Clock |
| **GPIO 20** | NEO-6M GPS | TX | ESP32-C3 UART RX pin (receives NMEA stream) |
| **GPIO 21** | NEO-6M GPS | RX | ESP32-C3 UART TX pin |
| **GPIO 2** | HC-SR04 | TRIG | Sends 10µs ultrasonic start pulse |
| **GPIO 3** | HC-SR04 | ECHO | Connect through 1kΩ / 2kΩ voltage divider to protect 3.3V pin |
| **GPIO 4** | SOS Button | Signal Pin | Active LOW (`INPUT_PULLUP`). Other terminal to GND |
| **GPIO 5** | Haptic Motor | Anode (+) | Cathode (-) to GND (or via 2N2222 NPN transistor) |

---

## 3. Circuit Schematic Diagram (ASCII)

```text
                  +-----------------------------------+
                  |        ESP32-C3 MICROCONTROLLER    |
                  |                                   |
   [3.3V / VIN] --+ 3.3V                         GPIO 8+-----> OLED SDA (I2C)
        [GND] ----+ GND                          GPIO 9+-----> OLED SCL (I2C)
                  |                                   |
                  | GPIO 20 (RX1) <--------------------+------ GPS TX (UART 9600)
                  | GPIO 21 (TX1) --------------------->------ GPS RX
                  |                                   |
                  | GPIO 2  --------------------------->------ HC-SR04 TRIG (5V)
                  | GPIO 3  <--- [1kΩ] <---+                  
                  |                        |                  
                  |                      [2kΩ] <-------------- HC-SR04 ECHO (5V)
                  |                        |                  
                  |                       GND                 
                  |                                   |
                  | GPIO 4  <--- [Handlebar Switch] --+------> GND (Active LOW SOS)
                  | GPIO 5  --------------------------->------ Haptic Motor / Buzzer
                  +-----------------------------------+
```

> **Note on HC-SR04 Echo Pin:**  
> The HC-SR04 echo pin outputs 5V logic. Since ESP32-C3 GPIO pins tolerate up to 3.3V, a simple 2-resistor voltage divider (1kΩ in series with GPIO 3 and 2kΩ to GND) steps down the 5V pulse to a safe ~3.3V.

---

## 4. Software Dependencies (Arduino IDE)

Install these libraries via **Tools → Manage Libraries** in Arduino IDE:

1. **Adafruit SSD1306** (v2.5.7 or higher)
2. **Adafruit GFX Library** (v1.11.5 or higher)
3. **TinyGPSPlus** by Mikal Hart (v1.0.3 or higher)
4. **ArduinoJson** by Benoît Blanchon (v6.21.3 or higher)

### Board Manager Configuration
- Add the official Espressif board index:  
  `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
- In Board Manager, install **esp32 by Espressif Systems**.
- Select Board: **ESP32C3 Dev Module** (or SuperMini ESP32-C3).
- Settings:
  - Flash Frequency: 80MHz
  - Flash Mode: QIO
  - CPU Frequency: 160MHz
  - Upload Speed: 921600

---

## 5. Firmware Flashing Procedure

1. Open `firmware/esp32c3_rider_assistant/esp32c3_rider_assistant.ino` in Arduino IDE.
2. Open `config.h` in the same directory.
3. Update `WIFI_SSID` and `WIFI_PASSWORD` with your local Wi-Fi credentials.
4. Set `BACKEND_SERVER_URL` to your computer's local IP address (e.g. `http://192.168.1.100:3000`).
5. Connect your ESP32-C3 via USB-C.
6. Select the COM Port from **Tools → Port**.
7. Click **Upload** (Ctrl + U).
8. Open the Serial Monitor at **115200 baud** to view real-time boot, Wi-Fi connection, and telemetry logs.
