from django.db import models

from apps.devices.models import Device


class SensorReading(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="sensor_readings")
    temperature = models.FloatField()
    humidity = models.FloatField()
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at"]
        indexes = [
            models.Index(fields=["-recorded_at"]),
            models.Index(fields=["device", "-recorded_at"]),
        ]

    def __str__(self):
        return f"{self.device.name}: {self.temperature}°C, {self.humidity}% @ {self.recorded_at}"


class SensorInsight(models.Model):
    SEVERITY_CHOICES = [
        ("info", "Info"),
        ("warning", "Warning"),
        ("critical", "Critical"),
    ]

    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="sensor_insights")
    insight_text = models.TextField()
    temperature = models.FloatField()
    humidity = models.FloatField()
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default="info")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["device", "-created_at"]),
        ]

    def __str__(self):
        return f"[{self.severity}] {self.device.name} @ {self.created_at}"


class SensorAggregate(models.Model):
    PERIOD_CHOICES = [
        ("hourly", "Hourly"),
        ("daily", "Daily"),
    ]

    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="sensor_aggregates")
    period_type = models.CharField(max_length=10, choices=PERIOD_CHOICES)
    period_start = models.DateTimeField()
    temp_min = models.FloatField()
    temp_max = models.FloatField()
    temp_avg = models.FloatField()
    humidity_min = models.FloatField()
    humidity_max = models.FloatField()
    humidity_avg = models.FloatField()
    reading_count = models.IntegerField(default=0)

    class Meta:
        ordering = ["-period_start"]
        constraints = [
            models.UniqueConstraint(
                fields=["device", "period_type", "period_start"],
                name="unique_device_period",
            ),
        ]
        indexes = [
            models.Index(fields=["device", "period_type", "-period_start"]),
        ]

    def __str__(self):
        return f"{self.device.name} {self.period_type} @ {self.period_start}"
