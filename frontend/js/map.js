/**
 * Google Maps JavaScript API Navigation Controller
 * Turn-by-Turn Rider Assistant - Dept. of IT
 * 
 * Features:
 * - Google Maps JavaScript API with Dark Cockpit HUD Styling
 * - Google Places Autocomplete Destination Search
 * - Google Directions API Driving Route Engine
 * - Geolocation GPS Live Tracking (getCurrentPosition & watchPosition)
 * - Turn-by-Turn Instruction Parser (STRAIGHT, LEFT, RIGHT, SLIGHT_LEFT, SLIGHT_RIGHT, U_TURN, ROUNDABOUT, DESTINATION)
 * - Synchronized with SSD1306 OLED HUD Simulator & Telemetry Gauges
 * - Proximity Destination Arrival Detection (<= 20 meters)
 * - Environment Variable API Key Configuration (.env fallback screen)
 */

class NavigationMap {
  constructor(mapContainerId = 'map') {
    this.mapContainerId = mapContainerId;
    this.map = null;
    this.apiKey = null;
    this.isLoaded = false;
    this.isNavigating = false;
    this.watchId = null;

    // Navigation state
    this.currentLocation = null; // { latitude, longitude }
    this.destination = null;     // { latitude, longitude, name, address }
    this.currentMarker = null;
    this.currentPulseCircle = null;
    this.destMarker = null;
    this.directionsService = null;
    this.directionsRenderer = null;
    this.autocomplete = null;

    // Route & Step tracking
    this.activeRoute = null;
    this.routeSteps = [];
    this.currentStepIndex = 0;
    this.totalSteps = 0;
    this.hasReachedDestination = false;
    this.lastRecalcLocation = null;
    this.lastGpsSpeedKmh = null;

    // DOM Elements
    this.mapWrapper = document.getElementById('map-wrapper');
    this.notConfiguredOverlay = document.getElementById('gmaps-not-configured');
    this.noticeContainer = document.getElementById('map-notice-container');
    this.destInput = document.getElementById('destination-input');
    this.btnCurrentLoc = document.getElementById('btn-use-current-location');
    this.btnSearch = document.getElementById('btn-search-destination');
    this.btnStartNav = document.getElementById('btn-start-navigation');

    this.init();
  }

  /**
   * 1. Bootstrap: Fetch API key and load Google Maps SDK
   */
  async init() {
    this.initEventListeners();

    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      this.apiKey = (data.googleMapsApiKey || '').trim();

      if (!this.apiKey || this.apiKey === 'YOUR_GOOGLE_MAPS_API_KEY') {
        this.showNotConfiguredError();
        return;
      }

      await this.loadGoogleMapsScript(this.apiKey);
      this.initGoogleMap();
    } catch (err) {
      console.warn('[Map] Could not fetch Google Maps API config:', err);
      this.showNotConfiguredError();
    }
  }

  /**
   * Show "GOOGLE MAPS NOT CONFIGURED" when API key is missing
   */
  showNotConfiguredError() {
    if (this.notConfiguredOverlay) {
      this.notConfiguredOverlay.style.display = 'flex';
    }
    this.showNotice('Google Maps API key is not configured. Add your key to .env file and restart server.', 'warning');
  }

  /**
   * Dynamically inject Google Maps JavaScript API with Places and Geometry libraries
   */
  loadGoogleMapsScript(apiKey) {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&loading=async`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        console.log('[Map] Google Maps JavaScript API loaded successfully');
        resolve();
      };
      script.onerror = () => {
        console.error('[Map] Failed to load Google Maps SDK');
        this.showNotice('Google Maps failed to load. Check API key restrictions and network connection.', 'error');
        this.showNotConfiguredError();
        reject(new Error('Google Maps script failed to load'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * 2. Initialize Google Map with Futuristic Dark Theme
   */
  initGoogleMap() {
    if (!window.google || !window.google.maps) return;

    if (this.notConfiguredOverlay) {
      this.notConfiguredOverlay.style.display = 'none';
    }

    const defaultCenter = { lat: 12.9716, lng: 77.5946 }; // Default center

    // Dark/Night HUD Style
    const darkStyle = [
      { elementType: 'geometry', stylers: [{ color: '#0d131f' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#070a10' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
      { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#00f0ff' }] },
      { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
      { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#111c2e' }] },
      { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#38bdf8' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a2538' }] },
      { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#131b28' }] },
      { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
      { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#223554' }] },
      { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#162338' }] },
      { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#38bdf8' }] },
      { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#162235' }] },
      { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#00f0ff' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#070c14' }] },
      { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#38bdf8' }] },
      { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#070a10' }] }
    ];

    const mapElement = document.getElementById(this.mapContainerId);
    this.map = new google.maps.Map(mapElement, {
      center: defaultCenter,
      zoom: 14,
      styles: darkStyle,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true
    });

    this.directionsService = new google.maps.DirectionsService();
    this.directionsRenderer = new google.maps.DirectionsRenderer({
      map: this.map,
      suppressMarkers: true,
      preserveViewport: false,
      polylineOptions: {
        strokeColor: '#00f0ff',
        strokeWeight: 6,
        strokeOpacity: 0.95
      }
    });

    // Initialize Places Autocomplete
    this.initPlacesAutocomplete();

    this.isLoaded = true;

    // Automatically attempt to obtain current location on page load
    this.requestCurrentLocation(false);
  }

  /**
   * 3. Google Places Autocomplete Destination Search
   */
  initPlacesAutocomplete() {
    if (!this.destInput || !window.google || !window.google.maps || !window.google.maps.places) return;

    this.autocomplete = new google.maps.places.Autocomplete(this.destInput, {
      fields: ['geometry', 'name', 'formatted_address']
    });

    if (this.map) {
      this.autocomplete.bindTo('bounds', this.map);
    }

    this.autocomplete.addListener('place_changed', () => {
      const place = this.autocomplete.getPlace();
      if (!place || !place.geometry || !place.geometry.location) {
        this.showNotice('Location not found. Please select a destination from the suggestions.', 'warning');
        return;
      }

      this.setDestination({
        latitude: place.geometry.location.lat(),
        longitude: place.geometry.location.lng(),
        name: place.name || 'Selected Place',
        address: place.formatted_address || ''
      });
    });
  }

  /**
   * Set Destination & Update Destination Marker
   */
  setDestination({ latitude, longitude, name, address }) {
    this.destination = { latitude, longitude, name, address };
    console.log('[Map] Destination set:', this.destination);

    const latLng = new google.maps.LatLng(latitude, longitude);

    // Update Destination Marker (Checkered Red/White Flag)
    if (!this.destMarker) {
      this.destMarker = new google.maps.Marker({
        position: latLng,
        map: this.map,
        title: name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#ef4444',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3
        }
      });
    } else {
      this.destMarker.setPosition(latLng);
      this.destMarker.setTitle(name);
      this.destMarker.setVisible(true);
    }

    // Update Title Badge
    const titleEl = document.getElementById('active-trip-title');
    if (titleEl) {
      titleEl.innerText = `To: ${name}`;
    }

    this.showNotice(`Destination selected: ${name}`, 'info');

    // If current location is already available, automatically calculate route preview
    if (this.currentLocation) {
      this.calculateAndDisplayRoute(false);
    } else {
      this.map.panTo(latLng);
      this.map.setZoom(15);
    }
  }

  /**
   * Search Destination Fallback (if user typed text and clicked Search button)
   */
  handleDestinationSearchButton() {
    const query = (this.destInput?.value || '').trim();
    if (!query) {
      this.showNotice('Please type a destination name or address.', 'warning');
      return;
    }

    if (!window.google || !window.google.maps) {
      this.showNotice('Google Maps is not initialized yet.', 'warning');
      return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: query }, (results, status) => {
      if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
        const result = results[0];
        this.setDestination({
          latitude: result.geometry.location.lat(),
          longitude: result.geometry.location.lng(),
          name: query,
          address: result.formatted_address
        });
      } else {
        this.showNotice(`Could not find location "${query}". Try another address.`, 'error');
      }
    });
  }

  /**
   * 4. Current Location Acquisition
   * Uses navigator.geolocation.getCurrentPosition()
   */
  requestCurrentLocation(isUserInitiated = true) {
    if (!navigator.geolocation) {
      this.showNotice('Geolocation is not supported by your browser.', 'error');
      return;
    }

    if (isUserInitiated) {
      this.showNotice('Requesting current GPS coordinates...', 'info');
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.currentLocation = { latitude: lat, longitude: lng };
        console.log('[Map] Current Location acquired:', this.currentLocation);

        this.updateCurrentLocationMarker(lat, lng, pos.coords.heading || 0);

        if (this.map) {
          this.map.panTo(new google.maps.LatLng(lat, lng));
          this.map.setZoom(16);
        }

        if (isUserInitiated) {
          this.showNotice('Current location updated.', 'info');
        }

        // If destination is already selected, calculate route
        if (this.destination) {
          this.calculateAndDisplayRoute(false);
        }
      },
      (err) => {
        console.warn('[Map] Geolocation error:', err.message);
        if (err.code === 1) { // PERMISSION_DENIED
          this.showNotice('Location permission denied. Please enable location access.', 'error');
        } else if (isUserInitiated) {
          this.showNotice('GPS signal unavailable. Please check device location settings.', 'error');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 2000
      }
    );
  }

  /**
   * Update Cyan Rider Navigation Marker
   */
  updateCurrentLocationMarker(lat, lng, heading = 0) {
    if (!this.map || !window.google) return;

    const latLng = new google.maps.LatLng(lat, lng);

    const cyanArrowIcon = {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 6,
      fillColor: '#00f0ff',
      fillOpacity: 1,
      strokeColor: '#0f172a',
      strokeWeight: 2,
      rotation: heading || 0,
      anchor: new google.maps.Point(0, 2.5)
    };

    if (!this.currentMarker) {
      this.currentMarker = new google.maps.Marker({
        position: latLng,
        map: this.map,
        title: 'Current Position',
        icon: cyanArrowIcon,
        zIndex: 1000
      });

      this.currentPulseCircle = new google.maps.Circle({
        map: this.map,
        center: latLng,
        radius: 20,
        fillColor: '#00f0ff',
        fillOpacity: 0.2,
        strokeColor: '#00f0ff',
        strokeOpacity: 0.6,
        strokeWeight: 1.5
      });
    } else {
      this.currentMarker.setPosition(latLng);
      this.currentMarker.setIcon(cyanArrowIcon);
      if (this.currentPulseCircle) {
        this.currentPulseCircle.setCenter(latLng);
      }
    }
  }

  /**
   * 5. Calculate and Display Driving Route using Google Directions API
   */
  calculateAndDisplayRoute(startActiveNav = false) {
    if (!this.currentLocation || !this.destination) {
      if (!this.currentLocation) this.showNotice('Waiting for current location...', 'warning');
      else if (!this.destination) this.showNotice('Select a destination first.', 'warning');
      return;
    }

    if (!this.directionsService || !this.directionsRenderer) {
      this.showNotice('Navigation service not ready.', 'error');
      return;
    }

    this.showNotice('Calculating optimal driving route...', 'info');

    const request = {
      origin: new google.maps.LatLng(this.currentLocation.latitude, this.currentLocation.longitude),
      destination: new google.maps.LatLng(this.destination.latitude, this.destination.longitude),
      travelMode: google.maps.TravelMode.DRIVING
    };

    this.directionsService.route(request, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK && result.routes && result.routes.length > 0) {
        this.activeRoute = result.routes[0];
        this.directionsRenderer.setDirections(result);

        const leg = this.activeRoute.legs[0];
        console.log(`[Map] Route calculated: ${leg.distance.text}, ${leg.duration.text}, ${leg.steps.length} steps`);

        // Parse turn-by-turn steps
        this.parseRouteSteps(leg);

        // Fit route bounds nicely on map
        if (this.activeRoute.bounds && this.map) {
          this.map.fitBounds(this.activeRoute.bounds);
        }

        // Update HUD Telemetry
        const destDistEl = document.getElementById('metric-dest-dist');
        if (destDistEl) destDistEl.innerText = leg.distance.text;

        this.lastRecalcLocation = { ...this.currentLocation };
        this.hasReachedDestination = false;

        // If user pressed START NAVIGATION, begin live GPS tracking
        if (startActiveNav) {
          this.beginActiveNavigation();
        } else {
          // Preview first turn
          if (this.routeSteps.length > 0) {
            this.updateHudWithStep(this.routeSteps[0], 0);
          }
        }

        this.showNotice(`Route ready: ${leg.distance.text} (${leg.duration.text})`, 'info');
      } else {
        console.error('[Map] Directions request failed:', status);
        this.showNotice(`Route calculation failed (${status}). Please try another destination.`, 'error');
      }
    });
  }

  /**
   * 6. Parse Google Directions Steps into Standard Maneuver States
   * Directions: STRAIGHT, LEFT, RIGHT, SLIGHT_LEFT, SLIGHT_RIGHT, U_TURN, ROUNDABOUT, DESTINATION
   */
  parseRouteSteps(leg) {
    this.routeSteps = [];
    const steps = leg.steps;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const parsed = this.mapStepToDirectionState(step);
      parsed.stepNumber = i + 1;
      parsed.totalSteps = steps.length;
      this.routeSteps.push(parsed);
    }

    // Add final Destination point
    this.routeSteps.push({
      state: 'DESTINATION',
      maneuver: 'arrive',
      instruction: `Arrive at ${this.destination.name}`,
      distanceM: 0,
      formattedDistance: '0 m',
      stepNumber: steps.length + 1,
      totalSteps: steps.length + 1,
      startLocation: {
        lat: leg.end_location.lat(),
        lng: leg.end_location.lng()
      }
    });

    this.currentStepIndex = 0;
    this.totalSteps = this.routeSteps.length;
  }

  /**
   * Convert Google Maps HTML Step to clean instruction & standard direction state
   */
  mapStepToDirectionState(step) {
    const rawHtml = step.instructions || '';
    const cleanText = rawHtml.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    const lower = cleanText.toLowerCase();
    const maneuver = (step.maneuver || '').toLowerCase();

    let state = 'STRAIGHT';
    let cleanManeuver = 'straight';

    if (maneuver.includes('u-turn') || lower.includes('u-turn') || lower.includes('make a u-turn')) {
      state = 'U_TURN';
      cleanManeuver = 'uturn';
    } else if (maneuver.includes('roundabout') || lower.includes('roundabout') || lower.includes('rotary')) {
      state = 'ROUNDABOUT';
      cleanManeuver = 'roundabout';
    } else if (maneuver.includes('sharp-left') || lower.includes('sharp left')) {
      state = 'LEFT';
      cleanManeuver = 'turn-sharp-left';
    } else if (maneuver.includes('sharp-right') || lower.includes('sharp right')) {
      state = 'RIGHT';
      cleanManeuver = 'turn-sharp-right';
    } else if (maneuver.includes('slight-left') || lower.includes('slight left') || lower.includes('bear left') || lower.includes('fork left')) {
      state = 'SLIGHT_LEFT';
      cleanManeuver = 'turn-slight-left';
    } else if (maneuver.includes('slight-right') || lower.includes('slight right') || lower.includes('bear right') || lower.includes('fork right')) {
      state = 'SLIGHT_RIGHT';
      cleanManeuver = 'turn-slight-right';
    } else if (maneuver.includes('turn-left') || lower.includes('turn left') || lower.includes('keep left')) {
      state = 'LEFT';
      cleanManeuver = 'turn-left';
    } else if (maneuver.includes('turn-right') || lower.includes('turn right') || lower.includes('keep right')) {
      state = 'RIGHT';
      cleanManeuver = 'turn-right';
    } else if (lower.includes('destination') || lower.includes('arrive') || lower.includes('reached')) {
      state = 'DESTINATION';
      cleanManeuver = 'arrive';
    }

    return {
      state,
      maneuver: cleanManeuver,
      instruction: cleanText || 'Continue Straight',
      distanceM: step.distance ? step.distance.value : 0,
      formattedDistance: step.distance ? step.distance.text : '0 m',
      durationS: step.duration ? step.duration.value : 0,
      startLocation: {
        lat: step.start_location.lat(),
        lng: step.start_location.lng()
      },
      endLocation: {
        lat: step.end_location.lat(),
        lng: step.end_location.lng()
      }
    };
  }

  /**
   * 7. Start / Stop Active Turn-by-Turn Navigation
   */
  toggleNavigation() {
    if (this.isNavigating) {
      this.stopNavigation();
    } else {
      this.startNavigation();
    }
  }

  startNavigation() {
    if (!this.currentLocation) {
      this.showNotice('Waiting for current location...', 'warning');
      this.requestCurrentLocation(true);
      return;
    }

    if (!this.destination) {
      this.showNotice('Select a destination first.', 'warning');
      if (this.destInput) this.destInput.focus();
      return;
    }

    // If route is not calculated yet, calculate then begin
    if (!this.activeRoute || this.routeSteps.length === 0) {
      this.calculateAndDisplayRoute(true);
      return;
    }

    this.beginActiveNavigation();
  }

  beginActiveNavigation() {
    this.isNavigating = true;
    this.hasReachedDestination = false;

    // Update Start Navigation button
    if (this.btnStartNav) {
      this.btnStartNav.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="6" y="6" width="12" height="12"/>
        </svg>
        STOP NAVIGATION
      `;
      this.btnStartNav.className = 'btn btn-danger btn-large btn-start-nav';
    }

    this.showNotice('Navigation active. GPS tracking live.', 'info');

    // Configure simulation engine with Google route so Auto Ride also works seamlessly
    if (window.simulator && this.activeRoute && this.activeRoute.overview_path) {
      const gPoints = this.activeRoute.overview_path.map((pt, i) => ({
        lat: pt.lat(),
        lng: pt.lng(),
        instruction: this.routeSteps[Math.min(i, this.routeSteps.length - 1)]?.instruction || 'Follow Route',
        maneuver_type: this.routeSteps[Math.min(i, this.routeSteps.length - 1)]?.maneuver || 'straight',
        distance_to_next_turn: 100
      }));
      window.simulator.setRoute(gPoints);
    }

    // Start Live GPS Tracking via watchPosition()
    this.startGpsWatch();

    // Render initial step to HUD & OLED
    if (this.routeSteps.length > 0) {
      this.updateHudWithStep(this.routeSteps[0], 0);
    }
  }

  stopNavigation() {
    this.isNavigating = false;
    this.stopGpsWatch();

    if (this.btnStartNav) {
      this.btnStartNav.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        START NAVIGATION
      `;
      this.btnStartNav.className = 'btn btn-primary btn-large btn-start-nav';
    }

    // Reset speed
    const speedEl = document.getElementById('metric-speed');
    if (speedEl) speedEl.innerText = '--';

    if (!this.hasReachedDestination && window.oledDisplay) {
      window.oledDisplay.renderStandby('ESP32-C3', 'Navigation Paused');
    }

    this.showNotice('Navigation stopped.', 'info');
  }

  /**
   * 8. GPS Live Tracking via navigator.geolocation.watchPosition()
   */
  startGpsWatch() {
    if (!navigator.geolocation) return;
    this.stopGpsWatch();

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onGpsPositionUpdate(pos),
      (err) => console.warn('[Map] GPS Watch error:', err.message),
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 8000
      }
    );
  }

  stopGpsWatch() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * GPS Position Update Handler
   */
  onGpsPositionUpdate(pos) {
    if (!this.isNavigating) return;

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const heading = pos.coords.heading || 0;
    const speedMs = pos.coords.speed; // speed in meters/second or null

    this.currentLocation = { latitude: lat, longitude: lng };

    // Update Speed: Convert m/s to km/h, safely display '-- km/h' if unavailable
    let speedKmh = null;
    if (speedMs !== null && speedMs !== undefined && !isNaN(speedMs) && speedMs >= 0) {
      speedKmh = Math.round(speedMs * 3.6);
    }
    this.lastGpsSpeedKmh = speedKmh;

    // Update Speedometer element
    const speedEl = document.getElementById('metric-speed');
    if (speedEl) {
      speedEl.innerText = speedKmh !== null ? speedKmh : '--';
    }

    // Update Heading element
    const headingEl = document.getElementById('metric-heading');
    if (headingEl) {
      headingEl.innerText = heading ? `${Math.round(heading)}°` : '--°';
    }

    // Update Cyan Navigation Marker on Google Map
    this.updateCurrentLocationMarker(lat, lng, heading);

    // Pan map to follow rider
    if (this.map) {
      this.map.panTo(new google.maps.LatLng(lat, lng));
    }

    // Check Destination Proximity (<= 20 meters)
    if (this.destination && !this.hasReachedDestination) {
      const distToDest = this.calculateDistanceMeters(lat, lng, this.destination.latitude, this.destination.longitude);
      if (distToDest <= 20) {
        this.handleDestinationReached();
        return;
      }
    }

    // Update Turn-by-Turn Progress
    this.updateActiveStepProgress(lat, lng);

    // Check if off-route (> 70 meters from expected path) -> Recalculate route
    if (this.lastRecalcLocation) {
      const movedFromLast = this.calculateDistanceMeters(lat, lng, this.lastRecalcLocation.lat, this.lastRecalcLocation.lng);
      if (movedFromLast > 150) {
        // Trigger soft recalculate without freezing UI
        this.lastRecalcLocation = { lat, lng };
        this.recalculateRouteIfOffPath(lat, lng);
      }
    }

    // Broadcast location to backend so ESP32 & DB logs stay updated
    this.syncLocationWithBackend(lat, lng, speedKmh || 0, heading);
  }

  /**
   * Advance turn step when rider reaches within 25m of current step waypoint
   */
  updateActiveStepProgress(lat, lng) {
    if (!this.routeSteps || this.routeSteps.length === 0) return;

    const currentStep = this.routeSteps[this.currentStepIndex];
    if (!currentStep) return;

    // Distance to turn waypoint
    const targetLoc = currentStep.endLocation || currentStep.startLocation;
    const distToTurn = Math.round(this.calculateDistanceMeters(lat, lng, targetLoc.lat, targetLoc.lng));

    // If within 25m of turn waypoint and not last step, advance to next step
    if (distToTurn <= 25 && this.currentStepIndex < this.routeSteps.length - 1) {
      this.currentStepIndex++;
      console.log(`[Map] Advanced to step ${this.currentStepIndex + 1}/${this.totalSteps}`);
      if (window.socketClient) {
        window.socketClient.playTurnChime();
      }
    }

    const activeStep = this.routeSteps[this.currentStepIndex];
    this.updateHudWithStep(activeStep, distToTurn);
  }

  /**
   * Update Dashboard HUD & OLED Simulator with Active Navigation Step
   */
  updateHudWithStep(step, distToTurnM) {
    if (!step) return;

    const formattedDist = distToTurnM >= 1000 
      ? `${(distToTurnM / 1000).toFixed(1)} km` 
      : `${distToTurnM} m`;

    // 1. HUD Current Instruction banner
    const hudInstEl = document.getElementById('hud-current-instruction');
    if (hudInstEl) hudInstEl.innerText = step.instruction;

    // 2. Next Turn Distance
    const turnDistEl = document.getElementById('metric-turn-dist');
    if (turnDistEl) turnDistEl.innerText = formattedDist;

    // 3. Progress percentage
    const progressPct = this.totalSteps > 0 
      ? Math.min(100, Math.round((this.currentStepIndex / this.totalSteps) * 100)) 
      : 0;
    const progFillEl = document.getElementById('trip-progress-fill');
    const progPctEl = document.getElementById('trip-progress-pct');
    if (progFillEl) progFillEl.style.width = `${progressPct}%`;
    if (progPctEl) progPctEl.innerText = `${progressPct}%`;

    // 4. Update OLED Display Simulator
    if (window.oledDisplay) {
      window.oledDisplay.renderInstruction({
        state: step.state,
        maneuver: step.maneuver,
        instruction: step.instruction,
        distance_to_turn_m: distToTurnM,
        formatted_distance: formattedDist,
        current_step: step.stepNumber || (this.currentStepIndex + 1),
        total_steps: step.totalSteps || this.totalSteps,
        progress_pct: progressPct
      }, this.lastGpsSpeedKmh);
    }
  }

  /**
   * 9. Destination Reached Handler (<= 20 meters)
   */
  handleDestinationReached() {
    if (this.hasReachedDestination) return; // Prevent repeated triggers
    this.hasReachedDestination = true;
    this.isNavigating = false;
    this.stopGpsWatch();

    console.log('[Map] Destination reached!');

    // Update HUD
    const hudInstEl = document.getElementById('hud-current-instruction');
    if (hudInstEl) hudInstEl.innerText = 'DESTINATION REACHED!';

    const turnDistEl = document.getElementById('metric-turn-dist');
    if (turnDistEl) turnDistEl.innerText = '0 m';

    const progFillEl = document.getElementById('trip-progress-fill');
    const progPctEl = document.getElementById('trip-progress-pct');
    if (progFillEl) progFillEl.style.width = '100%';
    if (progPctEl) progPctEl.innerText = '100%';

    // Update Start Nav button
    if (this.btnStartNav) {
      this.btnStartNav.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        START NAVIGATION
      `;
      this.btnStartNav.className = 'btn btn-primary btn-large btn-start-nav';
    }

    // Update OLED Simulator
    if (window.oledDisplay) {
      window.oledDisplay.renderDestinationReached();
    }

    // Play celebration toast
    this.showNotice('🎉 DESTINATION REACHED! Safe travels.', 'info');
    if (window.socketClient) {
      window.socketClient.showToast('🎉 DESTINATION REACHED!', 'success');
    }
  }

  /**
   * Check off-path deviation
   */
  recalculateRouteIfOffPath(lat, lng) {
    if (!this.directionsService || !this.destination || !this.isNavigating) return;

    const request = {
      origin: new google.maps.LatLng(lat, lng),
      destination: new google.maps.LatLng(this.destination.latitude, this.destination.longitude),
      travelMode: google.maps.TravelMode.DRIVING
    };

    this.directionsService.route(request, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK && result.routes && result.routes[0]) {
        console.log('[Map] Route updated with current position');
        this.activeRoute = result.routes[0];
        this.directionsRenderer.setDirections(result);
        this.parseRouteSteps(this.activeRoute.legs[0]);
      }
    });
  }

  /**
   * Synchronize position with backend API for ESP32 and database breadcrumb
   */
  async syncLocationWithBackend(lat, lng, speed, heading) {
    try {
      await fetch('/api/devices/esp32-c3-01/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, speed, heading, battery: 98 })
      });
    } catch (e) {
      // Ignore network hiccup
    }
  }

  /**
   * Draw Route compatibility method (for preset routes and simulation)
   */
  drawRoute(points) {
    if (!points || points.length === 0) return;
    if (!this.map || !window.google) return;

    const startPt = points[0];
    const endPt = points[points.length - 1];

    this.currentLocation = { latitude: startPt.lat, longitude: startPt.lng };
    this.setDestination({
      latitude: endPt.lat,
      longitude: endPt.lng,
      name: endPt.instruction || 'Destination',
      address: ''
    });
  }

  /**
   * Update rider position compatibility method (for simulator script or WebSocket)
   */
  updateRiderPosition(lat, lng, heading = 0) {
    this.updateCurrentLocationMarker(lat, lng, heading);
    if (this.map && !this.isNavigating) {
      this.map.panTo(new google.maps.LatLng(lat, lng));
    }
  }

  /**
   * Haversine formula distance in meters
   */
  calculateDistanceMeters(lat1, lon1, lat2, lon2) {
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
   * UI Notification Notice helper
   */
  showNotice(message, type = 'info') {
    if (!this.noticeContainer) return;
    this.noticeContainer.className = `map-notice-container notice-${type}`;
    this.noticeContainer.innerText = message;
    this.noticeContainer.style.display = 'block';

    if (type !== 'error') {
      setTimeout(() => {
        if (this.noticeContainer) this.noticeContainer.style.display = 'none';
      }, 5000);
    }
  }

  /**
   * DOM Listeners
   */
  initEventListeners() {
    // 1. "Use Current Location" button
    if (this.btnCurrentLoc) {
      this.btnCurrentLoc.addEventListener('click', () => {
        this.requestCurrentLocation(true);
      });
    }

    // 2. "Search Destination" button
    if (this.btnSearch) {
      this.btnSearch.addEventListener('click', () => {
        this.handleDestinationSearchButton();
      });
    }

    // 3. "START NAVIGATION" button
    if (this.btnStartNav) {
      this.btnStartNav.addEventListener('click', () => {
        this.toggleNavigation();
      });
    }

    // 4. Enter key in destination input
    if (this.destInput) {
      this.destInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleDestinationSearchButton();
        }
      });
    }
  }
}

window.NavigationMap = NavigationMap;
