/**
 * Real OpenStreetMap Geocoding and Routing API Routes
 * Turn-by-Turn Rider Assistant - Dept. of IT
 * 
 * Powered by OpenStreetMap Nominatim, Photon, and OSRM (Zero API Key Required)
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const socketService = require('../socket');
const config = require('../config');

// Helper to format maneuver types
function mapOsrmManeuver(type, modifier) {
  if (type === 'arrive') return 'arrive';
  if (type === 'depart') return 'depart';
  if (type === 'roundabout' || type === 'rotary') return 'roundabout';
  if (modifier === 'left') return 'turn-left';
  if (modifier === 'right') return 'turn-right';
  if (modifier === 'slight left') return 'turn-slight-left';
  if (modifier === 'slight right') return 'turn-slight-right';
  if (modifier === 'sharp left') return 'turn-sharp-left';
  if (modifier === 'sharp right') return 'turn-sharp-right';
  if (modifier === 'uturn') return 'uturn';
  return 'straight';
}

function formatManeuverText(maneuver, street) {
  const onStreet = street ? ` onto ${street}` : '';
  switch (maneuver) {
    case 'turn-left': return `Turn left${onStreet}`;
    case 'turn-right': return `Turn right${onStreet}`;
    case 'turn-slight-left': return `Slight left${onStreet}`;
    case 'turn-slight-right': return `Slight right${onStreet}`;
    case 'turn-sharp-left': return `Sharp left${onStreet}`;
    case 'turn-sharp-right': return `Sharp right${onStreet}`;
    case 'uturn': return `Make a U-turn${onStreet}`;
    case 'roundabout': return `Enter roundabout and take exit${onStreet}`;
    case 'arrive': return 'You have reached your destination';
    case 'depart': return `Head out${onStreet}`;
    default: return `Continue straight${onStreet}`;
  }
}

function formatDistance(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hrs > 0) {
    return `${hrs} hr ${mins} min`;
  }
  return `${mins} min`;
}

/**
 * GET /api/navigation/search?q=Coimbatore
 * Real India-wide place search via Nominatim & Photon fallback
 */
router.get('/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ success: false, error: 'Query parameter q is required' });
  }

  // Check if query is raw "lat, lng" coordinates
  const coordMatch = query.match(/^([-+]?[0-9]*\.?[0-9]+)\s*,\s*([-+]?[0-9]*\.?[0-9]+)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    return res.json({
      success: true,
      results: [{
        name: `Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        address: `Custom location at ${lat}, ${lng}`,
        displayName: `Coordinates: ${lat}, ${lng}`,
        lat,
        lng,
        type: 'coordinate'
      }]
    });
  }

  try {
    // 1. Primary geocoder: OpenStreetMap Nominatim restricted to India
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&countrycodes=in&limit=6`;
    const response = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'RiderAssistantHUD/2.0 (OpenStreetMap Navigation India; contact: dept-it-project)',
        'Accept-Language': 'en'
      },
      signal: AbortSignal.timeout(6500)
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const results = data.map(item => {
          const addr = item.address || {};
          const cityOrDistrict = addr.city || addr.town || addr.county || addr.state_district || addr.state || '';
          const shortName = item.name || item.display_name.split(',')[0];
          return {
            name: shortName,
            address: item.display_name,
            displayName: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            type: item.type || item.class || 'place',
            city: cityOrDistrict
          };
        });

        return res.json({ success: true, provider: 'nominatim', results });
      }
    }
  } catch (err) {
    console.warn('[Navigation] Nominatim search timed out/failed, trying Photon fallback:', err.message);
  }

  // 2. Fallback geocoder: Photon (OSM-based by Komoot, high availability)
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lat=20.5937&lon=78.9629`;
    const photonRes = await fetch(photonUrl, { signal: AbortSignal.timeout(6000) });
    if (photonRes.ok) {
      const data = await photonRes.json();
      if (data.features && data.features.length > 0) {
        const results = data.features.map(f => {
          const props = f.properties || {};
          const [lng, lat] = f.geometry.coordinates;
          const addressParts = [props.name, props.city || props.district, props.state, props.country].filter(Boolean);
          return {
            name: props.name || query,
            address: addressParts.join(', '),
            displayName: addressParts.join(', '),
            lat,
            lng,
            type: props.osm_value || 'place',
            city: props.city || props.district || props.state || ''
          };
        });

        return res.json({ success: true, provider: 'photon', results });
      }
    }
  } catch (err) {
    console.warn('[Navigation] Photon search failed:', err.message);
  }

  // If both geocoders return no results
  res.json({
    success: true,
    results: [],
    message: `No locations matching "${query}" found. Try another city or landmark in India.`
  });
});

/**
 * GET /api/navigation/reverse?lat=11.0018&lng=76.9628
 * Reverse geocoding for user's GPS position
 */
router.get('/reverse', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ success: false, error: 'Missing lat or lng query parameters' });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RiderAssistantHUD/2.0 (Reverse Geocoder)',
        'Accept-Language': 'en'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();
      const addr = data.address || {};
      const shortName = addr.suburb || addr.neighbourhood || addr.road || addr.city || addr.town || 'Current Location';
      return res.json({
        success: true,
        name: shortName,
        address: data.display_name || `${lat}, ${lng}`,
        lat: parseFloat(lat),
        lng: parseFloat(lng)
      });
    }
  } catch (err) {
    console.warn('[Navigation] Reverse geocode error:', err.message);
  }

  // Fallback to formatted coordinates
  res.json({
    success: true,
    name: 'Current GPS Location',
    address: `Lat ${parseFloat(lat).toFixed(4)}, Lng ${parseFloat(lng).toFixed(4)}`,
    lat: parseFloat(lat),
    lng: parseFloat(lng)
  });
});

/**
 * POST /api/navigation/route
 * Calculate real road route using OSRM driving engine
 */
router.post('/route', async (req, res) => {
  try {
    const {
      originLat,
      originLng,
      destLat,
      destLng,
      originName = 'Start Location',
      destName = 'Destination',
      deviceId = config.DEFAULT_DEVICE_ID,
      userId = config.DEFAULT_USER_ID
    } = req.body;

    if (!originLat || !originLng || !destLat || !destLng) {
      return res.status(400).json({
        success: false,
        error: 'Missing coordinates: originLat, originLng, destLat, and destLng are required'
      });
    }

    const oLat = parseFloat(originLat);
    const oLng = parseFloat(originLng);
    const dLat = parseFloat(destLat);
    const dLng = parseFloat(destLng);

    console.log(`[Navigation] Computing real road route: (${oLat}, ${oLng}) -> (${dLat}, ${dLng})`);

    // Fetch from OSRM public routing server
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson&steps=true`;
    const response = await fetch(osrmUrl, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      throw new Error(`OSRM service responded with HTTP status ${response.status}`);
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error(data.message || 'No drivable route found between these locations in OpenStreetMap.');
    }

    const route = data.routes[0];
    const totalDistanceM = Math.round(route.distance);
    const totalDurationS = Math.round(route.duration);
    const steps = [];

    // Extract turn-by-turn maneuvers from route steps
    let stepCount = 0;
    for (const leg of route.legs) {
      for (const step of leg.steps) {
        stepCount++;
        const maneuver = step.maneuver;
        const [lng, lat] = maneuver.location;
        const maneuverType = mapOsrmManeuver(maneuver.type, maneuver.modifier);
        const streetName = step.name || '';
        const instruction = formatManeuverText(maneuverType, streetName);

        steps.push({
          step_index: stepCount,
          lat,
          lng,
          instruction,
          distance_to_next_turn: Math.round(step.distance),
          formatted_distance: formatDistance(step.distance),
          duration_s: Math.round(step.duration),
          maneuver_type: maneuverType,
          modifier: maneuver.modifier || null,
          raw_type: maneuver.type || null,
          bearing_after: typeof maneuver.bearing_after === 'number' ? maneuver.bearing_after : null,
          bearing_before: typeof maneuver.bearing_before === 'number' ? maneuver.bearing_before : null,
          street_name: streetName
        });
      }
    }

    // Persist trip to SQLite database
    let tripId = null;
    try {
      tripId = db.createTrip({
        userId,
        deviceId,
        origin: originName,
        destination: destName,
        originLat: oLat,
        originLng: oLng,
        destLat: dLat,
        destLng: dLng,
        totalDistanceM,
        totalDurationS
      });

      // Insert route points
      db.insertRoutePoints(tripId, steps);

      // Log starting position
      db.logLocation({
        deviceId,
        tripId,
        lat: oLat,
        lng: oLng,
        speedKmh: 0,
        headingDeg: 0
      });

      // Broadcast to connected ESP32 and HUD dashboards
      const createdTrip = db.getTrip(tripId);
      socketService.broadcastTripEvent('trip_started', {
        trip: createdTrip,
        points: steps,
        provider: 'osrm'
      });
    } catch (dbErr) {
      console.warn('[Navigation] SQLite trip logging note:', dbErr.message);
    }

    res.json({
      success: true,
      provider: 'osrm',
      tripId,
      origin: originName,
      destination: destName,
      originCoords: { lat: oLat, lng: oLng },
      destCoords: { lat: dLat, lng: dLng },
      totalDistanceM,
      totalDurationS,
      formattedDistance: formatDistance(totalDistanceM),
      formattedDuration: formatDuration(totalDurationS),
      geometry: route.geometry, // GeoJSON { type: 'LineString', coordinates: [[lng, lat], ...] }
      steps
    });

  } catch (err) {
    console.error('[Navigation] Route calculation failed:', err.message);
    res.status(503).json({
      success: false,
      error: 'ROUTE SERVICE UNAVAILABLE',
      message: err.message || 'Could not calculate road route. Please verify locations and try again.'
    });
  }
});

module.exports = router;
