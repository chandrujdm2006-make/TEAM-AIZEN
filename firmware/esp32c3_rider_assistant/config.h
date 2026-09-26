/**
 * Configuration & Pinout Header for ESP32-C3 Rider Assistant
 * Department of Information Technology - Mini Project II
 */

#ifndef CONFIG_H
#define CONFIG_H

// =========================================================================
// 1. WI-FI & BACKEND SERVER SETTINGS
// =========================================================================
#define WIFI_SSID            "Your_WiFi_SSID"
#define WIFI_PASSWORD        "Your_WiFi_Password"

// IP address of computer running the Node.js backend (e.g., 192.168.1.50:3000)
#define BACKEND_SERVER_URL   "http://192.168.1.100:3000"
#define DEVICE_ID            "esp32-c3-01"

// =========================================================================
// 2. HARDWARE PIN ASSIGNMENTS (ESP32-C3 RISC-V)
// =========================================================================
// I2C OLED Display (SSD1306, 128x64)
#define I2C_SDA_PIN          8    // ESP32-C3 default SDA
#define I2C_SCL_PIN          9    // ESP32-C3 default SCL
#define OLED_RESET_PIN       -1   // Shared with ESP32 reset
#define SCREEN_WIDTH         128
#define SCREEN_HEIGHT        64
#define OLED_I2C_ADDRESS     0x3C

// NEO-6M GPS Module (Hardware UART Serial1)
#define GPS_RX_PIN           20   // ESP32-C3 receives from GPS TX
#define GPS_TX_PIN           21   // ESP32-C3 transmits to GPS RX
#define GPS_BAUD_RATE        9600

// Ultrasonic Obstacle Sensor (HC-SR04)
#define TRIG_PIN             2    // Output trigger pulse
#define ECHO_PIN             3    // Input echo pulse (use 1k/2k resistor divider for 3.3V)
#define OBSTACLE_DISTANCE_CM 100  // Trigger warning if obstacle is within 100 cm

// Emergency SOS Push Button
#define EMERGENCY_BTN_PIN    4    // Active LOW with INPUT_PULLUP
#define DEBOUNCE_DELAY_MS    200  // Button debounce time

// Haptic Vibration Motor & Buzzer Alert
#define HAPTIC_PIN           5    // Digital output or PWM for alert pulses

// =========================================================================
// 3. TIMING CONSTANTS (Non-blocking loop intervals)
// =========================================================================
#define GPS_TELEMETRY_INTERVAL_MS   1500  // Send GPS to backend every 1.5 seconds
#define ULTRASONIC_SCAN_INTERVAL_MS 200   // Scan for obstacles 5 times per second
#define HTTP_TIMEOUT_MS             3000  // 3 second HTTP request timeout

#endif // CONFIG_H
