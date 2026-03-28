# Smart Home Automation

IoT-based smart home system using ESP8266, 4-channel relay module, DHT11 sensor, and SH1106 OLED display. Control room electricity with scheduling support and real-time monitoring via WebSocket.

## Architecture

```
┌──────────────┐     WebSocket      ┌──────────────────┐     WebSocket      ┌──────────────┐
│   ESP8266    │ ◄────────────────► │  Django Backend   │ ◄────────────────► │  React       │
│   Firmware   │   /ws/device/{id}/ │  (DRF + Channels) │   /ws/dashboard/   │  Frontend    │
└──────────────┘                    └──────────────────┘                    └──────────────┘
  - 4 Relays                          - REST API                             - Vite + TS
  - DHT11                             - JWT Auth                             - Tailwind CSS
  - SH1106 OLED                       - Celery (scheduling)                  - Shadcn UI
  - WiFiManager                       - Redis                                - FSD Architecture
```

## Tech Stack

| Layer        | Technologies                                                             |
| ------------ | ------------------------------------------------------------------------ |
| **Backend**  | Django 4.2, Django REST Framework, Django Channels, Celery + Beat, Redis |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Shadcn UI, Zustand, Recharts   |
| **Firmware** | ESP8266, WiFiManager, WebSocketsClient, DHT, U8g2, ArduinoJson           |

## Prerequisites

- Python 3.10+
- Node.js 18+
- Redis (or Docker)
- [PlatformIO](https://platformio.org/) (CLI or VS Code extension)

## Quick Start

### 1. Start Redis

```bash
docker compose up -d
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt

# Copy and edit environment variables
cp .env.example .env

# Run migrations
python manage.py migrate

# Create admin user
python manage.py createsuperuser

# Start the server (uses Daphne ASGI for WebSocket support)
python manage.py runserver
```

In a separate terminal, start the Celery worker and beat scheduler:

```bash
cd backend
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

# Worker
celery -A config worker --loglevel=info

# Beat scheduler (separate terminal)
celery -A config beat --loglevel=info
```

### 3. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The frontend runs at `http://localhost:5173`.

### 4. Initial Configuration

1. Register a user account at `http://localhost:5173/login`
2. The dashboard auto-creates a device with 4 relays
3. Copy the **device UUID** from the settings page — you'll need it for the firmware

### 5. ESP8266 Firmware (PlatformIO)

1. Install [PlatformIO CLI](https://docs.platformio.org/en/latest/core/installation.html) or the VS Code extension
2. Edit `firmware/include/config.h`:
   - Set `WS_HOST` to your backend server's IP address
   - Set `WS_PORT` to the backend port (default 8000)
   - Set `DEVICE_ID` to the UUID from step 4
3. Build and upload:

```bash
cd firmware
pio run --target upload
```

4. Monitor serial output:

```bash
pio device monitor
```

5. On first boot, connect to the **"SmartHome-Setup"** WiFi network and configure via the captive portal:
   - WiFi credentials (SSID & password)
   - Server IP / Hostname (your Django backend)
   - Server Port (default 8000)
   - Device UUID (from the web dashboard)

> Settings are saved to flash (LittleFS). On subsequent boots the ESP connects automatically. To reconfigure, erase flash with `pio run --target erase` and re-upload.

## Wiring Diagram

```
                          ┌──────────────────┐
                          │   ESP8266         │
                          │   (NodeMCU v2)    │
                          │                   │
            Relay 1 IN ◄──┤ D3 (GPIO0)       │
            Relay 2 IN ◄──┤ D5 (GPIO14)      │
            Relay 3 IN ◄──┤ D6 (GPIO12)      │
            Relay 4 IN ◄──┤ D7 (GPIO13)      │
                          │                   │
         DHT11 Data  ◄────┤ D4 (GPIO2)       │
                          │                   │
          OLED SDA   ◄────┤ D2 (GPIO4)       │
          OLED SCL   ◄────┤ D1 (GPIO5)       │
                          │                   │
         3V3 rail    ◄────┤ 3V3              │
         5V  rail    ◄────┤ VIN              │
         GND rail    ◄────┤ GND              │
                          └──────────────────┘
```

| ESP8266 Pin | Component           | Notes                                     |
| ----------- | ------------------- | ----------------------------------------- |
| D3 (GPIO0)  | Relay 1 IN          | Active LOW — LOW = ON, HIGH = OFF         |
| D5 (GPIO14) | Relay 2 IN          | Active LOW                                |
| D6 (GPIO12) | Relay 3 IN          | Active LOW                                |
| D7 (GPIO13) | Relay 4 IN          | Active LOW                                |
| D4 (GPIO2)  | DHT11 Data          | Add 10kΩ pull-up resistor to 3V3          |
| D2 (GPIO4)  | OLED SDA (I2C)      | Hardware I2C SDA                          |
| D1 (GPIO5)  | OLED SCL (I2C)      | Hardware I2C SCL                          |
| 3V3         | DHT11 VCC, OLED VCC | 3.3V power for sensor & display           |
| GND         | Common GND          | Shared ground for all components          |
| VIN (5V)    | Relay Module VCC    | 5V needed to drive relay coils            |
| VIN (5V)    | Relay Module JD-VCC | Remove jumper if using separate 5V supply |

## Features

- **Relay Control** — Toggle 4 relays from the dashboard with custom labels
- **Real-time Monitoring** — Live temperature/humidity updates via WebSocket
- **Sensor History** — Charts showing temperature and humidity over time (1h, 6h, 24h, 7d)
- **Timer Schedules** — Turn relays on/off after a set duration
- **Recurring Schedules** — Daily/weekday-based on/off schedules
- **OLED Display** — Shows relay states, sensor readings, WiFi status, and IP address on the device
- **WiFiManager** — Captive portal for easy WiFi configuration (no hardcoded credentials)
- **JWT Authentication** — Secure API access with token refresh

## Project Structure

```
SmartHomeAutomation/
├── backend/
│   ├── config/          # Django project settings, ASGI, Celery
│   ├── apps/
│   │   ├── accounts/    # User registration & JWT auth
│   │   ├── devices/     # Device & relay CRUD, relay toggle
│   │   ├── schedules/   # Timer & recurring schedule management
│   │   └── monitoring/  # WebSocket consumers, sensor history
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/         # Providers, router, entry point
│       ├── pages/       # Login, Dashboard, Schedules, Settings
│       ├── widgets/     # Composed UI sections
│       ├── features/    # User interactions (auth, toggle, schedule)
│       ├── entities/    # Domain models (device, relay, sensor, schedule)
│       └── shared/      # UI components, API client, types, utils
├── firmware/
│   ├── platformio.ini   # PlatformIO configuration & dependencies
│   ├── include/         # config.h (pins, server, timing)
│   └── src/             # main.cpp (firmware entry point)
└── docker-compose.yml   # Redis service
```
