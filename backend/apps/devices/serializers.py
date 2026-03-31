from rest_framework import serializers

from .models import Device, Relay


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
        fields = ("id", "name", "device_id", "is_online", "last_seen", "relays", "created_at")
        read_only_fields = ("id", "device_id", "is_online", "last_seen", "created_at")
