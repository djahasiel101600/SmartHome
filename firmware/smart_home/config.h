// ===== PIN DEFINITIONS =====
// Relay pins (active LOW - common relay modules)
#define RELAY_1_PIN 16 // GPIO16
#define RELAY_2_PIN 17 // GPIO17
#define RELAY_3_PIN 18 // GPIO18
#define RELAY_4_PIN 19 // GPIO19

// DHT11 sensor pin
#define DHT_PIN 4 // GPIO4
#define DHT_TYPE DHT11

// OLED Display (I2C) — ESP32 default I2C pins
#define OLED_SDA 21 // GPIO21
#define OLED_SCL 22 // GPIO22

// ===== SERVER CONFIGURATION =====
// NOTE: This file is for the Arduino IDE sketch (smart_home.ino).
// The PlatformIO build (src/main.cpp + include/config.h) is the
// active version with auto-discovery and auto-registration.
// Consider migrating to PlatformIO for the full feature set.
#define WS_HOST "192.168.1.100"
#define WS_PORT 8000

// Device ID - must match a device_id in the Django database
// Create a device via the API first, then paste its UUID here
#define DEVICE_ID "9ac66b4a-484a-4068-8a5a-7c94497566b8"

// ===== TIMING CONFIGURATION =====
#define SENSOR_READ_INTERVAL 10000   // Read DHT11 every 10 seconds
#define HEARTBEAT_INTERVAL 30000     // Send heartbeat every 30 seconds
#define DISPLAY_UPDATE_INTERVAL 2000 // Refresh OLED every 2 seconds
#define RECONNECT_INTERVAL 5000      // WebSocket reconnect delay (ms)
#define MAX_RECONNECT_INTERVAL 60000 // Max reconnect delay (ms)

// ===== DISPLAY =====
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
