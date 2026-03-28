from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from apps.devices.serializers import RelaySerializer

from .models import RecurringSchedule, Schedule, TimerSchedule


class TimerScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimerSchedule
        fields = ("duration_minutes", "action", "started_at", "expires_at", "celery_task_id")
        read_only_fields = ("started_at", "expires_at", "celery_task_id")


class RecurringScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecurringSchedule
        fields = ("time", "days_of_week", "action")

    def validate_days_of_week(self, value):
        if not isinstance(value, list) or not all(isinstance(d, int) and 0 <= d <= 6 for d in value):
            raise serializers.ValidationError("Must be a list of integers 0-6 (Monday-Sunday).")
        return sorted(set(value))


class ScheduleSerializer(serializers.ModelSerializer):
    timer = TimerScheduleSerializer(read_only=True)
    recurring = RecurringScheduleSerializer(read_only=True)
    relay_label = serializers.CharField(source="relay.label", read_only=True)
    relay_number = serializers.IntegerField(source="relay.relay_number", read_only=True)

    class Meta:
        model = Schedule
        fields = (
            "id", "relay", "relay_label", "relay_number",
            "schedule_type", "is_active", "timer", "recurring", "created_at",
        )
        read_only_fields = ("id", "created_at")


class TimerCreateSerializer(serializers.Serializer):
    relay_id = serializers.IntegerField()
    duration_minutes = serializers.IntegerField(min_value=1, max_value=1440)
    action = serializers.ChoiceField(choices=["on", "off"])

    def create(self, validated_data):
        from .tasks import execute_timer_action

        relay_id = validated_data["relay_id"]
        duration = validated_data["duration_minutes"]
        action = validated_data["action"]
        now = timezone.now()
        expires_at = now + timedelta(minutes=duration)

        schedule = Schedule.objects.create(
            relay_id=relay_id,
            schedule_type="timer",
            is_active=True,
        )

        timer = TimerSchedule.objects.create(
            schedule=schedule,
            duration_minutes=duration,
            action=action,
            expires_at=expires_at,
        )

        # Dispatch delayed Celery task
        task = execute_timer_action.apply_async(
            args=[schedule.id],
            eta=expires_at,
        )
        timer.celery_task_id = task.id
        timer.save(update_fields=["celery_task_id"])

        return schedule


class RecurringCreateSerializer(serializers.Serializer):
    relay_id = serializers.IntegerField()
    time = serializers.TimeField()
    days_of_week = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6)
    )
    action = serializers.ChoiceField(choices=["on", "off"])

    def validate_days_of_week(self, value):
        if not value:
            raise serializers.ValidationError("At least one day must be selected.")
        return sorted(set(value))

    def create(self, validated_data):
        schedule = Schedule.objects.create(
            relay_id=validated_data["relay_id"],
            schedule_type="recurring",
            is_active=True,
        )

        RecurringSchedule.objects.create(
            schedule=schedule,
            time=validated_data["time"],
            days_of_week=validated_data["days_of_week"],
            action=validated_data["action"],
        )

        return schedule
