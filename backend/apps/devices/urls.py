from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    DeviceRelayCreateView,
    DeviceRelayListView,
    DeviceViewSet,
    RelayDeleteView,
    RelayDetailView,
    RelayToggleView,
)

router = DefaultRouter()
router.register(r"devices", DeviceViewSet, basename="device")

urlpatterns = [
    path("", include(router.urls)),
    path("devices/<int:device_id>/relays/", DeviceRelayListView.as_view(), name="device-relays"),
    path("devices/<int:device_id>/relays/create/", DeviceRelayCreateView.as_view(), name="device-relay-create"),
    path("relays/<int:pk>/", RelayDetailView.as_view(), name="relay-detail"),
    path("relays/<int:pk>/delete/", RelayDeleteView.as_view(), name="relay-delete"),
    path("relays/<int:pk>/toggle/", RelayToggleView.as_view(), name="relay-toggle"),
]
