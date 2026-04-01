from django.urls import path

from .views import SensorHistoryView, SensorInsightLatestView, SensorLatestView

urlpatterns = [
    path("sensors/latest/", SensorLatestView.as_view(), name="sensor-latest"),
    path("sensors/history/", SensorHistoryView.as_view(), name="sensor-history"),
    path("sensors/insights/latest/", SensorInsightLatestView.as_view(), name="sensor-insight-latest"),
]
