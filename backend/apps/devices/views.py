import os
import socket

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import models
from django.http import FileResponse
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Device, FirmwareVersion, Relay
from .serializers import (
    DeviceSerializer,
    FirmwareUploadSerializer,
    FirmwareVersionSerializer,
    RelayCreateSerializer,
    RelaySerializer,
    RelayToggleSerializer,
    TriggerOTASerializer,
)


def _get_lan_ip():
    """Get this machine's LAN IP by probing the default route."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))  # no data sent
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class DeviceViewSet(viewsets.ModelViewSet):
    queryset = Device.objects.prefetch_related("relays").all()
    serializer_class = DeviceSerializer

    def perform_create(self, serializer):
        device = serializer.save()
        # Auto-create 4 relays for the device
        for i in range(1, 5):
            Relay.objects.create(device=device, relay_number=i, label=f"Relay {i}")


class DeviceRelayListView(generics.ListAPIView):
    serializer_class = RelaySerializer

    def get_queryset(self):
        return Relay.objects.filter(device_id=self.kwargs["device_id"])


class DeviceRelayCreateView(APIView):
    """Add a new relay to a device."""

    def post(self, request, device_id):
        try:
            device = Device.objects.get(pk=device_id)
        except Device.DoesNotExist:
            return Response({"detail": "Device not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = RelayCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Determine next relay number
        max_num = device.relays.aggregate(m=models.Max("relay_number"))["m"] or 0
        next_num = max_num + 1

        label = serializer.validated_data.get("label", f"Relay {next_num}")
        relay = Relay.objects.create(device=device, relay_number=next_num, label=label)
        return Response(RelaySerializer(relay).data, status=status.HTTP_201_CREATED)


class RelayDetailView(generics.RetrieveUpdateAPIView):
    queryset = Relay.objects.select_related("device").all()
    serializer_class = RelaySerializer

    def perform_update(self, serializer):
        relay = serializer.save()
        # Push updated relay labels to the device
        device = relay.device
        relays = list(
            device.relays.order_by("relay_number").values("relay_number", "label")
        )
        channel_layer = get_channel_layer()
        device_group = f"device_{device.device_id}"
        async_to_sync(channel_layer.group_send)(
            device_group,
            {
                "type": "send_command",
                "command": {
                    "type": "relay_config",
                    "relays": relays,
                },
            },
        )


class RelayDeleteView(APIView):
    """Delete a relay."""

    def delete(self, request, pk):
        try:
            relay = Relay.objects.get(pk=pk)
        except Relay.DoesNotExist:
            return Response({"detail": "Relay not found."}, status=status.HTTP_404_NOT_FOUND)
        relay.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RelayToggleView(APIView):
    def post(self, request, pk):
        try:
            relay = Relay.objects.select_related("device").get(pk=pk)
        except Relay.DoesNotExist:
            return Response({"detail": "Relay not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = RelayToggleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_state = serializer.validated_data["state"]
        relay.state = new_state
        relay.save(update_fields=["state"])

        # Send command to device via WebSocket
        channel_layer = get_channel_layer()
        device_group = f"device_{relay.device.device_id}"
        async_to_sync(channel_layer.group_send)(
            device_group,
            {
                "type": "send_command",
                "command": {
                    "type": "command",
                    "action": "set_relay",
                    "relay": relay.relay_number,
                    "state": new_state,
                },
            },
        )

        # Broadcast to dashboard
        async_to_sync(channel_layer.group_send)(
            "dashboard",
            {
                "type": "relay_update",
                "data": {
                    "relay_id": relay.id,
                    "relay_number": relay.relay_number,
                    "state": new_state,
                    "device_id": str(relay.device.device_id),
                    "label": relay.label,
                },
            },
        )

        return Response(RelaySerializer(relay).data)


class FirmwareVersionListCreateView(APIView):
    parser_classes = [MultiPartParser]

    def get(self, request):
        versions = FirmwareVersion.objects.all()
        return Response(FirmwareVersionSerializer(versions, many=True).data)

    def post(self, request):
        serializer = FirmwareUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class FirmwareVersionDeleteView(APIView):
    def delete(self, request, pk):
        try:
            fw = FirmwareVersion.objects.get(pk=pk)
        except FirmwareVersion.DoesNotExist:
            return Response({"detail": "Firmware version not found."}, status=status.HTTP_404_NOT_FOUND)
        fw.binary.delete(save=False)
        fw.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FirmwareDownloadView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, pk):
        try:
            fw = FirmwareVersion.objects.get(pk=pk)
        except FirmwareVersion.DoesNotExist:
            return Response({"detail": "Firmware version not found."}, status=status.HTTP_404_NOT_FOUND)

        response = FileResponse(fw.binary.open("rb"), content_type="application/octet-stream")
        response["Content-Disposition"] = f'attachment; filename="firmware-{fw.version}.bin"'
        response["X-MD5"] = fw.checksum
        return response


class DeviceOTAUpdateView(APIView):
    def post(self, request, pk):
        try:
            device = Device.objects.get(pk=pk)
        except Device.DoesNotExist:
            return Response({"detail": "Device not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = TriggerOTASerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            fw = FirmwareVersion.objects.get(pk=serializer.validated_data["firmware_id"])
        except FirmwareVersion.DoesNotExist:
            return Response({"detail": "Firmware version not found."}, status=status.HTTP_404_NOT_FOUND)

        # Build URL using the server's actual LAN IP, not the proxy's Host header
        backend_host = os.getenv("BACKEND_HOST") or _get_lan_ip()
        backend_port = os.getenv("BACKEND_PORT") or request.META.get("SERVER_PORT", "8080")
        download_url = f"http://{backend_host}:{backend_port}/api/firmware/{fw.pk}/download/"

        channel_layer = get_channel_layer()
        device_group = f"device_{device.device_id}"
        async_to_sync(channel_layer.group_send)(
            device_group,
            {
                "type": "send_command",
                "command": {
                    "type": "command",
                    "action": "firmware_update",
                    "url": download_url,
                    "version": fw.version,
                    "checksum": fw.checksum,
                },
            },
        )

        return Response({"detail": f"OTA update to v{fw.version} triggered for {device.name}."})
