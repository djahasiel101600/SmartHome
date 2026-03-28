from rest_framework import serializers

from .models import SensorReading


class SensorReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SensorReading
        fields = ("id", "device", "temperature", "humidity", "recorded_at")
        read_only_fields = ("id", "recorded_at")
