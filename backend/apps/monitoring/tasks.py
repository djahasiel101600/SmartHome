import logging
from datetime import timedelta

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
from django.db.models import Avg, Count, Max, Min
from django.utils import timezone

from apps.devices.models import Device

from .models import SensorAggregate, SensorReading
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


@shared_task
def aggregate_hourly_readings():
    """Aggregate raw sensor readings into hourly summaries.

    Runs every hour (e.g. at :05). Processes the previous complete hour.
    """
    now = timezone.now()
    # Previous complete hour: e.g., if now is 14:05, process 13:00–14:00
    hour_end = now.replace(minute=0, second=0, microsecond=0)
    hour_start = hour_end - timedelta(hours=1)

    devices = Device.objects.all()
    created_count = 0

    for device in devices:
        readings = SensorReading.objects.filter(
            device=device,
            recorded_at__gte=hour_start,
            recorded_at__lt=hour_end,
        )

        stats = readings.aggregate(
            temp_min=Min("temperature"),
            temp_max=Max("temperature"),
            temp_avg=Avg("temperature"),
            humidity_min=Min("humidity"),
            humidity_max=Max("humidity"),
            humidity_avg=Avg("humidity"),
            count=Count("id"),
        )

        if stats["count"] == 0:
            continue

        SensorAggregate.objects.update_or_create(
            device=device,
            period_type="hourly",
            period_start=hour_start,
            defaults={
                "temp_min": round(stats["temp_min"], 2),
                "temp_max": round(stats["temp_max"], 2),
                "temp_avg": round(stats["temp_avg"], 2),
                "humidity_min": round(stats["humidity_min"], 2),
                "humidity_max": round(stats["humidity_max"], 2),
                "humidity_avg": round(stats["humidity_avg"], 2),
                "reading_count": stats["count"],
            },
        )
        created_count += 1

    logger.info(f"Hourly aggregation complete: {created_count} aggregates for {hour_start}")


@shared_task
def aggregate_daily_readings():
    """Aggregate hourly data into daily summaries.

    Runs once daily (e.g. at 00:15). Processes the previous complete day.
    """
    now = timezone.now()
    day_end = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_start = day_end - timedelta(days=1)

    devices = Device.objects.all()
    created_count = 0

    for device in devices:
        hourly_aggs = SensorAggregate.objects.filter(
            device=device,
            period_type="hourly",
            period_start__gte=day_start,
            period_start__lt=day_end,
        )

        stats = hourly_aggs.aggregate(
            temp_min=Min("temp_min"),
            temp_max=Max("temp_max"),
            temp_avg=Avg("temp_avg"),
            humidity_min=Min("humidity_min"),
            humidity_max=Max("humidity_max"),
            humidity_avg=Avg("humidity_avg"),
            count=Count("id"),
        )

        if stats["count"] == 0:
            continue

        # Total reading count from all hourly buckets
        total_readings = sum(
            hourly_aggs.values_list("reading_count", flat=True)
        )

        SensorAggregate.objects.update_or_create(
            device=device,
            period_type="daily",
            period_start=day_start,
            defaults={
                "temp_min": round(stats["temp_min"], 2),
                "temp_max": round(stats["temp_max"], 2),
                "temp_avg": round(stats["temp_avg"], 2),
                "humidity_min": round(stats["humidity_min"], 2),
                "humidity_max": round(stats["humidity_max"], 2),
                "humidity_avg": round(stats["humidity_avg"], 2),
                "reading_count": total_readings,
            },
        )
        created_count += 1

    logger.info(f"Daily aggregation complete: {created_count} aggregates for {day_start}")


@shared_task
def prune_old_readings():
    """Delete old raw readings and stale hourly aggregates.

    Retention policy:
      - Raw SensorReading: keep 7 days
      - Hourly SensorAggregate: keep 90 days
      - Daily SensorAggregate: keep forever
    """
    now = timezone.now()

    # Prune raw readings older than 7 days
    raw_cutoff = now - timedelta(days=7)
    raw_deleted, _ = SensorReading.objects.filter(recorded_at__lt=raw_cutoff).delete()

    # Prune hourly aggregates older than 90 days
    hourly_cutoff = now - timedelta(days=90)
    hourly_deleted, _ = SensorAggregate.objects.filter(
        period_type="hourly",
        period_start__lt=hourly_cutoff,
    ).delete()

    logger.info(
        f"Pruning complete: {raw_deleted} raw readings, "
        f"{hourly_deleted} hourly aggregates deleted"
    )
