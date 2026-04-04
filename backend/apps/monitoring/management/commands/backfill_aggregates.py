"""Backfill SensorAggregate records from existing raw SensorReading data.

Usage:
    python manage.py backfill_aggregates
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Avg, Count, Max, Min
from django.utils import timezone

from apps.devices.models import Device
from apps.monitoring.models import SensorAggregate, SensorReading


class Command(BaseCommand):
    help = "Backfill hourly and daily SensorAggregate records from raw SensorReading data"

    def handle(self, *args, **options):
        devices = Device.objects.all()
        if not devices.exists():
            self.stdout.write(self.style.WARNING("No devices found."))
            return

        for device in devices:
            self.stdout.write(f"Processing device: {device.name} ({device.device_id})")
            self._backfill_hourly(device)
            self._backfill_daily(device)

        self.stdout.write(self.style.SUCCESS("Backfill complete."))

    def _backfill_hourly(self, device):
        """Create hourly aggregates from raw readings."""
        oldest = (
            SensorReading.objects.filter(device=device)
            .order_by("recorded_at")
            .values_list("recorded_at", flat=True)
            .first()
        )
        if not oldest:
            self.stdout.write(f"  No readings for {device.name}, skipping hourly.")
            return

        # Align to start of hour
        current = oldest.replace(minute=0, second=0, microsecond=0)
        now = timezone.now()
        created = 0

        while current < now:
            next_hour = current + timedelta(hours=1)
            readings = SensorReading.objects.filter(
                device=device,
                recorded_at__gte=current,
                recorded_at__lt=next_hour,
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

            if stats["count"] and stats["count"] > 0:
                SensorAggregate.objects.update_or_create(
                    device=device,
                    period_type="hourly",
                    period_start=current,
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
                created += 1

            current = next_hour

        self.stdout.write(f"  Created {created} hourly aggregates for {device.name}")

    def _backfill_daily(self, device):
        """Create daily aggregates from hourly aggregates."""
        oldest = (
            SensorAggregate.objects.filter(device=device, period_type="hourly")
            .order_by("period_start")
            .values_list("period_start", flat=True)
            .first()
        )
        if not oldest:
            self.stdout.write(f"  No hourly aggregates for {device.name}, skipping daily.")
            return

        current = oldest.replace(hour=0, minute=0, second=0, microsecond=0)
        now = timezone.now()
        created = 0

        while current < now:
            next_day = current + timedelta(days=1)
            hourly_aggs = SensorAggregate.objects.filter(
                device=device,
                period_type="hourly",
                period_start__gte=current,
                period_start__lt=next_day,
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

            if stats["count"] and stats["count"] > 0:
                total_readings = sum(
                    hourly_aggs.values_list("reading_count", flat=True)
                )
                SensorAggregate.objects.update_or_create(
                    device=device,
                    period_type="daily",
                    period_start=current,
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
                created += 1

            current = next_day

        self.stdout.write(f"  Created {created} daily aggregates for {device.name}")
