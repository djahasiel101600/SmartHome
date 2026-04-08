import hashlib
import uuid

from django.db import models


class Device(models.Model):
    name = models.CharField(max_length=100, default="My Device")
    device_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)
    current_firmware_version = models.CharField(max_length=32, default="0.0.0")
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


def firmware_upload_path(instance, filename):
    return f"firmware/{instance.version}/{filename}"


class FirmwareVersion(models.Model):
    version = models.CharField(max_length=32, unique=True)
    binary = models.FileField(upload_to=firmware_upload_path)
    checksum = models.CharField(max_length=64, blank=True, editable=False)
    release_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Firmware v{self.version}"

    def save(self, *args, **kwargs):
        if self.binary and not self.checksum:
            md5 = hashlib.md5()
            for chunk in self.binary.chunks():
                md5.update(chunk)
            self.checksum = md5.hexdigest()
        super().save(*args, **kwargs)
