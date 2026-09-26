/**
 * Device routes for ESP32-C3 communication and web dashboard status
 * College Mini Project - Dept. of IT
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const routingService = require('../services/routingService');
const notificationService = require('../services/notificationService');
const socketService = require('../socket');
const config = require('../config');

/**
 * POST /api/devices/:id/location
 * Endpoint called by ESP32-C3 or simulation script with real-time GPS telemetry
 */
router.post('/:id/location', (req, res) => {
  try {
    const deviceId = req.params.id;
    const { lat, lng, speed = 0, heading = 0, battery = null } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ success: false, error: 'Missing lat or lng in payload' });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const speedKmh = parseFloat(speed) || 0;
    const headingDeg = parseFloat(heading) || 0;

    // Check device existence or auto-register
    let device = db.getDevice(deviceId);
    if (!device) {
      db.getDb().prepare(`
        INSERT INTO devices (id, user_id, device_name, status)
        VALUES (?, ?, ?, 'online')
      `).run(deviceId, config.DEFAULT_USER_ID, `Device ${deviceId}`);
      device = db.getDevice(deviceId);
    }

    // Update battery if reported
    if (battery !== null) {
      db.updateDeviceHeartbeat(deviceId, parseInt(battery, 10));
    } else {
      db.updateDeviceHeartbeat(deviceId);
    }

    // Get current active trip for this device
    const activeTrip = db.getActiveTripForDevice(deviceId);
    const tripId = activeTrip ? activeTrip.id : null;

    // Record GPS log in SQLite
    const logId = db.logLocation({
      deviceId,
      tripId,
      lat: latitude,
      lng: longitude,
      speedKmh,
      headingDeg
    });

    let nextInstruction = null;

    // If an active trip is running, calculate immediate next turn
    if (activeTrip) {
      const routePoints = db.getRoutePoints(activeTrip.id);
      nextInstruction = routingService.calculateNextInstruction(latitude, longitude, routePoints);

      // If arrived, complete trip
      if (nextInstruction.status === 'arrived' && activeTrip.status === 'in_progress') {
        db.updateTripStatus(activeTrip.id, 'completed');
        socketService.broadcastTripEvent('trip_completed', { tripId: activeTrip.id });
      }

      // Broadcast instruction update to OLED simulator
      socketService.broadcastInstructionUpdate({
        deviceId,
        tripId: activeTrip.id,
        instruction: nextInstruction
      });
    }

    // Broadcast live telemetry to map & dashboard
    const telemetryPayload = {
      logId,
      deviceId,
      tripId,
      lat: latitude,
      lng: longitude,
      speedKmh,
      headingDeg,
      timestamp: new Date().toISOString(),
      instruction: nextInstruction
    };

    socketService.broadcastLocationUpdate(telemetryPayload);

    // Return current instruction directly in response for efficient microcontroller polling
    res.json({
      success: true,
      deviceId,
      logged: true,
      activeTripId: tripId,
      nextInstruction: nextInstruction || {
        instruction: 'Standby - No Active Trip',
        maneuver: 'straight',
        distance_to_turn_m: 0,
        formatted_distance: '0 m'
      }
    });
  } catch (err) {
    console.error('[Device API] Error handling location update:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/devices/:id/emergency
 * Triggered by ESP32 emergency hardware button or Web UI SOS button
 */
router.post('/:id/emergency', (req, res) => {
  try {
    const deviceId = req.params.id;
    let { lat, lng, notes = 'Physical SOS Button Triggered' } = req.body;

    const device = db.getDevice(deviceId);
    const userId = device?.user_id || config.DEFAULT_USER_ID;
    const user = db.getUser(userId) || {
      name: 'Rider',
      emergency_contact_phone: '+1 (555) 019-2834',
      emergency_contact_email: 'emergency@example.com'
    };

    // If coordinates were omitted, retrieve latest logged position
    if (lat === undefined || lng === undefined) {
      const latestLoc = db.getLatestLocation(deviceId);
      if (latestLoc) {
        lat = latestLoc.lat;
        lng = latestLoc.lng;
      } else {
        lat = 12.9716;
        lng = 77.5946;
      }
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    const activeTrip = db.getActiveTripForDevice(deviceId);
    const tripId = activeTrip ? activeTrip.id : null;

    // Record emergency event in DB
    const eventId = db.logEmergencyEvent({
      userId,
      deviceId,
      tripId,
      lat: latitude,
      lng: longitude,
      notes
    });

    // Send SMS and Email notifications (stubs)
    const alertResult = notificationService.sendEmergencyAlert({
      user,
      deviceId,
      tripId,
      lat: latitude,
      lng: longitude
    });

    // Broadcast emergency event to all connected web clients in real-time
    const emergencyPayload = {
      eventId,
      userId,
      userName: user.name,
      deviceId,
      tripId,
      lat: latitude,
      lng: longitude,
      triggeredAt: new Date().toISOString(),
      notification: alertResult,
      notes
    };

    socketService.broadcastEmergencyAlert(emergencyPayload);

    res.status(201).json({
      success: true,
      eventId,
      message: 'EMERGENCY EVENT LOGGED & ALERTS DISPATCHED',
      details: emergencyPayload
    });
  } catch (err) {
    console.error('[Device API] Error handling emergency:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/devices/:id/obstacle
 * Triggered by ESP32 HC-SR04 ultrasonic sensor when an obstacle is within danger range
 */
router.post('/:id/obstacle', (req, res) => {
  try {
    const deviceId = req.params.id;
    const { distance_cm = 50, alert = true } = req.body;

    const payload = {
      deviceId,
      distanceCm: parseFloat(distance_cm),
      alert: Boolean(alert),
      timestamp: new Date().toISOString()
    };

    socketService.broadcastObstacleAlert(payload);

    res.json({
      success: true,
      message: alert ? 'Obstacle warning broadcasted' : 'Obstacle cleared',
      data: payload
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/devices/:id/status
 * Polled by web dashboard to check live state of device
 */
router.get('/:id/status', (req, res) => {
  try {
    const deviceId = req.params.id;
    const device = db.getDevice(deviceId);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const latestLocation = db.getLatestLocation(deviceId);
    const activeTrip = db.getActiveTripForDevice(deviceId);
    let nextInstruction = null;

    if (activeTrip && latestLocation) {
      const points = db.getRoutePoints(activeTrip.id);
      nextInstruction = routingService.calculateNextInstruction(latestLocation.lat, latestLocation.lng, points);
    }

    res.json({
      success: true,
      device,
      latestLocation,
      activeTrip,
      nextInstruction
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/devices
 * List all devices
 */
router.get('/', (req, res) => {
  try {
    const devices = db.getAllDevices();
    res.json({ success: true, devices });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
