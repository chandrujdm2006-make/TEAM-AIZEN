/**
 * Main Application Orchestrator
 * Turn-by-Turn Rider Assistant - Dept. of IT
 */

class App {
  constructor() {
    this.currentTrip = null;
    this.routePoints = [];

    this.init();
  }

  async init() {
    console.log('[App] Initializing Turn-by-Turn Rider Assistant...');

    // 1. Initialize Subsystems
    window.navMap = new NavigationMap('map');
    window.oledDisplay = new OledDisplay('oled-screen');
    window.socketClient = new SocketClient();
    window.simulator = new RideSimulator();
    window.aiAssistant = new AiNavigationAssistant();

    // 2. Setup DOM Listeners & Navigation Tabs
    this.initModeSelector();
    this.initTabs();
    this.initAudioToggle();
    this.initTripForms();
    this.initEmergencyBannerDismiss();

    // 3. Load Initial Data
    await this.loadActiveOrLatestTrip();
    await this.loadTripHistory();
    await this.loadEmergencyLogs();
  }

  initModeSelector() {
    const btnSimple = document.getElementById('btn-mode-simple');
    const btnAdvanced = document.getElementById('btn-mode-advanced');
    if (!btnSimple || !btnAdvanced) return;

    btnSimple.addEventListener('click', () => {
      document.body.classList.remove('mode-advanced');
      document.body.classList.add('mode-simple');
      btnSimple.classList.add('active');
      btnAdvanced.classList.remove('active');
      if (window.navMap && window.navMap.map) {
        setTimeout(() => window.navMap.map.invalidateSize(), 150);
      }
    });

    btnAdvanced.addEventListener('click', () => {
      document.body.classList.remove('mode-simple');
      document.body.classList.add('mode-advanced');
      btnAdvanced.classList.add('active');
      btnSimple.classList.remove('active');
      if (window.navMap && window.navMap.map) {
        setTimeout(() => window.navMap.map.invalidateSize(), 150);
      }
    });

    // Default to SIMPLE mode as requested by user
    document.body.classList.add('mode-simple');
  }

  initTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });
  }

  switchTab(tabId) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    const activeBtn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
    const activePane = document.getElementById(tabId);

    if (activeBtn) activeBtn.classList.add('active');
    if (activePane) activePane.classList.add('active');

    // Trigger Leaflet map resize on returning to dashboard tab
    if (tabId === 'tab-dashboard' && window.navMap && window.navMap.map) {
      setTimeout(() => {
        window.navMap.map.invalidateSize();
        if (window.navMap.currentLocation) {
          window.navMap.map.panTo([window.navMap.currentLocation.lat, window.navMap.currentLocation.lng]);
        }
      }, 150);
    }
  }

  initAudioToggle() {
    const audioBtn = document.getElementById('audio-toggle-btn');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        if (window.socketClient) {
          window.socketClient.audioEnabled = !window.socketClient.audioEnabled;
          audioBtn.style.color = window.socketClient.audioEnabled ? 'var(--accent-cyan)' : 'var(--text-muted)';
          window.socketClient.showToast(window.socketClient.audioEnabled ? 'Audio alerts enabled' : 'Audio alerts muted', 'info');
        }
      });
    }
  }

  initEmergencyBannerDismiss() {
    const dismissBtn = document.getElementById('btn-dismiss-emergency');
    const banner = document.getElementById('emergency-alert-banner');
    if (dismissBtn && banner) {
      dismissBtn.addEventListener('click', () => {
        banner.classList.remove('active');
        if (window.oledDisplay) {
          window.oledDisplay.clearSos();
        }
      });
    }
  }

  initTripForms() {
    // Preset cards
    document.querySelectorAll('.preset-card').forEach(card => {
      card.addEventListener('click', async () => {
        const presetKey = card.getAttribute('data-preset');
        await this.startTripWithPreset(presetKey);
      });
    });

    // Custom form
    const customForm = document.getElementById('custom-trip-form');
    if (customForm) {
      customForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const origin = document.getElementById('input-origin').value;
        const destination = document.getElementById('input-destination').value;
        const oLat = parseFloat(document.getElementById('input-olat').value) || null;
        const oLng = parseFloat(document.getElementById('input-olng').value) || null;
        const dLat = parseFloat(document.getElementById('input-dlat').value) || null;
        const dLng = parseFloat(document.getElementById('input-dlng').value) || null;

        await this.startCustomTrip({
          origin,
          destination,
          originLat: oLat,
          originLng: oLng,
          destLat: dLat,
          destLng: dLng
        });
      });
    }
  }

  async loadActiveOrLatestTrip() {
    try {
      const res = await fetch('/api/devices/esp32-c3-01/status');
      const data = await res.json();

      if (data.activeTrip && data.activeTrip.status === 'in_progress') {
        const pointsRes = await fetch(`/api/trips/${data.activeTrip.id}`);
        const pointsData = await pointsRes.json();
        this.setActiveTripUI(data.activeTrip, pointsData.route_points);
        if (data.nextInstruction) {
          window.oledDisplay.renderInstruction(data.nextInstruction, data.latestLocation?.speed_kmh || 0);
          window.socketClient.updateDashboardMetrics(data.nextInstruction);
        }
      } else {
        console.log('[App] Full India map ready for navigation search.');
      }
    } catch (err) {
      console.warn('[App] Could not load active device status:', err.message);
    }
  }

  async startDefaultTrip() {
    console.log('[App] Initializing default demo trip...');
    await this.startTripWithPreset('campus_to_techpark');
  }

  async startTripWithPreset(presetKey) {
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mockPreset: presetKey,
          deviceId: 'esp32-c3-01'
        })
      });
      const data = await res.json();
      if (data.success) {
        this.setActiveTripUI(data.trip, data.route_points);
        this.switchTab('tab-dashboard');
      }
    } catch (err) {
      console.error('[App] Error creating preset trip:', err);
    }
  }

  async startCustomTrip(payload) {
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          deviceId: 'esp32-c3-01'
        })
      });
      const data = await res.json();
      if (data.success) {
        this.setActiveTripUI(data.trip, data.route_points);
        this.switchTab('tab-dashboard');
      }
    } catch (err) {
      console.error('[App] Error creating custom trip:', err);
    }
  }

  setActiveTripUI(trip, points) {
    this.currentTrip = trip;
    this.routePoints = points || [];

    // Update map start and destination
    if (window.navMap) {
      const origLat = trip.origin_lat || trip.originLat;
      const origLng = trip.origin_lng || trip.originLng;
      const dLat = trip.dest_lat || trip.destLat;
      const dLng = trip.dest_lng || trip.destLng;

      if (origLat && origLng) {
        window.navMap.setStartLocation({
          lat: origLat,
          lng: origLng,
          name: trip.origin
        });
        if (window.navMap.startInput) window.navMap.startInput.value = trip.origin;
      }

      if (dLat && dLng) {
        window.navMap.setDestination({
          lat: dLat,
          lng: dLng,
          name: trip.destination
        });
        if (window.navMap.destInput) window.navMap.destInput.value = trip.destination;
      }

      window.navMap.drawRoute(this.routePoints);
      window.navMap.routeSteps = this.routePoints;
      window.navMap.activeRoute = {
        totalDistanceM: trip.total_distance_m || trip.totalDistanceM,
        totalDurationS: trip.total_duration_s || trip.totalDurationS
      };

      if (this.routePoints.length > 0) {
        window.navMap.updateNextTurnCard(this.routePoints[0], this.routePoints[0].distance_to_next_turn || 150);
      }
    }

    // Configure simulator
    if (window.simulator) {
      window.simulator.setRoute(this.routePoints);
    }

    // Update Header badges
    const titleEl = document.getElementById('active-trip-title');
    if (titleEl) {
      titleEl.innerText = `${trip.origin} → ${trip.destination}`;
    }

    // Telemetry distance & ETA
    const totalDist = trip.total_distance_m || trip.totalDistanceM;
    if (totalDist) {
      const distEl = document.getElementById('metric-dest-dist');
      if (distEl) distEl.innerText = (totalDist / 1000).toFixed(1) + ' km';
    }

    // OLED display preview
    if (this.routePoints.length > 0 && window.oledDisplay) {
      window.oledDisplay.renderInstruction({
        instruction: this.routePoints[0].instruction,
        maneuver: this.routePoints[0].maneuver_type || 'depart',
        distance_to_turn_m: this.routePoints[0].distance_to_next_turn || 250,
        formatted_distance: `${this.routePoints[0].distance_to_next_turn || 250} m`,
        progress_pct: 0,
        current_step: 1,
        total_steps: this.routePoints.length
      }, 0);
    }

    // AI Copilot notification
    if (window.aiAssistant) {
      window.aiAssistant.onRouteCalculated({
        origin: trip.origin,
        destination: trip.destination,
        formattedDistance: totalDist ? (totalDist / 1000).toFixed(1) + ' km' : '--',
        formattedDuration: trip.total_duration_s ? Math.round(trip.total_duration_s / 60) + ' min' : '--'
      });
    }
  }

  async loadTripHistory() {
    try {
      const res = await fetch('/api/trips');
      const data = await res.json();
      const tbody = document.getElementById('trip-history-tbody');
      if (!tbody) return;

      if (!data.trips || data.trips.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;">No trips logged in database yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.trips.map(t => {
        const distKm = (t.total_distance_m / 1000).toFixed(1);
        const statusBadge = t.status === 'in_progress'
          ? `<span class="badge badge-in-progress">In Progress</span>`
          : t.status === 'completed'
          ? `<span class="badge badge-completed">Completed</span>`
          : `<span class="badge badge-resolved">${t.status}</span>`;

        return `
          <tr>
            <td>#${t.id}</td>
            <td><strong>${t.origin}</strong></td>
            <td><strong>${t.destination}</strong></td>
            <td>${distKm} km</td>
            <td>${t.started_at || 'Just now'}</td>
            <td>${statusBadge}</td>
            <td>
              <button class="btn btn-secondary" style="padding:4px 10px;font-size:0.75rem;" onclick="app.viewPastTrip(${t.id})">
                Load Route
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('[App] Error loading trip history:', err);
    }
  }

  async viewPastTrip(tripId) {
    try {
      const res = await fetch(`/api/trips/${tripId}`);
      const data = await res.json();
      if (data.success) {
        this.setActiveTripUI(data.trip, data.route_points);
        this.switchTab('tab-dashboard');
        window.socketClient.showToast(`Loaded Trip #${tripId} onto map`, 'info');
      }
    } catch (err) {
      console.error('[App] Error viewing past trip:', err);
    }
  }

  async loadEmergencyLogs() {
    try {
      const res = await fetch('/api/emergency-events');
      const data = await res.json();
      const tbody = document.getElementById('emergency-log-tbody');
      if (!tbody) return;

      if (!data.events || data.events.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;">No emergency events recorded. Safe travels!</td></tr>`;
        return;
      }

      tbody.innerHTML = data.events.map(e => {
        const gmapsLink = `https://maps.google.com/?q=${e.lat},${e.lng}`;
        const statusBadge = e.resolved === 1
          ? `<span class="badge badge-resolved">Resolved</span>`
          : `<span class="badge badge-emergency">Active SOS</span>`;

        const actionBtn = e.resolved === 1
          ? `<span style="font-size:0.75rem;color:var(--text-muted);">Handled</span>`
          : `<button class="btn btn-success" style="padding:4px 10px;font-size:0.75rem;" onclick="app.resolveEmergency(${e.id})">Resolve</button>`;

        return `
          <tr>
            <td>#${e.id}</td>
            <td>${e.triggered_at}</td>
            <td>${e.device_id}</td>
            <td>
              <a href="${gmapsLink}" target="_blank" style="color:var(--accent-cyan);text-decoration:none;font-family:var(--font-mono);">
                📍 ${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}
              </a>
            </td>
            <td>${statusBadge}</td>
            <td>${actionBtn}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('[App] Error loading emergency events:', err);
    }
  }

  async resolveEmergency(eventId) {
    try {
      const res = await fetch(`/api/emergency-events/${eventId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Resolved by reviewer from web console' })
      });
      const data = await res.json();
      if (data.success) {
        window.socketClient.showToast(`Emergency incident #${eventId} marked resolved`, 'success');
        await this.loadEmergencyLogs();
      }
    } catch (err) {
      console.error('[App] Error resolving emergency:', err);
    }
  }
}

// Bootstrap once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
