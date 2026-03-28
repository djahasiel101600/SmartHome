// ===== PIN DEFINITIONS =====
// Relay pins (active LOW - common relay modules)
#define RELAY_1_PIN D1 // GPIO5
#define RELAY_2_PIN D2 // GPIO4
#define RELAY_3_PIN D5 // GPIO14
#define RELAY_4_PIN D6 // GPIO12

// DHT11 sensor pin
#define DHT_PIN D7 // GPIO13
#define DHT_TYPE DHT11

// OLED Display (I2C)
// SDA = D3 (GPIO0) - note: some boards use D2
// SCL = D4 (GPIO2) - note: some boards use D1
// Adjust if your wiring differs
#define OLED_SDA D3
#define OLED_SCL D4

// ===== SERVER CONFIGURATION =====
// The WebSocket server address (your Django backend)
// Change these to match your setup
#define WS_HOST "192.168.1.100"
#define WS_PORT 8000

// Device ID - must match a device_id UUID in the Django database
// Create a device via the API first, then paste its UUID here
#define DEVICE_ID "PASTE-YOUR-DEVICE-UUID-HERE"

// ===== TIMING CONFIGURATION =====
#define SENSOR_READ_INTERVAL 10000   // Read DHT11 every 10 seconds
#define HEARTBEAT_INTERVAL 30000     // Send heartbeat every 30 seconds
#define DISPLAY_UPDATE_INTERVAL 2000 // Refresh OLED every 2 seconds
#define RECONNECT_INTERVAL 5000      // WebSocket reconnect delay (ms)
#define MAX_RECONNECT_INTERVAL 60000 // Max reconnect delay (ms)

// ===== DISPLAY =====
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
