import uuid

from django.db import models


class Device(models.Model):
    name = models.CharField(max_length=100, default="My Device")
    device_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.device_id})"


class Relay(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="relays")
    relay_number = models.PositiveSmallIntegerField()
    label = models.CharField(max_length=50, default="Relay")
    state = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("device", "relay_number")
        ordering = ["relay_number"]

    def __str__(self):
        return f"{self.device.name} - {self.label} (Relay {self.relay_number})"
