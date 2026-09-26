/**
 * Trip management routes
 * College Mini Project - Dept. of IT
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const routingService = require('../services/routingService');
const socketService = require('../socket');
const config = require('../config');

/**
 * POST /api/trips
 * Start a new trip. Generates turn-by-turn route and saves route points to SQLite.
 */
router.post('/', async (req, res) => {
  try {
    const {
      origin = 'Campus Main Gate',
      destination = 'Innovation Tech Park',
      originLat,
      originLng,
      destLat,
      destLng,
      mockPreset,
      deviceId = config.DEFAULT_DEVICE_ID,
      userId = config.DEFAULT_USER_ID
    } = req.body;

    console.log(`[Trips API] Planning route from "${origin}" to "${destination}" for device "${deviceId}"`);

    // Generate route points via Google Maps, OSRM, or Mock Preset
    const routeData = await routingService.generateRoute({
      origin,
      destination,
      originLat,
      originLng,
      destLat,
      destLng,
      mockPreset
    });

    // Create trip entry in DB
    const tripId = db.createTrip({
      userId,
      deviceId,
      origin: routeData.origin,
      destination: routeData.destination,
      originLat: routeData.originLat,
      originLng: routeData.originLng,
      destLat: routeData.destLat,
      destLng: routeData.destLng,
      totalDistanceM: routeData.totalDistanceM,
      totalDurationS: routeData.totalDurationS
    });

    // Insert all turn-by-turn route points
    db.insertRoutePoints(tripId, routeData.points);

    // Initial location log (at trip origin)
    if (routeData.points.length > 0) {
      const startPt = routeData.points[0];
      db.logLocation({
        deviceId,
        tripId,
        lat: startPt.lat,
        lng: startPt.lng,
        speedKmh: 0,
        headingDeg: 0
      });
    }

    const createdTrip = db.getTrip(tripId);
    const points = db.getRoutePoints(tripId);

    // Broadcast trip started to all connected dashboards and OLED simulators
    socketService.broadcastTripEvent('trip_started', {
      trip: createdTrip,
      points,
      provider: routeData.provider
    });

    res.status(201).json({
      success: true,
      trip: createdTrip,
      route_points: points,
      provider: routeData.provider,
      message: 'Trip initiated successfully'
    });
  } catch (err) {
    console.error('[Trips API] Error initiating trip:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/trips
 * List past trips for the Trip History view
 */
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const trips = db.getAllTrips(limit);
    res.json({ success: true, trips });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/trips/:id
 * Retrieve specific trip details with its route points and breadcrumbs
 */
router.get('/:id', (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    const trip = db.getTrip(tripId);
    if (!trip) {
      return res.status(404).json({ success: false, error: 'Trip not found' });
    }
    const points = db.getRoutePoints(tripId);
    res.json({ success: true, trip, route_points: points });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/trips/:id/next-instruction
 * ESP32 firmware and web client poll this to get the immediate turn guidance.
 * Reads coordinates from query params or falls back to device's latest logged position.
 */
router.get('/:id/next-instruction', (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    const trip = db.getTrip(tripId);
    if (!trip) {
      return res.status(404).json({ success: false, error: 'Trip not found' });
    }

    let lat = req.query.lat ? parseFloat(req.query.lat) : null;
    let lng = req.query.lng ? parseFloat(req.query.lng) : null;

    // If coordinates were not passed in query, lookup device's latest location
    if (lat === null || lng === null) {
      const latestLoc = db.getLatestLocation(trip.device_id);
      if (latestLoc) {
        lat = latestLoc.lat;
        lng = latestLoc.lng;
      } else {
        // Fall back to origin
        lat = trip.origin_lat;
        lng = trip.origin_lng;
      }
    }

    const points = db.getRoutePoints(tripId);
    const instructionData = routingService.calculateNextInstruction(lat, lng, points);

    // If trip completed, auto-update trip status
    if (instructionData.status === 'arrived' && trip.status === 'in_progress') {
      db.updateTripStatus(tripId, 'completed');
      socketService.broadcastTripEvent('trip_completed', { tripId, trip });
    }

    res.json({
      success: true,
      trip_id: tripId,
      device_id: trip.device_id,
      ...instructionData
    });
  } catch (err) {
    console.error('[Trips API] Error calculating next instruction:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/trips/:id/complete
 * Manually mark trip as completed
 */
router.post('/:id/complete', (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    db.updateTripStatus(tripId, 'completed');
    const updated = db.getTrip(tripId);
    socketService.broadcastTripEvent('trip_completed', { tripId, trip: updated });
    res.json({ success: true, trip: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
