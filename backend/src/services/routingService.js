/**
 * Routing Service
 * Supports:
 * 1. Google Maps Directions API (if GOOGLE_MAPS_API_KEY is configured)
 * 2. OSRM (Open Source Routing Machine) - Free, real turn-by-turn worldwide
 * 3. Realistic Mock Routes (Offline fallback with predefined scenic & city rides)
 */

const config = require('../config');

// Preset mock routes for offline or instant demo
const MOCK_ROUTES = {
  campus_to_techpark: {
    origin: 'Campus Main Gate, Bangalore',
    destination: 'Innovation Tech Park, Whitefield',
    originCoords: { lat: 12.9716, lng: 77.5946 },
    destCoords: { lat: 12.9856, lng: 77.6258 },
    points: [
      { lat: 12.9716, lng: 77.5946, instruction: 'Head east on College Road towards Gate 2', distance_to_next_turn: 250, maneuver_type: 'depart', street_name: 'College Road' },
      { lat: 12.9725, lng: 77.5980, instruction: 'Turn right onto Metro Boulevard', distance_to_next_turn: 400, maneuver_type: 'turn-right', street_name: 'Metro Boulevard' },
      { lat: 12.9702, lng: 77.6015, instruction: 'Continue straight through University Circle', distance_to_next_turn: 600, maneuver_type: 'straight', street_name: 'Metro Boulevard' },
      { lat: 12.9698, lng: 77.6080, instruction: 'Turn left onto Trinity Church Road', distance_to_next_turn: 350, maneuver_type: 'turn-left', street_name: 'Trinity Church Road' },
      { lat: 12.9735, lng: 77.6105, instruction: 'Slight right onto Ring Flyover Ramp', distance_to_next_turn: 500, maneuver_type: 'turn-slight-right', street_name: 'Ring Flyover' },
      { lat: 12.9760, lng: 77.6160, instruction: 'Enter roundabout and take the 2nd exit onto Outer Expressway', distance_to_next_turn: 750, maneuver_type: 'roundabout', street_name: 'Outer Expressway' },
      { lat: 12.9790, lng: 77.6200, instruction: 'Continue straight on Outer Expressway', distance_to_next_turn: 650, maneuver_type: 'straight', street_name: 'Outer Expressway' },
      { lat: 12.9830, lng: 77.6235, instruction: 'Turn right into Tech Park Avenue', distance_to_next_turn: 300, maneuver_type: 'turn-right', street_name: 'Tech Park Avenue' },
      { lat: 12.9856, lng: 77.6258, instruction: 'You have arrived at Innovation Tech Park', distance_to_next_turn: 0, maneuver_type: 'arrive', street_name: 'Tech Park Gate 1' }
    ]
  },
  metro_to_hospital: {
    origin: 'Central Metro Station',
    destination: 'City General Hospital',
    originCoords: { lat: 12.9780, lng: 77.5850 },
    destCoords: { lat: 12.9650, lng: 77.5920 },
    points: [
      { lat: 12.9780, lng: 77.5850, instruction: 'Head south from Central Station', distance_to_next_turn: 300, maneuver_type: 'depart', street_name: 'Station Road' },
      { lat: 12.9750, lng: 77.5860, instruction: 'Turn left onto MG Arterial Way', distance_to_next_turn: 500, maneuver_type: 'turn-left', street_name: 'MG Arterial Way' },
      { lat: 12.9730, lng: 77.5900, instruction: 'Turn right onto Hospital Cross Road', distance_to_next_turn: 400, maneuver_type: 'turn-right', street_name: 'Hospital Cross' },
      { lat: 12.9690, lng: 77.5910, instruction: 'Make a U-Turn at Emergency Bay junction', distance_to_next_turn: 200, maneuver_type: 'uturn', street_name: 'Emergency Bay' },
      { lat: 12.9650, lng: 77.5920, instruction: 'Arrived at City General Hospital Emergency Gate', distance_to_next_turn: 0, maneuver_type: 'arrive', street_name: 'Hospital Gate' }
    ]
  }
};

/**
 * Calculate distance between two coordinate pairs in meters (Haversine Formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate compass bearing between two points in degrees (0 - 360)
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Map OSRM modifier / maneuver to clean standard maneuver types
 */
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

/**
 * Fetch directions from OSRM public API
 */
async function fetchOsrmRoute(originLat, originLng, destLat, destLng) {
  const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) {
    throw new Error(`OSRM error: ${response.statusText}`);
  }
  const data = await response.json();
  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error('No route found in OSRM');
  }

  const route = data.routes[0];
  const points = [];

  for (const leg of route.legs) {
    for (const step of leg.steps) {
      const maneuver = step.maneuver;
      const [lng, lat] = maneuver.location;
      const maneuverType = mapOsrmManeuver(maneuver.type, maneuver.modifier);
      const instruction = step.name 
        ? `${formatManeuverText(maneuverType)} onto ${step.name}`
        : formatManeuverText(maneuverType);

      points.push({
        lat,
        lng,
        instruction,
        distance_to_next_turn: Math.round(step.distance),
        maneuver_type: maneuverType,
        street_name: step.name || ''
      });
    }
  }

  return {
    totalDistanceM: Math.round(route.distance),
    totalDurationS: Math.round(route.duration),
    geometry: route.geometry,
    points
  };
}

/**
 * Fetch directions from Google Maps Directions API
 */
async function fetchGoogleMapsRoute(origin, destination, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&key=${apiKey}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  const data = await response.json();
  if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
    throw new Error(`Google Maps Directions error: ${data.status} ${data.error_message || ''}`);
  }

  const leg = data.routes[0].legs[0];
  const points = [];

  for (const step of leg.steps) {
    const cleanInstruction = step.html_instructions.replace(/<[^>]*>?/gm, ' ');
    points.push({
      lat: step.start_location.lat,
      lng: step.start_location.lng,
      instruction: cleanInstruction.trim(),
      distance_to_next_turn: step.distance.value,
      maneuver_type: step.maneuver || 'straight',
      street_name: ''
    });
  }

  // End destination point
  points.push({
    lat: leg.end_location.lat,
    lng: leg.end_location.lng,
    instruction: `You have arrived at ${destination}`,
    distance_to_next_turn: 0,
    maneuver_type: 'arrive',
    street_name: ''
  });

  return {
    totalDistanceM: leg.distance.value,
    totalDurationS: leg.duration.value,
    points
  };
}

function formatManeuverText(maneuver) {
  switch (maneuver) {
    case 'turn-left': return 'Turn Left';
    case 'turn-right': return 'Turn Right';
    case 'turn-slight-left': return 'Slight Left';
    case 'turn-slight-right': return 'Slight Right';
    case 'turn-sharp-left': return 'Sharp Left';
    case 'turn-sharp-right': return 'Sharp Right';
    case 'uturn': return 'Make U-Turn';
    case 'roundabout': return 'Enter Roundabout';
    case 'arrive': return 'You have arrived';
    case 'depart': return 'Start route';
    default: return 'Continue Straight';
  }
}

/**
 * Plan a trip route: tries Google Maps if API key is present,
 * then OSRM if lat/lng are given, or falls back to mock routes.
 */
async function generateRoute({ origin, destination, originLat, originLng, destLat, destLng, mockPreset = null }) {
  // If a preset mock route is requested
  if (mockPreset && MOCK_ROUTES[mockPreset]) {
    const preset = MOCK_ROUTES[mockPreset];
    const totalDist = preset.points.reduce((acc, p) => acc + (p.distance_to_next_turn || 0), 0);
    return {
      origin: preset.origin,
      destination: preset.destination,
      originLat: preset.originCoords.lat,
      originLng: preset.originCoords.lng,
      destLat: preset.destCoords.lat,
      destLng: preset.destCoords.lng,
      totalDistanceM: totalDist,
      totalDurationS: Math.round(totalDist / 11), // ~40 km/h
      points: preset.points,
      provider: 'mock_preset'
    };
  }

  // 1. Primary: Use OSRM with real road network if coordinates are provided
  if (originLat && originLng && destLat && destLng) {
    try {
      console.log(`[Routing] Querying OSRM public routing API (${originLat}, ${originLng} -> ${destLat}, ${destLng})...`);
      const osrmResult = await fetchOsrmRoute(originLat, originLng, destLat, destLng);
      return {
        origin: origin || 'Selected Origin',
        destination: destination || 'Selected Destination',
        originLat: parseFloat(originLat),
        originLng: parseFloat(originLng),
        destLat: parseFloat(destLat),
        destLng: parseFloat(destLng),
        totalDistanceM: osrmResult.totalDistanceM,
        totalDurationS: osrmResult.totalDurationS,
        geometry: osrmResult.geometry,
        points: osrmResult.points,
        provider: 'osrm'
      };
    } catch (err) {
      console.warn('[Routing] OSRM primary route attempt note:', err.message);
    }
  }

  // 2. Secondary fallback: Google Maps only if explicitly configured
  if (config.GOOGLE_MAPS_API_KEY) {
    try {
      console.log('[Routing] Fallback to Google Maps Directions API...');
      const gmResult = await fetchGoogleMapsRoute(origin, destination, config.GOOGLE_MAPS_API_KEY);
      return {
        origin,
        destination,
        originLat: gmResult.points[0]?.lat || originLat,
        originLng: gmResult.points[0]?.lng || originLng,
        destLat: gmResult.points[gmResult.points.length - 1]?.lat || destLat,
        destLng: gmResult.points[gmResult.points.length - 1]?.lng || destLng,
        totalDistanceM: gmResult.totalDistanceM,
        totalDurationS: gmResult.totalDurationS,
        points: gmResult.points,
        provider: 'google_maps'
      };
    } catch (err) {
      console.warn('[Routing] Google Maps failed:', err.message);
    }
  }

  // Fallback to Campus to Tech Park mock route
  console.log('[Routing] Using default mock route (campus_to_techpark)');
  const defaultPreset = MOCK_ROUTES.campus_to_techpark;
  const totalDist = defaultPreset.points.reduce((acc, p) => acc + (p.distance_to_next_turn || 0), 0);
  return {
    origin: origin || defaultPreset.origin,
    destination: destination || defaultPreset.destination,
    originLat: defaultPreset.originCoords.lat,
    originLng: defaultPreset.originCoords.lng,
    destLat: defaultPreset.destCoords.lat,
    destLng: defaultPreset.destCoords.lng,
    totalDistanceM: totalDist,
    totalDurationS: Math.round(totalDist / 11),
    points: defaultPreset.points,
    provider: 'canned_mock'
  };
}

/**
 * Determine the next instruction and distance for the rider based on current GPS position
 */
function calculateNextInstruction(currentLat, currentLng, routePoints) {
  if (!routePoints || routePoints.length === 0) {
    return {
      instruction: 'No active route found',
      maneuver: 'straight',
      distance_to_turn_m: 0,
      formatted_distance: '0 m',
      progress_pct: 0,
      status: 'idle'
    };
  }

  // Find the closest route point
  let closestIndex = 0;
  let minDistance = Infinity;

  for (let i = 0; i < routePoints.length; i++) {
    const d = calculateDistance(currentLat, currentLng, routePoints[i].lat, routePoints[i].lng);
    if (d < minDistance) {
      minDistance = d;
      closestIndex = i;
    }
  }

  // Check if reached destination
  const lastPoint = routePoints[routePoints.length - 1];
  const distToDest = calculateDistance(currentLat, currentLng, lastPoint.lat, lastPoint.lng);

  if (closestIndex >= routePoints.length - 1 && distToDest <= config.ARRIVAL_RADIUS_METERS) {
    return {
      current_step: routePoints.length,
      total_steps: routePoints.length,
      instruction: 'Destination Reached!',
      maneuver: 'arrive',
      distance_to_turn_m: 0,
      formatted_distance: '0 m',
      distance_to_destination_m: 0,
      progress_pct: 100,
      status: 'arrived',
      street_name: lastPoint.street_name || ''
    };
  }

  // The active turn target is the upcoming maneuver point
  // If rider is very close to closestIndex (< 35m) and there is a next point, target is closestIndex + 1
  let targetIndex = closestIndex;
  const distToClosest = calculateDistance(currentLat, currentLng, routePoints[closestIndex].lat, routePoints[closestIndex].lng);
  
  if (distToClosest < config.WAYPOINT_REACHED_RADIUS_METERS && closestIndex < routePoints.length - 1) {
    targetIndex = closestIndex + 1;
  }

  const targetPoint = routePoints[targetIndex];
  const distToTurn = Math.round(calculateDistance(currentLat, currentLng, targetPoint.lat, targetPoint.lng));

  // Compute total remaining distance to destination
  let remainingDist = distToTurn;
  for (let i = targetIndex; i < routePoints.length - 1; i++) {
    remainingDist += calculateDistance(routePoints[i].lat, routePoints[i].lng, routePoints[i + 1].lat, routePoints[i + 1].lng);
  }
  remainingDist = Math.round(remainingDist);

  // Compute overall progress percentage
  const totalRouteDist = routePoints.reduce((acc, p) => acc + (p.distance_to_next_turn || 0), 0) || 1;
  const completedDist = Math.max(0, totalRouteDist - remainingDist);
  const progressPct = Math.min(100, Math.max(0, Math.round((completedDist / totalRouteDist) * 100)));

  // Format distance for OLED: e.g. "180 m", "1.2 km"
  let formattedDist = `${distToTurn} m`;
  if (distToTurn >= 1000) {
    formattedDist = `${(distToTurn / 1000).toFixed(1)} km`;
  }

  // Next step preview
  const nextPreview = (targetIndex + 1 < routePoints.length) 
    ? routePoints[targetIndex + 1].instruction 
    : 'Destination Ahead';

  return {
    current_step: targetIndex + 1,
    total_steps: routePoints.length,
    instruction: targetPoint.instruction,
    maneuver: targetPoint.maneuver_type || 'straight',
    distance_to_turn_m: distToTurn,
    formatted_distance: formattedDist,
    distance_to_destination_m: remainingDist,
    progress_pct: progressPct,
    next_step_preview: nextPreview,
    status: 'in_progress',
    street_name: targetPoint.street_name || ''
  };
}

module.exports = {
  calculateDistance,
  calculateBearing,
  generateRoute,
  calculateNextInstruction,
  MOCK_ROUTES
};
