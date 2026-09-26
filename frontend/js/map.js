/**
 * India-Wide OpenStreetMap & Leaflet Navigation Controller
 * Turn-by-Turn Rider Assistant - Dept. of IT
 * 
 * Camera & Navigation Control:
 * - Persistent Leaflet Map instance (initialized ONCE, center India zoom 5)
 * - User has 100% Camera Control (Zoom in, Zoom out, Pan freely)
 * - Zero camera movement or zoom on normal GPS updates (marker updates ONLY)
 * - isFollowingUser state: default false
 * - User interaction (dragstart, zoomstart, movestart) immediately sets isFollowingUser = false & displays [ 📍 RECENTER ]
 * - [ 📍 RECENTER ] button centers ONCE at navigation zoom (16) and re-enables follow mode
 * - Route fitted ONCE when new route generated (hasFittedCurrentRoute flag guards all route events)
 * - "Use My Location" centers ONCE when explicitly clicked by user
 * - SSD1306 OLED HUD Simulator and AI Assistant synchronized with exact road maneuvers
 */

// Explicit Navigation Maneuver Model
const MANEUVER_MODELS = {
  STRAIGHT: {
    key: 'STRAIGHT',
    label: 'CONTINUE STRAIGHT',
    symbol: '↑',
    svg: `<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  SLIGHT_LEFT: {
    key: 'SLIGHT_LEFT',
    label: 'SLIGHT LEFT',
    symbol: '↖',
    svg: `<svg viewBox="0 0 24 24"><path d="M16 19l-4-7a3 3 0 0 0-2.6-1.5H6M10 6l-4 4 4 4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  SLIGHT_RIGHT: {
    key: 'SLIGHT_RIGHT',
    label: 'SLIGHT RIGHT',
    symbol: '↗',
    svg: `<svg viewBox="0 0 24 24"><path d="M8 19l4-7a3 3 0 0 1 2.6-1.5H18M14 6l4 4-4 4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  LEFT: {
    key: 'LEFT',
    label: 'TURN LEFT',
    symbol: '←',
    svg: `<svg viewBox="0 0 24 24"><path d="M19 19v-6a4 4 0 0 0-4-4H5M10 4L5 9l5 5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  RIGHT: {
    key: 'RIGHT',
    label: 'TURN RIGHT',
    symbol: '→',
    svg: `<svg viewBox="0 0 24 24"><path d="M5 19v-6a4 4 0 0 1 4-4h10M14 4l5 5-5 5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  SHARP_LEFT: {
    key: 'SHARP_LEFT',
    label: 'SHARP LEFT',
    symbol: '↰',
    svg: `<svg viewBox="0 0 24 24"><path d="M18 19v-7a3 3 0 0 0-3-3H6M10 5L5 9l5 5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  SHARP_RIGHT: {
    key: 'SHARP_RIGHT',
    label: 'SHARP RIGHT',
    symbol: '↱',
    svg: `<svg viewBox="0 0 24 24"><path d="M6 19v-7a3 3 0 0 1 3-3h9M14 5l5 4-5 4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  U_TURN: {
    key: 'U_TURN',
    label: 'MAKE U-TURN',
    symbol: '↶',
    svg: `<svg viewBox="0 0 24 24"><path d="M9 19V9a5 5 0 0 1 10 0v10M5 15l4 4 4-4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  ROUNDABOUT: {
    key: 'ROUNDABOUT',
    label: 'ENTER ROUNDABOUT',
    symbol: '⟳',
    svg: `<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9M21 7l-4 5h5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  ARRIVED: {
    key: 'ARRIVED',
    label: 'DESTINATION REACHED',
    symbol: '🏁',
    svg: `<svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  }
};

class NavigationMap {
  constructor(mapContainerId = 'map') {
    this.mapContainerId = mapContainerId;
    this.map = null;
    this.osmTileLayer = null;
    this.currentTileStyle = 'standard';
    this.tileErrorCount = 0;

    // Follow Mode & Camera Control State
    this.isFollowingUser = false;         // Default: false (user controls camera)
    this.hasFittedCurrentRoute = false;   // Guards fitBounds() to run ONLY ONCE per new route

    // Explicit State Machine: IDLE | LOCATION_READY | DESTINATION_SELECTED | ROUTE_READY | NAVIGATING | ARRIVED | ERROR
    this.state = 'IDLE';

    // Navigation State
    this.startLocation = null;            // { lat, lng, name, address }
    this.destination = null;              // { lat, lng, name, address }
    this.currentLocation = null;          // { lat, lng, heading, speed, accuracy }
    this.isNavigating = false;
    this.watchId = null;
    this.activeRoute = null;              // full route data from OSRM
    this.routeSteps = [];                 // turn-by-turn maneuver points
    this.currentStepIndex = 0;            // index of upcoming maneuver in routeSteps
    this.hasArrived = false;
    this.lastManeuver = null;

    // Persistent Leaflet Layers
    this.startMarker = null;
    this.destMarker = null;
    this.riderMarker = null;
    this.routePolyline = null;
    this.routeGlowPolyline = null;

    // Search Debounce Timers
    this.startSearchTimer = null;
    this.destSearchTimer = null;
    this.noticeTimeout = null;

    // Cache DOM Elements
    this.cacheDom();
    this.init();
  }

  cacheDom() {
    this.mapWrapper = document.getElementById('map-wrapper');
    this.noticeContainer = document.getElementById('map-notice-container');
    this.mapErrorOverlay = document.getElementById('map-error-overlay');
    this.startInput = document.getElementById('start-input');
    this.destInput = document.getElementById('destination-input');
    this.startSearchResults = document.getElementById('start-search-results');
    this.destSearchResults = document.getElementById('dest-search-results');
    this.startChipText = document.getElementById('start-chip-text');
    this.destChipText = document.getElementById('dest-chip-text');
    this.btnCurrentLoc = document.getElementById('btn-use-current-location');
    this.btnGenerateRoute = document.getElementById('btn-generate-route');
    this.btnStartNav = document.getElementById('btn-start-navigation');
    this.btnStopNav = document.getElementById('btn-stop-navigation');
    this.btnRecenter = document.getElementById('btn-map-recenter');
    this.routeSummaryCard = document.getElementById('route-summary-card');
    this.nextTurnCard = document.getElementById('next-turn-card');
    this.telemetryStrip = document.querySelector('.telemetry-strip');
    this.tripProgressContainer = document.querySelector('.trip-progress-container');
    this.hudInstruction = document.getElementById('hud-current-instruction');
  }

  /**
   * 1. Initialize Leaflet Map centered on India (ONCE)
   */
  init() {
    this.initLeafletMap();
    this.initEventListeners();
    this.initSearchAutocomplete();
    this.setState('IDLE');

    // Silent background check for GPS on startup (does NOT move or zoom map)
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

    if (this.map) {
      console.log('[Map] Map already initialized, keeping persistent instance.');
      return;
    }

    L.Icon.Default.imagePath = 'vendor/leaflet/images/';

    // Center of India: Lat ~20.5937, Lng ~78.9629. Zoom: 5 covers India from Kashmir to Kanyakumari
    const indiaCenter = [20.5937, 78.9629];
    const initialZoom = 5;

    try {
      this.map = L.map(this.mapContainerId, {
        center: indiaCenter,
        zoom: initialZoom,
        minZoom: 4,
        maxZoom: 19,
        zoomControl: false // Custom placement
      });

      // Custom Zoom control at top-left
      L.control.zoom({ position: 'topleft' }).addTo(this.map);

      // OpenStreetMap Standard Tile Layer (100% Free, Zero API Keys, Zero CARTO dependency)
      this.osmTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: 'abc',
        maxZoom: 19
      });

      // Tile error detection
      let tileNoticeShown = false;
      this.osmTileLayer.on('tileerror', () => {
        this.tileErrorCount++;
        if (this.tileErrorCount > 4 && !tileNoticeShown) {
          tileNoticeShown = true;
          this.showMapConnectionError();
        }
      });

      // Add initial OpenStreetMap layer
      this.osmTileLayer.addTo(this.map);

      // User interaction detection: immediately stop follow mode and show RECENTER button
      this.map.on('dragstart', () => {
        this.isFollowingUser = false;
        this.showRecenterButton(true);
        console.log('[MAP] user moved map (dragstart)');
      });

      this.map.on('zoomstart', () => {
        this.isFollowingUser = false;
        this.showRecenterButton(true);
        console.log('[MAP] zoom changed (zoomstart)');
      });

      this.map.on('movestart', (e) => {
        // If this movement was triggered by a user gesture, disable follow mode
        if (e && e.originalEvent) {
          this.isFollowingUser = false;
          this.showRecenterButton(true);
          console.log('[MAP] user moved map (movestart)');
        }
      });

      // Invalidate size once after DOM mount
      setTimeout(() => {
        if (this.map) {
          this.map.invalidateSize();
        }
      }, 200);

      window.addEventListener('resize', () => {
        if (this.map) this.map.invalidateSize();
      });

      console.log('[MAP] initialized: India-Wide interactive Leaflet map ready');
    } catch (err) {
      console.error('[Map] Leaflet initialization error:', err);
      this.showMapConnectionError();
    }
  }

  showMapConnectionError() {
    this.showNotice('Map tiles unavailable. Check your internet connection.', 'warning', 5000);
  }

  retryTiles() {
    this.tileErrorCount = 0;
    if (this.mapErrorOverlay) {
      this.mapErrorOverlay.style.display = 'none';
    }
    if (this.osmTileLayer) {
      this.osmTileLayer.redraw();
    }
    if (this.map) {
      this.map.invalidateSize();
    }
  }

  /**
   * 2. Setup DOM Listeners & UI Controls
   */
  initEventListeners() {
    // Current Location button (📍 USE MY LOCATION)
    if (this.btnCurrentLoc) {
      this.btnCurrentLoc.addEventListener('click', () => {
        this.requestCurrentLocation(true); // User-initiated: center map ONCE
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

    // Recenter Button: Centers map ONCE on user and re-enables follow mode
    if (this.btnRecenter) {
      this.btnRecenter.addEventListener('click', () => {
        this.recenterOnRider();
      });
    }

    const btnFit = document.getElementById('btn-map-fit');
    if (btnFit) {
      btnFit.addEventListener('click', () => this.fitRouteBoundsManually());
    }

    const btnTiles = document.getElementById('btn-map-tiles');
    if (btnTiles) {
      btnTiles.addEventListener('click', () => this.toggleTileStyle());
    }

    // Map error retry buttons
    const btnRetryTiles = document.getElementById('btn-retry-map-tiles');
    if (btnRetryTiles) {
      btnRetryTiles.addEventListener('click', () => this.retryTiles());
    }

    const btnSwitchProvider = document.getElementById('btn-switch-tile-provider');
    if (btnSwitchProvider) {
      btnSwitchProvider.addEventListener('click', () => {
        this.toggleTileStyle();
        if (this.mapErrorOverlay) this.mapErrorOverlay.style.display = 'none';
      });
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

  showRecenterButton(show) {
    if (!this.btnRecenter) return;
    if (show) {
      this.btnRecenter.classList.add('visible');
    } else {
      this.btnRecenter.classList.remove('visible');
    }
  }

  recenterOnRider() {
    if (!this.map) return;
    if (this.currentLocation) {
      console.log('[MAP] recenter clicked');
      // Center ONCE at navigation zoom (16)
      this.map.setView([this.currentLocation.lat, this.currentLocation.lng], 16, { animate: true });
      this.isFollowingUser = true;
      this.showRecenterButton(false);
    } else if (this.startLocation) {
      this.map.setView([this.startLocation.lat, this.startLocation.lng], 15, { animate: true });
      this.showRecenterButton(false);
    } else {
      this.showNotice('Current location unavailable.', 'warning', 3000);
    }
  }

  toggleTileStyle() {
    if (!this.map) return;
    const mapEl = document.getElementById(this.mapContainerId);
    if (this.currentTileStyle === 'dark') {
      if (mapEl) mapEl.classList.remove('dark-hud-tiles');
      this.currentTileStyle = 'standard';
      this.showNotice('Switched to Standard OpenStreetMap view.', 'info', 2000);
    } else {
      if (mapEl) mapEl.classList.add('dark-hud-tiles');
      this.currentTileStyle = 'dark';
      this.showNotice('Switched to Night Mode OpenStreetMap view.', 'info', 2000);
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
            this.setStartLocation(selected, true);
            this.startInput.value = selected.name;
            this.startSearchResults.style.display = 'none';
          });
        }, 300);
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
        }, 300);
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
  setStartLocation(location, centerOnce = false) {
    this.startLocation = {
      lat: location.lat,
      lng: location.lng,
      name: location.name || 'Start Location',
      address: location.address || ''
    };

    if (this.startChipText) {
      this.startChipText.innerText = `📍 Start: ${this.startLocation.name}`;
    }

    // Place or move Start Marker
    if (this.startMarker) {
      this.startMarker.setLatLng([this.startLocation.lat, this.startLocation.lng]);
    } else if (this.map) {
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
    }

    // Only center if explicitly requested by user click
    if (centerOnce && this.map) {
      this.map.setView([this.startLocation.lat, this.startLocation.lng], 14, { animate: true });
    }

    this.setState('LOCATION_READY');

    // If destination is already set, reset flag and recalculate route
    if (this.destination) {
      this.hasFittedCurrentRoute = false;
      this.calculateAndDisplayRoute();
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
      this.destChipText.innerText = `🏁 Destination: ${this.destination.name}`;
    }

    // Place or move Destination Marker
    if (this.destMarker) {
      this.destMarker.setLatLng([this.destination.lat, this.destination.lng]);
    } else if (this.map) {
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
    }

    const titleEl = document.getElementById('active-trip-title');
    if (titleEl) {
      titleEl.innerText = `To: ${this.destination.name}`;
    }

    // Reset route fit flag for new destination
    this.hasFittedCurrentRoute = false;
    this.setState('DESTINATION_SELECTED');
    this.showNotice(`Destination selected: ${this.destination.name}`, 'info', 2500);

    // If start location is ready, generate route automatically
    if (this.startLocation) {
      this.calculateAndDisplayRoute();
    } else {
      this.showNotice('Please click 📍 USE MY LOCATION or select your start location to generate the route.', 'info', 4000);
    }
  }

  /**
   * 6. Browser GPS Acquisition (navigator.geolocation)
   */
  requestCurrentLocation(isUserInitiated = true) {
    if (!navigator.geolocation) {
      if (isUserInitiated) this.showNotice('Geolocation is not supported by your browser.', 'error');
      return;
    }

    if (isUserInitiated) {
      this.showNotice('Acquiring live GPS coordinates...', 'info', 2000);
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const speedKmh = pos.coords.speed !== null && pos.coords.speed >= 0 ? Math.round(pos.coords.speed * 3.6) : null;
        const headingDeg = pos.coords.heading || 0;
        const accuracy = pos.coords.accuracy || 0;

        this.currentLocation = { lat, lng, speed: speedKmh, heading: headingDeg, accuracy };

        // Update Rider Marker on Map
        this.updateRiderPosition(lat, lng, headingDeg, speedKmh);

        // Center map ONCE ONLY if user explicitly clicked "Use My Location"
        if (isUserInitiated && this.map) {
          this.map.setView([lat, lng], 15, { animate: true });
        }

        // Reverse geocode to get real place/street name in India
        let placeName = `Current Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        let placeAddr = 'GPS Fix acquired';
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

        // Set as Start Location (without forced camera recenter)
        this.setStartLocation({
          lat,
          lng,
          name: placeName,
          address: placeAddr
        }, false);

        if (this.startInput) {
          this.startInput.value = placeName;
        }

        if (isUserInitiated) {
          this.showNotice(`📍 Live location acquired: ${placeName}`, 'success', 3000);
        }
      },
      (err) => {
        console.warn('[Map] Geolocation error:', err.message);
        if (err.code === 1) { // PERMISSION_DENIED
          if (isUserInitiated) this.showNotice('Location permission is required for live navigation. You can select your location manually using the search box.', 'warning', 6000);
        } else if (isUserInitiated) {
          this.showNotice('GPS signal unavailable. Please select your location manually.', 'warning', 6000);
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
      this.showNotice('Please select your Start Location first (or click 📍 USE MY LOCATION).', 'warning');
      this.startInput?.focus();
      return;
    }
    if (!this.destination) {
      this.showNotice('Please select your Destination in India.', 'warning');
      this.destInput?.focus();
      return;
    }

    this.showNotice(`Calculating road route: ${this.startLocation.name} → ${this.destination.name}...`, 'info');
    if (this.hudInstruction) this.hudInstruction.innerText = 'Calculating OSRM Road Route...';

    if (this.btnGenerateRoute) this.btnGenerateRoute.disabled = true;

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
        throw new Error(data.message || 'Unable to calculate route.');
      }

      this.activeRoute = data;
      this.routeSteps = data.steps;
      this.currentStepIndex = this.routeSteps.length > 1 ? 1 : 0;
      this.hasArrived = false;
      this.hasFittedCurrentRoute = false; // Reset so new route fits ONCE

      // Draw real road polyline onto Leaflet map
      this.drawRoute(this.routeSteps, data.geometry);

      // Update Route Summary UI
      this.updateRouteSummaryUI(data);

      // Transition to ROUTE_READY state
      this.setState('ROUTE_READY');
      this.showNotice(`Route ready: ${data.formattedDistance} • ${data.formattedDuration}. Click START NAVIGATION!`, 'success', 4000);

      // Trigger AI Guidance update
      if (window.aiAssistant) {
        window.aiAssistant.onRouteCalculated(data);
      }

      // Sync with OLED simulator initial screen
      const previewStep = this.routeSteps[this.currentStepIndex] || this.routeSteps[0];
      const previewManeuver = this.determineManeuver(previewStep, this.startLocation, null);
      if (window.oledDisplay && previewStep) {
        window.oledDisplay.renderInstruction({
          instruction: previewStep.instruction,
          maneuver: previewManeuver.key,
          state: previewManeuver.key,
          distance_to_turn_m: previewStep.distance_to_next_turn || 150,
          formatted_distance: previewStep.formatted_distance || '150 m',
          progress_pct: 0,
          current_step: 1,
          total_steps: this.routeSteps.length,
          street_name: previewStep.street_name || ''
        }, 0);
      }

      // Configure Virtual Ride Simulator if available
      if (window.simulator) {
        window.simulator.setRoute(this.routeSteps);
      }

    } catch (err) {
      console.error('[Map] Route calculation error:', err);
      this.setState('ERROR');
      this.showNotice(
        `Unable to calculate route: ${err.message}. <button onclick="window.navMap.calculateAndDisplayRoute()" class="btn btn-secondary" style="padding:2px 8px;font-size:0.7rem;margin-left:6px;">Try Again</button>`,
        'error',
        9000
      );
      if (this.hudInstruction) this.hudInstruction.innerText = 'Route Calculation Failed';
    } finally {
      if (this.btnGenerateRoute) this.btnGenerateRoute.disabled = false;
    }
  }

  updateRouteSummaryUI(data) {
    if (this.routeSummaryCard) {
      this.routeSummaryCard.style.display = 'flex';
      this.routeSummaryCard.innerHTML = `
        <div style="flex:1;min-width:200px;">
          <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">ROUTE SUMMARY</div>
          <div style="font-size:1.05rem;font-weight:700;color:#ffffff;margin-top:2px;">
            ${data.origin} <span style="color:var(--accent-cyan);">→</span> ${data.destination}
          </div>
        </div>
        <div style="display:flex;gap:1.5rem;align-items:center;">
          <div style="text-align:right;">
            <div style="font-size:1.25rem;font-weight:800;font-family:var(--font-mono);color:var(--accent-cyan);">${data.formattedDistance}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono);">${data.formattedDuration}</div>
          </div>
        </div>
      `;
    }

    const titleEl = document.getElementById('active-trip-title');
    if (titleEl) {
      titleEl.innerText = `${data.origin} → ${data.destination} (${data.formattedDistance})`;
    }

    const distEl = document.getElementById('metric-dest-dist');
    if (distEl) distEl.innerText = data.formattedDistance;

    const etaEl = document.getElementById('metric-eta');
    if (etaEl) etaEl.innerText = data.formattedDuration;

    // Show initial preview on Next Turn Card
    const previewStep = this.routeSteps[this.currentStepIndex] || this.routeSteps[0];
    if (previewStep) {
      this.updateNextTurnCard(previewStep, previewStep.distance_to_next_turn || 150, null);
    }
  }

  /**
   * 8. Draw Route on Leaflet Map
   */
  drawRoute(points, geometry = null) {
    if (!this.map || !points || points.length === 0) return;

    let latLngs = [];
    if (geometry && geometry.coordinates && Array.isArray(geometry.coordinates)) {
      // GeoJSON is [lng, lat], Leaflet is [lat, lng]
      latLngs = geometry.coordinates.map(coord => [coord[1], coord[0]]);
    } else {
      latLngs = points.map(p => [p.lat, p.lng]);
    }

    // Reuse existing polylines if available
    if (this.routeGlowPolyline) {
      this.routeGlowPolyline.setLatLngs(latLngs);
    } else {
      this.routeGlowPolyline = L.polyline(latLngs, {
        color: '#0284c7',
        weight: 8,
        opacity: 0.45,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);
    }

    if (this.routePolyline) {
      this.routePolyline.setLatLngs(latLngs);
    } else {
      this.routePolyline = L.polyline(latLngs, {
        color: '#00f0ff',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);
    }

    // Fit route bounds ONCE for the newly calculated route
    if (!this.hasFittedCurrentRoute && this.routePolyline) {
      this.map.fitBounds(this.routePolyline.getBounds(), {
        padding: [40, 40],
        maxZoom: 16
      });
      this.hasFittedCurrentRoute = true;
      console.log('[MAP] route fitted (once)');
    }
  }

  fitRouteBoundsManually() {
    if (this.routePolyline && this.map) {
      this.map.fitBounds(this.routePolyline.getBounds(), {
        padding: [40, 40],
        maxZoom: 16
      });
    }
  }

  /**
   * 9. Start / Stop Live Navigation
   */
  startNavigation() {
    if (!this.activeRoute || this.routeSteps.length === 0) {
      this.showNotice('Please select a destination and calculate route first.', 'warning');
      return;
    }

    this.isNavigating = true;
    this.hasArrived = false;

    // Set initial navigation camera ONCE if current location is known
    if (this.currentLocation && this.map) {
      this.map.setView([this.currentLocation.lat, this.currentLocation.lng], 16, { animate: true });
      this.isFollowingUser = true;
      this.showRecenterButton(false);
    } else {
      this.isFollowingUser = false;
    }

    this.setState('NAVIGATING');
    this.showNotice('🚀 Navigation active! Follow the turn-by-turn guidance.', 'success', 3000);

    if (this.hudInstruction) this.hudInstruction.innerText = 'Navigating Route';

    // Start live GPS watchPosition
    if (navigator.geolocation) {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const speedKmh = pos.coords.speed !== null && pos.coords.speed >= 0 ? Math.round(pos.coords.speed * 3.6) : null;
          const headingDeg = pos.coords.heading;

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
    this.isFollowingUser = false;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    this.setState('ROUTE_READY');
    this.showNotice('Navigation paused.', 'info', 2500);
    if (this.hudInstruction) this.hudInstruction.innerText = 'Navigation Paused';
  }

  /**
   * 10. Rider Position Update (Called by GPS, Simulator, or ESP32 telemetry)
   * CRITICAL RULE: Normal GPS updates update the marker ONLY. NO setView/fitBounds/setZoom!
   */
  updateRiderPosition(lat, lng, heading = null, speed = null) {
    if (!this.map) return;

    // Calculate heading if not provided from previous position
    let computedHeading = heading;
    if ((computedHeading === null || computedHeading === undefined || isNaN(computedHeading)) && this.currentLocation) {
      const d = this.calculateHaversineMeters(this.currentLocation.lat, this.currentLocation.lng, lat, lng);
      if (d > 2) {
        computedHeading = this.calculateBearing(this.currentLocation.lat, this.currentLocation.lng, lat, lng);
      } else {
        computedHeading = this.currentLocation.heading || 0;
      }
    } else if (computedHeading === null || computedHeading === undefined || isNaN(computedHeading)) {
      computedHeading = 0;
    }

    this.currentLocation = { lat, lng, heading: computedHeading, speed };

    // Update Rider Marker position and orientation (Create once, then setLatLng)
    if (!this.riderMarker) {
      const riderIcon = L.divIcon({
        className: 'custom-rider-icon',
        html: `
          <div class="hud-rider-marker" id="hud-rider-marker-el">
            <div class="hud-rider-needle" style="transform: rotate(${computedHeading}deg);"></div>
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
        needle.style.transform = `rotate(${computedHeading}deg)`;
      }
    }

    // CAMERA RULE: ONLY pan if in active navigation AND user has NOT moved the map
    // Does NOT change zoom level!
    if (this.isNavigating && this.isFollowingUser) {
      const center = this.map.getCenter();
      const distFromCenter = this.calculateHaversineMeters(center.lat, center.lng, lat, lng);
      // Only pan when rider moves significantly away from center (> 25m) to avoid animation thrashing
      if (distFromCenter > 25) {
        this.map.panTo([lat, lng], { animate: true, duration: 0.6 });
      }
    }

    // Update Speedometer
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
      headEl.innerText = `${Math.round(computedHeading)}°`;
    }

    // If active route is loaded, compute turn step progress
    if (this.routeSteps && this.routeSteps.length > 0) {
      this.evaluateTurnProgress(lat, lng, computedHeading, speed);
    }
  }

  /**
   * 11. Precise Turn Detection, Route Snapping, and Arrival
   */
  evaluateTurnProgress(currentLat, currentLng, currentHeading = 0, speedKmh = null) {
    if (this.hasArrived || !this.routeSteps || this.routeSteps.length === 0) return;

    // 1. Check Arrival: distance to final destination step
    const finalStep = this.routeSteps[this.routeSteps.length - 1];
    const distToDestination = this.calculateHaversineMeters(currentLat, currentLng, finalStep.lat, finalStep.lng);

    if (distToDestination <= 25) {
      this.triggerDestinationReached();
      return;
    }

    // 2. Find closest step to snap rider to route
    let closestStepIdx = 0;
    let minStepDist = Infinity;
    for (let i = 0; i < this.routeSteps.length; i++) {
      const d = this.calculateHaversineMeters(currentLat, currentLng, this.routeSteps[i].lat, this.routeSteps[i].lng);
      if (d < minStepDist) {
        minStepDist = d;
        closestStepIdx = i;
      }
    }

    // 3. Step Progression: Advance to upcoming maneuver when approaching within 35m of current step
    let targetIdx = this.currentStepIndex;
    if (targetIdx < closestStepIdx) {
      targetIdx = closestStepIdx;
    }

    const distToTargetStep = this.calculateHaversineMeters(
      currentLat, currentLng,
      this.routeSteps[targetIdx].lat, this.routeSteps[targetIdx].lng
    );

    // If we are within 35m of the target maneuver step, advance to next maneuver
    if (distToTargetStep < 35 && targetIdx < this.routeSteps.length - 1) {
      targetIdx++;
      if (window.socketClient) {
        window.socketClient.playTurnChime();
      }
    }

    this.currentStepIndex = targetIdx;
    const targetStep = this.routeSteps[targetIdx];

    // Check if target step is the arrival step
    if (targetIdx >= this.routeSteps.length - 1 && distToDestination <= 30) {
      this.triggerDestinationReached();
      return;
    }

    // 4. Exact Distance to Next Turn (Countdown)
    const distToNextTurn = Math.round(
      this.calculateHaversineMeters(currentLat, currentLng, targetStep.lat, targetStep.lng)
    );

    // 5. Remaining Distance along the route to destination
    let remainingMeters = distToNextTurn;
    for (let i = targetIdx; i < this.routeSteps.length - 1; i++) {
      remainingMeters += this.calculateHaversineMeters(
        this.routeSteps[i].lat, this.routeSteps[i].lng,
        this.routeSteps[i + 1].lat, this.routeSteps[i + 1].lng
      );
    }
    remainingMeters = Math.round(remainingMeters);

    // Progress %
    const totalDist = this.activeRoute?.totalDistanceM || remainingMeters || 1;
    const completedDist = Math.max(0, totalDist - remainingMeters);
    const progressPct = Math.min(100, Math.max(0, Math.round((completedDist / totalDist) * 100)));

    // ETA calculation
    let etaFormatted = '--';
    if (speedKmh && speedKmh > 10) {
      const etaSeconds = remainingMeters / ((speedKmh * 1000) / 3600);
      etaFormatted = this.formatDuration(etaSeconds);
    } else if (this.activeRoute?.totalDurationS) {
      const remainingTime = Math.round((remainingMeters / totalDist) * this.activeRoute.totalDurationS);
      etaFormatted = this.formatDuration(remainingTime);
    }

    const formattedTurnDist = distToNextTurn >= 1000 ? `${(distToNextTurn / 1000).toFixed(1)} km` : `${distToNextTurn} m`;
    const formattedRemDist = remainingMeters >= 1000 ? `${(remainingMeters / 1000).toFixed(1)} km` : `${remainingMeters} m`;

    // 6. Determine Maneuver & Arrow Direction from route geometry & relative bearing
    const maneuver = this.determineManeuver(targetStep, { lat: currentLat, lng: currentLng }, currentHeading);
    this.lastManeuver = maneuver;

    // 7. Update Next Turn Card UI
    this.updateNextTurnCard(targetStep, distToNextTurn, maneuver);

    // 8. Update Telemetry metrics
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

    if (this.hudInstruction) {
      this.hudInstruction.innerText = `${targetStep.instruction} (${formattedTurnDist})`;
    }

    // 9. Sync exact navigation state with OLED Simulator
    if (window.oledDisplay) {
      window.oledDisplay.renderInstruction({
        instruction: targetStep.instruction,
        maneuver: maneuver.key,
        state: maneuver.key,
        distance_to_turn_m: distToNextTurn,
        formatted_distance: formattedTurnDist,
        distance_to_destination_m: remainingMeters,
        progress_pct: progressPct,
        current_step: targetIdx + 1,
        total_steps: this.routeSteps.length,
        street_name: targetStep.street_name || ''
      }, speedKmh);
    }

    // 10. Update AI Navigation Copilot
    if (window.aiAssistant) {
      window.aiAssistant.updateNavigationState({
        currentLocation: this.currentLocation,
        destination: this.destination,
        nextTurn: targetStep.instruction,
        distanceToTurn: distToNextTurn,
        remainingDistance: remainingMeters,
        estimatedTime: etaFormatted,
        speed: speedKmh,
        maneuver: maneuver.key,
        street: targetStep.street_name
      });
    }
  }

  /**
   * 12. Maneuver Model & Relative Direction Determination
   */
  determineManeuver(step, currentPos, currentHeading) {
    if (!step) return MANEUVER_MODELS.STRAIGHT;

    if (step.raw_type === 'arrive' || step.maneuver_type === 'arrive') {
      return MANEUVER_MODELS.ARRIVED;
    }

    if (step.raw_type === 'roundabout' || step.raw_type === 'rotary' || step.maneuver_type === 'roundabout') {
      return MANEUVER_MODELS.ROUNDABOUT;
    }

    const routeBearing = this.calculateBearing(currentPos.lat, currentPos.lng, step.lat, step.lng);

    if (currentHeading !== null && currentHeading !== undefined && !isNaN(currentHeading)) {
      const relAngle = this.calculateRelativeAngle(routeBearing, currentHeading);

      if (Math.abs(relAngle) <= 20) {
        return MANEUVER_MODELS.STRAIGHT;
      } else if (relAngle > 20 && relAngle <= 65) {
        return MANEUVER_MODELS.SLIGHT_RIGHT;
      } else if (relAngle > 65 && relAngle <= 115) {
        return MANEUVER_MODELS.RIGHT;
      } else if (relAngle > 115 && relAngle <= 160) {
        return MANEUVER_MODELS.SHARP_RIGHT;
      } else if (relAngle < -20 && relAngle >= -65) {
        return MANEUVER_MODELS.SLIGHT_LEFT;
      } else if (relAngle < -65 && relAngle >= -115) {
        return MANEUVER_MODELS.LEFT;
      } else if (relAngle < -115 && relAngle >= -160) {
        return MANEUVER_MODELS.SHARP_LEFT;
      } else {
        return MANEUVER_MODELS.U_TURN;
      }
    }

    switch (step.maneuver_type) {
      case 'turn-left': return MANEUVER_MODELS.LEFT;
      case 'turn-right': return MANEUVER_MODELS.RIGHT;
      case 'turn-slight-left': return MANEUVER_MODELS.SLIGHT_LEFT;
      case 'turn-slight-right': return MANEUVER_MODELS.SLIGHT_RIGHT;
      case 'turn-sharp-left': return MANEUVER_MODELS.SHARP_LEFT;
      case 'turn-sharp-right': return MANEUVER_MODELS.SHARP_RIGHT;
      case 'uturn': return MANEUVER_MODELS.U_TURN;
      case 'arrive': return MANEUVER_MODELS.ARRIVED;
      default: return MANEUVER_MODELS.STRAIGHT;
    }
  }

  /**
   * 13. Update Next Turn Card UI
   */
  updateNextTurnCard(step, distMeters, maneuverModel = null) {
    if (!this.nextTurnCard) return;

    const iconWrap = document.getElementById('hud-turn-icon');
    const labelEl = document.getElementById('hud-maneuver-label');
    const distEl = document.getElementById('hud-turn-distance-big');
    const instEl = document.getElementById('hud-turn-instruction-text');
    const subEl = document.getElementById('hud-turn-sub-text');

    const m = maneuverModel || this.determineManeuver(step, this.currentLocation || this.startLocation || { lat: step.lat, lng: step.lng }, null);
    const distText = distMeters >= 1000 ? `${(distMeters / 1000).toFixed(1)} km` : `${distMeters} m`;

    if (distEl) distEl.innerText = distText;
    if (instEl) instEl.innerText = step.instruction || m.label;

    const street = step.street_name ? `Road: ${step.street_name}` : 'Continue on the designated roadway';
    if (subEl) subEl.innerText = street;

    if (labelEl) labelEl.innerText = `NEXT TURN: ${m.label}`;
    if (iconWrap) iconWrap.innerHTML = m.svg;
  }

  /**
   * 14. Trigger Destination Reached
   */
  triggerDestinationReached() {
    this.hasArrived = true;
    this.isNavigating = false;
    this.isFollowingUser = false;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    this.setState('ARRIVED');

    const destName = this.destination?.name || 'Destination';
    if (this.hudInstruction) this.hudInstruction.innerText = '🏁 Destination Reached!';

    const labelEl = document.getElementById('hud-maneuver-label');
    if (labelEl) labelEl.innerText = 'DESTINATION REACHED';

    const distEl = document.getElementById('hud-turn-distance-big');
    if (distEl) distEl.innerText = '0 m';

    const instEl = document.getElementById('hud-turn-instruction-text');
    if (instEl) instEl.innerText = `You have arrived at ${destName}! Safe journey completed.`;

    const iconWrap = document.getElementById('hud-turn-icon');
    if (iconWrap) iconWrap.innerHTML = MANEUVER_MODELS.ARRIVED.svg;

    // Update Progress to 100%
    const pctEl = document.getElementById('trip-progress-pct');
    if (pctEl) pctEl.innerText = '100%';
    const fillEl = document.getElementById('trip-progress-fill');
    if (fillEl) fillEl.style.width = '100%';

    // OLED Flag screen
    if (window.oledDisplay) {
      window.oledDisplay.renderDestinationReached();
    }

    this.showNotice(`🎉 You have reached your destination: ${destName}!`, 'success', 8000);

    // AI announcement
    if (window.aiAssistant) {
      window.aiAssistant.onDestinationReached(destName);
    }
  }

  /**
   * 15. Explicit State Machine Transition
   */
  setState(newState) {
    this.state = newState;
    console.log(`[Map State] -> ${newState}`);

    switch (newState) {
      case 'IDLE':
        this.updateFlowStep(1, false);
        if (this.btnStartNav) this.btnStartNav.style.display = 'none';
        if (this.btnStopNav) this.btnStopNav.style.display = 'none';
        if (this.btnGenerateRoute) this.btnGenerateRoute.style.display = 'inline-flex';
        if (this.nextTurnCard) this.nextTurnCard.style.display = 'none';
        if (this.telemetryStrip) this.telemetryStrip.style.display = 'none';
        if (this.tripProgressContainer) this.tripProgressContainer.style.display = 'none';
        if (this.routeSummaryCard) this.routeSummaryCard.style.display = 'none';
        if (this.hudInstruction) this.hudInstruction.innerText = 'Standby - Ready for Destination';
        break;

      case 'LOCATION_READY':
        this.updateFlowStep(1, true);
        this.updateFlowStep(2, false);
        if (this.nextTurnCard) this.nextTurnCard.style.display = 'none';
        if (this.telemetryStrip) this.telemetryStrip.style.display = 'none';
        if (this.tripProgressContainer) this.tripProgressContainer.style.display = 'none';
        if (this.routeSummaryCard) this.routeSummaryCard.style.display = 'none';
        break;

      case 'DESTINATION_SELECTED':
        this.updateFlowStep(2, true);
        this.updateFlowStep(3, false);
        if (this.btnGenerateRoute) this.btnGenerateRoute.style.display = 'inline-flex';
        break;

      case 'ROUTE_READY':
        this.updateFlowStep(3, true);
        this.updateFlowStep(4, false);
        if (this.btnStartNav) this.btnStartNav.style.display = 'inline-flex';
        if (this.btnStopNav) this.btnStopNav.style.display = 'none';
        if (this.btnGenerateRoute) this.btnGenerateRoute.style.display = 'inline-flex';
        if (this.nextTurnCard) this.nextTurnCard.style.display = 'flex';
        if (this.telemetryStrip) this.telemetryStrip.style.display = 'grid';
        if (this.tripProgressContainer) this.tripProgressContainer.style.display = 'block';
        if (this.routeSummaryCard) this.routeSummaryCard.style.display = 'flex';
        break;

      case 'NAVIGATING':
        this.updateFlowStep(4, true);
        if (this.btnStartNav) this.btnStartNav.style.display = 'none';
        if (this.btnStopNav) this.btnStopNav.style.display = 'inline-flex';
        if (this.btnGenerateRoute) this.btnGenerateRoute.style.display = 'none';
        if (this.nextTurnCard) this.nextTurnCard.style.display = 'flex';
        if (this.telemetryStrip) this.telemetryStrip.style.display = 'grid';
        if (this.tripProgressContainer) this.tripProgressContainer.style.display = 'block';
        if (this.routeSummaryCard) this.routeSummaryCard.style.display = 'flex';
        break;

      case 'ARRIVED':
        this.updateFlowStep(5, true);
        if (this.btnStartNav) this.btnStartNav.style.display = 'inline-flex';
        if (this.btnStartNav) this.btnStartNav.innerHTML = `<span>🔄 New Trip</span>`;
        if (this.btnStopNav) this.btnStopNav.style.display = 'none';
        if (this.btnGenerateRoute) this.btnGenerateRoute.style.display = 'none';
        if (this.nextTurnCard) this.nextTurnCard.style.display = 'flex';
        break;

      case 'ERROR':
        if (this.btnGenerateRoute) this.btnGenerateRoute.disabled = false;
        break;
    }
  }

  /**
   * 16. Step Flow Indicator Update
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
   * 17. Status Notice Banner System
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

  /**
   * Calculate Bearing between two geographical points (0° to 360°)
   */
  calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
    const x =
      Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
      Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return (brng + 360) % 360;
  }

  /**
   * Normalize relative angle between route bearing and vehicle heading (-180° to +180°)
   */
  calculateRelativeAngle(routeBearing, currentHeading) {
    return ((routeBearing - currentHeading + 540) % 360) - 180;
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
