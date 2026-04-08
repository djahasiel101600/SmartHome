from rest_framework import serializers

from .models import Device, FirmwareVersion, Relay


class RelaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Relay
        fields = ("id", "relay_number", "label", "state", "created_at")
        read_only_fields = ("id", "relay_number", "state", "created_at")


class RelayCreateSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=50, default="Relay")


class RelayToggleSerializer(serializers.Serializer):
    state = serializers.BooleanField()


class DeviceSerializer(serializers.ModelSerializer):
    relays = RelaySerializer(many=True, read_only=True)

    class Meta:
        model = Device
        fields = ("id", "name", "device_id", "is_online", "last_seen", "current_firmware_version", "relays", "created_at")
        read_only_fields = ("id", "device_id", "is_online", "last_seen", "current_firmware_version", "created_at")


class FirmwareVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = FirmwareVersion
        fields = ("id", "version", "checksum", "release_notes", "created_at")
        read_only_fields = ("id", "checksum", "created_at")


class FirmwareUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = FirmwareVersion
        fields = ("id", "version", "binary", "release_notes", "checksum", "created_at")
        read_only_fields = ("id", "checksum", "created_at")


class TriggerOTASerializer(serializers.Serializer):
    firmware_id = serializers.IntegerField()
