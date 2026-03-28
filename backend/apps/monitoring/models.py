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
