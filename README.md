# 🏍️ Turn-by-Turn Navigation System (IoT Motorcycle Rider Assistant)
**Department of Information Technology — Mini Project II**  
*Academic Project & IoT Working Prototype*

---

## 📌 1. Project Overview

The **Turn-by-Turn Navigation System** is a compact IoT rider assistant engineered to replace smartphone-based motorcycle navigation. Mounting expensive smartphones on motorcycle handlebars presents major drawbacks: high rider distraction, screen glare under sunlight, weather exposure, battery drain, and vibration damage to optical camera sensors.

This project delivers a **dedicated, distraction-free cockpit assistant**:
- **Compact Hardware HUD:** Built with an **ESP32-C3** RISC-V microcontroller and a 0.96" monochrome **SSD1306 OLED** display mounted on the handlebars, showing only essential turn cues, distance countdowns, and speed.
- **Proximity Collision Warning:** An **HC-SR04 ultrasonic sensor** continuously scans for frontal obstacles and overrides the display with a high-contrast hazard warning.
- **Handlebar Emergency Button:** One-touch SOS immediately broadcasts the rider's GPS location via SMS and email stubs to emergency guardians.
- **Companion Web Dashboard:** Full-featured cockpit interface with live Leaflet GPS map tracking, telemetry gauges, trip planner, emergency log, and an authentic **physical OLED hardware simulator** for complete testing without real hardware.

---

## 🏗️ 2. System Architecture

```text
+-----------------------------------------------------------------------------------+
|                            ESP32-C3 RIDER HARDWARE                                |
|  [NEO-6M GPS]  --UART-->  [ESP32-C3 RISC-V MCU]  <--I2C-->  [SSD1306 OLED 128x64]  |
|  [HC-SR04 US]  --GPIO-->       (Wi-Fi STA)       <--GPIO--  [Emergency Button]    |
+-------------------------------------|---------------------------------------------+
                                      | HTTP POST (JSON Telemetry & SOS)
                                      | HTTP GET  (Next Turn Poll)
                                      v
+-----------------------------------------------------------------------------------+
|                        NODE.JS & EXPRESS BACKEND SERVER                           |
|  - REST Endpoints (/api/trips, /api/devices, /api/emergency-events)               |
|  - Routing Engine (Google Maps API + OSRM Public API + Offline Mock Routes)       |
|  - Geodesic Haversine Math (Distance-to-turn countdown & corridor tracking)       |
|  - Socket.IO Real-Time Telemetry & Alert Broadcasting                             |
|  - Notification Service (SMS & Email Emergency Dispatch Stubs)                    |
+-------------------------------------|---------------------------------------------+
                   |                                     |
                   v                                     v
+-----------------------------------+   +-------------------------------------------+
|          SQLITE DATABASE          |   |          WEB COMPANION DASHBOARD          |
|  - users & devices                |   |  - Cockpit Telemetry & Rotating Marker    |
|  - trips & route_points           |   |  - Leaflet / OpenStreetMap Route Polyline |
|  - location_logs (breadcrumbs)    |   |  - Physical SSD1306 OLED Bezel Simulator  |
|  - emergency_events               |   |  - Virtual Ride Simulator Engine (Controls)|
+-----------------------------------+   |  - Trip Setup, History, & Emergency Logs  |
                                        +-------------------------------------------+
```

---

## 🗄️ 3. Database Schema (SQLite)

The database runs on SQLite (using Node 24 native `node:sqlite` with WAL mode enabled).

| Table | Columns | Description |
|---|---|---|
| `users` | `id, name, emergency_contact_phone, emergency_contact_email, created_at` | Rider profile and emergency contacts |
| `devices` | `id, user_id, device_name, last_seen_at, battery_level, status` | IoT device heartbeat and battery |
| `trips` | `id, user_id, device_id, origin, destination, origin_lat, origin_lng, dest_lat, dest_lng, started_at, ended_at, status, total_distance_m, total_duration_s` | Trip metadata & progress |
| `route_points` | `id, trip_id, sequence_no, lat, lng, instruction, distance_to_next_turn, maneuver_type, street_name` | Parsed turn-by-turn waypoints |
| `location_logs` | `id, device_id, trip_id, lat, lng, speed_kmh, heading_deg, timestamp` | Breadcrumb history & speed telemetry |
| `emergency_events` | `id, user_id, device_id, trip_id, lat, lng, triggered_at, resolved, resolved_at, notes` | Triggered SOS events and resolution logs |

---

## 🚀 4. Quick Start (Run Locally in 3 Steps)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Start Backend Server & Web Companion
```bash
npm start
```
The server will boot up and display:
```text
===============================================================
   🏍️ TURN-BY-TURN NAVIGATION SYSTEM (IOT RIDER ASSISTANT)
   Dept. of IT - Mini Project II Prototype Server
===============================================================
📡 Backend Server & API: http://localhost:3000
🌐 Web Companion App:   http://localhost:3000
💾 SQLite Database:     backend/data/navigation.db
⚡ WebSocket:            Socket.IO active
📍 Hardware Target:     ESP32-C3 + NEO-6M GPS + SSD1306 OLED
===============================================================
```

Open your browser to: **[http://localhost:3000](http://localhost:3000)**

### Step 3: Run the GPS Movement Simulator
In a second terminal window (or click the in-browser simulator buttons):
```bash
npm run simulate
```
Or with custom flags:
```bash
# Ride at 70 km/h and trigger obstacle warning + emergency SOS along route
node scripts/simulate_ride.js --speed 70 --obstacle --sos
```

---

## 🖥️ 5. Web Companion Features

1. **Cockpit & Live HUD Tab:**
   - **Interactive Leaflet Map:** Displays the active neon-cyan route, start pin, checkered destination flag, breadcrumbs, and a dynamic motorcycle rider marker that rotates according to the bike's heading angle.
   - **Live Telemetry Gauges:** Speedometer (km/h), Distance to next turn, Distance remaining to destination, Heading compass, and Trip completion progress bar.
   - **Physical SSD1306 OLED HUD Simulator:** Authentic 128x64 monochrome OLED replica styled with FR4 circuit board, 4 brass mounting screws, header pin labels (`GND VCC SCL SDA`), glass sheen glare, and cyan phosphor glowing vector turn arrows.
   - **Web Simulation Controls:** Click **Start Auto Ride**, **Step 1 Waypoint**, **HC-SR04 Obstacle**, or **SOS Emergency** directly from the UI.
2. **Trip Setup Tab:**
   - Select instant pre-computed demonstration routes (Campus Hub to Tech Park, Metro to Hospital) or input custom origin/destination coordinates.
3. **Trip History Tab:**
   - Lists past trips stored in SQLite. Click "Load Route" to inspect any past route on the map.
4. **Emergency Log Tab:**
   - View all triggered SOS incidents with timestamps, coordinates, and direct links to OpenStreetMap / Google Maps. Click "Resolve" to close the incident.
5. **Hardware & Pins Documentation Tab:**
   - On-screen reference of ESP32-C3 GPIO pinouts, timing loops, and system architecture for presentation reviews.

---

## 🔌 6. ESP32-C3 Hardware Pinout

| Peripheral | ESP32-C3 Pin | Mode / Protocol | Function |
|---|---|---|---|
| **SSD1306 OLED** | GPIO 8 | I2C SDA | Screen data line |
| **SSD1306 OLED** | GPIO 9 | I2C SCL | Screen clock line |
| **NEO-6M GPS** | GPIO 20 | UART RX1 | Receives NMEA stream at 9600 baud |
| **NEO-6M GPS** | GPIO 21 | UART TX1 | Transmits commands to GPS module |
| **HC-SR04 Ultrasonic** | GPIO 2 | OUTPUT | 10µs trigger pulse |
| **HC-SR04 Ultrasonic** | GPIO 3 | INPUT | Echo pulse width (via 1k/2k voltage divider) |
| **Handlebar SOS Button** | GPIO 4 | INPUT_PULLUP | Hardware interrupt (`FALLING`) |
| **Haptic Motor / Buzzer** | GPIO 5 | OUTPUT / PWM | Turn alert vibration & collision buzzer |

Firmware source files are located in `/firmware/esp32c3_rider_assistant/`. See [`/firmware/README.md`](firmware/README.md) for step-by-step flashing instructions.

---

## 📡 7. REST API Reference

| Method | Endpoint | Description | Payload / Query |
|---|---|---|---|
| `POST` | `/api/trips` | Plan a route & start a trip | `{ mockPreset: "campus_to_techpark", deviceId: "esp32-c3-01" }` |
| `GET` | `/api/trips` | Retrieve past trip history | Optional `?limit=50` |
| `GET` | `/api/trips/:id` | Get trip details and route points | N/A |
| `GET` | `/api/trips/:id/next-instruction` | Calculate turn instruction for GPS coordinate | Optional `?lat=12.9716&lng=77.5946` |
| `POST` | `/api/devices/:id/location` | Post real-time GPS telemetry from ESP32 | `{ lat: 12.972, lng: 77.598, speed: 45, heading: 90 }` |
| `POST` | `/api/devices/:id/emergency` | Trigger emergency SOS from physical button | `{ notes: "Handlebar switch activated" }` |
| `POST` | `/api/devices/:id/obstacle` | Signal proximity obstacle from HC-SR04 | `{ distance_cm: 45, alert: true }` |
| `GET` | `/api/devices/:id/status` | Polled by dashboard for device health | N/A |
| `GET` | `/api/emergency-events` | List emergency SOS events | N/A |
| `POST` | `/api/emergency-events/:id/resolve` | Mark emergency incident resolved | `{ notes: "Resolved by operator" }` |

---

## 🗺️ 8. Map Engine & Zero API Key Requirement

The web companion navigation is built using **Leaflet.js** and **OpenStreetMap**:
- **No API Key Required**: The interactive map view, tile loading, place searching, and routing work out of the box with zero configuration and zero credit card / billing dependencies.
- **Tiles**: Official OpenStreetMap standard tiles (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`) with zero watermark or API key requirement.
- **Search & Autocomplete**: OpenStreetMap Nominatim / Photon geocoding proxy (`/api/navigation/search`).
- **Turn-by-Turn Routing**: Public Open Source Routing Machine (OSRM) service with local realistic mock fallbacks.

### Optional Google Maps Fallback:
If you wish to use Google Maps Directions API as an optional secondary fallback for route calculations:
1. Provide `GOOGLE_MAPS_API_KEY=your_key` in `.env`.
2. If omitted, the system seamlessly uses OSRM and OpenStreetMap with zero disruption.

---

## 🧪 9. Testing Current Location & Destination Routing

### Testing Current Location:
1. Open `http://localhost:3000` in Chrome/Edge/Firefox.
2. Click **Current Location** (or the crosshair icon).
3. When prompted by the browser: `localhost:3000 wants to know your location`, click **Allow**.
4. The map will center on your real GPS coordinates and display the cyan navigation marker with an active radar pulse.

### Testing Destination Routing:
1. In the **"Where do you want to go?"** input, begin typing any destination (e.g., `Kempegowda International Airport`, `Bangalore City Railway Station`, or any local landmark).
2. Select your destination from the OpenStreetMap autocomplete dropdown.
3. The driving route polyline will appear in neon cyan, and the destination marker will be pinned.
4. Click **START NAVIGATION** to begin active turn-by-turn guidance.
5. The HUD and the physical OLED simulator will display the first turn instruction (e.g. `Turn Right in 180 m`) and begin live GPS tracking.
6. When simulated or real position approaches within 20 meters of the destination, both the HUD and the OLED simulator will trigger `DESTINATION REACHED!`.

---

## 🎓 9. College Review / Viva Demonstration Script

1. **Launch Server:** Run `npm start`. Explain that the server initializes the SQLite database with WAL mode and binds Socket.IO for real-time WebSocket communication.
2. **Open Dashboard:** Navigate to `http://localhost:3000`. Show the dark cockpit UI, the active route on the Leaflet map, and the 0.96" SSD1306 physical OLED module simulator.
3. **Run Simulation:**
   - Click **Start Auto Ride** in the browser or run `node scripts/simulate_ride.js --speed 60`.
   - Observe the motorcycle marker smoothly riding along the route on the map, with the breadcrumbs trailing behind.
   - Point out how the OLED display dynamically updates with turn arrows ("Turn Right in 380m"), distance countdowns, and current speed.
4. **Trigger Obstacle Alert:**
   - Click the **HC-SR04 Obstacle** button.
   - Show how the OLED display instantly flips into an inverted flashing warning screen: `⚠️ OBSTACLE AHEAD - 42 CM - BRAKE!`, and an alert chime plays.
5. **Trigger Emergency SOS:**
   - Click the **SOS Emergency** button.
   - Demonstrate the emergency siren audio, the red alert banner, and the SOS display on the OLED screen.
   - Open the **Emergency Log** tab to show the recorded GPS coordinates and the simulated SMS/Email dispatched to Alex Mercer's guardian.
6. **Review Firmware Code:**
   - Open `/firmware/esp32c3_rider_assistant/esp32c3_rider_assistant.ino` to showcase the non-blocking `millis()` loop, TinyGPS++ sentence parsing, hardware button debouncing, and custom 24x24 monochrome turn bitmaps.
