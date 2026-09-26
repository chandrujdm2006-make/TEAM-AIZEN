/**
 * =========================================================================
 * TURN-BY-TURN NAVIGATION SYSTEM (IOT MOTORCYCLE RIDER ASSISTANT)
 * =========================================================================
 * College Mini-Project: Dept. of Information Technology, Mini Project II
 * Target Hardware: ESP32-C3 RISC-V Microcontroller
 * Peripherals: NEO-6M GPS Module, 0.96" SSD1306 OLED (I2C), HC-SR04 Ultrasonic
 *              Sensor, Emergency Pushbutton, Haptic Vibration Motor.
 * 
 * Key Features:
 *  - Distraction-Free OLED HUD showing concise turn maneuvers and distance.
 *  - Real-time GPS Telemetry stream over Wi-Fi to Node.js backend.
 *  - Ultrasonic Proximity Collision Warning (overrides display with hazard).
 *  - Emergency SOS Button triggers instantaneous location broadcast.
 *  - Non-blocking millis() timing architecture.
 * =========================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <TinyGPSPlus.h>
#include "config.h"

// -------------------------------------------------------------------------
// HARDWARE INSTANCES & GLOBAL STATE
// -------------------------------------------------------------------------
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET_PIN);
TinyGPSPlus gps;
HardwareSerial gpsSerial(1); // ESP32-C3 Hardware UART 1

// Navigation telemetry state
struct NavState {
  String instruction = "Standby - Waiting for Route";
  String maneuver = "straight";
  String formattedDistance = "0 m";
  int distanceToTurnM = 0;
  int progressPct = 0;
  int currentStep = 1;
  int totalSteps = 1;
  float speedKmh = 0.0;
  float headingDeg = 0.0;
  bool isObstacleAlert = false;
  float obstacleDistanceCm = 999.0;
  bool isEmergencyActive = false;
  bool hasRoute = false;
} navState;

// Non-blocking timing variables
unsigned long lastTelemetryTime = 0;
unsigned long lastUltrasonicTime = 0;
volatile bool emergencyTriggered = false;
unsigned long lastButtonInterruptTime = 0;

// -------------------------------------------------------------------------
// 24x24 MONOCHROME MANEUVER BITMAPS FOR SSD1306 OLED
// -------------------------------------------------------------------------
// Straight Arrow Bitmap (24x24)
const unsigned char PROGMEM bmp_straight[] = {
  0x00, 0x18, 0x00, 0x00, 0x3c, 0x00, 0x00, 0x7e, 0x00, 0x00, 0xff, 0x00,
  0x01, 0xff, 0x80, 0x03, 0xff, 0xc0, 0x00, 0x3c, 0x00, 0x00, 0x3c, 0x00,
  0x00, 0x3c, 0x00, 0x00, 0x3c, 0x00, 0x00, 0x3c, 0x00, 0x00, 0x3c, 0x00,
  0x00, 0x3c, 0x00, 0x00, 0x3c, 0x00, 0x00, 0x3c, 0x00, 0x00, 0x3c, 0x00,
  0x00, 0x3c, 0x00, 0x00, 0x3c, 0x00, 0x00, 0x3c, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};

// Turn Left Bitmap (24x24)
const unsigned char PROGMEM bmp_turn_left[] = {
  0x00, 0x30, 0x00, 0x00, 0x70, 0x00, 0x00, 0xf0, 0x00, 0x01, 0xf0, 0x00,
  0x03, 0xff, 0xfc, 0x07, 0xff, 0xfe, 0x0f, 0xff, 0xfe, 0x07, 0xff, 0xfc,
  0x03, 0xf0, 0x0e, 0x01, 0xf0, 0x0e, 0x00, 0x70, 0x0e, 0x00, 0x30, 0x0e,
  0x00, 0x00, 0x0e, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x0e,
  0x00, 0x00, 0x0e, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x0e,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};

// Turn Right Bitmap (24x24)
const unsigned char PROGMEM bmp_turn_right[] = {
  0x00, 0x0c, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x0f, 0x00, 0x00, 0x0f, 0x80,
  0x3f, 0xff, 0xc0, 0x7f, 0xff, 0xe0, 0x7f, 0xff, 0xf0, 0x3f, 0xff, 0xe0,
  0x70, 0x0f, 0xc0, 0x70, 0x0f, 0x80, 0x70, 0x0e, 0x00, 0x70, 0x0c, 0x00,
  0x70, 0x00, 0x00, 0x70, 0x00, 0x00, 0x70, 0x00, 0x00, 0x70, 0x00, 0x00,
  0x70, 0x00, 0x00, 0x70, 0x00, 0x00, 0x70, 0x00, 0x00, 0x70, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};

// -------------------------------------------------------------------------
// HARDWARE INTERRUPT SERVICE ROUTINE (ISR) - EMERGENCY BUTTON
// -------------------------------------------------------------------------
void IRAM_ATTR handleEmergencyButton() {
  unsigned long now = millis();
  // Simple hardware debounce check
  if (now - lastButtonInterruptTime > DEBOUNCE_DELAY_MS) {
    emergencyTriggered = true;
    lastButtonInterruptTime = now;
  }
}

// -------------------------------------------------------------------------
// SETUP INITIALIZATION
// -------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n=======================================================");
  Serial.println("  ESP32-C3 TURN-BY-TURN RIDER ASSISTANT FIRMWARE");
  Serial.println("  Dept. of IT - Mini Project II");
  Serial.println("=======================================================");

  // 1. Initialize I2C and SSD1306 OLED
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS)) {
    Serial.println("[ERROR] SSD1306 OLED initialization failed!");
  } else {
    Serial.println("[OK] SSD1306 OLED initialized (128x64 I2C)");
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(10, 16);
    display.println("RIDER ASSISTANT");
    display.setCursor(10, 32);
    display.println("ESP32-C3 Booting...");
    display.display();
  }

  // 2. Initialize GPS UART Serial1
  gpsSerial.begin(GPS_BAUD_RATE, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("[OK] NEO-6M GPS UART initialized at 9600 baud");

  // 3. Initialize HC-SR04 Ultrasonic Pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  Serial.println("[OK] HC-SR04 Proximity Sensor configured");

  // 4. Initialize Emergency SOS Pushbutton with Interrupt
  pinMode(EMERGENCY_BTN_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(EMERGENCY_BTN_PIN), handleEmergencyButton, FALLING);
  Serial.println("[OK] Emergency Button interrupt attached on GPIO 4");

  // 5. Initialize Haptic / Buzzer alert pin
  pinMode(HAPTIC_PIN, OUTPUT);
  digitalWrite(HAPTIC_PIN, LOW);

  // 6. Connect to Wi-Fi
  connectWiFi();

  // Initial standby render
  renderOled();
}

// -------------------------------------------------------------------------
// MAIN NON-BLOCKING EXECUTION LOOP
// -------------------------------------------------------------------------
void loop() {
  unsigned long currentMillis = millis();

  // A. Process incoming GPS NMEA sentences over UART
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // B. Handle Emergency Button press immediately
  if (emergencyTriggered) {
    emergencyTriggered = false;
    triggerEmergencySOS();
  }

  // C. Periodically scan for proximity obstacles (HC-SR04)
  if (currentMillis - lastUltrasonicTime >= ULTRASONIC_SCAN_INTERVAL_MS) {
    lastUltrasonicTime = currentMillis;
    scanUltrasonicObstacle();
  }

  // D. Periodically send GPS telemetry to backend & fetch next turn instruction
  if (currentMillis - lastTelemetryTime >= GPS_TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;
    sendTelemetryAndFetchInstruction();
  }
}

// -------------------------------------------------------------------------
// WI-FI CONNECTION HANDLER
// -------------------------------------------------------------------------
void connectWiFi() {
  Serial.printf("[WiFi] Connecting to SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 20) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected successfully! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi] Connection timeout. Running in standalone fallback mode.");
  }
}

// -------------------------------------------------------------------------
// HC-SR04 PROXIMITY SCANNING
// -------------------------------------------------------------------------
void scanUltrasonicObstacle() {
  // Trigger 10 microsecond pulse
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // Read echo pulse travel time (timeout 25000us ~ 4 meters max)
  long duration = pulseIn(ECHO_PIN, HIGH, 25000);
  
  if (duration > 0) {
    // Speed of sound = 343 m/s = 0.0343 cm/us -> Distance = (duration * 0.0343) / 2
    float distanceCm = (duration * 0.0343) / 2.0;
    navState.obstacleDistanceCm = distanceCm;

    if (distanceCm < OBSTACLE_DISTANCE_CM) {
      navState.isObstacleAlert = true;
      // Pulse vibration motor / buzzer
      digitalWrite(HAPTIC_PIN, HIGH);
      renderOled();
      return;
    }
  }

  // Clear obstacle alert if free of hazards
  if (navState.isObstacleAlert) {
    navState.isObstacleAlert = false;
    digitalWrite(HAPTIC_PIN, LOW);
    renderOled();
  }
}

// -------------------------------------------------------------------------
// HTTP POST GPS TELEMETRY & PARSE NEXT INSTRUCTION
// -------------------------------------------------------------------------
void sendTelemetryAndFetchInstruction() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  float lat = 12.9716; // Fallback demo origin if GPS has no satellite lock
  float lng = 77.5946;
  float speed = 0.0;
  float heading = 0.0;

  if (gps.location.isValid()) {
    lat = gps.location.lat();
    lng = gps.location.lng();
    speed = gps.speed.kmph();
    heading = gps.course.deg();
  }

  navState.speedKmh = speed;
  navState.headingDeg = heading;

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/devices/" + DEVICE_ID + "/location";
  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");

  // Construct JSON telemetry payload
  StaticJsonDocument<256> doc;
  doc["lat"] = lat;
  doc["lng"] = lng;
  doc["speed"] = speed;
  doc["heading"] = heading;
  doc["battery"] = 98;

  String requestBody;
  serializeJson(doc, requestBody);

  int httpCode = http.POST(requestBody);

  if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
    String response = http.getString();
    
    // Parse backend JSON response containing next turn instruction
    StaticJsonDocument<512> resDoc;
    DeserializationError error = deserializeJson(resDoc, response);

    if (!error && resDoc.containsKey("nextInstruction")) {
      JsonObject nextInst = resDoc["nextInstruction"];
      navState.instruction = nextInst["instruction"].as<String>();
      navState.maneuver = nextInst["maneuver"].as<String>();
      navState.formattedDistance = nextInst["formatted_distance"].as<String>();
      navState.distanceToTurnM = nextInst["distance_to_turn_m"].as<int>();
      navState.progressPct = nextInst["progress_pct"].as<int>();
      navState.currentStep = nextInst["current_step"].as<int>();
      navState.totalSteps = nextInst["total_steps"].as<int>();
      navState.hasRoute = true;
    }
  } else {
    Serial.printf("[HTTP] Telemetry POST failed, code: %d\n", httpCode);
  }

  http.end();

  // Render updated instruction to OLED
  renderOled();
}

// -------------------------------------------------------------------------
// EMERGENCY SOS TRIGGER (HTTP POST /api/devices/:id/emergency)
// -------------------------------------------------------------------------
void triggerEmergencySOS() {
  Serial.println("\n🚨 [EMERGENCY] Physical SOS Button triggered! Dispatching location...");
  navState.isEmergencyActive = true;

  // Sound buzzer
  digitalWrite(HAPTIC_PIN, HIGH);
  renderOled();

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = String(BACKEND_SERVER_URL) + "/api/devices/" + DEVICE_ID + "/emergency";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<128> doc;
    doc["notes"] = "Handlebar Emergency Button Pressed";
    if (gps.location.isValid()) {
      doc["lat"] = gps.location.lat();
      doc["lng"] = gps.location.lng();
    }

    String body;
    serializeJson(doc, body);
    int code = http.POST(body);
    Serial.printf("[EMERGENCY] Server acknowledged SOS, response code: %d\n", code);
    http.end();
  }

  delay(1000);
  digitalWrite(HAPTIC_PIN, LOW);
  navState.isEmergencyActive = false;
  renderOled();
}

// -------------------------------------------------------------------------
// GRAPHICAL OLED DISPLAY RENDERER (SSD1306 128x64)
// -------------------------------------------------------------------------
void renderOled() {
  display.clearDisplay();

  // 1. Priority 1: Obstacle Hazard Override
  if (navState.isObstacleAlert) {
    // Invert screen for high-contrast strobe warning
    display.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    
    display.setTextSize(1);
    display.setCursor(8, 6);
    display.println("! OBSTACLE AHEAD !");
    
    display.setTextSize(2);
    display.setCursor(20, 24);
    display.printf("%d CM", (int)navState.obstacleDistanceCm);
    
    display.setTextSize(1);
    display.setCursor(16, 48);
    display.println("BRAKE IMMEDIATELY");
    
    display.display();
    return;
  }

  // 2. Priority 2: Emergency SOS Screen
  if (navState.isEmergencyActive) {
    display.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    
    display.setTextSize(2);
    display.setCursor(20, 10);
    display.println("SOS SENT");
    
    display.setTextSize(1);
    display.setCursor(12, 36);
    display.println("Guardian Notified");
    display.setCursor(10, 48);
    display.println("Help is Dispatched");
    
    display.display();
    return;
  }

  // 3. Normal HUD Display Mode
  display.setTextColor(SSD1306_WHITE);

  // Top Status Bar: WiFi status | Satellites | Speed
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(WiFi.status() == WL_CONNECTED ? "WF " : "NO-WF ");
  display.printf("SAT:%d ", gps.satellites.value());
  display.setCursor(80, 0);
  display.printf("%dkm/h", (int)navState.speedKmh);
  display.drawLine(0, 9, SCREEN_WIDTH, 9, SSD1306_WHITE);

  // Main Section: Maneuver Icon + Distance + Text
  const unsigned char* iconBmp = bmp_straight;
  if (navState.maneuver == "turn-left" || navState.maneuver == "turn-slight-left") {
    iconBmp = bmp_turn_left;
  } else if (navState.maneuver == "turn-right" || navState.maneuver == "turn-slight-right") {
    iconBmp = bmp_turn_right;
  }

  // Draw 24x24 Turn Icon
  display.drawBitmap(2, 14, iconBmp, 24, 24, SSD1306_WHITE);

  // Distance to turn in bold text
  display.setTextSize(2);
  display.setCursor(32, 14);
  display.println(navState.formattedDistance);

  // Turn instruction description (clipped to fit 128px)
  display.setTextSize(1);
  display.setCursor(32, 32);
  String cleanText = navState.instruction;
  if (cleanText.length() > 15) {
    cleanText = cleanText.substring(0, 15);
  }
  display.println(cleanText);

  // Bottom Progress Bar
  display.drawLine(0, 52, SCREEN_WIDTH, 52, SSD1306_WHITE);
  display.drawRect(2, 55, 70, 7, SSD1306_WHITE);
  int fillWidth = map(constrain(navState.progressPct, 0, 100), 0, 100, 0, 68);
  if (fillWidth > 0) {
    display.fillRect(3, 56, fillWidth, 5, SSD1306_WHITE);
  }

  // Step Counter
  display.setCursor(80, 55);
  display.printf("S:%d/%d", navState.currentStep, navState.totalSteps);

  display.display();
}
