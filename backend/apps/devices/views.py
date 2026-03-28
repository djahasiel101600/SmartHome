from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Device, Relay
from .serializers import DeviceSerializer, RelaySerializer, RelayToggleSerializer


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


class RelayDetailView(generics.RetrieveUpdateAPIView):
    queryset = Relay.objects.all()
    serializer_class = RelaySerializer


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
