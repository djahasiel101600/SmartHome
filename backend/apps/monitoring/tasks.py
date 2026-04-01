import logging

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer

from apps.devices.models import Device

from .services import check_thresholds, generate_insight, is_cached

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2, default_retry_delay=10)
def generate_sensor_insight(self, device_id: str, temperature: float, humidity: float):
    try:
        device = Device.objects.get(device_id=device_id)
    except Device.DoesNotExist:
        logger.error(f"Device {device_id} not found")
        return

    if not check_thresholds(temperature, humidity):
        return

    if is_cached(device):
        logger.debug(f"Insight for {device.name} is cached, skipping")
        return

    try:
        insight = generate_insight(device, temperature, humidity)
    except Exception as exc:
        logger.exception(f"Failed to generate insight for {device.name}")
        raise self.retry(exc=exc)

    # Broadcast to dashboard via WebSocket
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        "dashboard",
        {
            "type": "insight_update",
            "data": {
                "id": insight.id,
                "insight_text": insight.insight_text,
                "severity": insight.severity,
                "temperature": insight.temperature,
                "humidity": insight.humidity,
                "created_at": insight.created_at.isoformat(),
            },
        },
    )
