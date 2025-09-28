// Enhanced Tourist Safety Score System
// Considers travel patterns, area sensitivity, time factors, and behavior patterns

class TouristSafetyScoreService {
  constructor() {
    this.areaSensitivityWeights = {
      'red': 3.0,      // High-risk zones
      'yellow': 1.5,   // Medium-risk zones
      'green': 0.5,    // Low-risk zones
      'default': 1.0   // Unknown areas
    };

    this.timeFactors = {
      'night': 1.8,    // 10 PM - 6 AM
      'evening': 1.3,  // 6 PM - 10 PM
      'day': 1.0,      // 6 AM - 6 PM
      'dawn': 1.1      // 5 AM - 6 AM
    };

    this.behaviorPatterns = {
      'stationary': 0.8,     // Staying in one place
      'exploring': 1.2,      // Moving around normally
      'rushing': 1.5,        // Moving very quickly
      'wandering': 1.3,      // Erratic movement
      'group_travel': 0.7,   // Traveling with others
      'solo_travel': 1.4     // Traveling alone
    };
  }

  // Calculate time factor based on hour
  getTimeFactor(timestamp) {
    const hour = new Date(timestamp).getHours();
    if (hour >= 22 || hour < 6) return this.timeFactors.night;
    if (hour >= 18) return this.timeFactors.evening;
    if (hour >= 5 && hour < 6) return this.timeFactors.dawn;
    return this.timeFactors.day;
  }

  // Analyze movement patterns from GPS history
  analyzeMovementPattern(gpsHistory) {
    if (!gpsHistory || gpsHistory.length < 2) {
      return { pattern: 'stationary', confidence: 0.5 };
    }

    const points = gpsHistory.slice(-10); // Last 10 points
    const distances = [];
    const speeds = [];

    for (let i = 1; i < points.length; i++) {
      const dist = this.calculateDistance(
        points[i-1].latitude, points[i-1].longitude,
        points[i].latitude, points[i].longitude
      );
      distances.push(dist);
      
      const timeDiff = (new Date(points[i].at) - new Date(points[i-1].at)) / 1000; // seconds
      if (timeDiff > 0) {
        speeds.push(dist / timeDiff); // km/h
      }
    }

    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;

    // Classify movement pattern
    let pattern = 'stationary';
    let confidence = 0.8;

    if (avgSpeed > 50) {
      pattern = 'rushing';
      confidence = 0.9;
    } else if (avgSpeed > 5) {
      pattern = 'exploring';
      confidence = 0.8;
    } else if (avgDistance > 0.1) {
      pattern = 'wandering';
      confidence = 0.7;
    } else {
      pattern = 'stationary';
      confidence = 0.9;
    }

    return { pattern, confidence, avgSpeed, avgDistance };
  }

  // Calculate distance between two points (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI/180);
  }

  // Calculate area sensitivity score
  getAreaSensitivityScore(geofences, latitude, longitude) {
    let maxSensitivity = 0;
    let matchedZone = null;

    for (const fence of geofences) {
      if (this.pointInPolygon([latitude, longitude], fence.polygon)) {
        const sensitivity = this.areaSensitivityWeights[fence.riskLevel] || 1.0;
        if (sensitivity > maxSensitivity) {
          maxSensitivity = sensitivity;
          matchedZone = fence;
        }
      }
    }

    return {
      score: maxSensitivity,
      zone: matchedZone,
      isInRestrictedArea: maxSensitivity >= 2.0
    };
  }

  // Point-in-polygon check
  pointInPolygon(point, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    const [x, y] = [point[1], point[0]]; // lng, lat
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][1], yi = polygon[i][0];
      const xj = polygon[j][1], yj = polygon[j][0];
      const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Calculate tourist-specific safety score
  calculateTouristSafetyScore({
    touristId,
    gpsHistory = [],
    incidents = [],
    geofences = [],
    timeWindow = 24 // hours
  }) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - timeWindow * 60 * 60 * 1000);
    
    // Filter recent data
    const recentGps = gpsHistory.filter(point => 
      new Date(point.at) >= windowStart
    );
    const recentIncidents = incidents.filter(incident => 
      new Date(incident.createdAt) >= windowStart
    );

    // Base score (0-100)
    let score = 100;
    const factors = [];

    // 1. Area sensitivity factor
    if (recentGps.length > 0) {
      const latestLocation = recentGps[recentGps.length - 1];
      const areaSensitivity = this.getAreaSensitivityScore(
        geofences, 
        latestLocation.latitude, 
        latestLocation.longitude
      );
      
      const areaPenalty = (areaSensitivity.score - 1) * 15;
      score -= areaPenalty;
      factors.push({
        name: 'Area Sensitivity',
        impact: -areaPenalty,
        details: {
          zone: areaSensitivity.zone?.name || 'Unknown',
          riskLevel: areaSensitivity.zone?.riskLevel || 'default',
          isRestricted: areaSensitivity.isInRestrictedArea
        }
      });
    }

    // 2. Time factor
    if (recentGps.length > 0) {
      const timeFactor = this.getTimeFactor(recentGps[recentGps.length - 1].at);
      const timePenalty = (timeFactor - 1) * 10;
      score -= timePenalty;
      factors.push({
        name: 'Time Factor',
        impact: -timePenalty,
        details: { factor: timeFactor }
      });
    }

    // 3. Movement pattern analysis
    if (recentGps.length >= 2) {
      const movement = this.analyzeMovementPattern(recentGps);
      const behaviorWeight = this.behaviorPatterns[movement.pattern] || 1.0;
      const behaviorPenalty = (behaviorWeight - 1) * 12;
      score -= behaviorPenalty;
      factors.push({
        name: 'Movement Pattern',
        impact: -behaviorPenalty,
        details: {
          pattern: movement.pattern,
          confidence: movement.confidence,
          avgSpeed: movement.avgSpeed?.toFixed(2) + ' km/h'
        }
      });
    }

    // 4. Incident history
    const incidentPenalty = recentIncidents.length * 20;
    score -= incidentPenalty;
    if (recentIncidents.length > 0) {
      factors.push({
        name: 'Recent Incidents',
        impact: -incidentPenalty,
        details: { count: recentIncidents.length }
      });
    }

    // 5. GPS tracking consistency
    const gpsConsistency = this.calculateGpsConsistency(recentGps);
    const consistencyPenalty = (1 - gpsConsistency) * 15;
    score -= consistencyPenalty;
    factors.push({
      name: 'GPS Consistency',
      impact: -consistencyPenalty,
      details: { consistency: (gpsConsistency * 100).toFixed(1) + '%' }
    });

    // 6. Solo vs group travel detection
    const soloTravelPenalty = this.detectSoloTravel(recentGps) * 8;
    score -= soloTravelPenalty;
    if (soloTravelPenalty > 0) {
      factors.push({
        name: 'Solo Travel',
        impact: -soloTravelPenalty,
        details: { detected: true }
      });
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));

    // Calculate risk level
    let riskLevel = 'low';
    if (score < 30) riskLevel = 'high';
    else if (score < 60) riskLevel = 'medium';

    return {
      touristId,
      score: Math.round(score),
      riskLevel,
      factors,
      timestamp: now.toISOString(),
      timeWindow,
      recommendations: this.generateRecommendations(score, factors)
    };
  }

  // Calculate GPS tracking consistency
  calculateGpsConsistency(gpsHistory) {
    if (gpsHistory.length < 2) return 0.5;

    const intervals = [];
    for (let i = 1; i < gpsHistory.length; i++) {
      const diff = new Date(gpsHistory[i].at) - new Date(gpsHistory[i-1].at);
      intervals.push(diff / 1000 / 60); // minutes
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const expectedInterval = 5; // 5 minutes expected
    const consistency = Math.max(0, 1 - Math.abs(avgInterval - expectedInterval) / expectedInterval);
    
    return consistency;
  }

  // Detect solo travel based on movement patterns
  detectSoloTravel(gpsHistory) {
    if (gpsHistory.length < 5) return 0;

    // Look for patterns that suggest solo travel
    const movement = this.analyzeMovementPattern(gpsHistory);
    
    // Solo travelers tend to have more erratic patterns
    if (movement.pattern === 'wandering' || movement.pattern === 'rushing') {
      return 0.8;
    }
    
    // Check for consistent speed patterns (groups move more uniformly)
    const speeds = [];
    for (let i = 1; i < gpsHistory.length; i++) {
      const dist = this.calculateDistance(
        gpsHistory[i-1].latitude, gpsHistory[i-1].longitude,
        gpsHistory[i].latitude, gpsHistory[i].longitude
      );
      const timeDiff = (new Date(gpsHistory[i].at) - new Date(gpsHistory[i-1].at)) / 1000;
      if (timeDiff > 0) speeds.push(dist / timeDiff);
    }

    if (speeds.length > 0) {
      const speedVariance = this.calculateVariance(speeds);
      // High variance suggests solo travel
      return Math.min(1, speedVariance / 100);
    }

    return 0.5;
  }

  // Calculate variance of an array
  calculateVariance(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return variance;
  }

  // Generate safety recommendations
  generateRecommendations(score, factors) {
    const recommendations = [];

    if (score < 30) {
      recommendations.push('High risk detected - consider immediate safety measures');
      recommendations.push('Avoid traveling alone in current area');
      recommendations.push('Share location with trusted contacts');
    } else if (score < 60) {
      recommendations.push('Moderate risk - exercise caution');
      recommendations.push('Stay in well-lit, populated areas');
      recommendations.push('Keep emergency contacts updated');
    } else {
      recommendations.push('Low risk - continue normal activities');
      recommendations.push('Maintain regular check-ins');
    }

    // Specific recommendations based on factors
    factors.forEach(factor => {
      if (factor.name === 'Area Sensitivity' && factor.details.isRestricted) {
        recommendations.push('You are in a restricted area - consider leaving');
      }
      if (factor.name === 'Time Factor' && factor.details.factor > 1.5) {
        recommendations.push('Night time travel - use well-lit routes');
      }
      if (factor.name === 'Movement Pattern' && factor.details.pattern === 'rushing') {
        recommendations.push('Slow down - rushing may increase risk');
      }
      if (factor.name === 'Solo Travel' && factor.details.detected) {
        recommendations.push('Consider traveling with companions');
      }
    });

    return recommendations;
  }

  // Batch calculate scores for multiple tourists
  calculateBatchScores(tourists, gpsHistoryMap, incidents, geofences) {
    return tourists.map(tourist => {
      const touristGps = gpsHistoryMap[tourist.id] || [];
      const touristIncidents = incidents.filter(inc => inc.touristId === tourist.id);
      
      return this.calculateTouristSafetyScore({
        touristId: tourist.id,
        gpsHistory: touristGps,
        incidents: touristIncidents,
        geofences
      });
    });
  }
}

module.exports = new TouristSafetyScoreService();
