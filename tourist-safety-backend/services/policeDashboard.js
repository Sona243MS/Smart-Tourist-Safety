const EventEmitter = require('events');

// Tourism Department & Police Dashboard Service
class PoliceDashboardService extends EventEmitter {
  constructor() {
    super();
    this.heatMapData = new Map(); // regionId -> heat map data
    this.touristClusters = new Map(); // regionId -> cluster data
    this.eFirRecords = new Map(); // firId -> FIR record
    this.dashboardMetrics = {
      totalTourists: 0,
      activeAlerts: 0,
      resolvedIncidents: 0,
      pendingEFirs: 0,
      highRiskZones: 0
    };
    this.initializeHeatMapData();
  }

  // Initialize heat map data for different regions
  initializeHeatMapData() {
    const regions = ['guwahati', 'shillong', 'assam', 'default'];
    
    regions.forEach(regionId => {
      this.heatMapData.set(regionId, {
        regionId,
        lastUpdated: new Date().toISOString(),
        heatPoints: [],
        riskLevels: {
          low: 0,
          medium: 0,
          high: 0
        },
        totalIncidents: 0
      });
    });
  }

  // Generate real-time heat map data
  generateHeatMapData(incidents, geofences, regionId = 'default') {
    const heatPoints = [];
    const riskLevels = { low: 0, medium: 0, high: 0 };
    
    // Process incidents for heat map
    incidents.forEach(incident => {
      if (incident.latitude && incident.longitude) {
        const intensity = this.calculateIncidentIntensity(incident);
        const riskLevel = this.getRiskLevel(intensity);
        
        heatPoints.push({
          lat: incident.latitude,
          lng: incident.longitude,
          intensity,
          riskLevel,
          incidentId: incident.id,
          timestamp: incident.createdAt,
          type: incident.type,
          severity: incident.severity
        });
        
        riskLevels[riskLevel]++;
      }
    });

    // Add geofence risk zones
    geofences.forEach(fence => {
      if (fence.riskLevel && fence.polygon) {
        const center = this.calculatePolygonCenter(fence.polygon);
        const intensity = this.getGeofenceIntensity(fence.riskLevel);
        
        heatPoints.push({
          lat: center.lat,
          lng: center.lng,
          intensity,
          riskLevel: fence.riskLevel,
          geofenceId: fence.id,
          geofenceName: fence.name,
          isGeofence: true
        });
      }
    });

    const heatMapData = {
      regionId,
      lastUpdated: new Date().toISOString(),
      heatPoints,
      riskLevels,
      totalIncidents: incidents.length,
      totalGeofences: geofences.length
    };

    this.heatMapData.set(regionId, heatMapData);
    this.emit('heatMapUpdated', heatMapData);
    
    return heatMapData;
  }

  // Generate tourist clusters
  generateTouristClusters(gpsHistory, regionId = 'default') {
    const clusters = [];
    const clusterRadius = 0.5; // km
    
    // Group GPS points by proximity
    const points = [];
    for (const [touristId, history] of gpsHistory.entries()) {
      if (history && history.length > 0) {
        const latest = history[history.length - 1];
        points.push({
          touristId,
          lat: latest.latitude,
          lng: latest.longitude,
          timestamp: latest.at,
          deviceId: latest.deviceId
        });
      }
    }

    // Simple clustering algorithm
    const visited = new Set();
    points.forEach((point, index) => {
      if (visited.has(index)) return;
      
      const cluster = {
        id: require('crypto').randomUUID(),
        center: { lat: point.lat, lng: point.lng },
        tourists: [point],
        radius: clusterRadius,
        density: 1,
        lastUpdated: point.timestamp
      };
      
      // Find nearby points
      points.forEach((otherPoint, otherIndex) => {
        if (otherIndex === index || visited.has(otherIndex)) return;
        
        const distance = this.calculateDistance(
          point.lat, point.lng,
          otherPoint.lat, otherPoint.lng
        );
        
        if (distance <= clusterRadius) {
          cluster.tourists.push(otherPoint);
          cluster.density++;
          visited.add(otherIndex);
        }
      });
      
      if (cluster.density > 1) {
        clusters.push(cluster);
      }
      
      visited.add(index);
    });

    const clusterData = {
      regionId,
      lastUpdated: new Date().toISOString(),
      clusters,
      totalTourists: points.length,
      clusteredTourists: clusters.reduce((sum, c) => sum + c.density, 0)
    };

    this.touristClusters.set(regionId, clusterData);
    this.emit('clustersUpdated', clusterData);
    
    return clusterData;
  }

  // Generate E-FIR (Electronic First Information Report)
  generateEFir({
    touristId,
    deviceId,
    incidentType,
    description,
    location,
    reportedBy,
    priority = 'medium',
    additionalInfo = {}
  }) {
    const firId = require('crypto').randomUUID();
    const timestamp = new Date().toISOString();
    
    const eFir = {
      firId,
      touristId,
      deviceId,
      incidentType,
      description,
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address || 'Location not specified'
      },
      reportedBy: {
        officerId: reportedBy.officerId,
        officerName: reportedBy.officerName,
        department: reportedBy.department || 'Tourism Police',
        badgeNumber: reportedBy.badgeNumber
      },
      priority,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
      assignedTo: null,
      resolution: null,
      additionalInfo,
      caseNumber: this.generateCaseNumber(),
      jurisdiction: this.determineJurisdiction(location.latitude, location.longitude)
    };

    this.eFirRecords.set(firId, eFir);
    this.updateDashboardMetrics('eFirCreated');
    this.emit('eFirCreated', eFir);
    
    return eFir;
  }

  // Update E-FIR status
  updateEFirStatus(firId, status, updates = {}) {
    const eFir = this.eFirRecords.get(firId);
    if (!eFir) {
      throw new Error('E-FIR not found');
    }

    eFir.status = status;
    eFir.updatedAt = new Date().toISOString();
    
    if (updates.assignedTo) eFir.assignedTo = updates.assignedTo;
    if (updates.resolution) eFir.resolution = updates.resolution;
    if (updates.notes) eFir.notes = updates.notes;

    this.eFirRecords.set(firId, eFir);
    this.emit('eFirUpdated', eFir);
    
    return eFir;
  }

  // Get E-FIR by ID
  getEFir(firId) {
    return this.eFirRecords.get(firId);
  }

  // List E-FIRs with filtering
  listEFirs(filters = {}) {
    let eFirs = Array.from(this.eFirRecords.values());
    
    if (filters.status) {
      eFirs = eFirs.filter(fir => fir.status === filters.status);
    }
    
    if (filters.priority) {
      eFirs = eFirs.filter(fir => fir.priority === filters.priority);
    }
    
    if (filters.jurisdiction) {
      eFirs = eFirs.filter(fir => fir.jurisdiction === filters.jurisdiction);
    }
    
    if (filters.dateFrom) {
      eFirs = eFirs.filter(fir => new Date(fir.createdAt) >= new Date(filters.dateFrom));
    }
    
    if (filters.dateTo) {
      eFirs = eFirs.filter(fir => new Date(fir.createdAt) <= new Date(filters.dateTo));
    }

    return eFirs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // Get dashboard metrics
  getDashboardMetrics() {
    const totalEFirs = this.eFirRecords.size;
    const pendingEFirs = Array.from(this.eFirRecords.values()).filter(fir => fir.status === 'pending').length;
    const resolvedEFirs = Array.from(this.eFirRecords.values()).filter(fir => fir.status === 'resolved').length;
    
    return {
      ...this.dashboardMetrics,
      totalEFirs,
      pendingEFirs,
      resolvedEFirs,
      lastUpdated: new Date().toISOString()
    };
  }

  // Update dashboard metrics
  updateDashboardMetrics(metric) {
    switch (metric) {
      case 'touristAdded':
        this.dashboardMetrics.totalTourists++;
        break;
      case 'alertCreated':
        this.dashboardMetrics.activeAlerts++;
        break;
      case 'incidentResolved':
        this.dashboardMetrics.resolvedIncidents++;
        this.dashboardMetrics.activeAlerts = Math.max(0, this.dashboardMetrics.activeAlerts - 1);
        break;
      case 'eFirCreated':
        this.dashboardMetrics.pendingEFirs++;
        break;
      case 'eFirResolved':
        this.dashboardMetrics.pendingEFirs = Math.max(0, this.dashboardMetrics.pendingEFirs - 1);
        break;
    }
  }

  // Get tourist digital ID records
  getTouristDigitalRecords(touristId) {
    // This would integrate with the enhanced DID service
    return {
      touristId,
      didRecords: [],
      alertHistory: [],
      lastKnownLocation: null,
      registrationDate: null,
      lastActivity: null
    };
  }

  // Get alert history for a tourist
  getTouristAlertHistory(touristId, limit = 50) {
    // This would query the incidents database
    return {
      touristId,
      alerts: [],
      totalAlerts: 0,
      lastAlert: null
    };
  }

  // Get last known location for a tourist
  getTouristLastLocation(touristId) {
    // This would query the GPS history
    return {
      touristId,
      location: null,
      timestamp: null,
      accuracy: null,
      source: null
    };
  }

  // Generate case number
  generateCaseNumber() {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `FIR/${year}/${month}/${random}`;
  }

  // Determine jurisdiction based on location
  determineJurisdiction(latitude, longitude) {
    // Simple jurisdiction determination based on coordinates
    if (latitude >= 25.5 && latitude <= 26.5 && longitude >= 91.5 && longitude <= 92.5) {
      return 'Guwahati Police';
    } else if (latitude >= 25.0 && latitude <= 26.0 && longitude >= 91.5 && longitude <= 92.5) {
      return 'Shillong Police';
    } else if (latitude >= 26.0 && latitude <= 27.0 && longitude >= 93.0 && longitude <= 94.0) {
      return 'Kaziranga Police';
    }
    return 'Tourism Police';
  }

  // Calculate incident intensity for heat map
  calculateIncidentIntensity(incident) {
    let intensity = 1;
    
    // Base intensity on severity
    switch (incident.severity) {
      case 'high': intensity = 3; break;
      case 'medium': intensity = 2; break;
      case 'low': intensity = 1; break;
    }
    
    // Increase intensity for recent incidents
    const age = (Date.now() - new Date(incident.createdAt).getTime()) / (1000 * 60 * 60); // hours
    if (age < 1) intensity *= 1.5;
    else if (age < 24) intensity *= 1.2;
    
    return Math.min(intensity, 5); // Cap at 5
  }

  // Get risk level from intensity
  getRiskLevel(intensity) {
    if (intensity >= 3) return 'high';
    if (intensity >= 2) return 'medium';
    return 'low';
  }

  // Get geofence intensity
  getGeofenceIntensity(riskLevel) {
    switch (riskLevel) {
      case 'red': return 4;
      case 'yellow': return 2;
      case 'green': return 1;
      default: return 1;
    }
  }

  // Calculate polygon center
  calculatePolygonCenter(polygon) {
    if (!polygon || polygon.length === 0) return { lat: 0, lng: 0 };
    
    let lat = 0, lng = 0;
    polygon.forEach(point => {
      lat += point[0];
      lng += point[1];
    });
    
    return {
      lat: lat / polygon.length,
      lng: lng / polygon.length
    };
  }

  // Calculate distance between two points
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

  // Get all heat map data
  getAllHeatMapData() {
    return Array.from(this.heatMapData.values());
  }

  // Get all cluster data
  getAllClusterData() {
    return Array.from(this.touristClusters.values());
  }

  // Generate comprehensive dashboard report
  generateDashboardReport(regionId = 'all', timeWindow = 24) {
    const report = {
      generatedAt: new Date().toISOString(),
      regionId,
      timeWindow,
      metrics: this.getDashboardMetrics(),
      heatMapData: regionId === 'all' ? this.getAllHeatMapData() : this.heatMapData.get(regionId),
      clusterData: regionId === 'all' ? this.getAllClusterData() : this.touristClusters.get(regionId),
      eFirs: this.listEFirs({ dateFrom: new Date(Date.now() - timeWindow * 60 * 60 * 1000).toISOString() }),
      summary: {
        totalRegions: this.heatMapData.size,
        totalClusters: this.getAllClusterData().reduce((sum, data) => sum + data.clusters.length, 0),
        totalHeatPoints: this.getAllHeatMapData().reduce((sum, data) => sum + data.heatPoints.length, 0),
        averageRiskLevel: this.calculateAverageRiskLevel()
      }
    };

    return report;
  }

  // Calculate average risk level
  calculateAverageRiskLevel() {
    const allHeatMapData = this.getAllHeatMapData();
    let totalPoints = 0;
    let totalIntensity = 0;
    
    allHeatMapData.forEach(data => {
      data.heatPoints.forEach(point => {
        totalPoints++;
        totalIntensity += point.intensity;
      });
    });
    
    if (totalPoints === 0) return 'low';
    
    const averageIntensity = totalIntensity / totalPoints;
    return this.getRiskLevel(averageIntensity);
  }
}

module.exports = new PoliceDashboardService();
