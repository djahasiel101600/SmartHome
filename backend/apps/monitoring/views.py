from datetime import timedelta

from django.db.models import Avg, Count, Max, Min
from django.utils import timezone
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SensorAggregate, SensorInsight, SensorReading
from .serializers import (
    SensorAggregateSerializer,
    SensorInsightSerializer,
    SensorReadingSerializer,
)

RANGE_MAP = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "90d": timedelta(days=90),
    "1y": timedelta(days=365),
}

# Which period_type to use for aggregated queries at each range
AGGREGATE_RESOLUTION = {
    "7d": "hourly",
    "30d": "hourly",
    "90d": "hourly",
    "1y": "daily",
}


class SensorLatestView(APIView):
    def get(self, request):
        reading = SensorReading.objects.first()
        if not reading:
            return Response({"detail": "No sensor data available."}, status=404)
        return Response(SensorReadingSerializer(reading).data)


class SensorHistoryView(generics.ListAPIView):
    serializer_class = SensorReadingSerializer

    def get_queryset(self):
        time_range = self.request.query_params.get("range", "24h")
        delta = RANGE_MAP.get(time_range, RANGE_MAP["24h"])
        since = timezone.now() - delta
        return SensorReading.objects.filter(recorded_at__gte=since)


class LargeResultsPagination(PageNumberPagination):
    page_size = 2000
    max_page_size = 10000


class SensorAggregateHistoryView(generics.ListAPIView):
    """Return aggregated sensor history for longer time ranges.

    Auto-selects hourly or daily resolution based on the requested range.
    """

    serializer_class = SensorAggregateSerializer
    pagination_class = LargeResultsPagination

    def get_queryset(self):
        time_range = self.request.query_params.get("range", "7d")
        delta = RANGE_MAP.get(time_range, RANGE_MAP["7d"])
        since = timezone.now() - delta
        period_type = AGGREGATE_RESOLUTION.get(time_range, "hourly")
        return SensorAggregate.objects.filter(
            period_type=period_type,
            period_start__gte=since,
        ).order_by("period_start")


class SensorStatsView(APIView):
    """Return computed analytics for a time range.

    Includes min/max/avg, peak timestamps, and trend analysis.
    """

    def get(self, request):
        time_range = request.query_params.get("range", "24h")
        delta = RANGE_MAP.get(time_range, RANGE_MAP["24h"])
        since = timezone.now() - delta

        use_aggregates = time_range in AGGREGATE_RESOLUTION

        if use_aggregates:
            period_type = AGGREGATE_RESOLUTION[time_range]
            qs = SensorAggregate.objects.filter(
                period_type=period_type,
                period_start__gte=since,
            )

            if not qs.exists():
                return Response({"detail": "No data for this range."}, status=404)

            stats = qs.aggregate(
                temp_min=Min("temp_min"),
                temp_max=Max("temp_max"),
                temp_avg=Avg("temp_avg"),
                humidity_min=Min("humidity_min"),
                humidity_max=Max("humidity_max"),
                humidity_avg=Avg("humidity_avg"),
                reading_count=Count("id"),
            )

            # Peak timestamps — find the aggregate bucket with the highest temp / humidity
            peak_temp_row = qs.order_by("-temp_max").values("period_start", "temp_max").first()
            peak_humidity_row = qs.order_by("-humidity_max").values("period_start", "humidity_max").first()

            stats["peak_temp_at"] = peak_temp_row["period_start"].isoformat() if peak_temp_row else None
            stats["peak_humidity_at"] = peak_humidity_row["period_start"].isoformat() if peak_humidity_row else None

            # Trend analysis: compare first quarter avg vs last quarter avg
            total = qs.count()
            quarter = max(total // 4, 1)
            first_q = qs.order_by("period_start")[:quarter]
            last_q = qs.order_by("-period_start")[:quarter]

            first_temp_avg = first_q.aggregate(a=Avg("temp_avg"))["a"] or 0
            last_temp_avg = last_q.aggregate(a=Avg("temp_avg"))["a"] or 0
            first_hum_avg = first_q.aggregate(a=Avg("humidity_avg"))["a"] or 0
            last_hum_avg = last_q.aggregate(a=Avg("humidity_avg"))["a"] or 0

        else:
            qs = SensorReading.objects.filter(recorded_at__gte=since)

            if not qs.exists():
                return Response({"detail": "No data for this range."}, status=404)

            stats = qs.aggregate(
                temp_min=Min("temperature"),
                temp_max=Max("temperature"),
                temp_avg=Avg("temperature"),
                humidity_min=Min("humidity"),
                humidity_max=Max("humidity"),
                humidity_avg=Avg("humidity"),
                reading_count=Count("id"),
            )

            # Peak timestamps from raw readings
            peak_temp_row = qs.order_by("-temperature").values("recorded_at", "temperature").first()
            peak_humidity_row = qs.order_by("-humidity").values("recorded_at", "humidity").first()

            stats["peak_temp_at"] = peak_temp_row["recorded_at"].isoformat() if peak_temp_row else None
            stats["peak_humidity_at"] = peak_humidity_row["recorded_at"].isoformat() if peak_humidity_row else None

            # Trend analysis
            total = qs.count()
            quarter = max(total // 4, 1)
            first_q = qs.order_by("recorded_at")[:quarter]
            last_q = qs.order_by("-recorded_at")[:quarter]

            first_temp_avg = first_q.aggregate(a=Avg("temperature"))["a"] or 0
            last_temp_avg = last_q.aggregate(a=Avg("temperature"))["a"] or 0
            first_hum_avg = first_q.aggregate(a=Avg("humidity"))["a"] or 0
            last_hum_avg = last_q.aggregate(a=Avg("humidity"))["a"] or 0

        # Determine trend direction
        temp_diff = last_temp_avg - first_temp_avg
        hum_diff = last_hum_avg - first_hum_avg
        threshold = 0.5  # minimum difference to count as a trend

        stats["trend_temp"] = (
            "rising" if temp_diff > threshold else "falling" if temp_diff < -threshold else "stable"
        )
        stats["trend_humidity"] = (
            "rising" if hum_diff > threshold else "falling" if hum_diff < -threshold else "stable"
        )

        # Round float values
        for key in ("temp_min", "temp_max", "temp_avg", "humidity_min", "humidity_max", "humidity_avg"):
            if stats[key] is not None:
                stats[key] = round(stats[key], 1)

        return Response(stats)


class SensorInsightLatestView(APIView):
    def get(self, request):
        insight = SensorInsight.objects.first()
        if not insight:
            return Response({"detail": "No insights available."}, status=404)
        return Response(SensorInsightSerializer(insight).data)


class BatteryStatusView(APIView):
    """Return the current server battery level and charging status from cache."""

    def get(self, request):
        from django.core.cache import cache

        level = cache.get("server_battery_level")
        status = cache.get("server_battery_status")

        if level is None:
            return Response({"detail": "No battery data available."}, status=404)

        return Response({
            "level": level,
            "status": status or "unknown",
        })
