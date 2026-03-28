from datetime import timedelta

from django.utils import timezone
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SensorReading
from .serializers import SensorReadingSerializer

RANGE_MAP = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
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
