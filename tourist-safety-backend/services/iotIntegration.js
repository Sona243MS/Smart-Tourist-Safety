const EventEmitter = require('events');
const crypto = require('crypto');

// IoT Integration Service for Smart Bands, Tags, and Sensor Data
class IoTIntegrationService extends EventEmitter {
  constructor() {
    super();
    this.registeredDevices = new Map(); // deviceId -> device info
    this.deviceSessions = new Map(); // deviceId -> active session
    this.sensorData = new Map(); // deviceId -> sensor data history
    this.qrCodeRegistry = new Map(); // qrCode -> device pairing info
    this.healthAlerts = new Map(); // deviceId -> health alerts
    this.communicationProtocols = new Map(); // protocol -> handler
    this.initializeCommunicationProtocols();
    this.initializeDefaultDevices();
  }

  // Initialize communication protocols
  initializeCommunicationProtocols() {
    this.communicationProtocols.set('bluetooth_le', {
      name: 'Bluetooth Low Energy',
      maxRange: 100, // meters
      dataRate: '1Mbps',
      powerConsumption: 'low',
      supportedFeatures: ['heart_rate', 'location', 'sos', 'battery']
    });

    this.communicationProtocols.set('lorawan', {
      name: 'LoRaWAN',
      maxRange: 15000, // meters
      dataRate: '50kbps',
      powerConsumption: 'very_low',
      supportedFeatures: ['location', 'sos', 'battery', 'environmental']
    });

    this.communicationProtocols.set('wifi', {
      name: 'WiFi',
      maxRange: 100, // meters
      dataRate: '54Mbps',
      powerConsumption: 'high',
      supportedFeatures: ['heart_rate', 'location', 'sos', 'battery', 'video']
    });

    this.communicationProtocols.set('cellular', {
      name: 'Cellular (4G/5G)',
      maxRange: 'unlimited',
      dataRate: '100Mbps',
      powerConsumption: 'high',
      supportedFeatures: ['heart_rate', 'location', 'sos', 'battery', 'video', 'voice']
    });

    this.communicationProtocols.set('satellite', {
      name: 'Satellite (Starlink)',
      maxRange: 'global',
      dataRate: '1Mbps',
      powerConsumption: 'very_high',
      supportedFeatures: ['location', 'sos', 'battery', 'text']
    });
  }

  // Initialize default device types
  initializeDefaultDevices() {
    const deviceTypes = [
      {
        type: 'smart_band',
        name: 'Tourist Safety Smart Band',
        capabilities: ['heart_rate', 'spo2', 'location', 'sos', 'battery'],
        sensors: ['ppg', 'accelerometer', 'gyroscope', 'gps'],
        communication: ['bluetooth_le', 'wifi'],
        batteryLife: '7 days',
        waterproof: true,
        price: '$99'
      },
      {
        type: 'safety_tag',
        name: 'Emergency Safety Tag',
        capabilities: ['location', 'sos', 'battery', 'environmental'],
        sensors: ['gps', 'accelerometer', 'temperature'],
        communication: ['lorawan', 'bluetooth_le'],
        batteryLife: '30 days',
        waterproof: true,
        price: '$49'
      },
      {
        type: 'health_monitor',
        name: 'Advanced Health Monitor',
        capabilities: ['heart_rate', 'spo2', 'respiratory_rate', 'location', 'sos', 'battery'],
        sensors: ['ppg', 'accelerometer', 'gyroscope', 'gps', 'temperature'],
        communication: ['bluetooth_le', 'wifi', 'cellular'],
        batteryLife: '5 days',
        waterproof: true,
        price: '$199'
      },
      {
        type: 'satellite_tag',
        name: 'Remote Area Satellite Tag',
        capabilities: ['location', 'sos', 'battery', 'text'],
        sensors: ['gps', 'accelerometer'],
        communication: ['satellite', 'bluetooth_le'],
        batteryLife: '14 days',
        waterproof: true,
        price: '$299'
      }
    ];

    deviceTypes.forEach(deviceType => {
      this.deviceTypes = deviceTypes;
    });
  }

  // Generate QR code for device pairing
  generateQRCode(deviceType, touristId, additionalData = {}) {
    const qrData = {
      deviceType,
      touristId,
      pairingCode: crypto.randomBytes(16).toString('hex'),
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      additionalData
    };

    const qrCode = `TST_${qrData.pairingCode}`;
    this.qrCodeRegistry.set(qrCode, qrData);

    return {
      qrCode,
      qrData,
      qrImageUrl: this.generateQRImageUrl(qrCode),
      pairingInstructions: this.getPairingInstructions(deviceType)
    };
  }

  // Generate QR image URL (mock implementation)
  generateQRImageUrl(qrCode) {
    // In production, this would generate actual QR code image
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrCode}`;
  }

  // Get pairing instructions for device type
  getPairingInstructions(deviceType) {
    const instructions = {
      smart_band: [
        '1. Power on the smart band by pressing the button for 3 seconds',
        '2. Open the Tourist Safety app on your smartphone',
        '3. Tap "Add Device" and scan the QR code',
        '4. Follow the on-screen instructions to pair via Bluetooth',
        '5. Wear the band on your wrist and ensure it\'s snug but comfortable'
      ],
      safety_tag: [
        '1. Remove the safety tag from packaging',
        '2. Activate by pressing the power button',
        '3. Open the Tourist Safety app and scan the QR code',
        '4. Attach the tag to your backpack or clothing',
        '5. Test the SOS button to ensure it\'s working'
      ],
      health_monitor: [
        '1. Charge the device using the provided cable',
        '2. Power on and wait for the display to show pairing mode',
        '3. Open the Tourist Safety app and scan the QR code',
        '4. Follow the calibration instructions for health sensors',
        '5. Wear the device as instructed for optimal readings'
      ],
      satellite_tag: [
        '1. Charge the device fully before first use',
        '2. Power on and wait for satellite signal acquisition',
        '3. Open the Tourist Safety app and scan the QR code',
        '4. Test the satellite communication in an open area',
        '5. Attach securely to your gear for remote area travel'
      ]
    };

    return instructions[deviceType] || instructions.safety_tag;
  }

  // Register device with QR code
  registerDevice(qrCode, deviceInfo) {
    const qrData = this.qrCodeRegistry.get(qrCode);
    if (!qrData) {
      throw new Error('Invalid or expired QR code');
    }

    if (new Date() > new Date(qrData.expiresAt)) {
      this.qrCodeRegistry.delete(qrCode);
      throw new Error('QR code has expired');
    }

    const deviceId = crypto.randomUUID();
    const device = {
      deviceId,
      qrCode,
      touristId: qrData.touristId,
      deviceType: qrData.deviceType,
      deviceInfo: {
        ...deviceInfo,
        registeredAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        status: 'active'
      },
      capabilities: this.getDeviceCapabilities(qrData.deviceType),
      communication: this.getCommunicationProtocols(qrData.deviceType),
      batteryLevel: 100,
      signalStrength: 0,
      location: null,
      healthData: null
    };

    this.registeredDevices.set(deviceId, device);
    this.qrCodeRegistry.delete(qrCode); // One-time use

    this.logDeviceEvent('device_registered', deviceId, {
      deviceType: qrData.deviceType,
      touristId: qrData.touristId
    });

    return device;
  }

  // Get device capabilities
  getDeviceCapabilities(deviceType) {
    const deviceTypeInfo = this.deviceTypes?.find(dt => dt.type === deviceType);
    return deviceTypeInfo?.capabilities || ['location', 'sos', 'battery'];
  }

  // Get communication protocols for device type
  getCommunicationProtocols(deviceType) {
    const deviceTypeInfo = this.deviceTypes?.find(dt => dt.type === deviceType);
    return deviceTypeInfo?.communication || ['bluetooth_le'];
  }

  // Process sensor data from IoT device
  processSensorData(deviceId, sensorData) {
    const device = this.registeredDevices.get(deviceId);
    if (!device) {
      throw new Error('Device not registered');
    }

    const processedData = {
      deviceId,
      timestamp: new Date().toISOString(),
      rawData: sensorData,
      processedData: this.processRawSensorData(sensorData, device.deviceType),
      batteryLevel: sensorData.batteryLevel || device.batteryLevel,
      signalStrength: sensorData.signalStrength || device.signalStrength,
      location: sensorData.location || device.location
    };

    // Update device info
    device.lastSeen = processedData.timestamp;
    device.batteryLevel = processedData.batteryLevel;
    device.signalStrength = processedData.signalStrength;
    device.location = processedData.location;
    device.healthData = processedData.processedData;

    // Store sensor data
    if (!this.sensorData.has(deviceId)) {
      this.sensorData.set(deviceId, []);
    }
    const dataHistory = this.sensorData.get(deviceId);
    dataHistory.push(processedData);
    
    // Keep only last 1000 data points
    if (dataHistory.length > 1000) {
      dataHistory.splice(0, dataHistory.length - 1000);
    }

    // Check for health anomalies
    this.checkHealthAnomalies(deviceId, processedData.processedData);

    // Check for SOS button press
    if (sensorData.sosPressed) {
      this.handleSOSAlert(deviceId, processedData);
    }

    this.emit('sensorDataReceived', processedData);
    return processedData;
  }

  // Process raw sensor data based on device type
  processRawSensorData(rawData, deviceType) {
    const processed = {
      timestamp: new Date().toISOString(),
      deviceType
    };

    // Process PPG sensor data for heart rate and SpO2
    if (rawData.ppgData) {
      processed.heartRate = this.calculateHeartRate(rawData.ppgData);
      processed.spo2 = this.calculateSpO2(rawData.ppgData);
      processed.respiratoryRate = this.calculateRespiratoryRate(rawData.ppgData);
    }

    // Process accelerometer data for activity detection
    if (rawData.accelerometer) {
      processed.activity = this.detectActivity(rawData.accelerometer);
      processed.steps = this.countSteps(rawData.accelerometer);
      processed.fallDetected = this.detectFall(rawData.accelerometer);
    }

    // Process GPS data
    if (rawData.gps) {
      processed.location = {
        latitude: rawData.gps.latitude,
        longitude: rawData.gps.longitude,
        accuracy: rawData.gps.accuracy,
        altitude: rawData.gps.altitude
      };
    }

    // Process environmental data
    if (rawData.environmental) {
      processed.temperature = rawData.environmental.temperature;
      processed.humidity = rawData.environmental.humidity;
      processed.pressure = rawData.environmental.pressure;
    }

    return processed;
  }

  // Calculate heart rate from PPG data
  calculateHeartRate(ppgData) {
    // Simple peak detection algorithm
    const peaks = this.detectPeaks(ppgData);
    if (peaks.length < 2) return null;
    
    const timeDiff = (peaks[peaks.length - 1] - peaks[0]) / (peaks.length - 1);
    const heartRate = 60000 / timeDiff; // Convert to BPM
    
    return Math.round(heartRate);
  }

  // Calculate SpO2 from PPG data
  calculateSpO2(ppgData) {
    // Simplified SpO2 calculation (in production, use proper algorithm)
    const redSignal = ppgData.red || ppgData.signal;
    const irSignal = ppgData.ir || ppgData.signal;
    
    if (!redSignal || !irSignal) return null;
    
    const ratio = this.calculateRatio(redSignal, irSignal);
    const spo2 = 110 - 25 * ratio; // Simplified formula
    
    return Math.max(70, Math.min(100, Math.round(spo2)));
  }

  // Calculate respiratory rate
  calculateRespiratoryRate(ppgData) {
    // Extract respiratory component from PPG
    const respiratorySignal = this.extractRespiratoryComponent(ppgData);
    const peaks = this.detectPeaks(respiratorySignal);
    
    if (peaks.length < 2) return null;
    
    const timeDiff = (peaks[peaks.length - 1] - peaks[0]) / (peaks.length - 1);
    const respiratoryRate = 60000 / timeDiff;
    
    return Math.round(respiratoryRate);
  }

  // Detect activity from accelerometer data
  detectActivity(accelerometerData) {
    const { x, y, z } = accelerometerData;
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    
    if (magnitude < 1.1) return 'stationary';
    if (magnitude < 1.5) return 'walking';
    if (magnitude < 2.0) return 'running';
    return 'high_activity';
  }

  // Count steps from accelerometer data
  countSteps(accelerometerData) {
    // Simple step counting algorithm
    const { x, y, z } = accelerometerData;
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    
    // This is a simplified implementation
    // In production, use proper step detection algorithms
    return magnitude > 1.2 ? 1 : 0;
  }

  // Detect fall from accelerometer data
  detectFall(accelerometerData) {
    const { x, y, z } = accelerometerData;
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    
    // Fall detection threshold
    return magnitude > 3.0;
  }

  // Check for health anomalies
  checkHealthAnomalies(deviceId, healthData) {
    const device = this.registeredDevices.get(deviceId);
    if (!device) return;

    const anomalies = [];

    // Check heart rate anomalies
    if (healthData.heartRate) {
      if (healthData.heartRate < 40 || healthData.heartRate > 200) {
        anomalies.push({
          type: 'abnormal_heart_rate',
          severity: 'high',
          value: healthData.heartRate,
          normalRange: '60-100 BPM'
        });
      }
    }

    // Check SpO2 anomalies
    if (healthData.spo2) {
      if (healthData.spo2 < 90) {
        anomalies.push({
          type: 'low_oxygen_saturation',
          severity: 'high',
          value: healthData.spo2,
          normalRange: '95-100%'
        });
      }
    }

    // Check fall detection
    if (healthData.fallDetected) {
      anomalies.push({
        type: 'fall_detected',
        severity: 'high',
        value: true,
        description: 'Potential fall detected by accelerometer'
      });
    }

    // Check respiratory rate
    if (healthData.respiratoryRate) {
      if (healthData.respiratoryRate < 8 || healthData.respiratoryRate > 30) {
        anomalies.push({
          type: 'abnormal_respiratory_rate',
          severity: 'medium',
          value: healthData.respiratoryRate,
          normalRange: '12-20 breaths/min'
        });
      }
    }

    if (anomalies.length > 0) {
      this.createHealthAlert(deviceId, anomalies);
    }
  }

  // Create health alert
  createHealthAlert(deviceId, anomalies) {
    const alertId = crypto.randomUUID();
    const device = this.registeredDevices.get(deviceId);
    
    const alert = {
      alertId,
      deviceId,
      touristId: device.touristId,
      deviceType: device.deviceType,
      anomalies,
      severity: this.getMaxSeverity(anomalies),
      timestamp: new Date().toISOString(),
      status: 'active',
      location: device.location,
      batteryLevel: device.batteryLevel
    };

    this.healthAlerts.set(alertId, alert);
    this.emit('healthAlert', alert);

    return alert;
  }

  // Get maximum severity from anomalies
  getMaxSeverity(anomalies) {
    const severities = anomalies.map(a => a.severity);
    if (severities.includes('high')) return 'high';
    if (severities.includes('medium')) return 'medium';
    return 'low';
  }

  // Handle SOS alert
  handleSOSAlert(deviceId, sensorData) {
    const device = this.registeredDevices.get(deviceId);
    if (!device) return;

    const sosAlert = {
      alertId: crypto.randomUUID(),
      deviceId,
      touristId: device.touristId,
      deviceType: device.deviceType,
      type: 'sos_manual',
      severity: 'high',
      timestamp: new Date().toISOString(),
      location: sensorData.location,
      batteryLevel: sensorData.batteryLevel,
      signalStrength: sensorData.signalStrength,
      status: 'active'
    };

    this.emit('sosAlert', sosAlert);
    return sosAlert;
  }

  // Get device status
  getDeviceStatus(deviceId) {
    const device = this.registeredDevices.get(deviceId);
    if (!device) return null;

    const recentData = this.sensorData.get(deviceId) || [];
    const lastData = recentData[recentData.length - 1];

    return {
      deviceId,
      touristId: device.touristId,
      deviceType: device.deviceType,
      status: device.deviceInfo.status,
      lastSeen: device.lastSeen,
      batteryLevel: device.batteryLevel,
      signalStrength: device.signalStrength,
      location: device.location,
      healthData: lastData?.processedData || null,
      activeAlerts: Array.from(this.healthAlerts.values())
        .filter(alert => alert.deviceId === deviceId && alert.status === 'active')
    };
  }

  // Get all devices for a tourist
  getTouristDevices(touristId) {
    const devices = [];
    for (const [deviceId, device] of this.registeredDevices) {
      if (device.touristId === touristId) {
        devices.push(this.getDeviceStatus(deviceId));
      }
    }
    return devices;
  }

  // Get sensor data history
  getSensorDataHistory(deviceId, limit = 100) {
    const dataHistory = this.sensorData.get(deviceId) || [];
    return dataHistory.slice(-limit);
  }

  // Get health alerts
  getHealthAlerts(filters = {}) {
    let alerts = Array.from(this.healthAlerts.values());
    
    if (filters.deviceId) {
      alerts = alerts.filter(alert => alert.deviceId === filters.deviceId);
    }
    
    if (filters.touristId) {
      alerts = alerts.filter(alert => alert.touristId === filters.touristId);
    }
    
    if (filters.severity) {
      alerts = alerts.filter(alert => alert.severity === filters.severity);
    }
    
    if (filters.status) {
      alerts = alerts.filter(alert => alert.status === filters.status);
    }

    return alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // Update device status
  updateDeviceStatus(deviceId, status) {
    const device = this.registeredDevices.get(deviceId);
    if (!device) return false;

    device.deviceInfo.status = status;
    device.lastSeen = new Date().toISOString();

    this.logDeviceEvent('status_updated', deviceId, { status });
    return true;
  }

  // Log device event
  logDeviceEvent(eventType, deviceId, details) {
    const log = {
      eventType,
      deviceId,
      details,
      timestamp: new Date().toISOString()
    };

    this.emit('deviceEvent', log);
    return log;
  }

  // Get communication protocols
  getCommunicationProtocols() {
    return Array.from(this.communicationProtocols.entries()).map(([key, protocol]) => ({
      protocol: key,
      ...protocol
    }));
  }

  // Get device types
  getDeviceTypes() {
    return this.deviceTypes || [];
  }

  // Helper methods for signal processing
  detectPeaks(signal) {
    // Simple peak detection algorithm
    const peaks = [];
    const threshold = 0.5;
    
    for (let i = 1; i < signal.length - 1; i++) {
      if (signal[i] > signal[i-1] && signal[i] > signal[i+1] && signal[i] > threshold) {
        peaks.push(i);
      }
    }
    
    return peaks;
  }

  calculateRatio(redSignal, irSignal) {
    const redAC = this.getACComponent(redSignal);
    const redDC = this.getDCComponent(redSignal);
    const irAC = this.getACComponent(irSignal);
    const irDC = this.getDCComponent(irSignal);
    
    return (redAC / redDC) / (irAC / irDC);
  }

  getACComponent(signal) {
    const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
    return Math.sqrt(signal.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / signal.length);
  }

  getDCComponent(signal) {
    return signal.reduce((a, b) => a + b, 0) / signal.length;
  }

  extractRespiratoryComponent(ppgData) {
    // Simplified respiratory extraction
    // In production, use proper signal processing
    return ppgData.map((val, i) => Math.sin(i * 0.1) * 0.1);
  }

  // Generate device pairing report
  generatePairingReport(touristId) {
    const devices = this.getTouristDevices(touristId);
    const alerts = this.getHealthAlerts({ touristId });
    
    return {
      touristId,
      generatedAt: new Date().toISOString(),
      totalDevices: devices.length,
      activeDevices: devices.filter(d => d.status === 'active').length,
      devices: devices.map(device => ({
        deviceId: device.deviceId,
        deviceType: device.deviceType,
        status: device.status,
        lastSeen: device.lastSeen,
        batteryLevel: device.batteryLevel,
        activeAlerts: device.activeAlerts.length
      })),
      totalAlerts: alerts.length,
      activeAlerts: alerts.filter(a => a.status === 'active').length,
      recentAlerts: alerts.slice(0, 5)
    };
  }
}

module.exports = new IoTIntegrationService();
