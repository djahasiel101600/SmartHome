/*
 * Smart Home Automation - ESP8266 Firmware
 *
 * Hardware:
 *   - ESP8266 (NodeMCU/Wemos D1 Mini)
 *   - 4-Channel Relay Module (active LOW)
 *   - DHT11 Temperature & Humidity Sensor
 *   - SH1106 128x64 OLED Display (I2C)
 *
 * Connectivity features:
 *   - WiFi auto-reconnect with exponential backoff
 *   - WiFi event-driven disconnect detection
 *   - WebSocket reconnect with exponential backoff
 *   - Hardware watchdog for crash recovery
 *   - Config reset via button hold on boot
 *   - Captive portal re-entry after repeated WiFi failures
 */

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiManager.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <U8g2lib.h>
#include <Wire.h>
#include <LittleFS.h>

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
char cfgDeviceId[DEVICE_ID_LEN] = DEFAULT_DEVICE_ID;

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

// ===== FORWARD DECLARATIONS =====
void sendRelayState(int relayNum, bool state);
void setRelay(int relayNum, bool state);
void readAndSendSensor();
void sendHeartbeat();
void handleCommand(JsonDocument &doc);
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length);
void updateDisplay();
void loadConfig();
void saveConfig();
bool configChanged(const char *newHost, const char *newPort, const char *newDeviceId);
void startWebSocket();
void stopWebSocket();
void checkWifiConnection();
void onWifiConnect(const WiFiEventStationModeGotIP &event);
void onWifiDisconnect(const WiFiEventStationModeDisconnected &event);
bool checkConfigResetButton();
void startCaptivePortal(bool forcePortal);
void displayMessage(const char *line1, const char *line2 = nullptr, const char *line3 = nullptr, const char *line4 = nullptr);

// WiFi event handlers (stored to prevent garbage collection)
WiFiEventHandler wifiConnectHandler;
WiFiEventHandler wifiDisconnectHandler;

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

    String payload;
    serializeJson(doc, payload);
    webSocket.sendTXT(payload);
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
}

// ===== WEBSOCKET MANAGEMENT =====
void startWebSocket()
{
    if (wsStarted)
        return;

    int port = atoi(cfgWsPort);
    if (port <= 0 || port > 65535)
        port = 8000;

    String wsPath = "/ws/device/";
    wsPath += cfgDeviceId;
    wsPath += "/";

    Serial.printf("WebSocket connecting to %s:%d%s\n", cfgWsHost, port, wsPath.c_str());

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
        Serial.println("WebSocket disconnected");
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
        Serial.printf("WebSocket connected to %s\n", (char *)payload);
        wsConnected = true;
        wsReconnectDelay = RECONNECT_INTERVAL; // Reset backoff
        connState = CONN_WS_CONNECTED;

        // Send current relay states on connect — server needs to know
        // the actual hardware state after a reconnection
        for (int i = 0; i < 4; i++)
        {
            sendRelayState(i + 1, relayStates[i]);
        }
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

// ===== WIFI EVENT HANDLERS =====
void onWifiConnect(const WiFiEventStationModeGotIP &event)
{
    Serial.printf("WiFi connected — IP: %s\n", WiFi.localIP().toString().c_str());
    wifiConsecutiveFailures = 0;
    wifiReconnectDelay = RECONNECT_INTERVAL;
    connState = CONN_WIFI_CONNECTED;
    wifiWasConnected = true;

    // Start WebSocket once WiFi is available
    startWebSocket();
}

void onWifiDisconnect(const WiFiEventStationModeDisconnected &event)
{
    Serial.printf("WiFi disconnected — reason: %d\n", event.reason);

    // Stop WebSocket — it can't work without WiFi
    stopWebSocket();

    connState = CONN_WIFI_DISCONNECTED;

    if (wifiWasConnected)
    {
        // Only track disconnect time if we were previously connected
        wifiDisconnectedSince = millis();
        wifiConsecutiveFailures++;
        Serial.printf("WiFi failure #%d\n", wifiConsecutiveFailures);
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

    // Check if button is held HIGH (D8/GPIO15 has pull-down by default on NodeMCU)
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
        ESP.wdtFeed(); // Keep watchdog happy during wait
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
    WiFiManagerParameter paramWsHost("ws_host", "Server IP / Hostname", cfgWsHost, WS_HOST_LEN);
    WiFiManagerParameter paramWsPort("ws_port", "Server Port", cfgWsPort, WS_PORT_LEN);
    WiFiManagerParameter paramDeviceId("device_id", "Device UUID", cfgDeviceId, DEVICE_ID_LEN);

    WiFiManager wifiManager;

    wifiManager.addParameter(&paramWsHost);
    wifiManager.addParameter(&paramWsPort);
    wifiManager.addParameter(&paramDeviceId);

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
        const char *newDeviceId = paramDeviceId.getValue();

        if (configChanged(newHost, newPort, newDeviceId))
        {
            strlcpy(cfgWsHost, newHost, WS_HOST_LEN);
            strlcpy(cfgWsPort, newPort, WS_PORT_LEN);
            strlcpy(cfgDeviceId, newDeviceId, DEVICE_ID_LEN);
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
    const char *newDeviceId = paramDeviceId.getValue();

    if (configChanged(newHost, newPort, newDeviceId))
    {
        strlcpy(cfgWsHost, newHost, WS_HOST_LEN);
        strlcpy(cfgWsPort, newPort, WS_PORT_LEN);
        strlcpy(cfgDeviceId, newDeviceId, DEVICE_ID_LEN);
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

// ===== OLED DISPLAY =====
void updateDisplay()
{
    display.clearBuffer();

    // Title bar
    display.setFont(u8g2_font_6x10_tr);
    display.drawStr(0, 10, "Smart Home");

    // Connection status indicator (right side of title bar)
    switch (connState)
    {
    case CONN_WS_CONNECTED:
        display.drawStr(76, 10, "ONLINE");
        break;
    case CONN_WS_CONNECTING:
    {
        unsigned long d = (millis() / 400) % 4;
        const char *wsAnim[] = {"WS   ", "WS.  ", "WS.. ", "WS..."};
        display.drawStr(76, 10, wsAnim[d]);
        break;
    }
    case CONN_WIFI_CONNECTED:
        display.drawStr(76, 10, "WiFi");
        break;
    case CONN_WIFI_CONNECTING:
    {
        unsigned long d = (millis() / 400) % 4;
        const char *wfAnim[] = {"CONN ", "CONN.", "CONN.", "CONN."};
        display.drawStr(76, 10, wfAnim[d]);
        break;
    }
    case CONN_WIFI_DISCONNECTED:
        display.drawStr(76, 10, "OFFL");
        break;
    }

    // Divider line
    display.drawHLine(0, 13, 128);

    // Temperature & Humidity
    display.setFont(u8g2_font_6x10_tr);
    char tempStr[20];
    char humStr[20];

    if (!isnan(lastTemperature))
    {
        snprintf(tempStr, sizeof(tempStr), "Temp: %.1fC", lastTemperature);
    }
    else
    {
        snprintf(tempStr, sizeof(tempStr), "Temp: --");
    }

    if (!isnan(lastHumidity))
    {
        snprintf(humStr, sizeof(humStr), "Hum:  %.1f%%", lastHumidity);
    }
    else
    {
        snprintf(humStr, sizeof(humStr), "Hum:  --");
    }

    display.drawStr(0, 26, tempStr);
    display.drawStr(0, 37, humStr);

    // Relay states
    display.drawHLine(0, 40, 128);
    display.setFont(u8g2_font_6x10_tr);

    for (int i = 0; i < 4; i++)
    {
        char relayStr[12];
        snprintf(relayStr, sizeof(relayStr), "R%d:%s", i + 1, relayStates[i] ? "ON" : "--");
        display.drawStr(i * 32, 52, relayStr);
    }

    // Bottom bar: contextual info
    display.setFont(u8g2_font_5x7_tr);
    if (WiFi.status() == WL_CONNECTED)
    {
        display.drawStr(0, 63, WiFi.localIP().toString().c_str());

        // Show RSSI as signal bar icon + dBm
        int rssi = WiFi.RSSI();
        char rssiStr[16];
        if (rssi > -50)
            snprintf(rssiStr, sizeof(rssiStr), "Sig:|||| %d", rssi);
        else if (rssi > -60)
            snprintf(rssiStr, sizeof(rssiStr), "Sig:||| %d", rssi);
        else if (rssi > -70)
            snprintf(rssiStr, sizeof(rssiStr), "Sig:|| %d", rssi);
        else
            snprintf(rssiStr, sizeof(rssiStr), "Sig:| %d", rssi);
        display.drawStr(73, 63, rssiStr);
    }
    else
    {
        // Show actionable message instead of just "No WiFi"
        if (wifiConsecutiveFailures >= WIFI_MAX_FAILURES_BEFORE_PORTAL - 1)
        {
            display.drawStr(0, 63, "Opening portal soon..");
        }
        else if (wifiConsecutiveFailures > 0)
        {
            char retryStr[28];
            snprintf(retryStr, sizeof(retryStr), "Reconnecting.. (%d/%d)",
                     wifiConsecutiveFailures, WIFI_MAX_FAILURES_BEFORE_PORTAL);
            display.drawStr(0, 63, retryStr);
        }
        else
        {
            display.drawStr(0, 63, "WiFi disconnected");
        }
    }

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
    strlcpy(cfgDeviceId, doc["device_id"] | DEFAULT_DEVICE_ID, DEVICE_ID_LEN);

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

bool configChanged(const char *newHost, const char *newPort, const char *newDeviceId)
{
    return strcmp(cfgWsHost, newHost) != 0 ||
           strcmp(cfgWsPort, newPort) != 0 ||
           strcmp(cfgDeviceId, newDeviceId) != 0;
}

// ===== SETUP =====
void setup()
{
    Serial.begin(115200);
    Serial.println("\n\nSmart Home Automation - Starting...");

    // Enable software watchdog (resets ESP if loop hangs for ~8s)
    ESP.wdtEnable(WDTO_8S);

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

    // Mount LittleFS and load saved config
    if (!LittleFS.begin())
    {
        Serial.println("LittleFS mount failed — formatting");
        LittleFS.format();
        LittleFS.begin();
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
    WiFi.persistent(true);

    // Register WiFi event handlers for runtime reconnection
    wifiConnectHandler = WiFi.onStationModeGotIP(onWifiConnect);
    wifiDisconnectHandler = WiFi.onStationModeDisconnected(onWifiDisconnect);

    Serial.println("WiFi connected!");
    Serial.printf("IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("RSSI: %d dBm\n", WiFi.RSSI());
    Serial.printf("WS target: %s:%s  Device: %s\n", cfgWsHost, cfgWsPort, cfgDeviceId);

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
    // Feed the watchdog to prevent reset during normal operation
    ESP.wdtFeed();

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
