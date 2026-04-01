from rest_framework import serializers

from .models import SensorInsight, SensorReading


class SensorReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SensorReading
        fields = ("id", "device", "temperature", "humidity", "recorded_at")
        read_only_fields = ("id", "recorded_at")


class SensorInsightSerializer(serializers.ModelSerializer):
    class Meta:
        model = SensorInsight
        fields = ("id", "device", "insight_text", "temperature", "humidity", "severity", "created_at")
        read_only_fields = fields
