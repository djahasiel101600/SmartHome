/*
 * Smart Home Automation - ESP32 Firmware
 *
 * Hardware:
 *   - ESP32 DevKit V1
 *   - 4-Channel Relay Module (active LOW)
 *   - DHT11 Temperature & Humidity Sensor
 *   - SH1106 128x64 OLED Display (I2C)
 *
 * Connectivity features:
 *   - WiFi auto-reconnect with exponential backoff
 *   - WiFi event-driven disconnect detection
 *   - WebSocket reconnect with exponential backoff
 *   - OTA firmware updates via HTTP
 *   - Config reset via button hold on boot
 *   - Captive portal re-entry after repeated WiFi failures
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPUpdate.h>
#include <WiFiManager.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <U8g2lib.h>
#include <Wire.h>
#include <LittleFS.h>
#include <ESPmDNS.h>

#include "config.h"

// ===== CONNECTION STATE MACHINE =====
enum ConnState
{
    CONN_WIFI_DISCONNECTED,
    CONN_WIFI_CONNECTING,
    CONN_WIFI_CONNECTED,
    CONN_WS_CONNECTING,
    CONN_WS_CONNECTED
};

// ===== OBJECTS =====
WebSocketsClient webSocket;
DHT dht(DHT_PIN, DHT_TYPE);

// SH1106 128x64 I2C - adjust constructor if your display differs
U8G2_SH1106_128X64_NONAME_F_SW_I2C display(U8G2_R0, OLED_SCL, OLED_SDA, U8X8_PIN_NONE);

// ===== USER-CONFIGURABLE SETTINGS (via captive portal) =====
char cfgWsHost[WS_HOST_LEN] = DEFAULT_WS_HOST;
char cfgWsPort[WS_PORT_LEN] = DEFAULT_WS_PORT;
char cfgDeviceId[DEVICE_ID_LEN] = ""; // Auto-generated from MAC on first boot

// ===== RELAY LABELS (synced from server) =====
char relayLabels[MAX_RELAYS][RELAY_LABEL_LEN] = {"Relay 1", "Relay 2", "Relay 3", "Relay 4"};

// ===== STATE =====
bool relayStates[4] = {false, false, false, false};
const int relayPins[4] = {RELAY_1_PIN, RELAY_2_PIN, RELAY_3_PIN, RELAY_4_PIN};

float lastTemperature = NAN;
float lastHumidity = NAN;

ConnState connState = CONN_WIFI_DISCONNECTED;
bool wsConnected = false;
bool wsStarted = false;

unsigned long lastSensorRead = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastDisplayUpdate = 0;
unsigned long lastWifiCheck = 0;
unsigned long wifiDisconnectedSince = 0;
unsigned long lastWifiReconnectAttempt = 0;
unsigned long wifiReconnectDelay = RECONNECT_INTERVAL;
unsigned long wsReconnectDelay = RECONNECT_INTERVAL;

int wifiConsecutiveFailures = 0;
bool wifiWasConnected = false;

// OTA state
bool otaInProgress = false;
int otaProgressPercent = 0;

// ===== FORWARD DECLARATIONS =====
void sendRelayState(int relayNum, bool state);
void setRelay(int relayNum, bool state);
void readAndSendSensor();
void sendHeartbeat();
void handleCommand(JsonDocument &doc);
void handleRelayConfig(JsonDocument &doc);
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length);
void updateDisplay();
void loadConfig();
void saveConfig();
bool configChanged(const char *newHost, const char *newPort);
void handleOTAUpdate(const char *url, const char *version);
void sendDeviceInfo();
void startWebSocket();
void stopWebSocket();
void checkWifiConnection();
void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info);
bool checkConfigResetButton();
void startCaptivePortal(bool forcePortal);
void displayMessage(const char *line1, const char *line2 = nullptr, const char *line3 = nullptr, const char *line4 = nullptr);
void generateDeviceId();
bool discoverServer();

// ===== RELAY CONTROL =====
void setRelay(int relayNum, bool state)
{
    if (relayNum < 1 || relayNum > 4)
        return;

    int index = relayNum - 1;
    relayStates[index] = state;

    // Active LOW relay modules: LOW = ON, HIGH = OFF
    digitalWrite(relayPins[index], state ? LOW : HIGH);

    Serial.printf("Relay %d set to %s\n", relayNum, state ? "ON" : "OFF");

    // Report state back to server
    sendRelayState(relayNum, state);
}

void sendRelayState(int relayNum, bool state)
{
    if (!wsConnected)
        return;

    JsonDocument doc;
    doc["type"] = "relay_state";
    doc["relay"] = relayNum;
    doc["state"] = state;

    String payload;
    serializeJson(doc, payload);
    webSocket.sendTXT(payload);
}

// ===== SENSOR =====
void readAndSendSensor()
{
    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();

    if (isnan(humidity) || isnan(temperature))
    {
        Serial.println("DHT11 read failed");
        return;
    }

    lastTemperature = temperature;
    lastHumidity = humidity;

    Serial.printf("Temp: %.1f°C  Humidity: %.1f%%\n", temperature, humidity);

    if (!wsConnected)
        return;

    JsonDocument doc;
    doc["type"] = "sensor_data";
    doc["temperature"] = round(temperature * 10.0) / 10.0;
    doc["humidity"] = round(humidity * 10.0) / 10.0;

    String payload;
    serializeJson(doc, payload);
    webSocket.sendTXT(payload);
}

// ===== HEARTBEAT =====
void sendHeartbeat()
{
    if (!wsConnected)
        return;

    JsonDocument doc;
    doc["type"] = "heartbeat";
    doc["firmware_version"] = FIRMWARE_VERSION;

    String payload;
    serializeJson(doc, payload);
    webSocket.sendTXT(payload);
}

// ===== DEVICE INFO (sent on WebSocket connect) =====
void sendDeviceInfo()
{
    if (!wsConnected)
        return;

    JsonDocument doc;
    doc["type"] = "device_info";
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["mac_address"] = WiFi.macAddress();

    String payload;
    serializeJson(doc, payload);
    webSocket.sendTXT(payload);
}

// ===== OTA UPDATE =====
void sendOTAProgress(const char *otaStatus, int progress)
{
    if (!wsConnected)
        return;

    JsonDocument doc;
    doc["type"] = "ota_progress";
    doc["status"] = otaStatus;
    doc["progress"] = progress;

    String payload;
    serializeJson(doc, payload);
    webSocket.sendTXT(payload);
}

void sendOTAResult(bool success, const char *version, const char *error)
{
    if (!wsConnected)
        return;

    JsonDocument doc;
    doc["type"] = "ota_result";
    doc["success"] = success;
    doc["version"] = version;
    if (error)
        doc["error"] = error;

    String payload;
    serializeJson(doc, payload);
    webSocket.sendTXT(payload);
}

void handleOTAUpdate(const char *url, const char *version)
{
    if (otaInProgress)
    {
        Serial.println("OTA already in progress, ignoring");
        return;
    }

    // Skip if same version
    if (strcmp(version, FIRMWARE_VERSION) == 0)
    {
        Serial.printf("Already on firmware v%s, skipping OTA\n", version);
        sendOTAResult(false, version, "Already on this version");
        return;
    }

    Serial.printf("Starting OTA update to v%s from %s\n", version, url);
    otaInProgress = true;

    displayMessage("OTA Update", "Downloading...", version, "Do not power off!");
    sendOTAProgress("starting", 0);

    // Process any pending WebSocket data before blocking OTA
    webSocket.loop();

    WiFiClient wifiClient;

    httpUpdate.onProgress([](int progress, int total)
                          {
        int pct = (total > 0) ? (progress * 100 / total) : 0;
        otaProgressPercent = pct;
        Serial.printf("OTA progress: %d%%\n", pct);

        // Update display periodically
        if (pct % 10 == 0)
        {
            char progressStr[32];
            snprintf(progressStr, sizeof(progressStr), "Progress: %d%%", pct);
            displayMessage("OTA Update", "Downloading...", progressStr, "Do not power off!");
        } });

    httpUpdate.rebootOnUpdate(false);
    t_httpUpdate_return ret = httpUpdate.update(wifiClient, url);

    switch (ret)
    {
    case HTTP_UPDATE_OK:
        Serial.println("OTA update successful! Rebooting...");
        sendOTAProgress("completed", 100);
        sendOTAResult(true, version, nullptr);
        // Give WebSocket time to send the messages
        webSocket.loop();
        delay(500);
        webSocket.loop();
        displayMessage("OTA Complete!", "Rebooting...", version);
        delay(1000);
        ESP.restart();
        break;

    case HTTP_UPDATE_FAILED:
    {
        String errMsg = httpUpdate.getLastErrorString();
        Serial.printf("OTA failed: %s\n", errMsg.c_str());
        sendOTAResult(false, version, errMsg.c_str());
        displayMessage("OTA Failed!", errMsg.c_str(), "Continuing...");
        delay(3000);
        break;
    }

    case HTTP_UPDATE_NO_UPDATES:
        Serial.println("OTA: no update available");
        sendOTAResult(false, version, "No update available");
        break;
    }

    otaInProgress = false;
}

// ===== COMMAND HANDLING =====
void handleCommand(JsonDocument &doc)
{
    const char *action = doc["action"];
    if (!action)
        return;

    if (strcmp(action, "set_relay") == 0)
    {
        int relay = doc["relay"];
        bool state = doc["state"];
        setRelay(relay, state);
    }
    else if (strcmp(action, "firmware_update") == 0)
    {
        const char *url = doc["url"];
        const char *version = doc["version"];
        if (url && version)
        {
            handleOTAUpdate(url, version);
        }
    }
}

// ===== RELAY CONFIG (labels from server) =====
void handleRelayConfig(JsonDocument &doc)
{
    JsonArray relays = doc["relays"].as<JsonArray>();
    if (relays.isNull())
        return;

    for (JsonVariant r : relays)
    {
        int num = r["relay_number"] | 0;
        const char *label = r["label"];
        if (num >= 1 && num <= MAX_RELAYS && label)
        {
            strlcpy(relayLabels[num - 1], label, RELAY_LABEL_LEN);
            Serial.printf("Relay %d label: \"%s\"\n", num, label);
        }
    }
}

// ===== WEBSOCKET MANAGEMENT =====
void startWebSocket()
{
    if (wsStarted)
        return;

    if (strlen(cfgWsHost) == 0)
    {
        Serial.println("Cannot start WebSocket: no server host configured");
        return;
    }

    int port = atoi(cfgWsPort);
    if (port <= 0 || port > 65535)
    {
        Serial.printf("[WARN] Invalid port \"%s\", falling back to 8000\n", cfgWsPort);
        port = 8000;
    }

    String wsPath = "/ws/device/";
    wsPath += cfgDeviceId;
    wsPath += "/";

    Serial.printf("WebSocket connecting to ws://%s:%d%s\n", cfgWsHost, port, wsPath.c_str());

    webSocket.begin(cfgWsHost, port, wsPath);
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(RECONNECT_INTERVAL);
    webSocket.enableHeartbeat(15000, 3000, 2); // ping every 15s, pong timeout 3s, 2 retries

    wsStarted = true;
    wsReconnectDelay = RECONNECT_INTERVAL;
    connState = CONN_WS_CONNECTING;
}

void stopWebSocket()
{
    if (!wsStarted)
        return;

    webSocket.disconnect();
    wsStarted = false;
    wsConnected = false;
    Serial.println("WebSocket stopped");
}

// ===== WEBSOCKET EVENTS =====
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length)
{
    switch (type)
    {
    case WStype_DISCONNECTED:
        Serial.printf("WebSocket disconnected (WiFi RSSI: %d dBm)\n", WiFi.RSSI());
        wsConnected = false;
        if (connState == CONN_WS_CONNECTED)
        {
            connState = CONN_WS_CONNECTING;
        }
        // Exponential backoff: the library handles reconnect timing,
        // but we track state for display purposes
        wsReconnectDelay = min(wsReconnectDelay * 2, (unsigned long)MAX_RECONNECT_INTERVAL);
        break;

    case WStype_CONNECTED:
        Serial.printf("WebSocket connected to: %s\n", (char *)payload);
        wsConnected = true;
        wsReconnectDelay = RECONNECT_INTERVAL; // Reset backoff
        connState = CONN_WS_CONNECTED;

        // Send current relay states on connect — server needs to know
        // the actual hardware state after a reconnection
        for (int i = 0; i < 4; i++)
        {
            sendRelayState(i + 1, relayStates[i]);
        }

        // Report firmware version to server
        sendDeviceInfo();
        break;

    case WStype_TEXT:
    {
        Serial.printf("Received: %s\n", (char *)payload);

        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, payload, length);
        if (error)
        {
            Serial.printf("JSON parse error: %s\n", error.c_str());
            return;
        }

        const char *msgType = doc["type"];
        if (!msgType)
            return;

        if (strcmp(msgType, "command") == 0)
        {
            handleCommand(doc);
        }
        else if (strcmp(msgType, "relay_config") == 0)
        {
            handleRelayConfig(doc);
        }
        break;
    }

    case WStype_PING:
        // Library auto-responds with pong
        break;

    case WStype_PONG:
        break;

    default:
        break;
    }
}

// ===== WIFI EVENT HANDLER (ESP32) =====
void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info)
{
    switch (event)
    {
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
        Serial.printf("WiFi connected — IP: %s\n", WiFi.localIP().toString().c_str());
        wifiConsecutiveFailures = 0;
        wifiReconnectDelay = RECONNECT_INTERVAL;
        connState = CONN_WIFI_CONNECTED;
        wifiWasConnected = true;
        startWebSocket();
        break;

    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
        Serial.printf("WiFi disconnected — reason: %d\n", info.wifi_sta_disconnected.reason);
        stopWebSocket();
        connState = CONN_WIFI_DISCONNECTED;
        if (wifiWasConnected)
        {
            wifiDisconnectedSince = millis();
            wifiConsecutiveFailures++;
            Serial.printf("WiFi failure #%d\n", wifiConsecutiveFailures);
        }
        break;

    default:
        break;
    }
}

// ===== WIFI RECONNECTION =====
void checkWifiConnection()
{
    if (WiFi.status() == WL_CONNECTED)
    {
        // WiFi is fine — make sure WebSocket is running
        if (!wsStarted && connState >= CONN_WIFI_CONNECTED)
        {
            startWebSocket();
        }
        return;
    }

    // WiFi is not connected

    // After too many consecutive failures, re-enter captive portal
    if (wifiConsecutiveFailures >= WIFI_MAX_FAILURES_BEFORE_PORTAL)
    {
        Serial.printf("WiFi failed %d times — restarting into captive portal\n",
                      wifiConsecutiveFailures);

        displayMessage(
            "WiFi Failed!",
            "Too many retries.",
            "Restarting into",
            "setup portal...");
        delay(3000);

        // Erase saved WiFi creds and restart so WiFiManager opens the portal
        WiFiManager wm;
        wm.resetSettings();
        delay(500);
        ESP.restart();
    }

    // Attempt reconnect with exponential backoff
    unsigned long now = millis();
    if (now - lastWifiReconnectAttempt >= wifiReconnectDelay)
    {
        lastWifiReconnectAttempt = now;
        connState = CONN_WIFI_CONNECTING;

        Serial.printf("WiFi reconnecting (attempt in %lums)...\n", wifiReconnectDelay);

        WiFi.reconnect();

        // Increase delay for next attempt (exponential backoff, capped)
        wifiReconnectDelay = min(wifiReconnectDelay * 2, (unsigned long)MAX_RECONNECT_INTERVAL);
    }
}

// ===== CONFIG RESET BUTTON =====
bool checkConfigResetButton()
{
    pinMode(CONFIG_RESET_PIN, INPUT);

    // Check if button is held HIGH (GPIO15 with external pull-down)
    if (digitalRead(CONFIG_RESET_PIN) != HIGH)
        return false;

    Serial.println("Config reset button detected — hold for 3 seconds...");

    displayMessage(
        "Config Reset?",
        "Keep holding btn",
        "for 3 seconds...",
        "Release to cancel");

    unsigned long start = millis();
    while (digitalRead(CONFIG_RESET_PIN) == HIGH)
    {
        if (millis() - start >= CONFIG_RESET_HOLD_MS)
        {
            Serial.println("Config reset confirmed!");

            displayMessage(
                "Config Cleared!",
                "WiFi + server",
                "settings erased.",
                "Opening setup portal...");
            delay(1500);

            return true;
        }
        delay(50);
    }

    Serial.println("Config reset cancelled (button released early)");
    return false;
}

// ===== OLED MESSAGE HELPER =====
void displayMessage(const char *line1, const char *line2, const char *line3, const char *line4)
{
    display.clearBuffer();
    display.setFont(u8g2_font_6x10_tr);
    if (line1)
        display.drawStr(0, 12, line1);
    if (line2)
        display.drawStr(0, 26, line2);
    if (line3)
        display.drawStr(0, 40, line3);
    display.setFont(u8g2_font_5x7_tr);
    if (line4)
        display.drawStr(0, 55, line4);
    display.sendBuffer();
}

// ===== CAPTIVE PORTAL =====
void startCaptivePortal(bool forcePortal)
{
    WiFiManagerParameter paramWsHost("ws_host", "Server IP (blank = auto-discover)", cfgWsHost, WS_HOST_LEN);
    WiFiManagerParameter paramWsPort("ws_port", "Server Port", cfgWsPort, WS_PORT_LEN);

    WiFiManager wifiManager;

    wifiManager.addParameter(&paramWsHost);
    wifiManager.addParameter(&paramWsPort);

    wifiManager.setConfigPortalTimeout(180); // 3 min timeout
    wifiManager.setConnectTimeout(20);       // 20s per connection attempt
    wifiManager.setConnectRetries(3);        // Retry 3 times before giving up
    wifiManager.setAPStaticIPConfig(
        IPAddress(192, 168, 4, 1),
        IPAddress(192, 168, 4, 1),
        IPAddress(255, 255, 255, 0));

    // Save custom params whenever the user submits the form,
    // even if the WiFi connection itself fails afterwards
    wifiManager.setSaveParamsCallback([&]()
                                      {
        const char *newHost = paramWsHost.getValue();
        const char *newPort = paramWsPort.getValue();

        if (configChanged(newHost, newPort))
        {
            strlcpy(cfgWsHost, newHost, WS_HOST_LEN);
            strlcpy(cfgWsPort, newPort, WS_PORT_LEN);
            saveConfig();
        } });

    // Debug output helps diagnose connection issues
    wifiManager.setDebugOutput(true);

    // --- OLED callbacks for user feedback during connection ---

    // Called when the config portal AP starts — user should connect to it
    wifiManager.setAPCallback([](WiFiManager *mgr)
                              { displayMessage(
                                    "== SETUP MODE ==",
                                    "Connect to WiFi:",
                                    "\"SmartHome-Setup\"",
                                    "Then open 192.168.4.1"); });

    // Called before saving new WiFi config from the portal form
    wifiManager.setPreSaveConfigCallback([]()
                                         { displayMessage(
                                               "Saving config...",
                                               "Connecting WiFi..",
                                               "Please wait...",
                                               "Attempting connection"); });

    // Called when config portal times out
    wifiManager.setConfigPortalTimeoutCallback([]()
                                               { displayMessage(
                                                     "Portal timeout!",
                                                     "No config given.",
                                                     "Restarting..."); });

    bool wifiConnected;
    if (forcePortal)
    {
        displayMessage(
            "== SETUP MODE ==",
            "Starting portal..",
            "Please wait...");

        // Force the config portal open (ignores saved credentials)
        wifiConnected = wifiManager.startConfigPortal("SmartHome-Setup");
    }
    else
    {
        displayMessage(
            "Connecting WiFi..",
            "Using saved config",
            "Please wait...");

        // Try saved credentials first, open portal only if they fail
        wifiConnected = wifiManager.autoConnect("SmartHome-Setup");
    }

    // Also read params in case the callback didn't fire (direct auto-connect)
    const char *newHost = paramWsHost.getValue();
    const char *newPort = paramWsPort.getValue();

    if (configChanged(newHost, newPort))
    {
        strlcpy(cfgWsHost, newHost, WS_HOST_LEN);
        strlcpy(cfgWsPort, newPort, WS_PORT_LEN);
        saveConfig();
    }

    if (!wifiConnected)
    {
        Serial.println("Captive portal timed out — restarting");
        displayMessage(
            "WiFi Failed!",
            "Could not connect.",
            "Restarting in 3s..",
            "Will retry on boot");
        delay(3000);
        ESP.restart();
    }
}

// ===== CUSTOM ICONS (8x8 XBM bitmaps) =====
// Thermometer icon
static const uint8_t icon_temp[] = {0x0C, 0x12, 0x12, 0x12, 0x12, 0x3E, 0x3E, 0x1C};
// Water droplet icon
static const uint8_t icon_drop[] = {0x08, 0x08, 0x14, 0x22, 0x41, 0x41, 0x22, 0x1C};
// Power plug / connected icon
static const uint8_t icon_plug[] = {0x00, 0x24, 0x24, 0x7E, 0x7E, 0x3C, 0x18, 0x18};
// WiFi icon (3 arcs)
static const uint8_t icon_wifi[] = {0x00, 0x3C, 0x42, 0x18, 0x24, 0x00, 0x08, 0x00};
// No WiFi / X
static const uint8_t icon_nowifi[] = {0x00, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x00};
// Cloud connected
static const uint8_t icon_cloud[] = {0x0C, 0x12, 0x71, 0x81, 0x81, 0x81, 0x7E, 0x00};
// Lightning bolt (relay ON)
static const uint8_t icon_bolt[] = {0x10, 0x30, 0x7C, 0x18, 0x3E, 0x0C, 0x08, 0x00};
// Circle-dot (relay OFF)
static const uint8_t icon_circle[] = {0x1C, 0x22, 0x41, 0x41, 0x41, 0x22, 0x1C, 0x00};
// Signal strength bars
static const uint8_t icon_sig1[] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x40};
static const uint8_t icon_sig2[] = {0x00, 0x00, 0x00, 0x00, 0x20, 0x20, 0x60, 0x60};
static const uint8_t icon_sig3[] = {0x00, 0x00, 0x10, 0x10, 0x30, 0x30, 0x70, 0x70};
static const uint8_t icon_sig4[] = {0x08, 0x08, 0x18, 0x18, 0x38, 0x38, 0x78, 0x78};
// Home icon
static const uint8_t icon_home[] = {0x08, 0x14, 0x22, 0x41, 0x7F, 0x41, 0x41, 0x7F};

// ===== OLED DISPLAY =====
void updateDisplay()
{
    display.clearBuffer();

    // ── Top bar: title + connection icon ──
    display.setFont(u8g2_font_6x10_tr);
    display.drawXBM(0, 0, 8, 8, icon_home);
    display.drawStr(11, 8, "SmartHome");

    // Connection status (top-right)
    switch (connState)
    {
    case CONN_WS_CONNECTED:
        display.drawXBM(92, 0, 8, 8, icon_cloud);
        display.setFont(u8g2_font_5x7_tr);
        display.drawStr(102, 7, "LIVE");
        break;
    case CONN_WS_CONNECTING:
    case CONN_WIFI_CONNECTED:
    {
        display.drawXBM(92, 0, 8, 8, icon_wifi);
        display.setFont(u8g2_font_5x7_tr);
        unsigned long d = (millis() / 500) % 2;
        display.drawStr(102, 7, connState == CONN_WS_CONNECTING ? (d ? ".." : "  ") : "OK");
        break;
    }
    case CONN_WIFI_CONNECTING:
    {
        display.drawXBM(92, 0, 8, 8, icon_wifi);
        display.setFont(u8g2_font_5x7_tr);
        unsigned long d2 = (millis() / 500) % 2;
        display.drawStr(102, 7, d2 ? ".." : "  ");
        break;
    }
    case CONN_WIFI_DISCONNECTED:
        display.drawXBM(92, 0, 8, 8, icon_nowifi);
        display.setFont(u8g2_font_5x7_tr);
        display.drawStr(102, 7, "OFF");
        break;
    }

    display.drawHLine(0, 11, 128);

    // ── Temperature (large, centered) ──
    display.drawXBM(4, 16, 8, 8, icon_temp);
    display.setFont(u8g2_font_logisoso16_tn); // big numeric font
    if (!isnan(lastTemperature))
    {
        char tv[10];
        snprintf(tv, sizeof(tv), "%.1f", lastTemperature);
        display.drawStr(16, 30, tv);
    }
    else
    {
        display.setFont(u8g2_font_7x13B_tr);
        display.drawStr(16, 28, "--.-");
    }
    // Unit
    display.setFont(u8g2_font_6x10_tr);
    display.drawStr(56, 18, "o");
    display.drawStr(61, 30, "C");

    // ── Humidity (large, right half) ──
    display.drawXBM(72, 16, 8, 8, icon_drop);
    display.setFont(u8g2_font_logisoso16_tn);
    if (!isnan(lastHumidity))
    {
        char hv[10];
        snprintf(hv, sizeof(hv), "%.0f", lastHumidity);
        display.drawStr(84, 30, hv);
    }
    else
    {
        display.setFont(u8g2_font_7x13B_tr);
        display.drawStr(84, 28, "--");
    }
    display.setFont(u8g2_font_6x10_tr);
    display.drawStr(112, 30, "%");

    display.drawHLine(0, 35, 128);

    // ── Signal & IP bar ──
    display.setFont(u8g2_font_5x7_tr);
    if (WiFi.status() == WL_CONNECTED)
    {
        int rssi = WiFi.RSSI();

        // Signal bars icon
        const uint8_t *sigIcon;
        const char *sigLabel;
        if (rssi > -50)
        {
            sigIcon = icon_sig4;
            sigLabel = "Strong";
        }
        else if (rssi > -60)
        {
            sigIcon = icon_sig3;
            sigLabel = "Good";
        }
        else if (rssi > -70)
        {
            sigIcon = icon_sig2;
            sigLabel = "Fair";
        }
        else
        {
            sigIcon = icon_sig1;
            sigLabel = "Weak";
        }

        display.drawXBM(0, 38, 8, 8, sigIcon);
        char rssiStr[16];
        snprintf(rssiStr, sizeof(rssiStr), "%s %ddBm", sigLabel, rssi);
        display.drawStr(10, 45, rssiStr);

        // IP address row
        display.drawStr(0, 55, WiFi.localIP().toString().c_str());

        // Device ID (bottom right, truncated)
        if (strlen(cfgDeviceId) > 0)
        {
            // Show last 12 chars of device ID to fit
            const char *id = cfgDeviceId;
            int len = strlen(id);
            if (len > 12)
                id = id + (len - 12);
            int w = display.getStrWidth(id);
            display.drawStr(128 - w, 55, id);
        }
    }
    else
    {
        display.drawXBM(0, 38, 8, 8, icon_nowifi);
        if (wifiConsecutiveFailures >= WIFI_MAX_FAILURES_BEFORE_PORTAL - 1)
        {
            display.drawStr(10, 45, "Portal opening..");
        }
        else if (wifiConsecutiveFailures > 0)
        {
            char retryStr[24];
            snprintf(retryStr, sizeof(retryStr), "Retry %d/%d",
                     wifiConsecutiveFailures, WIFI_MAX_FAILURES_BEFORE_PORTAL);
            display.drawStr(10, 45, retryStr);
        }
        else
        {
            display.drawStr(10, 45, "Disconnected");
        }
    }

    // ── Firmware version (bottom-right corner) ──
    display.setFont(u8g2_font_4x6_tr);
    char verStr[12];
    snprintf(verStr, sizeof(verStr), "v%s", FIRMWARE_VERSION);
    int vw = display.getStrWidth(verStr);
    display.drawStr(128 - vw, 63, verStr);

    display.sendBuffer();
}

// ===== CONFIG PERSISTENCE (LittleFS) =====
void loadConfig()
{
    if (!LittleFS.exists(CONFIG_FILE))
    {
        Serial.println("No config file found, using defaults");
        return;
    }

    File file = LittleFS.open(CONFIG_FILE, "r");
    if (!file)
    {
        Serial.println("Failed to open config file");
        return;
    }

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error)
    {
        Serial.printf("Config parse error: %s\n", error.c_str());
        return;
    }

    strlcpy(cfgWsHost, doc["ws_host"] | DEFAULT_WS_HOST, WS_HOST_LEN);
    strlcpy(cfgWsPort, doc["ws_port"] | DEFAULT_WS_PORT, WS_PORT_LEN);

    // Device ID is stored in config but auto-generated if missing
    const char *savedId = doc["device_id"] | "";
    if (strlen(savedId) > 0)
    {
        strlcpy(cfgDeviceId, savedId, DEVICE_ID_LEN);
    }

    Serial.printf("Config loaded — Host: %s  Port: %s  Device: %s\n",
                  cfgWsHost, cfgWsPort, cfgDeviceId);
}

void saveConfig()
{
    JsonDocument doc;
    doc["ws_host"] = cfgWsHost;
    doc["ws_port"] = cfgWsPort;
    doc["device_id"] = cfgDeviceId;

    File file = LittleFS.open(CONFIG_FILE, "w");
    if (!file)
    {
        Serial.println("Failed to save config");
        return;
    }

    serializeJson(doc, file);
    file.close();
    Serial.println("Config saved to LittleFS");
}

bool configChanged(const char *newHost, const char *newPort)
{
    return strcmp(cfgWsHost, newHost) != 0 ||
           strcmp(cfgWsPort, newPort) != 0;
}

// ===== DEVICE ID GENERATION =====
// Generates a stable device ID from the ESP32's MAC address.
// Format: "esp32-AABBCCDDEEFF" — deterministic, unique per chip.
void generateDeviceId()
{
    if (strlen(cfgDeviceId) > 0)
    {
        Serial.printf("Device ID already set: %s\n", cfgDeviceId);
        return;
    }

    uint8_t mac[6];
    WiFi.macAddress(mac);
    snprintf(cfgDeviceId, DEVICE_ID_LEN, "esp32-%02x%02x%02x%02x%02x%02x",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    Serial.printf("Generated device ID from MAC: %s\n", cfgDeviceId);
    saveConfig();
}

// ===== mDNS SERVER DISCOVERY =====
// Queries the local network for a _smarthome._tcp service.
// Returns true if a server was found and cfgWsHost/cfgWsPort were updated.
bool discoverServer()
{
    // Skip if user manually configured a server address
    if (strlen(cfgWsHost) > 0)
    {
        Serial.printf("Server already configured: %s:%s (skipping mDNS)\n", cfgWsHost, cfgWsPort);
        return true;
    }

    Serial.println("Searching for server via mDNS...");
    displayMessage("Searching...", "Looking for server", "on local network", "via mDNS discovery");

    if (!MDNS.begin("smarthome-device"))
    {
        Serial.println("mDNS responder failed to start");
        return false;
    }

    int n = MDNS.queryService(MDNS_SERVICE_NAME, MDNS_SERVICE_PROTO);
    if (n == 0)
    {
        Serial.println("No server found via mDNS");
        displayMessage("No server found!", "Set IP manually:", "Hold GPIO15 3s", "to open portal");
        MDNS.end();
        return false;
    }

    // Use the first discovered server
    IPAddress serverIp = MDNS.IP(0);
    uint16_t serverPort = MDNS.port(0);

    serverIp.toString().toCharArray(cfgWsHost, WS_HOST_LEN);
    snprintf(cfgWsPort, WS_PORT_LEN, "%d", serverPort);

    Serial.printf("Server found via mDNS: %s:%s\n", cfgWsHost, cfgWsPort);
    saveConfig();

    MDNS.end();
    return true;
}

// ===== SETUP =====
void setup()
{
    Serial.begin(115200);
    Serial.println("\n\nDevice Initializing");

    // Initialize relay pins (all OFF initially)
    for (int i = 0; i < 4; i++)
    {
        pinMode(relayPins[i], OUTPUT);
        digitalWrite(relayPins[i], HIGH); // HIGH = OFF for active LOW relays
    }

    // Initialize DHT sensor
    dht.begin();

    // Initialize OLED display
    display.begin();
    displayMessage("Smart Home", nullptr, "  Starting...");

    // Mount LittleFS and load saved config (true = format on fail)
    if (!LittleFS.begin(true))
    {
        Serial.println("LittleFS mount failed");
    }
    loadConfig();

    // Check if config reset button is held on boot
    bool forcePortal = checkConfigResetButton();

    // Show boot screen with saved config info
    if (forcePortal)
    {
        displayMessage(
            "== SETUP MODE ==",
            "Config reset by",
            "button press.",
            "Opening portal...");
    }
    else if (strlen(cfgWsHost) > 0 && WiFi.SSID().length() > 0)
    {
        char ssidLine[48];
        snprintf(ssidLine, sizeof(ssidLine), "WiFi: %s", WiFi.SSID().c_str());
        char hostLine[80];
        snprintf(hostLine, sizeof(hostLine), "Srv: %s:%s", cfgWsHost, cfgWsPort);
        displayMessage(
            "Connecting...",
            ssidLine,
            hostLine,
            "Using saved config");
    }
    else
    {
        displayMessage(
            "First time setup",
            "No saved config.",
            "Opening portal...",
            "Connect: SmartHome-Setup");
    }

    // Start WiFiManager captive portal (blocks until connected or timeout)
    // WiFiManager handles AP/STA mode transitions internally — do NOT call
    // WiFi.mode() or WiFi.persistent() before this, it interferes.
    startCaptivePortal(forcePortal);

    // NOW that WiFiManager has handed us a working connection,
    // enable auto-reconnect for runtime disconnections
    WiFi.setAutoReconnect(true);

    // Register WiFi event handler for runtime reconnection
    WiFi.onEvent(onWifiEvent);

    Serial.println("WiFi connected!");
    Serial.printf("IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("RSSI: %d dBm\n", WiFi.RSSI());

    // Generate stable device ID from MAC address (first boot only)
    generateDeviceId();

    // Discover server via mDNS if not manually configured
    if (strlen(cfgWsHost) == 0)
    {
        if (!discoverServer())
        {
            Serial.println("No server found — opening captive portal for manual config");
            displayMessage(
                "No server found!",
                "Opening setup...",
                "Enter server IP",
                "in the portal");
            delay(2000);
            startCaptivePortal(true);

            // If portal closed and still no host, retry mDNS once more
            if (strlen(cfgWsHost) == 0)
            {
                discoverServer();
            }

            // If STILL no host, restart and try again
            if (strlen(cfgWsHost) == 0)
            {
                Serial.println("Still no server configured — restarting");
                displayMessage(
                    "No server set!",
                    "Restarting...",
                    "Will retry mDNS",
                    "on next boot");
                delay(3000);
                ESP.restart();
            }
        }
    }

    Serial.printf("Server: %s:%s  Device: %s\n", cfgWsHost, cfgWsPort, cfgDeviceId);

    wifiWasConnected = true;
    connState = CONN_WIFI_CONNECTED;

    // Show connected status on OLED
    {
        char ipLine[32];
        snprintf(ipLine, sizeof(ipLine), "IP: %s", WiFi.localIP().toString().c_str());
        char rssiLine[32];
        snprintf(rssiLine, sizeof(rssiLine), "Signal: %d dBm", WiFi.RSSI());
        char wsLine[80];
        snprintf(wsLine, sizeof(wsLine), "Server: %s:%s", cfgWsHost, cfgWsPort);
        displayMessage(
            "WiFi Connected!",
            ipLine,
            wsLine,
            rssiLine);
    }
    delay(1500);

    // WebSocket will be started by onWifiConnect event handler,
    // but if the event already fired before we registered, start it now
    startWebSocket();
}

// ===== MAIN LOOP =====
void loop()
{
    // Process WebSocket messages (only if started)
    if (wsStarted)
    {
        webSocket.loop();
    }

    unsigned long now = millis();

    // Periodically check WiFi and reconnect if needed
    if (now - lastWifiCheck >= WIFI_CHECK_INTERVAL)
    {
        lastWifiCheck = now;
        checkWifiConnection();
    }

    // Read sensor data periodically (always, even without WiFi)
    if (now - lastSensorRead >= SENSOR_READ_INTERVAL)
    {
        lastSensorRead = now;
        readAndSendSensor();
    }

    // Send heartbeat periodically
    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL)
    {
        lastHeartbeat = now;
        sendHeartbeat();
    }

    // Update OLED display periodically
    if (now - lastDisplayUpdate >= DISPLAY_UPDATE_INTERVAL)
    {
        lastDisplayUpdate = now;
        updateDisplay();
    }
}
