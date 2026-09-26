/**
 * Comprehensive Automated Test Suite for Upgraded Navigation System
 * Tests all requirements: Search, Geocoding, Routing, AI Copilot, Hardware Telemetry
 */

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('===============================================================');
  console.log('   🧪 TESTING UPGRADED INDIA-WIDE NAVIGATION SYSTEM');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ [FAIL] ${name}:`, e.message);
    }
  }

  // 1. Health & Config
  await test('System Health Endpoint', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    if (data.status !== 'online' || data.mapEngine !== 'Leaflet + OpenStreetMap + OSRM') {
      throw new Error(`Unexpected health payload: ${JSON.stringify(data)}`);
    }
  });

  await test('Config Endpoint (Zero Google API Requirement)', async () => {
    const res = await fetch(`${BASE_URL}/api/config`);
    const data = await res.json();
    if (data.mapProvider !== 'leaflet_osm' || data.country !== 'India') {
      throw new Error(`Unexpected config payload: ${JSON.stringify(data)}`);
    }
  });

  // 2. India-wide Geocoding (Section 26 test locations)
  const searchLocations = [
    'Coimbatore',
    'Chennai',
    'Madurai',
    'Bangalore',
    'Bengaluru International Airport',
    'Chennai Central Railway Station',
    'SREC',
    'Ooty',
    'Hyderabad',
    'Mumbai',
    'New Delhi'
  ];

  for (const loc of searchLocations) {
    await test(`Geocoding Search: "${loc}" in India`, async () => {
      const res = await fetch(`${BASE_URL}/api/navigation/search?q=${encodeURIComponent(loc)}`);
      const data = await res.json();
      if (!data.success || !data.results || data.results.length === 0) {
        throw new Error(`No geocoding results returned for "${loc}"`);
      }
      const first = data.results[0];
      if (typeof first.lat !== 'number' || typeof first.lng !== 'number') {
        throw new Error(`Missing valid coordinates for "${loc}"`);
      }
    });
  }

  // 3. Real Road Routing via OSRM (Section 7, 8)
  let coimbatoreCoords = null;
  let chennaiCoords = null;

  await test('Retrieve Coordinates for Coimbatore and Chennai', async () => {
    const cbeRes = await fetch(`${BASE_URL}/api/navigation/search?q=Coimbatore`);
    const cbeData = await cbeRes.json();
    coimbatoreCoords = { lat: cbeData.results[0].lat, lng: cbeData.results[0].lng };

    const chnRes = await fetch(`${BASE_URL}/api/navigation/search?q=Chennai`);
    const chnData = await chnRes.json();
    chennaiCoords = { lat: chnData.results[0].lat, lng: chnData.results[0].lng };
  });

  await test('Calculate Real Road Route (Coimbatore -> Chennai)', async () => {
    const res = await fetch(`${BASE_URL}/api/navigation/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originLat: coimbatoreCoords.lat,
        originLng: coimbatoreCoords.lng,
        destLat: chennaiCoords.lat,
        destLng: chennaiCoords.lng,
        originName: 'Coimbatore',
        destName: 'Chennai'
      })
    });

    const data = await res.json();
    if (!data.success || data.provider !== 'osrm') {
      throw new Error(`Route calculation failed: ${data.error || 'Unknown'}`);
    }

    if (data.totalDistanceM < 450000 || data.totalDistanceM > 550000) {
      throw new Error(`Expected ~500km route, got ${(data.totalDistanceM/1000).toFixed(1)}km`);
    }

    if (!data.geometry || !data.geometry.coordinates || data.geometry.coordinates.length < 100) {
      throw new Error('Missing real road geometry coordinates');
    }

    if (!data.steps || data.steps.length === 0) {
      throw new Error('No turn-by-turn steps generated');
    }

    console.log(`      📍 Distance: ${data.formattedDistance}, Duration: ${data.formattedDuration}, Steps: ${data.steps.length}`);
  });

  // 4. AI Navigation Guide Guidance (Section 12, 15)
  await test('AI Navigation Guide Advice Endpoint', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/navigation-guide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination: { name: 'Chennai Central' },
        nextTurn: 'Turn right onto Avinashi Road',
        distanceToTurn: 120,
        remainingDistance: 501000,
        speed: 42
      })
    });

    const data = await res.json();
    if (!data.success || !data.guidance || !data.guidance.includes('Chennai Central')) {
      throw new Error(`Unexpected guidance response: ${JSON.stringify(data)}`);
    }
  });

  // 5. AI Chat Intent Parser (Section 13, 14)
  const chatQueries = [
    { q: 'Where am I?', expectedFocus: 'current_location' },
    { q: 'What is my next turn?', expectedFocus: 'next_turn' },
    { q: 'How far is left?', expectedFocus: 'eta' },
    { q: 'Explain my route', expectedFocus: 'route_overview' },
    { q: 'Take me to Chennai airport', expectedAction: 'set_destination_query' },
    { q: 'From Coimbatore to Ooty', expectedAction: 'set_route_pair' }
  ];

  for (const item of chatQueries) {
    await test(`AI Chat Query: "${item.q}"`, async () => {
      const res = await fetch(`${BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: item.q,
          navigationState: {
            currentLocation: { name: 'Coimbatore, Tamil Nadu' },
            destination: { name: 'Chennai Central' },
            nextTurn: 'Turn right onto Avinashi Road',
            distanceToTurn: 120,
            remainingDistance: 501000,
            estimatedTime: '6 hr 24 min',
            speed: 45
          }
        })
      });

      const data = await res.json();
      if (!data.success || !data.reply) {
        throw new Error(`Chat query failed: ${JSON.stringify(data)}`);
      }
      if (item.expectedAction && data.action !== item.expectedAction) {
        throw new Error(`Expected action "${item.expectedAction}", got "${data.action}"`);
      }
    });
  }

  // 6. Device Telemetry & Turn Instruction (Section 18, 19)
  await test('Device Location Telemetry & Next Instruction Generation', async () => {
    const res = await fetch(`${BASE_URL}/api/devices/esp32-c3-01/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: coimbatoreCoords.lat,
        lng: coimbatoreCoords.lng,
        speed: 40,
        heading: 85,
        battery: 98
      })
    });

    const data = await res.json();
    if (!data.success || !data.logged) {
      throw new Error(`Device telemetry failed: ${JSON.stringify(data)}`);
    }
  });

  // 7. HTML & Script Assets Integrity
  await test('Frontend HTML & Leaflet Asset Files', async () => {
    const htmlRes = await fetch(`${BASE_URL}/index.html`);
    const htmlText = await htmlRes.text();

    if (htmlText.includes('GOOGLE MAPS NOT CONFIGURED') || htmlText.includes('API KEY REQUIRED')) {
      throw new Error('Old Google Maps error overlay still present in index.html!');
    }
    if (!htmlText.includes('leaflet.css') || !htmlText.includes('leaflet.js')) {
      throw new Error('Leaflet scripts missing in index.html');
    }
    if (!htmlText.includes('ai-assistant.js')) {
      throw new Error('ai-assistant.js missing in index.html');
    }
  });

  console.log('\n===============================================================');
  console.log(`   📊 TEST SUMMARY: ${passed}/${total} PASSED (${Math.round((passed/total)*100)}%)`);
  console.log('===============================================================\n');
}

runTests();
