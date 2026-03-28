from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DeviceRelayListView, DeviceViewSet, RelayDetailView, RelayToggleView

router = DefaultRouter()
router.register(r"devices", DeviceViewSet, basename="device")

urlpatterns = [
    path("", include(router.urls)),
    path("devices/<int:device_id>/relays/", DeviceRelayListView.as_view(), name="device-relays"),
    path("relays/<int:pk>/", RelayDetailView.as_view(), name="relay-detail"),
    path("relays/<int:pk>/toggle/", RelayToggleView.as_view(), name="relay-toggle"),
]
