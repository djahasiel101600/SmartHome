from django.urls import path

from .views import (
    BatteryStatusView,
    SensorAggregateHistoryView,
    SensorHistoryView,
    SensorInsightLatestView,
    SensorLatestView,
    SensorStatsView,
)

urlpatterns = [
    path("sensors/latest/", SensorLatestView.as_view(), name="sensor-latest"),
    path("sensors/history/", SensorHistoryView.as_view(), name="sensor-history"),
    path("sensors/history/aggregated/", SensorAggregateHistoryView.as_view(), name="sensor-history-aggregated"),
    path("sensors/stats/", SensorStatsView.as_view(), name="sensor-stats"),
    path("sensors/insights/latest/", SensorInsightLatestView.as_view(), name="sensor-insight-latest"),
    path("battery/", BatteryStatusView.as_view(), name="battery-status"),
]
