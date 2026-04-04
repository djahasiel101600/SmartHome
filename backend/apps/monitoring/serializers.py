from rest_framework import serializers

from .models import SensorAggregate, SensorInsight, SensorReading


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


class SensorAggregateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SensorAggregate
        fields = (
            "id",
            "device",
            "period_type",
            "period_start",
            "temp_min",
            "temp_max",
            "temp_avg",
            "humidity_min",
            "humidity_max",
            "humidity_avg",
            "reading_count",
        )
        read_only_fields = fields
