import json
import logging

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone

from apps.devices.models import Device, Relay

from .models import SensorReading
from .services import check_thresholds

logger = logging.getLogger(__name__)


class DeviceConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket consumer for ESP8266 device communication."""

    async def connect(self):
        self.device_id = self.scope["url_route"]["kwargs"]["device_id"]
        self.device_group = f"device_{self.device_id}"
        self.device = None

        # Validate device exists
        try:
            self.device = await sync_to_async(
                Device.objects.get
            )(device_id=self.device_id)
        except Device.DoesNotExist:
            await self.close(code=4001)
            return

        # Join device group
        await self.channel_layer.group_add(self.device_group, self.channel_name)
        await self.accept()

        # Mark device online
        await self._set_device_online(True)

        # Notify dashboard
        await self.channel_layer.group_send(
            "dashboard",
            {
                "type": "device_status",
                "data": {
                    "device_id": str(self.device_id),
                    "is_online": True,
                },
            },
        )

        logger.info(f"Device {self.device_id} connected")

    async def disconnect(self, close_code):
        if self.device:
            await self._set_device_online(False)

            # Notify dashboard
            await self.channel_layer.group_send(
                "dashboard",
                {
                    "type": "device_status",
                    "data": {
                        "device_id": str(self.device_id),
                        "is_online": False,
                    },
                },
            )

        await self.channel_layer.group_discard(self.device_group, self.channel_name)
        logger.info(f"Device {self.device_id} disconnected")

    async def receive_json(self, content):
        msg_type = content.get("type")

        if msg_type == "sensor_data":
            await self._handle_sensor_data(content)
        elif msg_type == "relay_state":
            await self._handle_relay_state(content)
        elif msg_type == "heartbeat":
            await self._update_last_seen()
        else:
            logger.warning(f"Unknown message type from device {self.device_id}: {msg_type}")

    async def send_command(self, event):
        """Send a command to the device (called via channel layer)."""
        await self.send_json(event["command"])

    async def _handle_sensor_data(self, data):
        temperature = data.get("temperature")
        humidity = data.get("humidity")

        if temperature is None or humidity is None:
            return

        # Save to database
        await sync_to_async(SensorReading.objects.create)(
            device=self.device,
            temperature=temperature,
            humidity=humidity,
        )

        await self._update_last_seen()

        # Broadcast to dashboard
        await self.channel_layer.group_send(
            "dashboard",
            {
                "type": "sensor_update",
                "data": {
                    "device_id": str(self.device_id),
                    "temperature": temperature,
                    "humidity": humidity,
                    "recorded_at": timezone.now().isoformat(),
                },
            },
        )

        # Check thresholds and dispatch insight generation
        if check_thresholds(temperature, humidity):
            from .tasks import generate_sensor_insight

            generate_sensor_insight.delay(
                str(self.device_id), temperature, humidity
            )

    async def _handle_relay_state(self, data):
        relay_number = data.get("relay")
        state = data.get("state")

        if relay_number is None or state is None:
            return

        # Update relay state in DB
        await sync_to_async(
            Relay.objects.filter(device=self.device, relay_number=relay_number).update
        )(state=state)

        await self._update_last_seen()

        # Broadcast to dashboard
        relay = await sync_to_async(
            Relay.objects.filter(device=self.device, relay_number=relay_number).first
        )()
        if relay:
            await self.channel_layer.group_send(
                "dashboard",
                {
                    "type": "relay_update",
                    "data": {
                        "relay_id": relay.id,
                        "relay_number": relay_number,
                        "state": state,
                        "device_id": str(self.device_id),
                        "label": relay.label,
                    },
                },
            )

    @sync_to_async
    def _set_device_online(self, is_online):
        Device.objects.filter(device_id=self.device_id).update(
            is_online=is_online,
            last_seen=timezone.now(),
        )

    @sync_to_async
    def _update_last_seen(self):
        Device.objects.filter(device_id=self.device_id).update(
            last_seen=timezone.now(),
        )


class DashboardConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket consumer for the frontend dashboard (JWT authenticated)."""

    async def connect(self):
        self.user = self.scope.get("user")

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4003)
            return

        await self.channel_layer.group_add("dashboard", self.channel_name)
        await self.accept()
        logger.info(f"Dashboard client connected: {self.user.username}")

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("dashboard", self.channel_name)

    async def receive_json(self, content):
        # Dashboard is read-only for now (commands go through REST API)
        pass

    async def relay_update(self, event):
        """Broadcast relay state update to dashboard clients."""
        await self.send_json({
            "type": "relay_update",
            "data": event["data"],
        })

    async def sensor_update(self, event):
        """Broadcast sensor data update to dashboard clients."""
        await self.send_json({
            "type": "sensor_update",
            "data": event["data"],
        })

    async def device_status(self, event):
        """Broadcast device online/offline status to dashboard clients."""
        await self.send_json({
            "type": "device_status",
            "data": event["data"],
        })

    async def insight_update(self, event):
        """Broadcast AI-generated sensor insight to dashboard clients."""
        await self.send_json({
            "type": "insight_update",
            "data": event["data"],
        })
