from django.urls import re_path

from .consumers import DashboardConsumer, DeviceConsumer

websocket_urlpatterns = [
    re_path(r"ws/device/(?P<device_id>[0-9a-f-]+)/$", DeviceConsumer.as_asgi()),
    re_path(r"ws/dashboard/$", DashboardConsumer.as_asgi()),
]
