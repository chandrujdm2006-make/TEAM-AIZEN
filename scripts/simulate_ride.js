/**
 * Standalone GPS Movement Simulation Script
 * Turn-by-Turn Rider Assistant - Dept. of IT
 * 
 * Usage:
 *   node scripts/simulate_ride.js
 *   node scripts/simulate_ride.js --speed 60
 *   node scripts/simulate_ride.js --obstacle --sos
 */

const http = require('http');

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultVal;
}
const hasFlag = (flag) => args.includes(flag);

const PORT = parseInt(getArg('--port', 3000), 10);
const HOST = getArg('--host', 'localhost');
const SPEED_KMH = parseFloat(getArg('--speed', 45));
const DEVICE_ID = getArg('--device', 'esp32-c3-01');
const TRIGGER_OBSTACLE_STEP = hasFlag('--obstacle') ? 4 : null;
const TRIGGER_SOS_STEP = hasFlag('--sos') ? 6 : null;

function apiRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: HOST,
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function calculateHeading(lat1, lon1, lat2, lon2) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('\n===============================================================');
  console.log('   🏍️ TURN-BY-TURN RIDER ASSISTANT - GPS SIMULATOR');
  console.log('   Simulating motorcycle ride telemetry for evaluator demo');
  console.log('===============================================================');
  console.log(`Target: http://${HOST}:${PORT}`);
  console.log(`Device: ${DEVICE_ID} | Speed: ${SPEED_KMH} km/h`);
  if (TRIGGER_OBSTACLE_STEP) console.log(`[Config] Will trigger Ultrasonic Obstacle at step ${TRIGGER_OBSTACLE_STEP}`);
  if (TRIGGER_SOS_STEP) console.log(`[Config] Will trigger Emergency SOS at step ${TRIGGER_SOS_STEP}`);
  console.log('---------------------------------------------------------------\n');

  // 1. Fetch active trip or create demo trip
  let status = await apiRequest(`/api/devices/${DEVICE_ID}/status`);
  let tripId = status.activeTrip ? status.activeTrip.id : null;
  let points = [];

  if (tripId) {
    const tripData = await apiRequest(`/api/trips/${tripId}`);
    points = tripData.route_points || [];
    console.log(`[Simulator] Found existing active trip #${tripId} ("${status.activeTrip.origin}" → "${status.activeTrip.destination}") with ${points.length} waypoints.`);
  } else {
    console.log('[Simulator] No active trip. Creating new preset trip (campus_to_techpark)...');
    const newTrip = await apiRequest('/api/trips', 'POST', {
      mockPreset: 'campus_to_techpark',
      deviceId: DEVICE_ID
    });
    tripId = newTrip.trip.id;
    points = newTrip.route_points;
    console.log(`[Simulator] Started new trip #${tripId} with ${points.length} waypoints.`);
  }

  if (!points || points.length === 0) {
    console.error('[Simulator] Error: No route points available to simulate.');
    process.exit(1);
  }

  console.log('\n[Simulator] Starting ride simulation loop. Telemetry is streaming live to dashboard...\n');

  const subStepsPerSegment = 4;

  for (let i = 0; i < points.length - 1; i++) {
    const pA = points[i];
    const pB = points[i + 1];
    const heading = calculateHeading(pA.lat, pA.lng, pB.lat, pB.lng);

    for (let s = 0; s < subStepsPerSegment; s++) {
      const t = s / subStepsPerSegment;
      const currentLat = pA.lat + (pB.lat - pA.lat) * t;
      const currentLng = pA.lng + (pB.lng - pA.lng) * t;

      // Send telemetry
      const resp = await apiRequest(`/api/devices/${DEVICE_ID}/location`, 'POST', {
        lat: currentLat,
        lng: currentLng,
        speed: SPEED_KMH,
        heading: Math.round(heading),
        battery: 98
      });

      const nextInst = resp.nextInstruction || {};
      const distRemaining = nextInst.distance_to_turn_m || 0;
      const instructionText = nextInst.instruction || 'Continue Ahead';
      const progress = nextInst.progress_pct || 0;

      // Colorful CLI output
      process.stdout.write(`\r📍 Step ${i + 1}/${points.length} [Prog: ${progress}%] Speed: ${SPEED_KMH}km/h | Turn in: ${distRemaining}m | "${instructionText.slice(0, 35)}"    `);

      // Obstacle trigger test
      if (i === TRIGGER_OBSTACLE_STEP && s === 2) {
        console.log('\n\n⚠️  [SIMULATOR TRIGGER] Obstacle detected by HC-SR04 at 42cm! Firing alert...');
        await apiRequest(`/api/devices/${DEVICE_ID}/obstacle`, 'POST', { distance_cm: 42, alert: true });
        await sleep(2000);
      }

      // SOS trigger test
      if (i === TRIGGER_SOS_STEP && s === 2) {
        console.log('\n\n🚨 [SIMULATOR TRIGGER] Emergency SOS button pressed! Dispatching alerts...');
        await apiRequest(`/api/devices/${DEVICE_ID}/emergency`, 'POST', { notes: 'Automated simulator SOS demonstration' });
        await sleep(2000);
      }

      await sleep(1000);
    }
  }

  // Reach final point
  const endPt = points[points.length - 1];
  await apiRequest(`/api/devices/${DEVICE_ID}/location`, 'POST', {
    lat: endPt.lat,
    lng: endPt.lng,
    speed: 0,
    heading: 0
  });

  console.log('\n\n===============================================================');
  console.log('   🎉 SIMULATION COMPLETE: DESTINATION REACHED!');
  console.log('   OLED display updated to "Destination Reached"');
  console.log('===============================================================\n');
}

main().catch(err => {
  console.error('[Simulator] Fatal error:', err);
  process.exit(1);
});
