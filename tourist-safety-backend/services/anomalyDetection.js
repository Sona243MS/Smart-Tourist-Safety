const EventEmitter = require('events');

// AI-Based Anomaly Detection Service
class AnomalyDetectionService extends EventEmitter {
  constructor() {
    super();
    this.touristProfiles = new Map(); // touristId -> behavior profile
    this.anomalyThresholds = {
      locationDropOff: 30, // minutes without GPS
      inactivity: 60, // minutes without movement
      routeDeviation: 0.8, // similarity threshold for route deviation
      speedAnomaly: 2.0, // speed multiplier for anomaly detection
      panicPattern: 0.7 // panic behavior pattern threshold
    };
    this.detectionHistory = new Map(); // touristId -> recent detections
    this.maxHistorySize = 100;
  }

  // Analyze tourist behavior and detect anomalies
  analyzeBehavior({
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

    const anomalies = [];
    const profile = this.getOrCreateProfile(touristId);

    // 1. Location Drop-off Detection
    const locationDropOff = this.detectLocationDropOff(touristId, recentGps);
    if (locationDropOff) {
      anomalies.push(locationDropOff);
    }

    // 2. Inactivity Detection
    const inactivity = this.detectInactivity(touristId, recentGps);
    if (inactivity) {
      anomalies.push(inactivity);
    }

    // 3. Route Deviation Detection
    const routeDeviation = this.detectRouteDeviation(touristId, recentGps, profile);
    if (routeDeviation) {
      anomalies.push(routeDeviation);
    }

    // 4. Speed Anomaly Detection
    const speedAnomaly = this.detectSpeedAnomaly(touristId, recentGps, profile);
    if (speedAnomaly) {
      anomalies.push(speedAnomaly);
    }

    // 5. Panic Pattern Detection
    const panicPattern = this.detectPanicPattern(touristId, recentGps, recentIncidents);
    if (panicPattern) {
      anomalies.push(panicPattern);
    }

    // 6. Geofence Violation Detection
    const geofenceViolation = this.detectGeofenceViolation(touristId, recentGps, geofences);
    if (geofenceViolation) {
      anomalies.push(geofenceViolation);
    }

    // 7. Unusual Time Pattern Detection
    const timePattern = this.detectUnusualTimePattern(touristId, recentGps, profile);
    if (timePattern) {
      anomalies.push(timePattern);
    }

    // Update profile with recent behavior
    this.updateProfile(touristId, recentGps, recentIncidents);

    // Store detection results
    this.storeDetection(touristId, anomalies);

    return {
      touristId,
      timestamp: now.toISOString(),
      timeWindow,
      anomalies,
      riskLevel: this.calculateRiskLevel(anomalies),
      recommendations: this.generateAnomalyRecommendations(anomalies)
    };
  }

  // Detect location drop-off (no GPS for extended period)
  detectLocationDropOff(touristId, gpsHistory) {
    if (gpsHistory.length === 0) return null;

    const lastLocation = gpsHistory[gpsHistory.length - 1];
    const timeSinceLastLocation = (Date.now() - new Date(lastLocation.at).getTime()) / (1000 * 60); // minutes

    if (timeSinceLastLocation > this.anomalyThresholds.locationDropOff) {
      return {
        type: 'location_dropoff',
        severity: timeSinceLastLocation > 120 ? 'high' : 'medium',
        description: `No location updates for ${Math.round(timeSinceLastLocation)} minutes`,
        details: {
          lastSeen: lastLocation.at,
          lastLocation: { lat: lastLocation.latitude, lng: lastLocation.longitude },
          timeSinceLastUpdate: Math.round(timeSinceLastLocation)
        },
        confidence: 0.9
      };
    }

    return null;
  }

  // Detect inactivity (no movement for extended period)
  detectInactivity(touristId, gpsHistory) {
    if (gpsHistory.length < 2) return null;

    const recentPoints = gpsHistory.slice(-10); // Last 10 points
    const totalDistance = this.calculateTotalDistance(recentPoints);
    const timeSpan = (new Date(recentPoints[recentPoints.length - 1].at) - new Date(recentPoints[0].at)) / (1000 * 60); // minutes

    if (timeSpan > this.anomalyThresholds.inactivity && totalDistance < 0.1) { // Less than 100m movement
      return {
        type: 'inactivity',
        severity: timeSpan > 180 ? 'high' : 'medium',
        description: `No significant movement for ${Math.round(timeSpan)} minutes`,
        details: {
          timeSpan: Math.round(timeSpan),
          distanceMoved: totalDistance.toFixed(2) + ' km',
          location: { lat: recentPoints[0].latitude, lng: recentPoints[0].longitude }
        },
        confidence: 0.8
      };
    }

    return null;
  }

  // Detect route deviation from normal patterns
  detectRouteDeviation(touristId, gpsHistory, profile) {
    if (gpsHistory.length < 5 || !profile.normalRoutes || profile.normalRoutes.length === 0) {
      return null;
    }

    const recentRoute = gpsHistory.slice(-10).map(p => ({ lat: p.latitude, lng: p.longitude }));
    const maxSimilarity = Math.max(...profile.normalRoutes.map(route => 
      this.calculateRouteSimilarity(recentRoute, route)
    ));

    if (maxSimilarity < this.anomalyThresholds.routeDeviation) {
      return {
        type: 'route_deviation',
        severity: maxSimilarity < 0.5 ? 'high' : 'medium',
        description: `Deviating from normal travel patterns`,
        details: {
          similarity: maxSimilarity.toFixed(2),
          threshold: this.anomalyThresholds.routeDeviation,
          recentRoute: recentRoute.slice(0, 5) // First 5 points for brevity
        },
        confidence: 0.7
      };
    }

    return null;
  }

  // Detect speed anomalies
  detectSpeedAnomaly(touristId, gpsHistory, profile) {
    if (gpsHistory.length < 3 || !profile.normalSpeed) return null;

    const recentSpeeds = [];
    for (let i = 1; i < gpsHistory.length; i++) {
      const dist = this.calculateDistance(
        gpsHistory[i-1].latitude, gpsHistory[i-1].longitude,
        gpsHistory[i].latitude, gpsHistory[i].longitude
      );
      const timeDiff = (new Date(gpsHistory[i].at) - new Date(gpsHistory[i-1].at)) / 1000; // seconds
      if (timeDiff > 0) {
        recentSpeeds.push(dist / timeDiff * 3.6); // km/h
      }
    }

    if (recentSpeeds.length === 0) return null;

    const avgSpeed = recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length;
    const speedRatio = avgSpeed / profile.normalSpeed;

    if (speedRatio > this.anomalyThresholds.speedAnomaly || speedRatio < 0.1) {
      return {
        type: 'speed_anomaly',
        severity: speedRatio > 3 ? 'high' : 'medium',
        description: `Unusual speed pattern detected`,
        details: {
          currentSpeed: avgSpeed.toFixed(2) + ' km/h',
          normalSpeed: profile.normalSpeed.toFixed(2) + ' km/h',
          speedRatio: speedRatio.toFixed(2)
        },
        confidence: 0.8
      };
    }

    return null;
  }

  // Detect panic behavior patterns
  detectPanicPattern(touristId, gpsHistory, incidents) {
    if (gpsHistory.length < 5) return null;

    // Check for recent incidents
    const recentIncidents = incidents.filter(inc => 
      new Date(inc.createdAt) > new Date(Date.now() - 2 * 60 * 60 * 1000) // Last 2 hours
    );

    if (recentIncidents.length === 0) return null;

    // Analyze movement patterns around incident time
    const incidentTime = new Date(recentIncidents[0].createdAt);
    const beforeIncident = gpsHistory.filter(p => new Date(p.at) < incidentTime).slice(-5);
    const afterIncident = gpsHistory.filter(p => new Date(p.at) > incidentTime).slice(0, 5);

    if (beforeIncident.length < 3 || afterIncident.length < 3) return null;

    const beforeSpeed = this.calculateAverageSpeed(beforeIncident);
    const afterSpeed = this.calculateAverageSpeed(afterIncident);
    const speedChange = Math.abs(afterSpeed - beforeSpeed) / beforeSpeed;

    if (speedChange > this.anomalyThresholds.panicPattern) {
      return {
        type: 'panic_pattern',
        severity: 'high',
        description: `Panic behavior pattern detected after incident`,
        details: {
          incidentCount: recentIncidents.length,
          speedChange: (speedChange * 100).toFixed(1) + '%',
          beforeSpeed: beforeSpeed.toFixed(2) + ' km/h',
          afterSpeed: afterSpeed.toFixed(2) + ' km/h'
        },
        confidence: 0.9
      };
    }

    return null;
  }

  // Detect geofence violations
  detectGeofenceViolation(touristId, gpsHistory, geofences) {
    if (gpsHistory.length === 0) return null;

    const lastLocation = gpsHistory[gpsHistory.length - 1];
    const violations = [];

    for (const fence of geofences) {
      if (fence.riskLevel === 'red' && this.pointInPolygon([lastLocation.latitude, lastLocation.longitude], fence.polygon)) {
        violations.push({
          geofenceId: fence.id,
          name: fence.name,
          riskLevel: fence.riskLevel
        });
      }
    }

    if (violations.length > 0) {
      return {
        type: 'geofence_violation',
        severity: 'high',
        description: `Entered restricted area: ${violations[0].name}`,
        details: {
          violations,
          location: { lat: lastLocation.latitude, lng: lastLocation.longitude }
        },
        confidence: 1.0
      };
    }

    return null;
  }

  // Detect unusual time patterns
  detectUnusualTimePattern(touristId, gpsHistory, profile) {
    if (gpsHistory.length === 0 || !profile.normalHours) return null;

    const recentHours = gpsHistory.map(p => new Date(p.at).getHours());
    const currentHour = new Date().getHours();
    
    // Check if current activity is outside normal hours
    const isOutsideNormalHours = !profile.normalHours.some(hourRange => 
      currentHour >= hourRange.start && currentHour <= hourRange.end
    );

    if (isOutsideNormalHours) {
      return {
        type: 'unusual_time_pattern',
        severity: 'medium',
        description: `Activity outside normal hours`,
        details: {
          currentHour,
          normalHours: profile.normalHours,
          recentActivity: recentHours.slice(-5)
        },
        confidence: 0.6
      };
    }

    return null;
  }

  // Get or create tourist behavior profile
  getOrCreateProfile(touristId) {
    if (!this.touristProfiles.has(touristId)) {
      this.touristProfiles.set(touristId, {
        normalSpeed: 5.0, // km/h
        normalRoutes: [],
        normalHours: [{ start: 6, end: 22 }], // 6 AM to 10 PM
        activityPatterns: [],
        lastUpdated: new Date().toISOString()
      });
    }
    return this.touristProfiles.get(touristId);
  }

  // Update tourist profile with recent behavior
  updateProfile(touristId, gpsHistory, incidents) {
    const profile = this.getOrCreateProfile(touristId);
    
    if (gpsHistory.length >= 5) {
      // Update normal speed
      const speeds = [];
      for (let i = 1; i < gpsHistory.length; i++) {
        const dist = this.calculateDistance(
          gpsHistory[i-1].latitude, gpsHistory[i-1].longitude,
          gpsHistory[i].latitude, gpsHistory[i].longitude
        );
        const timeDiff = (new Date(gpsHistory[i].at) - new Date(gpsHistory[i-1].at)) / 1000;
        if (timeDiff > 0) {
          speeds.push(dist / timeDiff * 3.6);
        }
      }
      
      if (speeds.length > 0) {
        const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        profile.normalSpeed = (profile.normalSpeed + avgSpeed) / 2; // Moving average
      }

      // Update normal routes (keep last 10 routes)
      const route = gpsHistory.slice(-10).map(p => ({ lat: p.latitude, lng: p.longitude }));
      profile.normalRoutes.push(route);
      if (profile.normalRoutes.length > 10) {
        profile.normalRoutes.shift();
      }
    }

    profile.lastUpdated = new Date().toISOString();
  }

  // Calculate risk level based on anomalies
  calculateRiskLevel(anomalies) {
    if (anomalies.length === 0) return 'low';
    
    const highSeverityCount = anomalies.filter(a => a.severity === 'high').length;
    const mediumSeverityCount = anomalies.filter(a => a.severity === 'medium').length;
    
    if (highSeverityCount > 0) return 'high';
    if (mediumSeverityCount > 2) return 'high';
    if (mediumSeverityCount > 0) return 'medium';
    return 'low';
  }

  // Generate recommendations based on anomalies
  generateAnomalyRecommendations(anomalies) {
    const recommendations = [];
    
    anomalies.forEach(anomaly => {
      switch (anomaly.type) {
        case 'location_dropoff':
          recommendations.push('Check if tourist is safe - no location updates received');
          recommendations.push('Attempt to contact tourist via phone or emergency contacts');
          break;
        case 'inactivity':
          recommendations.push('Verify tourist status - no movement detected');
          recommendations.push('Consider sending welfare check if no response');
          break;
        case 'route_deviation':
          recommendations.push('Monitor tourist closely - unusual travel pattern detected');
          break;
        case 'speed_anomaly':
          recommendations.push('Check if tourist is in distress - unusual speed pattern');
          break;
        case 'panic_pattern':
          recommendations.push('IMMEDIATE ATTENTION - panic behavior detected');
          recommendations.push('Dispatch emergency response if needed');
          break;
        case 'geofence_violation':
          recommendations.push('URGENT - tourist entered restricted area');
          recommendations.push('Contact local authorities immediately');
          break;
        case 'unusual_time_pattern':
          recommendations.push('Monitor tourist - activity outside normal hours');
          break;
      }
    });

    return [...new Set(recommendations)]; // Remove duplicates
  }

  // Store detection results
  storeDetection(touristId, anomalies) {
    if (!this.detectionHistory.has(touristId)) {
      this.detectionHistory.set(touristId, []);
    }
    
    const history = this.detectionHistory.get(touristId);
    history.push({
      timestamp: new Date().toISOString(),
      anomalies: anomalies.length,
      riskLevel: this.calculateRiskLevel(anomalies)
    });
    
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  // Helper methods
  calculateTotalDistance(points) {
    if (points.length < 2) return 0;
    
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += this.calculateDistance(
        points[i-1].latitude, points[i-1].longitude,
        points[i].latitude, points[i].longitude
      );
    }
    return total;
  }

  calculateAverageSpeed(points) {
    if (points.length < 2) return 0;
    
    const speeds = [];
    for (let i = 1; i < points.length; i++) {
      const dist = this.calculateDistance(
        points[i-1].latitude, points[i-1].longitude,
        points[i].latitude, points[i].longitude
      );
      const timeDiff = (new Date(points[i].at) - new Date(points[i-1].at)) / 1000;
      if (timeDiff > 0) {
        speeds.push(dist / timeDiff * 3.6); // km/h
      }
    }
    
    return speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  }

  calculateRouteSimilarity(route1, route2) {
    if (route1.length === 0 || route2.length === 0) return 0;
    
    // Simple similarity based on endpoint distance
    const end1 = route1[route1.length - 1];
    const end2 = route2[route2.length - 1];
    const distance = this.calculateDistance(end1.lat, end1.lng, end2.lat, end2.lng);
    
    // Convert distance to similarity (closer = more similar)
    return Math.max(0, 1 - distance / 10); // 10km threshold
  }

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

  // Get detection history for a tourist
  getDetectionHistory(touristId) {
    return this.detectionHistory.get(touristId) || [];
  }

  // Get all tourist profiles
  getAllProfiles() {
    return Array.from(this.touristProfiles.entries()).map(([id, profile]) => ({
      touristId: id,
      ...profile
    }));
  }
}

module.exports = new AnomalyDetectionService();
