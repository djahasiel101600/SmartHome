// ===== FIRMWARE VERSION =====
#define FIRMWARE_VERSION "1.0.0"

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

// ===== SERVER DEFAULTS =====
// These are used as initial/fallback values.
// Users configure the actual values via the WiFiManager captive portal,
// which saves them to LittleFS and loads them on every boot.
#define DEFAULT_WS_HOST "192.168.1.100"
#define DEFAULT_WS_PORT "8000"
#define DEFAULT_DEVICE_ID ""

// Max field lengths (including null terminator)
#define WS_HOST_LEN 64
#define WS_PORT_LEN 6
#define DEVICE_ID_LEN 48

// LittleFS config file path
#define CONFIG_FILE "/config.json"

// ===== TIMING CONFIGURATION =====
#define SENSOR_READ_INTERVAL 10000   // Read DHT11 every 10 seconds
#define HEARTBEAT_INTERVAL 30000     // Send heartbeat every 30 seconds
#define DISPLAY_UPDATE_INTERVAL 2000 // Refresh OLED every 2 seconds
#define RECONNECT_INTERVAL 5000      // Initial WebSocket reconnect delay (ms)
#define MAX_RECONNECT_INTERVAL 60000 // Max reconnect delay (ms)

// ===== WIFI RESILIENCE =====
#define WIFI_CHECK_INTERVAL 10000         // Check WiFi status every 10s
#define WIFI_RECONNECT_TIMEOUT 30000      // Wait 30s for WiFi reconnect before escalating
#define WIFI_MAX_FAILURES_BEFORE_PORTAL 5 // Re-enter captive portal after N consecutive failures
#define CONFIG_RESET_PIN 15               // GPIO15 — hold HIGH on boot to force captive portal
#define CONFIG_RESET_HOLD_MS 3000         // Hold button for 3s to trigger reset

// ===== DISPLAY =====
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
