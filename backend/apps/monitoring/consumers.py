import asyncio
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
    """WebSocket consumer for ESP32 device communication.

    Supports auto-registration: if the device_id in the URL is unknown,
    a new Device (with 4 relays) is created automatically.
    """

    async def connect(self):
        self.device_id = self.scope["url_route"]["kwargs"]["device_id"]
        self.device_group = f"device_{self.device_id}"
        self.device = None

        try:
            # Look up or auto-register the device
            self.device = await self._get_or_create_device()
        except Exception:
            logger.exception(f"Error looking up device {self.device_id}")
            await self.accept()
            await self.close(code=4002)
            return

        try:
            # Join device group
            await self.channel_layer.group_add(self.device_group, self.channel_name)
            await self.accept()

            # Mark device online
            await self._set_device_online(True)

            # Send relay labels to the device so it can display them
            await self._send_relay_config()

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
        except Exception:
            logger.exception(f"Error during connect for device {self.device_id}")

    async def disconnect(self, close_code):
        try:
            async with asyncio.timeout(5):
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
        except asyncio.TimeoutError:
            logger.warning(f"Disconnect cleanup timed out for device {self.device_id}")
        except Exception:
            logger.exception(f"Error during disconnect for device {self.device_id}")
        logger.info(f"Device {self.device_id} disconnected (code={close_code})")

    async def receive_json(self, content):
        msg_type = content.get("type")

        try:
            if msg_type == "sensor_data":
                await self._handle_sensor_data(content)
            elif msg_type == "relay_state":
                await self._handle_relay_state(content)
            elif msg_type == "heartbeat":
                firmware_version = content.get("firmware_version")
                if firmware_version:
                    await self._update_firmware_version(firmware_version)
                await self._update_last_seen()
            elif msg_type == "device_info":
                firmware_version = content.get("firmware_version")
                if firmware_version:
                    await self._update_firmware_version(firmware_version)
                await self._update_last_seen()
            elif msg_type == "ota_progress":
                await self.channel_layer.group_send(
                    "dashboard",
                    {
                        "type": "ota_progress",
                        "data": {
                            "device_id": str(self.device_id),
                            "progress": content.get("progress", 0),
                            "status": content.get("status", "unknown"),
                        },
                    },
                )
            elif msg_type == "ota_result":
                success = content.get("success", False)
                if success:
                    version = content.get("version", "")
                    if version:
                        await self._update_firmware_version(version)
                await self.channel_layer.group_send(
                    "dashboard",
                    {
                        "type": "ota_result",
                        "data": {
                            "device_id": str(self.device_id),
                            "success": success,
                            "version": content.get("version", ""),
                            "error": content.get("error", ""),
                        },
                    },
                )
            else:
                logger.warning(f"Unknown message type from device {self.device_id}: {msg_type}")
        except Exception:
            logger.exception(f"Error processing {msg_type} from device {self.device_id}")

    async def send_command(self, event):
        """Send a command to the device (called via channel layer)."""
        await self.send_json(event["command"])

    async def _handle_sensor_data(self, data):
        temperature = data.get("temperature")
        humidity = data.get("humidity")

        if temperature is None or humidity is None:
            return

        # Run all synchronous DB and celery operations in a single thread pool
        # call to minimise async→sync context switches that delay Twisted's
        # PING/PONG handling and cause the ESP to disconnect.
        @sync_to_async
        def _persist_and_dispatch():
            from .tasks import generate_sensor_insight
            from apps.schedules.tasks import evaluate_automation_rules

            SensorReading.objects.create(
                device=self.device,
                temperature=temperature,
                humidity=humidity,
            )
            Device.objects.filter(device_id=self.device_id).update(
                last_seen=timezone.now(),
            )
            if check_thresholds(temperature, humidity):
                generate_sensor_insight.delay(
                    str(self.device_id), temperature, humidity
                )
            evaluate_automation_rules.delay(device_id=str(self.device_id))

        await _persist_and_dispatch()

        # Broadcast to dashboard (async Redis — non-blocking)
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

    @sync_to_async
    def _update_firmware_version(self, version):
        Device.objects.filter(device_id=self.device_id).update(
            current_firmware_version=version,
        )

    @sync_to_async
    def _get_or_create_device(self):
        """Look up a device by device_id, or auto-register it with 4 relays."""
        try:
            return Device.objects.get(device_id=self.device_id)
        except Device.DoesNotExist:
            pass

        # Auto-register: create a new device with this ID
        device = Device(
            name=f"Auto: {self.device_id[:16]}",
            device_id=self.device_id,
        )
        device.save()

        # Create 4 default relays
        for i in range(1, 5):
            Relay.objects.create(device=device, relay_number=i, label=f"Relay {i}")

        logger.info(f"Auto-registered new device: {self.device_id}")
        return device

    @sync_to_async
    def _get_relay_config(self):
        """Return relay labels for the device."""
        relays = list(
            self.device.relays.order_by("relay_number").values(
                "relay_number", "label"
            )
        )
        return relays

    async def _send_relay_config(self):
        """Send relay labels to the device so it can display them on OLED."""
        relays = await self._get_relay_config()
        await self.send_json({
            "type": "relay_config",
            "relays": relays,
        })


class DashboardConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket consumer for the frontend dashboard (JWT authenticated)."""

    async def connect(self):
        self.user = self.scope.get("user")

        if not self.user or not self.user.is_authenticated:
            await self.accept()
            await self.close(code=4003)
            return

        await self.channel_layer.group_add("dashboard", self.channel_name)
        await self.accept()
        logger.info(f"Dashboard client connected: {self.user.username}")

        # Send current online status of every device so the frontend
        # doesn't have to rely on receiving a live device_status broadcast.
        await self._send_all_device_statuses()

    @sync_to_async
    def _get_all_device_statuses(self):
        return list(
            Device.objects.values_list("device_id", "is_online")
        )

    async def _send_all_device_statuses(self):
        statuses = await self._get_all_device_statuses()
        for device_id, is_online in statuses:
            await self.send_json({
                "type": "device_status",
                "data": {"device_id": str(device_id), "is_online": is_online},
            })

    async def disconnect(self, close_code):
        try:
            async with asyncio.timeout(5):
                await self.channel_layer.group_discard("dashboard", self.channel_name)
        except asyncio.TimeoutError:
            logger.warning("Dashboard disconnect cleanup timed out")
        except Exception:
            logger.exception("Error during dashboard disconnect")

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

    async def battery_update(self, event):
        """Broadcast battery level/status update to dashboard clients."""
        await self.send_json({
            "type": "battery_update",
            "data": event["data"],
        })

    async def ota_progress(self, event):
        """Broadcast OTA progress to dashboard clients."""
        await self.send_json({
            "type": "ota_progress",
            "data": event["data"],
        })

    async def ota_result(self, event):
        """Broadcast OTA result to dashboard clients."""
        await self.send_json({
            "type": "ota_result",
            "data": event["data"],
        })
