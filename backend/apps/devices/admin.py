from django.contrib import admin

from .models import Device, FirmwareVersion, Relay


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("name", "device_id", "is_online", "last_seen", "created_at")
    readonly_fields = ("device_id", "created_at")


@admin.register(FirmwareVersion)
class FirmwareVersionAdmin(admin.ModelAdmin):
    list_display = ("version", "checksum", "created_at")
    readonly_fields = ("checksum", "created_at")


@admin.register(Relay)
class RelayAdmin(admin.ModelAdmin):
    list_display = ("device", "relay_number", "label", "state")
    list_filter = ("device", "state")
