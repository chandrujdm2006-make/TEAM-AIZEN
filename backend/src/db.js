/**
 * Database module using Node 24 native node:sqlite
 * Turn-by-Turn Rider Assistant - Dept. of IT Mini Project
 */

const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(config.DB_PATH);
    // Enable WAL mode for high performance concurrent reads
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
  }
  return dbInstance;
}

/**
 * Initialize all database tables and indexes
 */
function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      emergency_contact_phone TEXT NOT NULL,
      emergency_contact_email TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      device_name TEXT NOT NULL,
      last_seen_at TEXT,
      battery_level INTEGER DEFAULT 100,
      status TEXT DEFAULT 'offline',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      device_id TEXT,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      origin_lat REAL,
      origin_lng REAL,
      dest_lat REAL,
      dest_lng REAL,
      started_at TEXT DEFAULT (datetime('now', 'localtime')),
      ended_at TEXT,
      status TEXT DEFAULT 'in_progress', -- 'in_progress', 'completed', 'cancelled'
      total_distance_m REAL DEFAULT 0,
      total_duration_s REAL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS route_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      sequence_no INTEGER NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      instruction TEXT NOT NULL,
      distance_to_next_turn REAL DEFAULT 0,
      maneuver_type TEXT DEFAULT 'straight', -- 'depart', 'straight', 'turn-left', 'turn-right', 'turn-slight-left', 'turn-slight-right', 'uturn', 'roundabout', 'arrive'
      street_name TEXT DEFAULT '',
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS location_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      trip_id INTEGER,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      speed_kmh REAL DEFAULT 0,
      heading_deg REAL DEFAULT 0,
      timestamp TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS emergency_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      device_id TEXT NOT NULL,
      trip_id INTEGER,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      triggered_at TEXT DEFAULT (datetime('now', 'localtime')),
      resolved INTEGER DEFAULT 0,
      resolved_at TEXT,
      notes TEXT DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_route_points_trip ON route_points(trip_id, sequence_no);
    CREATE INDEX IF NOT EXISTS idx_location_logs_device ON location_logs(device_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_trips_device_status ON trips(device_id, status);
  `);

  seedInitialData(db);
}

/**
 * Seed initial user and IoT device if database is fresh
 */
function seedInitialData(db) {
  const userCheck = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCheck.count === 0) {
    db.prepare(`
      INSERT INTO users (id, name, emergency_contact_phone, emergency_contact_email)
      VALUES (1, 'Alex Mercer (Rider)', '+1 (555) 019-2834', 'alex.guardian@ridesafe.org')
    `).run();
    console.log('[DB] Seeded default user Alex Mercer');
  }

  const deviceCheck = db.prepare('SELECT COUNT(*) as count FROM devices WHERE id = ?').get(config.DEFAULT_DEVICE_ID);
  if (deviceCheck.count === 0) {
    db.prepare(`
      INSERT INTO devices (id, user_id, device_name, last_seen_at, battery_level, status)
      VALUES (?, 1, 'ESP32-C3 RiderHUD-01', datetime('now', 'localtime'), 98, 'online')
    `).run(config.DEFAULT_DEVICE_ID);
    console.log(`[DB] Seeded default device ${config.DEFAULT_DEVICE_ID}`);
  }
}

// -------------------------------------------------------------
// USER OPERATIONS
// -------------------------------------------------------------
function getUser(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// -------------------------------------------------------------
// DEVICE OPERATIONS
// -------------------------------------------------------------
function getDevice(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
}

function getAllDevices() {
  const db = getDb();
  return db.prepare('SELECT * FROM devices ORDER BY id ASC').all();
}

function updateDeviceHeartbeat(deviceId, battery = null) {
  const db = getDb();
  if (battery !== null) {
    db.prepare(`
      UPDATE devices 
      SET last_seen_at = datetime('now', 'localtime'), 
          battery_level = ?,
          status = 'online'
      WHERE id = ?
    `).run(battery, deviceId);
  } else {
    db.prepare(`
      UPDATE devices 
      SET last_seen_at = datetime('now', 'localtime'),
          status = 'online'
      WHERE id = ?
    `).run(deviceId);
  }
}

// -------------------------------------------------------------
// TRIP OPERATIONS
// -------------------------------------------------------------
function createTrip({ userId, deviceId, origin, destination, originLat, originLng, destLat, destLng, totalDistanceM, totalDurationS }) {
  const db = getDb();

  // If there's an ongoing trip for this device, mark it completed or cancelled
  db.prepare(`
    UPDATE trips SET status = 'cancelled', ended_at = datetime('now', 'localtime')
    WHERE device_id = ? AND status = 'in_progress'
  `).run(deviceId);

  const stmt = db.prepare(`
    INSERT INTO trips (user_id, device_id, origin, destination, origin_lat, origin_lng, dest_lat, dest_lng, total_distance_m, total_duration_s, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress')
  `);
  
  const res = stmt.run(userId, deviceId, origin, destination, originLat, originLng, destLat, destLng, totalDistanceM || 0, totalDurationS || 0);
  return res.lastInsertRowid;
}

function getTrip(tripId) {
  const db = getDb();
  return db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
}

function getActiveTripForDevice(deviceId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM trips 
    WHERE device_id = ? AND status = 'in_progress' 
    ORDER BY started_at DESC LIMIT 1
  `).get(deviceId);
}

function updateTripStatus(tripId, status) {
  const db = getDb();
  const endedAt = (status === 'completed' || status === 'cancelled') ? "datetime('now', 'localtime')" : null;
  if (endedAt) {
    db.prepare(`UPDATE trips SET status = ?, ended_at = datetime('now', 'localtime') WHERE id = ?`).run(status, tripId);
  } else {
    db.prepare(`UPDATE trips SET status = ? WHERE id = ?`).run(status, tripId);
  }
}

function getAllTrips(limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT t.*, u.name as user_name, d.device_name
    FROM trips t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN devices d ON t.device_id = d.id
    ORDER BY t.id DESC
    LIMIT ?
  `).all(limit);
}

// -------------------------------------------------------------
// ROUTE POINTS
// -------------------------------------------------------------
function insertRoutePoints(tripId, points) {
  const db = getDb();
  const insertStmt = db.prepare(`
    INSERT INTO route_points (trip_id, sequence_no, lat, lng, instruction, distance_to_next_turn, maneuver_type, street_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    insertStmt.run(
      tripId,
      i + 1,
      pt.lat,
      pt.lng,
      pt.instruction || 'Continue straight',
      pt.distance_to_next_turn || 0,
      pt.maneuver_type || 'straight',
      pt.street_name || ''
    );
  }
}

function getRoutePoints(tripId) {
  const db = getDb();
  return db.prepare('SELECT * FROM route_points WHERE trip_id = ? ORDER BY sequence_no ASC').all(tripId);
}

// -------------------------------------------------------------
// LOCATION LOGS
// -------------------------------------------------------------
function logLocation({ deviceId, tripId = null, lat, lng, speedKmh = 0, headingDeg = 0 }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO location_logs (device_id, trip_id, lat, lng, speed_kmh, heading_deg, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
  `);
  const res = stmt.run(deviceId, tripId, lat, lng, speedKmh, headingDeg);

  // Update device last_seen_at
  updateDeviceHeartbeat(deviceId);

  return res.lastInsertRowid;
}

function getLatestLocation(deviceId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM location_logs 
    WHERE device_id = ? 
    ORDER BY id DESC LIMIT 1
  `).get(deviceId);
}

function getLocationHistory(deviceId, limit = 100) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM location_logs 
    WHERE device_id = ? 
    ORDER BY id DESC LIMIT ?
  `).all(deviceId, limit);
}

// -------------------------------------------------------------
// EMERGENCY EVENTS
// -------------------------------------------------------------
function logEmergencyEvent({ userId, deviceId, tripId = null, lat, lng, notes = '' }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO emergency_events (user_id, device_id, trip_id, lat, lng, triggered_at, resolved, notes)
    VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), 0, ?)
  `);
  const res = stmt.run(userId, deviceId, tripId, lat, lng, notes);
  return res.lastInsertRowid;
}

function getAllEmergencyEvents(limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT e.*, u.name as user_name, u.emergency_contact_phone, u.emergency_contact_email, d.device_name
    FROM emergency_events e
    LEFT JOIN users u ON e.user_id = u.id
    LEFT JOIN devices d ON e.device_id = d.id
    ORDER BY e.id DESC LIMIT ?
  `).all(limit);
}

function resolveEmergencyEvent(eventId, notes = '') {
  const db = getDb();
  db.prepare(`
    UPDATE emergency_events 
    SET resolved = 1, resolved_at = datetime('now', 'localtime'), notes = coalesce(notes || ' | ', '') || ?
    WHERE id = ?
  `).run(notes, eventId);
}

module.exports = {
  getDb,
  initDb,
  getUser,
  getDevice,
  getAllDevices,
  updateDeviceHeartbeat,
  createTrip,
  getTrip,
  getActiveTripForDevice,
  updateTripStatus,
  getAllTrips,
  insertRoutePoints,
  getRoutePoints,
  logLocation,
  getLatestLocation,
  getLocationHistory,
  logEmergencyEvent,
  getAllEmergencyEvents,
  resolveEmergencyEvent
};
