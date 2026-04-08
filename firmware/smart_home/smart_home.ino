/*
 * Smart Home Automation - ESP32 Firmware
 *
 * Hardware:
 *   - ESP32 DevKit V1
 *   - 4-Channel Relay Module (active LOW)
 *   - DHT11 Temperature & Humidity Sensor
 *   - SH1106 128x64 OLED Display (I2C)
 *
 * Libraries required (install via Arduino Library Manager):
 *   - WiFiManager by tzapu
 *   - WebSockets by Markus Sattler
 *   - ArduinoJson by Benoit Blanchon (v6/v7)
 *   - DHT sensor library by Adafruit
 *   - Adafruit Unified Sensor
 *   - U8g2 by oliver
 */

#include <WiFi.h>
#include <WiFiManager.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <U8g2lib.h>
#include <Wire.h>

#include "config.h"

// ===== OBJECTS =====
WebSocketsClient webSocket;
DHT dht(DHT_PIN, DHT_TYPE);

// SH1106 128x64 I2C - adjust constructor if your display differs
U8G2_SH1106_128X64_NONAME_F_SW_I2C display(U8G2_R0, OLED_SCL, OLED_SDA, U8X8_PIN_NONE);

// ===== STATE =====
bool relayStates[4] = {false, false, false, false};
const int relayPins[4] = {RELAY_1_PIN, RELAY_2_PIN, RELAY_3_PIN, RELAY_4_PIN};

float lastTemperature = NAN;
float lastHumidity = NAN;

bool wsConnected = false;
unsigned long lastSensorRead = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastDisplayUpdate = 0;
unsigned long reconnectDelay = RECONNECT_INTERVAL;

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

// ===== WEBSOCKET EVENTS =====
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length)
{
    switch (type)
    {
    case WStype_DISCONNECTED:
        Serial.println("WebSocket disconnected");
        wsConnected = false;
        break;

    case WStype_CONNECTED:
        Serial.printf("WebSocket connected to %s\n", (char *)payload);
        wsConnected = true;
        reconnectDelay = RECONNECT_INTERVAL; // Reset reconnect delay

        // Send current relay states on connect
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
        Serial.println("Ping received");
        break;

    case WStype_PONG:
        Serial.println("Pong received");
        break;

    default:
        break;
    }
}

// ===== OLED DISPLAY =====
void updateDisplay()
{
    display.clearBuffer();

    // Title
    display.setFont(u8g2_font_6x10_tr);
    display.drawStr(0, 10, "Smart Home");

    // WiFi status
    if (WiFi.status() == WL_CONNECTED)
    {
        display.drawStr(75, 10, "WiFi:OK");
    }
    else
    {
        display.drawStr(75, 10, "WiFi:--");
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

    // IP address & WebSocket status
    display.setFont(u8g2_font_5x7_tr);
    if (WiFi.status() == WL_CONNECTED)
    {
        display.drawStr(0, 63, WiFi.localIP().toString().c_str());
    }
    else
    {
        display.drawStr(0, 63, "No WiFi");
    }

    display.drawStr(85, 63, wsConnected ? "WS:OK" : "WS:--");

    display.sendBuffer();
}

// ===== SETUP =====
void setup()
{
    Serial.begin(115200);
    Serial.println("\n\nSmart Home Automation - Starting...");

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
    display.clearBuffer();
    display.setFont(u8g2_font_6x10_tr);
    display.drawStr(20, 30, "Connecting...");
    display.sendBuffer();

    // WiFiManager - captive portal for WiFi setup
    WiFiManager wifiManager;

    // Reset saved settings (uncomment for testing)
    // wifiManager.resetSettings();

    wifiManager.setConfigPortalTimeout(180); // 3 min timeout
    wifiManager.setAPStaticIPConfig(
        IPAddress(192, 168, 4, 1),
        IPAddress(192, 168, 4, 1),
        IPAddress(255, 255, 255, 0));

    // This blocks until connected or timeout
    if (!wifiManager.autoConnect("SmartHome-Setup"))
    {
        Serial.println("Failed to connect - restarting");
        display.clearBuffer();
        display.drawStr(10, 30, "WiFi Failed!");
        display.drawStr(10, 45, "Restarting...");
        display.sendBuffer();
        delay(2000);
        ESP.restart();
    }

    Serial.println("WiFi connected!");
    Serial.printf("IP: %s\n", WiFi.localIP().toString().c_str());

    // Show connected status on OLED
    display.clearBuffer();
    display.drawStr(20, 25, "WiFi Connected!");
    display.drawStr(10, 40, WiFi.localIP().toString().c_str());
    display.drawStr(15, 55, "Connecting WS...");
    display.sendBuffer();
    delay(1000);

    // Connect WebSocket
    String wsPath = "/ws/device/";
    wsPath += DEVICE_ID;
    wsPath += "/";

    webSocket.begin(WS_HOST, WS_PORT, wsPath);
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(RECONNECT_INTERVAL);
    webSocket.enableHeartbeat(15000, 3000, 2); // ping every 15s, pong timeout 3s, 2 retries
}

// ===== MAIN LOOP =====
void loop()
{
    webSocket.loop();

    unsigned long now = millis();

    // Read sensor data periodically
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
