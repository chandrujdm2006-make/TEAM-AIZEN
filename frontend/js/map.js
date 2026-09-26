/**
 * India-Wide OpenStreetMap & Leaflet Navigation Controller
 * Turn-by-Turn Rider Assistant - Dept. of IT
 * 
 * Features:
 * - 100% Free & Open-Source: Leaflet + OpenStreetMap + OSRM (Zero Google API Key Required)
 * - Initial View: Entire Country of India (Zoom from India -> State -> City -> Street)
 * - Real OpenStreetMap Geocoding: City, College, Hospital, Station, Airport, Address across India
 * - Start Location: Browser GPS (getCurrentPosition & watchPosition) OR Manual Search
 * - Destination Location: Autocomplete search with Place Name, Address, Lat, Longitude
 * - Real Road Route Calculation via OSRM Driving Engine with high-precision road geometry
 * - Upgraded Next Turn Card with direction icon, countdown distance, and street name
 * - Distance, Speed, Heading & ETA synchronization
 * - Synchronized with Physical SSD1306 OLED HUD Simulator & AI Navigation Copilot
 * - GPS Signal Unavailable & Route Failure Error Handlers with Manual Selection
 */

class NavigationMap {
  constructor(mapContainerId = 'map') {
    this.mapContainerId = mapContainerId;
    this.map = null;
    this.tileLayers = {};
    this.currentTileStyle = 'dark'; // 'dark' (CartoDB Dark Matter / OSM) or 'osm' (Standard OSM)

    // Navigation State
    this.startLocation = null;     // { lat, lng, name, address }
    this.destination = null;       // { lat, lng, name, address }
    this.currentLocation = null;   // { lat, lng, heading, speed }
    this.isNavigating = false;
    this.watchId = null;
    this.activeRoute = null;       // full route data from OSRM
    this.routeSteps = [];          // turn-by-turn maneuver points
    this.currentStepIndex = 0;
    this.hasArrived = false;

    // Leaflet Layers
    this.startMarker = null;
    this.destMarker = null;
    this.riderMarker = null;
    this.routePolyline = null;
    this.routeGlowPolyline = null;

    // Search Debounce Timers
    this.startSearchTimer = null;
    this.destSearchTimer = null;

    // DOM Elements
    this.mapWrapper = document.getElementById('map-wrapper');
    this.noticeContainer = document.getElementById('map-notice-container');
    this.startInput = document.getElementById('start-input');
    this.destInput = document.getElementById('destination-input');
    this.startSearchResults = document.getElementById('start-search-results');
    this.destSearchResults = document.getElementById('dest-search-results');
    this.startChipText = document.getElementById('start-chip-text');
    this.startChipCoords = document.getElementById('start-chip-coords');
    this.destChipText = document.getElementById('dest-chip-text');
    this.destChipCoords = document.getElementById('dest-chip-coords');
    this.btnCurrentLoc = document.getElementById('btn-use-current-location');
    this.btnGenerateRoute = document.getElementById('btn-generate-route');
    this.btnStartNav = document.getElementById('btn-start-navigation');
    this.btnStopNav = document.getElementById('btn-stop-navigation');

    this.init();
  }

  /**
   * 1. Initialize Leaflet Map centered on India
   */
  init() {
    this.initLeafletMap();
    this.initEventListeners();
    this.initSearchAutocomplete();

    // Automatically try to obtain GPS location on startup (graceful fallback if denied)
    this.requestCurrentLocation(false);
  }

  initLeafletMap() {
    const mapEl = document.getElementById(this.mapContainerId);
    if (!mapEl) return;

    if (typeof L === 'undefined') {
      console.error('[Map] Leaflet library not loaded.');
      this.showNotice('Map engine failed to load. Please refresh the page.', 'error');
      return;
    }

    // Configure Leaflet default image asset path
    L.Icon.Default.imagePath = 'assets/images/';

    // Center of India: Lat ~20.5937, Lng ~78.9629. Zoom: 5 covers India from Kashmir to Kanyakumari
    const indiaCenter = [20.5937, 78.9629];
    const initialZoom = 5;

    this.map = L.map(this.mapContainerId, {
      center: indiaCenter,
      zoom: initialZoom,
      minZoom: 4,
      maxZoom: 19,
      zoomControl: false // Custom placement
    });

    // Custom Zoom control at top-left
    L.control.zoom({ position: 'topleft' }).addTo(this.map);

    // 1. Dark HUD Tile Layer (CartoDB Dark Matter - OSM based, sleek futuristic look matching HUD)
    this.tileLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    });

    // 2. Standard OpenStreetMap Tile Layer
    this.tileLayers.osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    });

    // Add initial dark layer
    this.tileLayers.dark.addTo(this.map);

    console.log('[Map] India-Wide Leaflet Map initialized successfully (Coverage: India, Zoom: 5)');
  }

  /**
   * 2. Setup DOM Listeners & UI Controls
   */
  initEventListeners() {
    // Current Location button
    if (this.btnCurrentLoc) {
      this.btnCurrentLoc.addEventListener('click', () => {
        this.requestCurrentLocation(true);
      });
    }

    // Generate Route button
    if (this.btnGenerateRoute) {
      this.btnGenerateRoute.addEventListener('click', () => {
        this.calculateAndDisplayRoute();
      });
    }

    // Start Navigation button
    if (this.btnStartNav) {
      this.btnStartNav.addEventListener('click', () => {
        this.startNavigation();
      });
    }

    // Stop Navigation button
    if (this.btnStopNav) {
      this.btnStopNav.addEventListener('click', () => {
        this.stopNavigation();
      });
    }

    // Floating Map Controls: Recenter, Fit Route, Tile Style
    const btnRecenter = document.getElementById('btn-map-recenter');
    if (btnRecenter) {
      btnRecenter.addEventListener('click', () => this.centerOnRider());
    }

    const btnFit = document.getElementById('btn-map-fit');
    if (btnFit) {
      btnFit.addEventListener('click', () => this.fitRouteBounds());
    }

    const btnTiles = document.getElementById('btn-map-tiles');
    if (btnTiles) {
      btnTiles.addEventListener('click', () => this.toggleTileStyle());
    }

    // Hide dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (this.startSearchResults && !this.startSearchResults.contains(e.target) && e.target !== this.startInput) {
        this.startSearchResults.style.display = 'none';
      }
      if (this.destSearchResults && !this.destSearchResults.contains(e.target) && e.target !== this.destInput) {
        this.destSearchResults.style.display = 'none';
      }
    });
  }

  toggleTileStyle() {
    if (!this.map) return;
    if (this.currentTileStyle === 'dark') {
      this.map.removeLayer(this.tileLayers.dark);
      this.tileLayers.osm.addTo(this.map);
      this.currentTileStyle = 'osm';
      this.showNotice('Switched to Standard OpenStreetMap view.', 'info', 2500);
    } else {
      this.map.removeLayer(this.tileLayers.osm);
      this.tileLayers.dark.addTo(this.map);
      this.currentTileStyle = 'dark';
      this.showNotice('Switched to Dark HUD Map view.', 'info', 2500);
    }
  }

  /**
   * 3. OpenStreetMap Nominatim/Photon Geocoding Autocomplete
   */
  initSearchAutocomplete() {
    // Start Location Search Input
    if (this.startInput && this.startSearchResults) {
      this.startInput.addEventListener('input', (e) => {
        clearTimeout(this.startSearchTimer);
        const query = e.target.value.trim();
        if (query.length < 2) {
          this.startSearchResults.style.display = 'none';
          return;
        }

        this.startSearchTimer = setTimeout(() => {
          this.executeGeocodeSearch(query, this.startSearchResults, (selected) => {
            this.setStartLocation(selected);
            this.startInput.value = selected.name;
            this.startSearchResults.style.display = 'none';
          });
        }, 320);
      });

      this.startInput.addEventListener('focus', () => {
        if (this.startSearchResults.children.length > 0) {
          this.startSearchResults.style.display = 'block';
        }
      });
    }

    // Destination Location Search Input
    if (this.destInput && this.destSearchResults) {
      this.destInput.addEventListener('input', (e) => {
        clearTimeout(this.destSearchTimer);
        const query = e.target.value.trim();
        if (query.length < 2) {
          this.destSearchResults.style.display = 'none';
          return;
        }

        this.destSearchTimer = setTimeout(() => {
          this.executeGeocodeSearch(query, this.destSearchResults, (selected) => {
            this.setDestination(selected);
            this.destInput.value = selected.name;
            this.destSearchResults.style.display = 'none';
          });
        }, 320);
      });

      this.destInput.addEventListener('focus', () => {
        if (this.destSearchResults.children.length > 0) {
          this.destSearchResults.style.display = 'block';
        }
      });
    }
  }

  /**
   * Execute real OpenStreetMap geocode query against backend proxy
   */
  async executeGeocodeSearch(query, dropdownEl, onSelectCallback) {
    dropdownEl.innerHTML = `<div style="padding:10px 14px;color:var(--text-muted);font-size:0.75rem;">🔍 Searching places across India...</div>`;
    dropdownEl.style.display = 'block';

    try {
      const res = await fetch(`/api/navigation/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!data.success || !data.results || data.results.length === 0) {
        dropdownEl.innerHTML = `<div style="padding:10px 14px;color:var(--text-muted);font-size:0.75rem;">No places found matching "${query}". Try another city, college, hospital, or landmark.</div>`;
        return;
      }

      dropdownEl.innerHTML = '';
      data.results.forEach((item) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'search-result-item';
        itemEl.innerHTML = `
          <div class="search-result-name">
            <span>${item.name}</span>
            <span style="font-size:0.65rem;color:var(--accent-cyan);">${item.city ? item.city : 'India'}</span>
          </div>
          <div class="search-result-addr" title="${item.address}">${item.address}</div>
          <div class="search-result-coords">📍 ${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}</div>
        `;

        itemEl.addEventListener('click', () => {
          onSelectCallback(item);
        });

        dropdownEl.appendChild(itemEl);
      });
    } catch (err) {
      console.error('[Map] Search error:', err);
      dropdownEl.innerHTML = `<div style="padding:10px 14px;color:var(--accent-red);font-size:0.75rem;">Location search unavailable. Check connection.</div>`;
    }
  }

  /**
   * 4. Start Location Handling
   */
  setStartLocation(location) {
    this.startLocation = {
      lat: location.lat,
      lng: location.lng,
      name: location.name || 'Start Location',
      address: location.address || ''
    };

    if (this.startChipText) {
      this.startChipText.innerText = `📍 ${this.startLocation.name}`;
    }
    if (this.startChipCoords) {
      this.startChipCoords.innerText = `${this.startLocation.lat.toFixed(4)}, ${this.startLocation.lng.toFixed(4)}`;
    }

    // Place emerald Start Marker
    if (this.startMarker && this.map) {
      this.map.removeLayer(this.startMarker);
    }

    const startIcon = L.divIcon({
      className: 'custom-start-icon',
      html: `<div class="hud-start-marker" title="${this.startLocation.name}">A</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    this.startMarker = L.marker([this.startLocation.lat, this.startLocation.lng], {
      icon: startIcon,
      title: `Start: ${this.startLocation.name}`
    }).addTo(this.map);

    this.startMarker.bindPopup(`<strong>Start Location</strong><br>${this.startLocation.name}<br><small>${this.startLocation.address}</small>`);

    // If destination is not selected yet, pan to start
    if (!this.destination && this.map) {
      this.map.setView([this.startLocation.lat, this.startLocation.lng], 14);
    }

    this.updateFlowStep(1, true);
    this.showNotice(`Start location set: ${this.startLocation.name}`, 'info', 3000);

    // If destination already chosen, prompt to generate route
    if (this.destination) {
      this.updateFlowStep(3, false);
    }
  }

  /**
   * 5. Destination Location Handling
   */
  setDestination(location) {
    this.destination = {
      lat: location.lat,
      lng: location.lng,
      name: location.name || 'Destination',
      address: location.address || ''
    };

    if (this.destChipText) {
      this.destChipText.innerText = `🏁 ${this.destination.name}`;
    }
    if (this.destChipCoords) {
      this.destChipCoords.innerText = `${this.destination.lat.toFixed(4)}, ${this.destination.lng.toFixed(4)}`;
    }

    // Place Destination Marker
    if (this.destMarker && this.map) {
      this.map.removeLayer(this.destMarker);
    }

    const destIcon = L.divIcon({
      className: 'custom-dest-icon',
      html: `
        <div class="hud-dest-marker" title="${this.destination.name}">
          <div class="hud-dest-pin"><span>🏁</span></div>
        </div>
      `,
      iconSize: [32, 40],
      iconAnchor: [16, 36]
    });

    this.destMarker = L.marker([this.destination.lat, this.destination.lng], {
      icon: destIcon,
      title: `Destination: ${this.destination.name}`
    }).addTo(this.map);

    this.destMarker.bindPopup(`<strong>🏁 Destination</strong><br>${this.destination.name}<br><small>${this.destination.address}</small>`);

    const titleEl = document.getElementById('active-trip-title');
    if (titleEl) {
      titleEl.innerText = `To: ${this.destination.name}`;
    }

    this.updateFlowStep(2, true);
    this.showNotice(`Destination selected: ${this.destination.name}`, 'info', 3000);

    // If start is also ready, update step flow and auto fit or prompt
    if (this.startLocation) {
      this.updateFlowStep(3, false);
      const bounds = L.latLngBounds(
        [this.startLocation.lat, this.startLocation.lng],
        [this.destination.lat, this.destination.lng]
      );
      this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else {
      this.map.setView([this.destination.lat, this.destination.lng], 14);
    }
  }

  /**
   * 6. Browser GPS Acquisition (navigator.geolocation)
   */
  requestCurrentLocation(isUserInitiated = true) {
    if (!navigator.geolocation) {
      this.showNotice('Geolocation is not supported by your browser.', 'error');
      return;
    }

    if (isUserInitiated) {
      this.showNotice('Acquiring live GPS coordinates from your device...', 'info', 2500);
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const speedKmh = pos.coords.speed !== null && pos.coords.speed >= 0 ? Math.round(pos.coords.speed * 3.6) : null;
        const headingDeg = pos.coords.heading || 0;

        this.currentLocation = { lat, lng, speed: speedKmh, heading: headingDeg };
        console.log('[Map] Acquired live GPS location:', this.currentLocation);

        // Update Rider Marker on Map
        this.updateRiderPosition(lat, lng, headingDeg);

        // Reverse geocode to get city/place name in India
        let placeName = `GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        let placeAddr = 'Your current position';
        try {
          const revRes = await fetch(`/api/navigation/reverse?lat=${lat}&lng=${lng}`);
          const revData = await revRes.json();
          if (revData.success && revData.name) {
            placeName = revData.name;
            placeAddr = revData.address;
          }
        } catch (e) {
          console.warn('[Map] Reverse geocode lookup note:', e.message);
        }

        // Set as Start Location
        this.setStartLocation({
          lat,
          lng,
          name: placeName,
          address: placeAddr
        });

        if (this.startInput) {
          this.startInput.value = placeName;
        }

        if (isUserInitiated) {
          this.showNotice(`Current location set: ${placeName}`, 'success', 3000);
        }
      },
      (err) => {
        console.warn('[Map] Geolocation error:', err.message);
        if (err.code === 1) { // PERMISSION_DENIED
          this.showNotice('GPS SIGNAL UNAVAILABLE: Location permission was denied. Please select your starting point manually using the search box above.', 'warning', 7000);
        } else if (isUserInitiated) {
          this.showNotice('GPS SIGNAL UNAVAILABLE: Could not obtain satellite fix. Please search your starting location manually.', 'warning', 7000);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 3000
      }
    );
  }

  /**
   * 7. Real Road Route Calculation via OSRM Engine
   */
  async calculateAndDisplayRoute() {
    if (!this.startLocation) {
      this.showNotice('Please select your Start Location first (or click 📍 My GPS).', 'warning');
      this.startInput?.focus();
      return;
    }
    if (!this.destination) {
      this.showNotice('Please select your Destination in India.', 'warning');
      this.destInput?.focus();
      return;
    }

    this.showNotice(`Calculating real road route: ${this.startLocation.name} → ${this.destination.name}...`, 'info');
    const hudStatus = document.getElementById('hud-current-instruction');
    if (hudStatus) hudStatus.innerText = 'Calculating OSRM Road Route...';

    try {
      const response = await fetch('/api/navigation/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originLat: this.startLocation.lat,
          originLng: this.startLocation.lng,
          destLat: this.destination.lat,
          destLng: this.destination.lng,
          originName: this.startLocation.name,
          destName: this.destination.name
        })
      });

      const data = await response.json();
      if (!data.success || !data.steps || data.steps.length === 0) {
        throw new Error(data.message || 'ROUTE SERVICE UNAVAILABLE');
      }

      this.activeRoute = data;
      this.routeSteps = data.steps;
      this.currentStepIndex = 0;
      this.hasArrived = false;

      // Draw real road polyline onto Leaflet map
      this.drawRoute(this.routeSteps, data.geometry);

      // Update Telemetry Metrics with actual OSRM distance and duration
      const distEl = document.getElementById('metric-dest-dist');
      if (distEl) distEl.innerText = data.formattedDistance;

      const etaEl = document.getElementById('metric-eta');
      if (etaEl) etaEl.innerText = data.formattedDuration;

      const titleEl = document.getElementById('active-trip-title');
      if (titleEl) {
        titleEl.innerText = `${data.origin} → ${data.destination} (${data.formattedDistance})`;
      }

      // Initial Next Turn Card preview
      if (this.routeSteps.length > 0) {
        this.updateNextTurnCard(this.routeSteps[0], 0);
      }

      // Update Step Flow Indicator
      this.updateFlowStep(3, true);
      this.showNotice(`Route generated: ${data.formattedDistance} • ${data.formattedDuration}. Ready to navigate!`, 'success', 4000);

      // Trigger AI Guidance update
      if (window.aiAssistant) {
        window.aiAssistant.onRouteCalculated(data);
      }

      // Sync with OLED simulator initial screen
      if (window.oledDisplay && this.routeSteps.length > 0) {
        window.oledDisplay.renderInstruction({
          instruction: this.routeSteps[0].instruction,
          maneuver: this.routeSteps[0].maneuver_type || 'straight',
          distance_to_turn_m: this.routeSteps[0].distance_to_next_turn || 150,
          formatted_distance: this.routeSteps[0].formatted_distance || '150 m',
          progress_pct: 0,
          current_step: 1,
          total_steps: this.routeSteps.length
        }, 0);
      }

      // Configure Virtual Ride Simulator if available
      if (window.simulator) {
        window.simulator.setRoute(this.routeSteps);
      }

    } catch (err) {
      console.error('[Map] Route calculation error:', err);
      this.showNotice(`ROUTE SERVICE UNAVAILABLE: ${err.message}. <button onclick="window.navMap.calculateAndDisplayRoute()" class="btn btn-secondary" style="padding:2px 8px;font-size:0.7rem;margin-left:6px;">Try Again</button>`, 'error', 9000);
      if (hudStatus) hudStatus.innerText = 'Route Calculation Failed';
    }
  }

  /**
   * 8. Draw Route on Leaflet Map
   */
  drawRoute(points, geometry = null) {
    if (!this.map || !points || points.length === 0) return;

    // Clear previous polylines
    if (this.routePolyline) {
      this.map.removeLayer(this.routePolyline);
      this.routePolyline = null;
    }
    if (this.routeGlowPolyline) {
      this.map.removeLayer(this.routeGlowPolyline);
      this.routeGlowPolyline = null;
    }

    let latLngs = [];

    // If real GeoJSON geometry is provided by OSRM, use it for exact road curves
    if (geometry && geometry.coordinates && Array.isArray(geometry.coordinates)) {
      // GeoJSON is [lng, lat], Leaflet is [lat, lng]
      latLngs = geometry.coordinates.map(coord => [coord[1], coord[0]]);
    } else {
      // Fallback to step points
      latLngs = points.map(p => [p.lat, p.lng]);
    }

    // Outer glow casing
    this.routeGlowPolyline = L.polyline(latLngs, {
      color: '#0284c7',
      weight: 9,
      opacity: 0.45,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(this.map);

    // Inner bright cyan road line
    this.routePolyline = L.polyline(latLngs, {
      color: '#00f0ff',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(this.map);

    // Automatically fit route inside viewport
    this.fitRouteBounds();
  }

  fitRouteBounds() {
    if (this.routePolyline && this.map) {
      this.map.fitBounds(this.routePolyline.getBounds(), {
        padding: [45, 45],
        maxZoom: 16
      });
    }
  }

  /**
   * 9. Start / Stop Live Navigation
   */
  startNavigation() {
    if (!this.activeRoute || this.routeSteps.length === 0) {
      this.showNotice('Please generate a route first before starting navigation.', 'warning');
      return;
    }

    this.isNavigating = true;
    this.hasArrived = false;

    // Update Buttons
    if (this.btnStartNav) this.btnStartNav.style.display = 'none';
    if (this.btnStopNav) this.btnStopNav.style.display = 'inline-flex';

    this.updateFlowStep(4, true);
    this.showNotice('Live Navigation active! Heading to destination.', 'success', 3000);

    const hudStatus = document.getElementById('hud-current-instruction');
    if (hudStatus) hudStatus.innerText = 'Navigating Route';

    // Start watchPosition for continuous real-world GPS tracking
    if (navigator.geolocation) {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const speedKmh = pos.coords.speed !== null && pos.coords.speed >= 0 ? Math.round(pos.coords.speed * 3.6) : null;
          const headingDeg = pos.coords.heading || 0;

          this.updateRiderPosition(lat, lng, headingDeg, speedKmh);
        },
        (err) => {
          console.warn('[Map] Geolocation watch error:', err.message);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 1000
        }
      );
    }
  }

  stopNavigation() {
    this.isNavigating = false;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.btnStartNav) this.btnStartNav.style.display = 'inline-flex';
    if (this.btnStopNav) this.btnStopNav.style.display = 'none';

    this.showNotice('Navigation paused.', 'info', 2500);
    const hudStatus = document.getElementById('hud-current-instruction');
    if (hudStatus) hudStatus.innerText = 'Navigation Paused';
  }

  /**
   * 10. Rider Position Update (Called by GPS, Simulator, or ESP32 telemetry)
   */
  updateRiderPosition(lat, lng, heading = 0, speed = null) {
    if (!this.map) return;

    this.currentLocation = { lat, lng, heading, speed };

    // Create or update glowing Rider Marker with direction pointer
    if (!this.riderMarker) {
      const riderIcon = L.divIcon({
        className: 'custom-rider-icon',
        html: `
          <div class="hud-rider-marker" id="hud-rider-marker-el">
            <div class="hud-rider-needle" style="transform: rotate(${heading}deg);"></div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      this.riderMarker = L.marker([lat, lng], {
        icon: riderIcon,
        zIndexOffset: 1000
      }).addTo(this.map);
    } else {
      this.riderMarker.setLatLng([lat, lng]);
      const needle = document.getElementById('hud-rider-marker-el')?.querySelector('.hud-rider-needle');
      if (needle) {
        needle.style.transform = `rotate(${heading}deg)`;
      }
    }

    // Update Speedometer: show real GPS speed or '-- km/h'
    const speedEl = document.getElementById('metric-speed');
    if (speedEl) {
      if (speed !== null && speed !== undefined && !isNaN(speed)) {
        speedEl.innerText = Math.round(speed);
      } else {
        speedEl.innerText = '--';
      }
    }

    // Update Heading
    const headEl = document.getElementById('metric-heading');
    if (headEl) {
      headEl.innerText = `${Math.round(heading)}°`;
    }

    // If active route is loaded, compute turn step progress
    if (this.routeSteps && this.routeSteps.length > 0) {
      this.evaluateTurnProgress(lat, lng, speed);
    }
  }

  centerOnRider() {
    if (this.currentLocation && this.map) {
      this.map.panTo([this.currentLocation.lat, this.currentLocation.lng], { animate: true });
    } else if (this.startLocation && this.map) {
      this.map.panTo([this.startLocation.lat, this.startLocation.lng], { animate: true });
    }
  }

  /**
   * 11. Calculate closest turn step, countdown distance, and arrival
   */
  evaluateTurnProgress(currentLat, currentLng, speedKmh = null) {
    if (this.hasArrived) return;

    let closestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < this.routeSteps.length; i++) {
      const d = this.calculateHaversineMeters(currentLat, currentLng, this.routeSteps[i].lat, this.routeSteps[i].lng);
      if (d < minDistance) {
        minDistance = d;
        closestIdx = i;
      }
    }

    // Destination arrival check (under 25 meters from destination)
    const lastStep = this.routeSteps[this.routeSteps.length - 1];
    const distToFinal = this.calculateHaversineMeters(currentLat, currentLng, lastStep.lat, lastStep.lng);

    if (distToFinal <= 25 || closestIdx >= this.routeSteps.length - 1) {
      this.triggerDestinationReached();
      return;
    }

    // Target step is the upcoming maneuver
    let targetIdx = closestIdx;
    if (minDistance < 35 && closestIdx < this.routeSteps.length - 1) {
      targetIdx = closestIdx + 1;
    }

    this.currentStepIndex = targetIdx;
    const targetStep = this.routeSteps[targetIdx];
    const distToTurn = Math.round(this.calculateHaversineMeters(currentLat, currentLng, targetStep.lat, targetStep.lng));

    // Calculate remaining distance to destination
    let remainingMeters = distToTurn;
    for (let i = targetIdx; i < this.routeSteps.length - 1; i++) {
      remainingMeters += this.calculateHaversineMeters(
        this.routeSteps[i].lat, this.routeSteps[i].lng,
        this.routeSteps[i + 1].lat, this.routeSteps[i + 1].lng
      );
    }
    remainingMeters = Math.round(remainingMeters);

    // Calculate Progress %
    const totalDist = this.activeRoute?.totalDistanceM || 1;
    const completedDist = Math.max(0, totalDist - remainingMeters);
    const progressPct = Math.min(100, Math.max(0, Math.round((completedDist / totalDist) * 100)));

    // Calculate ETA
    let etaFormatted = '--';
    if (speedKmh && speedKmh > 10) {
      const etaSeconds = (remainingMeters / (speedKmh * 1000 / 3600));
      etaFormatted = this.formatDuration(etaSeconds);
    } else if (this.activeRoute?.totalDurationS) {
      const remainingTime = Math.round((remainingMeters / totalDist) * this.activeRoute.totalDurationS);
      etaFormatted = this.formatDuration(remainingTime);
    }

    // Format turn distance: e.g. "120 m" or "1.4 km"
    const formattedTurnDist = distToTurn >= 1000 ? `${(distToTurn / 1000).toFixed(1)} km` : `${distToTurn} m`;
    const formattedRemDist = remainingMeters >= 1000 ? `${(remainingMeters / 1000).toFixed(1)} km` : `${remainingMeters} m`;

    // 1. Update Next Turn Card
    this.updateNextTurnCard(targetStep, distToTurn);

    // 2. Update Telemetry metrics
    const turnDistEl = document.getElementById('metric-turn-dist');
    if (turnDistEl) turnDistEl.innerText = formattedTurnDist;

    const remDistEl = document.getElementById('metric-dest-dist');
    if (remDistEl) remDistEl.innerText = formattedRemDist;

    const etaEl = document.getElementById('metric-eta');
    if (etaEl) etaEl.innerText = etaFormatted;

    const pctEl = document.getElementById('trip-progress-pct');
    if (pctEl) pctEl.innerText = `${progressPct}%`;

    const fillEl = document.getElementById('trip-progress-fill');
    if (fillEl) fillEl.style.width = `${progressPct}%`;

    const hudInstruction = document.getElementById('hud-current-instruction');
    if (hudInstruction) {
      hudInstruction.innerText = `${targetStep.instruction} (${formattedTurnDist})`;
    }

    // 3. Send Instruction state to OLED Simulator
    const instructionData = {
      instruction: targetStep.instruction,
      maneuver: targetStep.maneuver_type || 'straight',
      distance_to_turn_m: distToTurn,
      formatted_distance: formattedTurnDist,
      distance_to_destination_m: remainingMeters,
      progress_pct: progressPct,
      current_step: targetIdx + 1,
      total_steps: this.routeSteps.length,
      street_name: targetStep.street_name || ''
    };

    if (window.oledDisplay) {
      window.oledDisplay.renderInstruction(instructionData, speedKmh);
    }

    // 4. Update AI Navigation Copilot
    if (window.aiAssistant) {
      window.aiAssistant.updateNavigationState({
        currentLocation: this.currentLocation,
        destination: this.destination,
        nextTurn: targetStep.instruction,
        distanceToTurn: distToTurn,
        remainingDistance: remainingMeters,
        estimatedTime: etaFormatted,
        speed: speedKmh,
        maneuver: targetStep.maneuver_type,
        street: targetStep.street_name
      });
    }
  }

  /**
   * 12. Update Next Turn Card UI
   */
  updateNextTurnCard(step, distMeters) {
    const iconWrap = document.getElementById('hud-turn-icon');
    const labelEl = document.getElementById('hud-maneuver-label');
    const distEl = document.getElementById('hud-turn-distance-big');
    const instEl = document.getElementById('hud-turn-instruction-text');
    const subEl = document.getElementById('hud-turn-sub-text');

    const maneuver = step.maneuver_type || 'straight';
    const distText = distMeters >= 1000 ? `${(distMeters / 1000).toFixed(1)} km` : `${distMeters} m`;

    if (distEl) distEl.innerText = distText;
    if (instEl) instEl.innerText = step.instruction || 'Continue on route';

    const street = step.street_name ? `Road: ${step.street_name}` : 'Continue on the designated roadway';
    if (subEl) subEl.innerText = street;

    // Maneuver label & icon
    const maneuverUpper = maneuver.toUpperCase().replace('-', ' ');
    if (labelEl) labelEl.innerText = `NEXT TURN: ${maneuverUpper}`;

    if (iconWrap) {
      iconWrap.innerHTML = this.getManeuverSvg(maneuver);
    }
  }

  getManeuverSvg(maneuver) {
    switch (maneuver) {
      case 'turn-left':
      case 'turn-sharp-left':
        return `<svg viewBox="0 0 24 24"><path d="M19 19v-6a4 4 0 0 0-4-4H5M10 4L5 9l5 5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      case 'turn-right':
      case 'turn-sharp-right':
        return `<svg viewBox="0 0 24 24"><path d="M5 19v-6a4 4 0 0 1 4-4h10M14 4l5 5-5 5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      case 'turn-slight-left':
        return `<svg viewBox="0 0 24 24"><path d="M16 19l-4-7a3 3 0 0 0-2.6-1.5H6M10 6l-4 4 4 4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      case 'turn-slight-right':
        return `<svg viewBox="0 0 24 24"><path d="M8 19l4-7a3 3 0 0 1 2.6-1.5H18M14 6l4 4-4 4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      case 'uturn':
        return `<svg viewBox="0 0 24 24"><path d="M9 19V9a5 5 0 0 1 10 0v10M5 15l4 4 4-4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      case 'roundabout':
        return `<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9M21 7l-4 5h5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      case 'arrive':
        return `<svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      default:
        return `<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
  }

  /**
   * 13. Trigger Destination Reached
   */
  triggerDestinationReached() {
    this.hasArrived = true;
    this.isNavigating = false;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.btnStartNav) this.btnStartNav.style.display = 'inline-flex';
    if (this.btnStopNav) this.btnStopNav.style.display = 'none';

    const destName = this.destination?.name || 'Destination';
    const hudStatus = document.getElementById('hud-current-instruction');
    if (hudStatus) hudStatus.innerText = '🏁 Destination Reached!';

    const labelEl = document.getElementById('hud-maneuver-label');
    if (labelEl) labelEl.innerText = 'DESTINATION REACHED';

    const distEl = document.getElementById('hud-turn-distance-big');
    if (distEl) distEl.innerText = '0 m';

    const instEl = document.getElementById('hud-turn-instruction-text');
    if (instEl) instEl.innerText = `You have arrived at ${destName}! Safe journey completed.`;

    const iconWrap = document.getElementById('hud-turn-icon');
    if (iconWrap) iconWrap.innerHTML = this.getManeuverSvg('arrive');

    // Update Progress to 100%
    const pctEl = document.getElementById('trip-progress-pct');
    if (pctEl) pctEl.innerText = '100%';
    const fillEl = document.getElementById('trip-progress-fill');
    if (fillEl) fillEl.style.width = '100%';

    // OLED Flag screen
    if (window.oledDisplay) {
      window.oledDisplay.renderDestinationReached();
    }

    // Step Flow 5
    this.updateFlowStep(5, true);
    this.showNotice(`🎉 You have reached your destination: ${destName}!`, 'success', 8000);

    // AI announcement
    if (window.aiAssistant) {
      window.aiAssistant.onDestinationReached(destName);
    }
  }

  /**
   * 14. Step Flow Indicator Update
   */
  updateFlowStep(stepNumber, isCompleted = false) {
    for (let i = 1; i <= 5; i++) {
      const stepEl = document.getElementById(`flow-step-${i}`);
      if (!stepEl) continue;

      if (i < stepNumber) {
        stepEl.className = 'step-item completed';
      } else if (i === stepNumber) {
        stepEl.className = isCompleted ? 'step-item completed' : 'step-item active';
      } else {
        stepEl.className = 'step-item';
      }
    }
  }

  /**
   * 15. Status Notice Banner System
   */
  showNotice(messageHtml, type = 'info', timeoutMs = 5000) {
    if (!this.noticeContainer) return;

    this.noticeContainer.className = `map-notice-container ${type}`;
    this.noticeContainer.innerHTML = messageHtml;
    this.noticeContainer.style.display = 'block';

    if (timeoutMs > 0) {
      clearTimeout(this.noticeTimeout);
      this.noticeTimeout = setTimeout(() => {
        this.noticeContainer.style.display = 'none';
      }, timeoutMs);
    }
  }

  /**
   * Geodesic Distance Helper (Haversine formula in meters)
   */
  calculateHaversineMeters(lat1, lon1, lat2, lon2) {
    if (lat1 === lat2 && lon1 === lon2) return 0;
    const R = 6371e3;
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

  formatDuration(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs} hr ${mins} min`;
    return `${mins} min`;
  }
}

// Global exposure
window.NavigationMap = NavigationMap;
