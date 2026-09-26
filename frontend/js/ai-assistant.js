/**
 * AI Navigation Assistant Frontend Controller
 * Turn-by-Turn Rider Assistant - Dept. of IT
 * 
 * Manages:
 * - Real-time conversational guidance speech bubble
 * - AI Quick Action triggers (Where am I?, Next turn, Distance left, Explain route, Find nearby)
 * - Natural language input handling ("Take me to Chennai airport", "Where am I?", etc.)
 * - Text-to-speech voice announcements (optional, rider-friendly)
 * - Synchronization with backend /api/ai/navigation-guide and /api/ai/chat
 */

class AiNavigationAssistant {
  constructor() {
    this.speechBubble = document.getElementById('ai-speech-bubble');
    this.chatForm = document.getElementById('ai-chat-form');
    this.chatInput = document.getElementById('ai-chat-input');
    this.quickActionBtns = document.querySelectorAll('.ai-quick-btn');

    this.navState = {
      currentLocation: null,
      destination: null,
      nextTurn: null,
      distanceToTurn: null,
      remainingDistance: null,
      estimatedTime: null,
      speed: null,
      maneuver: null,
      street: null,
      status: 'standby'
    };

    this.lastSpokenInstruction = null;
    this.voiceSynth = window.speechSynthesis || null;
    this.voiceEnabled = true;

    this.init();
  }

  init() {
    this.initQuickActions();
    this.initChatForm();
    console.log('[AI Assistant] AI Navigation Guide Copilot initialized');
  }

  initQuickActions() {
    this.quickActionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        this.handleQuickAction(action);
      });
    });
  }

  initChatForm() {
    if (!this.chatForm) return;

    this.chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = (this.chatInput?.value || '').trim();
      if (!message) return;

      this.chatInput.value = '';
      await this.askAi(message);
    });
  }

  async handleQuickAction(action) {
    let query = '';
    switch (action) {
      case 'where_am_i':
        query = 'Where am I right now?';
        break;
      case 'next_turn':
        query = 'What is my next turn?';
        break;
      case 'how_far':
        query = 'How far is left to my destination?';
        break;
      case 'explain_route':
        query = 'Explain my route and major turns';
        break;
      case 'find_nearby':
        query = 'Find nearby emergency hospital or petrol pump';
        break;
      default:
        query = action;
    }

    await this.askAi(query);
  }

  /**
   * Send natural language query to backend AI endpoint
   */
  async askAi(userQuery) {
    this.updateSpeechBubble(`Thinking... "${userQuery}"`);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userQuery,
          navigationState: this.navState
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'AI service error');
      }

      this.updateSpeechBubble(data.reply);
      this.speakText(data.reply);

      // Execute AI Actions if returned
      if (data.action === 'set_destination_query' && data.data?.destinationQuery) {
        const target = data.data.destinationQuery;
        if (window.navMap) {
          window.navMap.executeGeocodeSearch(target, window.navMap.destSearchResults, (item) => {
            window.navMap.setDestination(item);
            if (window.navMap.destInput) window.navMap.destInput.value = item.name;
            window.navMap.destSearchResults.style.display = 'none';
            // Auto generate route
            setTimeout(() => {
              window.navMap.calculateAndDisplayRoute();
            }, 600);
          });
        }
      } else if (data.action === 'set_route_pair' && data.data?.originQuery && data.data?.destQuery) {
        // Handle "from Coimbatore to Ooty"
        if (window.navMap) {
          window.navMap.executeGeocodeSearch(data.data.originQuery, window.navMap.startSearchResults, (origItem) => {
            window.navMap.setStartLocation(origItem);
            if (window.navMap.startInput) window.navMap.startInput.value = origItem.name;
            window.navMap.startSearchResults.style.display = 'none';

            window.navMap.executeGeocodeSearch(data.data.destQuery, window.navMap.destSearchResults, (destItem) => {
              window.navMap.setDestination(destItem);
              if (window.navMap.destInput) window.navMap.destInput.value = destItem.name;
              window.navMap.destSearchResults.style.display = 'none';

              setTimeout(() => {
                window.navMap.calculateAndDisplayRoute();
              }, 600);
            });
          });
        }
      } else if (data.action === 'find_nearby' && window.navMap && window.navMap.currentLocation) {
        const category = data.data?.category || 'amenity';
        this.searchNearbyPois(category, window.navMap.currentLocation);
      }

    } catch (err) {
      console.warn('[AI Assistant] Error contacting AI endpoint:', err.message);
      // Deterministic client fallback
      this.generateLocalResponse(userQuery);
    }
  }

  generateLocalResponse(query) {
    const q = query.toLowerCase();
    if (q.includes('where am i')) {
      const loc = this.navState.currentLocation?.name || 'your current GPS coordinates in India';
      const reply = `You are currently near ${loc}.`;
      this.updateSpeechBubble(reply);
      this.speakText(reply);
    } else if (q.includes('next turn')) {
      const next = this.navState.nextTurn || 'Continue straight';
      const dist = this.navState.distanceToTurn ? `${this.navState.distanceToTurn} m` : '';
      const reply = `Your next turn is: ${next} in ${dist}.`;
      this.updateSpeechBubble(reply);
      this.speakText(reply);
    } else if (q.includes('how far')) {
      const rem = this.navState.remainingDistance ? `${(this.navState.remainingDistance / 1000).toFixed(1)} km` : 'calculating';
      const eta = this.navState.estimatedTime || '';
      const reply = `You have approximately ${rem} remaining to your destination. ETA: ${eta}.`;
      this.updateSpeechBubble(reply);
      this.speakText(reply);
    } else {
      const reply = `Route is synchronized with your OLED HUD. Safe riding!`;
      this.updateSpeechBubble(reply);
    }
  }

  /**
   * Search nearby POIs (hospital, fuel, food) using OpenStreetMap Overpass/Nominatim
   */
  async searchNearbyPois(category, location) {
    this.updateSpeechBubble(`Locating nearest ${category} around you...`);
    try {
      const res = await fetch(`/api/navigation/search?q=${encodeURIComponent(category + ' near ' + (location.name || 'Coimbatore'))}`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const first = data.results[0];
        const reply = `Found nearest ${category}: "${first.name}" at ${first.address.split(',').slice(0, 2).join(',')}. Would you like to navigate there?`;
        this.updateSpeechBubble(reply);
        this.speakText(reply);
      } else {
        this.updateSpeechBubble(`No immediate ${category} found in this sector. Check route landmarks.`);
      }
    } catch (e) {
      this.updateSpeechBubble(`Nearby search complete. Keep your eyes on the road.`);
    }
  }

  /**
   * Called continuously by map.js when rider moves
   */
  updateNavigationState(state) {
    this.navState = { ...this.navState, ...state };

    // Update speech bubble with clear guidance when turn instruction changes
    if (state.nextTurn && state.nextTurn !== this.lastSpokenInstruction) {
      this.lastSpokenInstruction = state.nextTurn;
      const distStr = state.distanceToTurn >= 1000 ? `${(state.distanceToTurn / 1000).toFixed(1)} km` : `${state.distanceToTurn} m`;
      const message = `Continue en route. Your next maneuver is <strong>${state.nextTurn}</strong> in ${distStr}.`;
      this.updateSpeechBubble(message);
    }
  }

  onRouteCalculated(routeData) {
    this.navState.destination = { name: routeData.destination };
    const msg = `Route calculated from ${routeData.origin} to ${routeData.destination}. Distance: <strong>${routeData.formattedDistance}</strong>, estimated travel time: <strong>${routeData.formattedDuration}</strong>. Click "Start Navigation" when ready.`;
    this.updateSpeechBubble(msg);
    this.speakText(`Route ready. Total distance is ${routeData.formattedDistance}.`);
  }

  onDestinationReached(destName) {
    const msg = `🎉 <strong>Destination Reached!</strong> You have arrived at ${destName}. Navigation complete.`;
    this.updateSpeechBubble(msg);
    this.speakText(`You have reached your destination: ${destName}. Safe travels!`);
  }

  updateSpeechBubble(htmlContent) {
    if (this.speechBubble) {
      this.speechBubble.innerHTML = `"${htmlContent}"`;
    }
  }

  speakText(text) {
    if (!this.voiceEnabled || !this.voiceSynth) return;
    try {
      // Clean HTML tags from speech
      const plainText = text.replace(/<[^>]*>?/gm, '');
      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;
      this.voiceSynth.cancel(); // Stop any pending utterance
      this.voiceSynth.speak(utterance);
    } catch (e) {
      // Speech synthesis unsupported or user disabled
    }
  }
}

// Global exposure
window.AiNavigationAssistant = AiNavigationAssistant;
