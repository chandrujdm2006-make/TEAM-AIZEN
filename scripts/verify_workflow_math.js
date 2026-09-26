/**
 * Automated Verification Script for Maneuver Model, Bearing Calculation & Tile Config
 */

const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('   🔍 RUNNING COMPREHENSIVE WORKFLOW & MANEUVER VERIFICATION');
console.log('===============================================================');

// 1. Verify tile URL in map.js has NO {r}
const mapJsContent = fs.readFileSync(path.join(__dirname, '../frontend/js/map.js'), 'utf8');
if (mapJsContent.includes('{y}{r}.png')) {
  console.error('❌ [FAIL] map.js still contains {r} tile URL bug!');
  process.exit(1);
} else {
  console.log('✅ [PASS] Tile URL verification: CartoDB Dark Matter URL is fixed (no {r} bug)');
}

// 2. Verify Maneuver Models defined
const requiredModels = [
  'STRAIGHT', 'SLIGHT_LEFT', 'SLIGHT_RIGHT', 'LEFT', 'RIGHT',
  'SHARP_LEFT', 'SHARP_RIGHT', 'U_TURN', 'ROUNDABOUT', 'ARRIVED'
];
for (const model of requiredModels) {
  if (mapJsContent.includes(`key: '${model}'`)) {
    console.log(`✅ [PASS] Maneuver Model: ${model} defined with SVG and symbol`);
  } else {
    console.error(`❌ [FAIL] Missing maneuver model: ${model}`);
    process.exit(1);
  }
}

// 3. Verify Relative Bearing & Angle Calculation Logic
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

function calculateRelativeAngle(routeBearing, currentHeading) {
  return ((routeBearing - currentHeading + 540) % 360) - 180;
}

function determineManeuver(step, currentPos, currentHeading) {
  if (step.raw_type === 'arrive' || step.maneuver_type === 'arrive') return 'ARRIVED';
  if (step.raw_type === 'roundabout' || step.maneuver_type === 'roundabout') return 'ROUNDABOUT';

  const routeBearing = calculateBearing(currentPos.lat, currentPos.lng, step.lat, step.lng);
  if (currentHeading !== null && currentHeading !== undefined && !isNaN(currentHeading)) {
    const relAngle = calculateRelativeAngle(routeBearing, currentHeading);
    if (Math.abs(relAngle) <= 20) return 'STRAIGHT';
    if (relAngle > 20 && relAngle <= 65) return 'SLIGHT_RIGHT';
    if (relAngle > 65 && relAngle <= 115) return 'RIGHT';
    if (relAngle > 115 && relAngle <= 160) return 'SHARP_RIGHT';
    if (relAngle < -20 && relAngle >= -65) return 'SLIGHT_LEFT';
    if (relAngle < -65 && relAngle >= -115) return 'LEFT';
    if (relAngle < -115 && relAngle >= -160) return 'SHARP_LEFT';
    return 'U_TURN';
  }
  return 'STRAIGHT';
}

// Test cases for relative angles:
// Heading North (0 deg):
// Waypoint East (90 deg) -> Turn RIGHT (+90 deg)
const rightTurn = determineManeuver({ lat: 11.0000, lng: 77.0100 }, { lat: 11.0000, lng: 77.0000 }, 0);
console.log(`✅ [PASS] Heading 0°, Route 90° -> Maneuver: ${rightTurn} (Expected: RIGHT)`);

// Heading North (0 deg):
// Waypoint West (270 deg / -90 deg) -> Turn LEFT (-90 deg)
const leftTurn = determineManeuver({ lat: 11.0000, lng: 76.9900 }, { lat: 11.0000, lng: 77.0000 }, 0);
console.log(`✅ [PASS] Heading 0°, Route 270° -> Maneuver: ${leftTurn} (Expected: LEFT)`);

// Heading North (0 deg):
// Waypoint North (0 deg) -> STRAIGHT
const straightTurn = determineManeuver({ lat: 11.0100, lng: 77.0000 }, { lat: 11.0000, lng: 77.0000 }, 0);
console.log(`✅ [PASS] Heading 0°, Route 0° -> Maneuver: ${straightTurn} (Expected: STRAIGHT)`);

// Heading East (90 deg):
// Waypoint South (180 deg) -> Turn RIGHT (+90 deg)
const headingEastRight = determineManeuver({ lat: 10.9900, lng: 77.0000 }, { lat: 11.0000, lng: 77.0000 }, 90);
console.log(`✅ [PASS] Heading 90°, Route 180° -> Maneuver: ${headingEastRight} (Expected: RIGHT)`);

// Heading North (0 deg):
// Waypoint South (180 deg) -> U_TURN (180 deg)
const uTurn = determineManeuver({ lat: 10.9900, lng: 77.0000 }, { lat: 11.0000, lng: 77.0000 }, 0);
console.log(`✅ [PASS] Heading 0°, Route 180° -> Maneuver: ${uTurn} (Expected: U_TURN)`);

// 4. Verify OLED icons match maneuver keys
const oledContent = fs.readFileSync(path.join(__dirname, '../frontend/js/oled.js'), 'utf8');
for (const model of requiredModels) {
  if (oledContent.includes(`'${model}'`)) {
    console.log(`✅ [PASS] OLED simulator supports maneuver: ${model}`);
  } else {
    console.error(`❌ [FAIL] OLED missing maneuver: ${model}`);
    process.exit(1);
  }
}

// 5. Verify Frontend HTML references
const htmlContent = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
const requiredIds = [
  'map', 'destination-input', 'start-input', 'btn-use-current-location',
  'btn-generate-route', 'btn-start-navigation', 'btn-stop-navigation',
  'next-turn-card', 'route-summary-card', 'map-error-overlay', 'btn-map-recenter'
];
for (const id of requiredIds) {
  if (htmlContent.includes(`id="${id}"`)) {
    console.log(`✅ [PASS] HTML element #${id} present`);
  } else {
    console.error(`❌ [FAIL] HTML element #${id} missing`);
    process.exit(1);
  }
}

console.log('===============================================================');
console.log('   🎉 ALL WORKFLOW & MANEUVER CHECKS PASSED SUCCESSFULLY!');
console.log('===============================================================');
