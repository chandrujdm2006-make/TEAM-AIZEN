/**
 * AI Navigation Assistant Service & Endpoints
 * Turn-by-Turn Rider Assistant - Dept. of IT
 * 
 * Provides:
 * 1. POST /api/ai/navigation-guide - Context-aware natural spoken guidance
 * 2. POST /api/ai/chat - Natural language query understanding & intent execution
 * 
 * Includes deterministic fallback engine: 100% operational without external API key!
 */

const express = require('express');
const router = express.Router();

function formatDist(meters) {
  if (meters === null || meters === undefined) return '';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} meters`;
}

/**
 * Generate human-friendly guidance from structured navigation state
 */
function generateDeterministicGuidance(state) {
  const {
    currentLocation,
    destination,
    nextTurn,
    distanceToTurn,
    remainingDistance,
    speed,
    heading,
    status
  } = state || {};

  if (status === 'arrived') {
    const destName = destination?.name || 'your destination';
    return {
      message: `🎉 Destination reached! You have arrived safely at ${destName}.`,
      shortGuidance: 'Destination reached. Safe travels!',
      advice: 'Turn off motorcycle ignition and inspect your ride summary.'
    };
  }

  if (!destination) {
    return {
      message: 'Awaiting route setup. Use your current location or search any place across India to begin navigation.',
      shortGuidance: 'Ready for route. Select a destination.',
      advice: 'Tap "Use Current Location" or type a destination like "Chennai Central" or "SREC".'
    };
  }

  const destName = destination.name || 'your destination';
  const distStr = formatDist(distanceToTurn);
  const remStr = formatDist(remainingDistance);

  let guidanceText = `You're en route to ${destName}. `;

  if (nextTurn) {
    if (distanceToTurn !== null && distanceToTurn !== undefined) {
      if (distanceToTurn <= 40) {
        guidanceText += `Make your turn now: ${nextTurn}.`;
      } else if (distanceToTurn <= 300) {
        guidanceText += `Prepare to ${nextTurn.toLowerCase()} in ${distStr}.`;
      } else {
        guidanceText += `Continue ahead. Your next maneuver will be ${nextTurn.toLowerCase()} in ${distStr}.`;
      }
    } else {
      guidanceText += `Next maneuver: ${nextTurn}.`;
    }
  } else {
    guidanceText += 'Continue along the designated roadway.';
  }

  if (remainingDistance) {
    guidanceText += ` Approximately ${remStr} remaining.`;
  }

  let advice = 'Maintain safe braking distance and keep your eyes on the road.';
  if (speed > 60) {
    advice = 'You are traveling at higher speed. Anticipate turns early.';
  }

  return {
    message: guidanceText,
    shortGuidance: nextTurn ? `${nextTurn} in ${distStr}` : `Head towards ${destName}`,
    advice
  };
}

/**
 * Natural language intent parser for user chat queries
 */
async function processNaturalLanguageIntent(userQuery, navState = {}) {
  const q = (userQuery || '').toLowerCase().trim();
  const { currentLocation, destination, nextTurn, distanceToTurn, remainingDistance, estimatedTime, speed } = navState;

  // 1. "Where am I?"
  if (q.includes('where am i') || q.includes('my location') || q.includes('current place') || q.includes('current position')) {
    if (currentLocation && (currentLocation.name || currentLocation.address)) {
      const loc = currentLocation.name || currentLocation.address;
      return {
        reply: `You are currently near ${loc}.`,
        action: 'speak',
        focus: 'current_location'
      };
    }
    return {
      reply: 'Your GPS location is active on the map. Enable location permissions if you want precise street reverse geocoding.',
      action: 'speak',
      focus: 'current_location'
    };
  }

  // 2. "What is my next turn?" / "Next maneuver"
  if (q.includes('next turn') || q.includes('turn') || q.includes('maneuver') || q.includes('which way')) {
    if (nextTurn) {
      const dist = formatDist(distanceToTurn);
      return {
        reply: `Your next turn is: ${nextTurn} in approximately ${dist}.`,
        action: 'speak',
        focus: 'next_turn'
      };
    }
    return {
      reply: 'No active turn at this moment. Please generate a route to see turn-by-turn maneuvers.',
      action: 'speak'
    };
  }

  // 3. "How far is left?" / "Remaining distance" / "ETA"
  if (q.includes('how far') || q.includes('remaining') || q.includes('distance') || q.includes('how long') || q.includes('eta') || q.includes('time left')) {
    if (remainingDistance) {
      const rem = formatDist(remainingDistance);
      const eta = estimatedTime || 'calculating';
      const dest = destination?.name ? `to ${destination.name}` : '';
      return {
        reply: `You have approximately ${rem} left ${dest}. Estimated travel duration: ${eta}.`,
        action: 'speak',
        focus: 'eta'
      };
    }
    return {
      reply: 'Select a destination and generate a route to calculate remaining distance and estimated arrival time.',
      action: 'speak'
    };
  }

  // 4. "Explain my route"
  if (q.includes('explain') || q.includes('route summary') || q.includes('overview') || q.includes('tell me about route')) {
    if (destination) {
      const orig = currentLocation?.name || 'Start location';
      const dest = destination.name || 'Destination';
      const rem = formatDist(remainingDistance) || 'the full distance';
      const next = nextTurn ? `Upcoming instruction: ${nextTurn} in ${formatDist(distanceToTurn)}.` : '';
      return {
        reply: `Your route runs from ${orig} to ${dest} spanning ${rem}. ${next} The OLED HUD is synchronized with your upcoming waypoints.`,
        action: 'speak',
        focus: 'route_overview'
      };
    }
    return {
      reply: 'You have not set an active route yet. Choose a starting point and destination in India to generate one.',
      action: 'speak'
    };
  }

  // 5. "Find nearby" (hospital, fuel, food, police)
  if (q.includes('nearby') || q.includes('nearest') || q.includes('hospital') || q.includes('petrol') || q.includes('fuel') || q.includes('gas') || q.includes('food')) {
    let category = 'amenity';
    if (q.includes('hospital') || q.includes('doctor') || q.includes('clinic')) category = 'hospital';
    else if (q.includes('petrol') || q.includes('fuel') || q.includes('gas station')) category = 'fuel';
    else if (q.includes('food') || q.includes('restaurant') || q.includes('hotel')) category = 'restaurant';

    return {
      reply: `Searching for nearest ${category} in your vicinity. Showing points of interest on your India map.`,
      action: 'find_nearby',
      category
    };
  }

  // 6. "I want to go from [A] to [B]"
  const fromToMatch = userQuery.match(/(?:from|between)\s+(.+?)\s+\bto\b\s+(.+)/i);
  if (fromToMatch) {
    const originQuery = fromToMatch[1].trim();
    const destQuery = fromToMatch[2].trim();
    return {
      reply: `Planning your trip from ${originQuery} to ${destQuery}. Geocoding both locations across India...`,
      action: 'set_route_pair',
      originQuery,
      destQuery
    };
  }

  // 7. "Take me to [Place]" / "Route to [Place]" / "Go to [Place]"
  const directMatch = userQuery.match(/(?:take me to|navigate to|route to|go to|directions to|drive to|head to)\s+(.+)/i);
  if (directMatch) {
    const target = directMatch[1].trim().replace(/[?.!]+$/, '');
    return {
      reply: `Setting destination to "${target}". Calculating the real OpenStreetMap road route...`,
      action: 'set_destination_query',
      destinationQuery: target
    };
  }

  // 8. General question fallback
  return {
    reply: `I can help you navigate India! Try asking: "Where am I?", "What is my next turn?", "How far is left?", "Take me to Chennai Airport", or "Find nearest hospital".`,
    action: 'speak'
  };
}

/**
 * POST /api/ai/navigation-guide
 * Returns human-friendly speech/text instruction
 */
router.post('/navigation-guide', (req, res) => {
  try {
    const state = req.body || {};
    const guidance = generateDeterministicGuidance(state);
    res.json({
      success: true,
      guidance: guidance.message,
      shortText: guidance.shortGuidance,
      advice: guidance.advice,
      message: guidance.message
    });
  } catch (err) {
    console.error('[AI] Navigation guide error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ai/chat
 * Natural language chat endpoint
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, navigationState } = req.body || {};
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const result = await processNaturalLanguageIntent(message, navigationState);
    res.json({
      success: true,
      query: message,
      reply: result.reply,
      action: result.action,
      data: result
    });
  } catch (err) {
    console.error('[AI] Chat error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
