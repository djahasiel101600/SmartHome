from django.db import models

from apps.devices.models import Relay


class Schedule(models.Model):
    SCHEDULE_TYPE_CHOICES = [
        ("timer", "Timer"),
        ("recurring", "Recurring"),
    ]

    relay = models.ForeignKey(Relay, on_delete=models.CASCADE, related_name="schedules")
    schedule_type = models.CharField(max_length=10, choices=SCHEDULE_TYPE_CHOICES)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_schedule_type_display()} - {self.relay}"


class TimerSchedule(models.Model):
    ACTION_CHOICES = [
        ("on", "Turn On"),
        ("off", "Turn Off"),
    ]

    schedule = models.OneToOneField(Schedule, on_delete=models.CASCADE, related_name="timer")
    duration_minutes = models.PositiveIntegerField()
    action = models.CharField(max_length=3, choices=ACTION_CHOICES, default="off")
    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    celery_task_id = models.CharField(max_length=255, blank=True, default="")

    def __str__(self):
        return f"Timer: {self.duration_minutes}min → {self.action}"


class RecurringSchedule(models.Model):
    ACTION_CHOICES = [
        ("on", "Turn On"),
        ("off", "Turn Off"),
    ]

    schedule = models.OneToOneField(Schedule, on_delete=models.CASCADE, related_name="recurring")
    time = models.TimeField()
    days_of_week = models.JSONField(
        help_text="List of day numbers: 0=Monday, 1=Tuesday, ..., 6=Sunday"
    )
    action = models.CharField(max_length=3, choices=ACTION_CHOICES, default="off")

    def __str__(self):
        return f"Recurring: {self.time} on days {self.days_of_week} → {self.action}"
