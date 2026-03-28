from django.urls import path

from .views import SensorHistoryView, SensorLatestView

urlpatterns = [
    path("sensors/latest/", SensorLatestView.as_view(), name="sensor-latest"),
    path("sensors/history/", SensorHistoryView.as_view(), name="sensor-history"),
]
