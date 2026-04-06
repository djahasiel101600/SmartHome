from django.db import models

from apps.devices.models import Device, Relay


class Schedule(models.Model):
    SCHEDULE_TYPE_CHOICES = [
        ("timer", "Timer"),
        ("recurring", "Recurring"),
        ("automation", "Automation"),
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
    counter_action_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Optional: minutes after primary action to perform reverse action",
    )
    counter_task_id = models.CharField(max_length=255, blank=True, default="")

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
    counter_action_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Optional: minutes after primary action to perform reverse action",
    )

    def __str__(self):
        return f"Recurring: {self.time} on days {self.days_of_week} → {self.action}"


class AutomationRule(models.Model):
    ACTION_CHOICES = [
        ("on", "Turn On"),
        ("off", "Turn Off"),
    ]

    SENSOR_FIELD_CHOICES = [
        ("temperature", "Temperature"),
        ("humidity", "Humidity"),
        ("battery", "Battery"),
    ]

    OPERATOR_CHOICES = [
        ("gt", "Greater than"),
        ("lt", "Less than"),
        ("gte", "Greater than or equal"),
        ("lte", "Less than or equal"),
    ]

    schedule = models.OneToOneField(Schedule, on_delete=models.CASCADE, related_name="automation")
    sensor_field = models.CharField(max_length=15, choices=SENSOR_FIELD_CHOICES)
    operator = models.CharField(max_length=3, choices=OPERATOR_CHOICES)
    threshold_value = models.FloatField()
    action = models.CharField(max_length=3, choices=ACTION_CHOICES, default="off")
    cooldown_minutes = models.PositiveIntegerField(default=5)
    last_triggered_at = models.DateTimeField(null=True, blank=True)
    counter_action_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Optional: minutes after trigger to perform reverse action",
    )
    source_device = models.ForeignKey(
        Device, on_delete=models.CASCADE, related_name="automation_rules",
        help_text="Device whose sensor readings trigger this rule",
        null=True, blank=True,
    )

    def __str__(self):
        return f"Automation: {self.sensor_field} {self.operator} {self.threshold_value} → {self.action}"

    def evaluate(self, value: float) -> bool:
        ops = {
            "gt": lambda v, t: v > t,
            "lt": lambda v, t: v < t,
            "gte": lambda v, t: v >= t,
            "lte": lambda v, t: v <= t,
        }
        return ops[self.operator](value, self.threshold_value)
