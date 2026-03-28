from django.urls import path

from .views import (
    RecurringCreateView,
    RelayScheduleListView,
    ScheduleDetailView,
    ScheduleListView,
    ScheduleToggleView,
    TimerCreateView,
)

urlpatterns = [
    path("schedules/", ScheduleListView.as_view(), name="schedule-list"),
    path("schedules/<int:pk>/", ScheduleDetailView.as_view(), name="schedule-detail"),
    path("schedules/<int:pk>/toggle/", ScheduleToggleView.as_view(), name="schedule-toggle"),
    path("schedules/timer/", TimerCreateView.as_view(), name="timer-create"),
    path("schedules/recurring/", RecurringCreateView.as_view(), name="recurring-create"),
    path("relays/<int:relay_id>/schedules/", RelayScheduleListView.as_view(), name="relay-schedules"),
]
