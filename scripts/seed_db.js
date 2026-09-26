/**
 * Database Reset and Seeder Script
 * Turn-by-Turn Rider Assistant - Dept. of IT
 */

const fs = require('fs');
const path = require('path');
const config = require('../backend/src/config');
const db = require('../backend/src/db');
const routingService = require('../backend/src/services/routingService');

async function seed() {
  console.log('[Seed] Seeding database at:', config.DB_PATH);

  // Initialize schema
  db.initDb();

  const database = db.getDb();

  // Insert test trip
  const campusRoute = routingService.MOCK_ROUTES.campus_to_techpark;
  const tripId = db.createTrip({
    userId: 1,
    deviceId: config.DEFAULT_DEVICE_ID,
    origin: campusRoute.origin,
    destination: campusRoute.destination,
    originLat: campusRoute.originCoords.lat,
    originLng: campusRoute.originCoords.lng,
    destLat: campusRoute.destCoords.lat,
    destLng: campusRoute.destCoords.lng,
    totalDistanceM: 4200,
    totalDurationS: 400
  });

  db.insertRoutePoints(tripId, campusRoute.points);
  console.log(`[Seed] Created preset trip #${tripId} with ${campusRoute.points.length} route points.`);

  // Insert sample past emergency event
  db.logEmergencyEvent({
    userId: 1,
    deviceId: config.DEFAULT_DEVICE_ID,
    tripId,
    lat: 12.9730,
    lng: 77.6015,
    notes: 'Initial test panic button check'
  });
  console.log('[Seed] Created sample emergency event.');

  console.log('\n[Seed] Database successfully populated!');
}

seed().catch(err => {
  console.error('[Seed] Error seeding database:', err);
  process.exit(1);
});
