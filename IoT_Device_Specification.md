# IoT Device Integration Specification
## Smart Tourist Safety Bands & Tags

### Overview
This document outlines the hardware and firmware specifications for IoT devices that integrate with the Smart Tourist Safety system. The system supports multiple device types with QR code pairing and real-time sensor data transmission.

## Device Types

### 1. Smart Safety Band
**Target Users**: General tourists, adventure travelers
**Key Features**: Heart rate, SpO2, location, SOS, 7-day battery
**Price**: $99

#### Hardware Specifications
- **MCU**: ESP32-S3 (WiFi + Bluetooth LE)
- **Sensors**: 
  - PPG sensor (MAX30102) for heart rate and SpO2
  - 3-axis accelerometer (LSM6DS3)
  - 3-axis gyroscope (LSM6DS3)
  - GPS module (NEO-8M)
- **Display**: 1.3" OLED (128x64)
- **Battery**: 500mAh Li-Po (7 days standby)
- **Charging**: USB-C
- **Waterproof**: IP67
- **Size**: 45mm x 20mm x 12mm

#### Firmware Requirements
```c
// Core sensor reading functions
void readPPGData(uint32_t* red, uint32_t* ir);
void readAccelerometer(float* x, float* y, float* z);
void readGyroscope(float* x, float* y, float* z);
void readGPS(float* lat, float* lng, float* accuracy);
void readBatteryLevel(uint8_t* level);

// Communication functions
void sendBluetoothData(sensor_data_t* data);
void sendWiFiData(sensor_data_t* data);
void handleSOSButton();

// Power management
void enterSleepMode();
void wakeFromSleep();
void optimizePowerConsumption();
```

### 2. Emergency Safety Tag
**Target Users**: Budget-conscious tourists, group travelers
**Key Features**: Location, SOS, environmental sensors, 30-day battery
**Price**: $49

#### Hardware Specifications
- **MCU**: STM32L4 (Low power)
- **Sensors**:
  - GPS module (NEO-8M)
  - 3-axis accelerometer (LSM6DS3)
  - Temperature sensor (DS18B20)
- **Communication**: LoRaWAN + Bluetooth LE
- **Battery**: 2000mAh Li-SOCl2 (30 days)
- **Waterproof**: IP67
- **Size**: 60mm x 40mm x 15mm

#### Firmware Requirements
```c
// Core functions
void readGPS(float* lat, float* lng, float* accuracy);
void readAccelerometer(float* x, float* y, float* z);
void readTemperature(float* temp);
void sendLoRaWANData(sensor_data_t* data);
void sendBluetoothData(sensor_data_t* data);
void handleSOSButton();
```

### 3. Advanced Health Monitor
**Target Users**: Elderly tourists, health-conscious travelers
**Key Features**: Comprehensive health monitoring, 5-day battery
**Price**: $199

#### Hardware Specifications
- **MCU**: ESP32-S3 (WiFi + Bluetooth LE + Cellular)
- **Sensors**:
  - PPG sensor (MAX30102) for heart rate and SpO2
  - 3-axis accelerometer (LSM6DS3)
  - 3-axis gyroscope (LSM6DS3)
  - GPS module (NEO-8M)
  - Temperature sensor (MLX90614)
  - Humidity sensor (SHT30)
- **Display**: 2.4" TFT LCD (320x240)
- **Battery**: 1000mAh Li-Po (5 days)
- **Charging**: Wireless + USB-C
- **Waterproof**: IP68
- **Size**: 50mm x 30mm x 15mm

### 4. Remote Area Satellite Tag
**Target Users**: Adventure tourists, remote area travelers
**Key Features**: Satellite communication, 14-day battery
**Price**: $299

#### Hardware Specifications
- **MCU**: STM32H7 (High performance)
- **Sensors**:
  - GPS module (NEO-8M)
  - 3-axis accelerometer (LSM6DS3)
- **Communication**: Satellite (Iridium) + Bluetooth LE
- **Battery**: 3000mAh Li-SOCl2 (14 days)
- **Waterproof**: IP68
- **Size**: 80mm x 50mm x 20mm

## Communication Protocols

### 1. Bluetooth Low Energy (BLE)
**Use Case**: Short-range communication with smartphones
**Range**: 100m
**Data Rate**: 1Mbps
**Power**: Low

```c
// BLE Service UUID: 12345678-1234-1234-1234-123456789ABC
// Characteristic UUIDs:
// - Heart Rate: 12345678-1234-1234-1234-123456789ABD
// - Location: 12345678-1234-1234-1234-123456789ABE
// - SOS: 12345678-1234-1234-1234-123456789ABF
// - Battery: 12345678-1234-1234-1234-123456789AC0

void setupBLE() {
    BLEDevice::init("TouristSafety");
    BLEServer* pServer = BLEDevice::createServer();
    BLEService* pService = pServer->createService(SERVICE_UUID);
    
    // Heart Rate Characteristic
    BLECharacteristic* pHeartRate = pService->createCharacteristic(
        HEART_RATE_CHAR_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    
    // Location Characteristic
    BLECharacteristic* pLocation = pService->createCharacteristic(
        LOCATION_CHAR_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    
    // SOS Characteristic
    BLECharacteristic* pSOS = pService->createCharacteristic(
        SOS_CHAR_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_NOTIFY
    );
    
    pService->start();
    pServer->getAdvertising()->start();
}
```

### 2. LoRaWAN
**Use Case**: Long-range communication in remote areas
**Range**: 15km
**Data Rate**: 50kbps
**Power**: Very Low

```c
// LoRaWAN Configuration
#define LORAWAN_APP_EUI "1234567890123456"
#define LORAWAN_APP_KEY "12345678901234567890123456789012"
#define LORAWAN_DEV_EUI "1234567890123456"

void setupLoRaWAN() {
    LoRaWAN.begin(EU868);
    LoRaWAN.setSubBand(2);
    LoRaWAN.setAdaptiveDR(true);
    LoRaWAN.setDutyCycle(false);
    LoRaWAN.setAntennaGain(2.0);
    LoRaWAN.setTxPower(14);
}

void sendLoRaWANData(sensor_data_t* data) {
    uint8_t payload[64];
    int payloadSize = 0;
    
    // Pack sensor data
    payload[payloadSize++] = (data->heartRate >> 8) & 0xFF;
    payload[payloadSize++] = data->heartRate & 0xFF;
    payload[payloadSize++] = data->spo2;
    payload[payloadSize++] = (data->batteryLevel >> 8) & 0xFF;
    payload[payloadSize++] = data->batteryLevel & 0xFF;
    
    // Send data
    LoRaWAN.sendData(1, payload, payloadSize, false);
}
```

### 3. WiFi
**Use Case**: High-speed communication in urban areas
**Range**: 100m
**Data Rate**: 54Mbps
**Power**: High

```c
void setupWiFi() {
    WiFi.begin(SSID, PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(1000);
    }
}

void sendWiFiData(sensor_data_t* data) {
    HTTPClient http;
    http.begin("https://api.touristsafety.com/iot/sensor-data");
    http.addHeader("Content-Type", "application/json");
    
    String jsonData = "{";
    jsonData += "\"deviceId\":\"" + String(deviceId) + "\",";
    jsonData += "\"sensorData\":{";
    jsonData += "\"heartRate\":" + String(data->heartRate) + ",";
    jsonData += "\"spo2\":" + String(data->spo2) + ",";
    jsonData += "\"location\":{";
    jsonData += "\"latitude\":" + String(data->latitude) + ",";
    jsonData += "\"longitude\":" + String(data->longitude);
    jsonData += "}";
    jsonData += "}";
    jsonData += "}";
    
    int httpResponseCode = http.POST(jsonData);
    http.end();
}
```

### 4. Cellular (4G/5G)
**Use Case**: Global communication
**Range**: Unlimited
**Data Rate**: 100Mbps
**Power**: High

```c
void setupCellular() {
    SerialAT.begin(115200);
    modem.init();
    modem.simUnlock("1234");
    modem.gprsConnect("internet", "user", "pass");
}

void sendCellularData(sensor_data_t* data) {
    String url = "https://api.touristsafety.com/iot/sensor-data";
    String payload = createJSONPayload(data);
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + String(deviceToken));
    
    int httpResponseCode = http.POST(payload);
    http.end();
}
```

### 5. Satellite (Iridium)
**Use Case**: Global communication in remote areas
**Range**: Global
**Data Rate**: 1Mbps
**Power**: Very High

```c
void setupSatellite() {
    iridiumSerial.begin(19200);
    iridiumSerial.setTimeout(1000);
}

void sendSatelliteData(sensor_data_t* data) {
    String message = "TST," + String(deviceId) + "," + 
                    String(data->latitude, 6) + "," + 
                    String(data->longitude, 6) + "," + 
                    String(data->heartRate) + "," + 
                    String(data->batteryLevel);
    
    iridiumSerial.println(message);
}
```

## QR Code Integration

### QR Code Format
```
TST_<16_character_hex_code>
```

### QR Code Data Structure
```json
{
  "deviceType": "smart_band",
  "touristId": "tourist-uuid",
  "pairingCode": "a1b2c3d4e5f6g7h8",
  "timestamp": "2024-01-01T00:00:00Z",
  "expiresAt": "2024-01-02T00:00:00Z",
  "additionalData": {
    "region": "assam",
    "entryPoint": "guwahati-airport"
  }
}
```

### Pairing Process
1. Device generates QR code with pairing data
2. Tourist scans QR code with mobile app
3. App validates QR code and establishes connection
4. Device sends initial sensor data
5. App confirms pairing and starts data collection

## Sensor Data Processing

### PPG Sensor Processing
```c
// Heart Rate Calculation
float calculateHeartRate(uint32_t* ppgData, int length) {
    float peaks[100];
    int peakCount = detectPeaks(ppgData, length, peaks);
    
    if (peakCount < 2) return 0;
    
    float avgInterval = 0;
    for (int i = 1; i < peakCount; i++) {
        avgInterval += peaks[i] - peaks[i-1];
    }
    avgInterval /= (peakCount - 1);
    
    return 60000.0 / avgInterval; // Convert to BPM
}

// SpO2 Calculation
float calculateSpO2(uint32_t* redData, uint32_t* irData, int length) {
    float redAC = calculateACComponent(redData, length);
    float redDC = calculateDCComponent(redData, length);
    float irAC = calculateACComponent(irData, length);
    float irDC = calculateDCComponent(irData, length);
    
    float ratio = (redAC / redDC) / (irAC / irDC);
    return 110 - 25 * ratio; // Simplified formula
}
```

### Accelerometer Processing
```c
// Activity Detection
String detectActivity(float x, float y, float z) {
    float magnitude = sqrt(x*x + y*y + z*z);
    
    if (magnitude < 1.1) return "stationary";
    if (magnitude < 1.5) return "walking";
    if (magnitude < 2.0) return "running";
    return "high_activity";
}

// Fall Detection
bool detectFall(float x, float y, float z) {
    float magnitude = sqrt(x*x + y*y + z*z);
    return magnitude > 3.0; // Fall threshold
}
```

## Power Management

### Sleep Modes
```c
// Deep Sleep Mode (Lowest Power)
void enterDeepSleep(int seconds) {
    esp_sleep_enable_timer_wakeup(seconds * 1000000);
    esp_deep_sleep_start();
}

// Light Sleep Mode (Medium Power)
void enterLightSleep() {
    esp_light_sleep_start();
}

// Power Optimization
void optimizePowerConsumption() {
    // Reduce CPU frequency
    setCpuFrequencyMhz(80);
    
    // Disable unused peripherals
    WiFi.mode(WIFI_OFF);
    BluetoothSerial.end();
    
    // Reduce sensor sampling rate
    setSensorSamplingRate(1000); // 1Hz
}
```

### Battery Monitoring
```c
uint8_t readBatteryLevel() {
    int rawValue = analogRead(BATTERY_PIN);
    float voltage = (rawValue / 4095.0) * 3.3 * 2; // Voltage divider
    uint8_t percentage = map(voltage, 3.0, 4.2, 0, 100);
    return constrain(percentage, 0, 100);
}
```

## Security Features

### Device Authentication
```c
// Generate device signature
String generateDeviceSignature(String data, String secretKey) {
    String payload = data + secretKey;
    String signature = sha256(payload);
    return signature;
}

// Verify device signature
bool verifyDeviceSignature(String data, String signature, String secretKey) {
    String expectedSignature = generateDeviceSignature(data, secretKey);
    return signature.equals(expectedSignature);
}
```

### Data Encryption
```c
// Encrypt sensor data
String encryptData(String data, String key) {
    AES128 aes128;
    aes128.setKey(key.c_str(), 16);
    String encrypted = aes128.encrypt(data);
    return encrypted;
}
```

## Mobile App Integration

### Android Integration
```java
// Bluetooth LE Service Discovery
private void discoverServices() {
    bluetoothGatt.discoverServices();
}

// Characteristic Read/Write
private void readCharacteristic(BluetoothGattCharacteristic characteristic) {
    bluetoothGatt.readCharacteristic(characteristic);
}

private void writeCharacteristic(BluetoothGattCharacteristic characteristic, byte[] value) {
    characteristic.setValue(value);
    bluetoothGatt.writeCharacteristic(characteristic);
}
```

### iOS Integration
```swift
// Core Bluetooth Service Discovery
func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard let services = peripheral.services else { return }
    for service in services {
        peripheral.discoverCharacteristics(nil, for: service)
    }
}

// Characteristic Read/Write
func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    guard let data = characteristic.value else { return }
    processSensorData(data)
}
```

## Testing and Validation

### Unit Tests
```c
void testHeartRateCalculation() {
    uint32_t testData[] = {100, 200, 150, 250, 120, 180, 160, 240};
    float heartRate = calculateHeartRate(testData, 8);
    assert(heartRate > 60 && heartRate < 120);
}

void testSpO2Calculation() {
    uint32_t redData[] = {1000, 1100, 1050, 1150, 1020, 1080, 1060, 1120};
    uint32_t irData[] = {800, 900, 850, 950, 820, 880, 860, 920};
    float spo2 = calculateSpO2(redData, irData, 8);
    assert(spo2 >= 95 && spo2 <= 100);
}
```

### Integration Tests
```c
void testDataTransmission() {
    sensor_data_t testData = {
        .heartRate = 75,
        .spo2 = 98,
        .latitude = 26.1841,
        .longitude = 91.7462,
        .batteryLevel = 85
    };
    
    bool success = sendBluetoothData(&testData);
    assert(success == true);
}
```

## Manufacturing Guidelines

### PCB Design
- Use 4-layer PCB for better signal integrity
- Implement proper grounding and power distribution
- Include test points for debugging
- Use surface-mount components for compact design

### Assembly
- Follow IPC-A-610 standards
- Implement proper ESD protection
- Use conformal coating for waterproofing
- Include proper strain relief for cables

### Quality Control
- Test all sensors before assembly
- Verify communication protocols
- Test battery life under various conditions
- Validate waterproofing (IP67/IP68)

## Regulatory Compliance

### FCC Certification
- Ensure proper RF emissions
- Test for interference
- Include proper labeling

### CE Marking
- Comply with EU regulations
- Include proper documentation
- Test for safety standards

### Medical Device Regulations
- If claiming health monitoring capabilities
- Follow FDA guidelines for medical devices
- Include proper disclaimers

## Cost Optimization

### Component Selection
- Use cost-effective microcontrollers
- Select sensors with good price/performance ratio
- Consider volume discounts for production

### Manufacturing
- Optimize PCB design for cost
- Use standard components where possible
- Consider assembly automation

### Software
- Optimize code for efficiency
- Use open-source libraries where possible
- Implement efficient power management

This specification provides a comprehensive framework for developing IoT devices that integrate seamlessly with the Smart Tourist Safety system. The modular design allows for different device types while maintaining consistent communication protocols and data formats.
