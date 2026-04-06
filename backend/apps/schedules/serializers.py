from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from apps.devices.serializers import RelaySerializer

from .models import AutomationRule, RecurringSchedule, Schedule, TimerSchedule


class TimerScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimerSchedule
        fields = ("duration_minutes", "action", "started_at", "expires_at", "celery_task_id", "counter_action_minutes")
        read_only_fields = ("started_at", "expires_at", "celery_task_id")


class RecurringScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecurringSchedule
        fields = ("time", "days_of_week", "action", "counter_action_minutes")

    def validate_days_of_week(self, value):
        if not isinstance(value, list) or not all(isinstance(d, int) and 0 <= d <= 6 for d in value):
            raise serializers.ValidationError("Must be a list of integers 0-6 (Monday-Sunday).")
        return sorted(set(value))


class AutomationRuleSerializer(serializers.ModelSerializer):
    source_device_id = serializers.UUIDField(source="source_device.device_id", read_only=True, default=None)
    source_device_name = serializers.CharField(source="source_device.name", read_only=True, default=None)

    class Meta:
        model = AutomationRule
        fields = (
            "sensor_field", "operator", "threshold_value", "action",
            "cooldown_minutes", "last_triggered_at", "counter_action_minutes",
            "source_device_id", "source_device_name",
        )
        read_only_fields = ("last_triggered_at",)


class ScheduleSerializer(serializers.ModelSerializer):
    timer = TimerScheduleSerializer(read_only=True)
    recurring = RecurringScheduleSerializer(read_only=True)
    automation = AutomationRuleSerializer(read_only=True)
    relay_label = serializers.CharField(source="relay.label", read_only=True)
    relay_number = serializers.IntegerField(source="relay.relay_number", read_only=True)

    class Meta:
        model = Schedule
        fields = (
            "id", "relay", "relay_label", "relay_number",
            "schedule_type", "is_active", "timer", "recurring", "automation", "created_at",
        )
        read_only_fields = ("id", "created_at")


class TimerCreateSerializer(serializers.Serializer):
    relay_id = serializers.IntegerField()
    duration_minutes = serializers.IntegerField(min_value=1, max_value=1440)
    action = serializers.ChoiceField(choices=["on", "off"])
    counter_action_minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False, allow_null=True, default=None)

    def create(self, validated_data):
        from .tasks import execute_timer_action

        relay_id = validated_data["relay_id"]
        duration = validated_data["duration_minutes"]
        action = validated_data["action"]
        counter_minutes = validated_data.get("counter_action_minutes")
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
            counter_action_minutes=counter_minutes,
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
    counter_action_minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False, allow_null=True, default=None)

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
            counter_action_minutes=validated_data.get("counter_action_minutes"),
        )

        return schedule


class AutomationRuleCreateSerializer(serializers.Serializer):
    relay_id = serializers.IntegerField()
    sensor_field = serializers.ChoiceField(choices=["temperature", "humidity", "battery"])
    operator = serializers.ChoiceField(choices=["gt", "lt", "gte", "lte"])
    threshold_value = serializers.FloatField()
    action = serializers.ChoiceField(choices=["on", "off"])
    cooldown_minutes = serializers.IntegerField(min_value=1, max_value=1440, default=5)
    counter_action_minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False, allow_null=True, default=None)
    source_device_id = serializers.UUIDField(required=False)

    def validate_threshold_value(self, value):
        return value

    def validate(self, attrs):
        sensor = attrs["sensor_field"]
        threshold = attrs["threshold_value"]
        if sensor == "temperature" and not (-40 <= threshold <= 80):
            raise serializers.ValidationError(
                {"threshold_value": "Temperature threshold must be between -40 and 80."}
            )
        if sensor == "humidity" and not (0 <= threshold <= 100):
            raise serializers.ValidationError(
                {"threshold_value": "Humidity threshold must be between 0 and 100."}
            )
        if sensor == "battery" and not (0 <= threshold <= 100):
            raise serializers.ValidationError(
                {"threshold_value": "Battery threshold must be between 0 and 100."}
            )
        return attrs

    def create(self, validated_data):
        from apps.devices.models import Device, Relay

        relay_id = validated_data["relay_id"]
        relay = Relay.objects.select_related("device").get(pk=relay_id)

        # Resolve source device: battery rules don't need one
        source_device = None
        source_device_id = validated_data.get("source_device_id")
        if source_device_id:
            source_device = Device.objects.get(device_id=source_device_id)
        elif validated_data["sensor_field"] != "battery":
            source_device = relay.device

        schedule = Schedule.objects.create(
            relay_id=relay_id,
            schedule_type="automation",
            is_active=True,
        )

        AutomationRule.objects.create(
            schedule=schedule,
            sensor_field=validated_data["sensor_field"],
            operator=validated_data["operator"],
            threshold_value=validated_data["threshold_value"],
            action=validated_data["action"],
            cooldown_minutes=validated_data.get("cooldown_minutes", 5),
            counter_action_minutes=validated_data.get("counter_action_minutes"),
            source_device=source_device,
        )

        return schedule


class TimerUpdateSerializer(serializers.Serializer):
    relay_id = serializers.IntegerField(required=False)
    duration_minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False)
    action = serializers.ChoiceField(choices=["on", "off"], required=False)
    counter_action_minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False, allow_null=True)

    def update(self, schedule, validated_data):
        from .tasks import execute_timer_action

        timer = schedule.timer

        if "relay_id" in validated_data:
            schedule.relay_id = validated_data["relay_id"]
            schedule.save(update_fields=["relay_id"])

        needs_reschedule = False
        if "duration_minutes" in validated_data:
            timer.duration_minutes = validated_data["duration_minutes"]
            needs_reschedule = True
        if "action" in validated_data:
            timer.action = validated_data["action"]
        if "counter_action_minutes" in validated_data:
            timer.counter_action_minutes = validated_data["counter_action_minutes"]

        if needs_reschedule:
            if timer.celery_task_id:
                from config.celery import app
                app.control.revoke(timer.celery_task_id)

            now = timezone.now()
            timer.expires_at = now + timedelta(minutes=timer.duration_minutes)
            timer.save()

            task = execute_timer_action.apply_async(
                args=[schedule.id],
                eta=timer.expires_at,
            )
            timer.celery_task_id = task.id
            timer.save(update_fields=["celery_task_id"])
        else:
            timer.save()

        return schedule


class RecurringUpdateSerializer(serializers.Serializer):
    relay_id = serializers.IntegerField(required=False)
    time = serializers.TimeField(required=False)
    days_of_week = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6),
        required=False,
    )
    action = serializers.ChoiceField(choices=["on", "off"], required=False)
    counter_action_minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False, allow_null=True)

    def validate_days_of_week(self, value):
        if not value:
            raise serializers.ValidationError("At least one day must be selected.")
        return sorted(set(value))

    def update(self, schedule, validated_data):
        recurring = schedule.recurring

        if "relay_id" in validated_data:
            schedule.relay_id = validated_data["relay_id"]
            schedule.save(update_fields=["relay_id"])

        if "time" in validated_data:
            recurring.time = validated_data["time"]
        if "days_of_week" in validated_data:
            recurring.days_of_week = validated_data["days_of_week"]
        if "action" in validated_data:
            recurring.action = validated_data["action"]
        if "counter_action_minutes" in validated_data:
            recurring.counter_action_minutes = validated_data["counter_action_minutes"]

        recurring.save()
        return schedule


class AutomationRuleUpdateSerializer(serializers.Serializer):
    relay_id = serializers.IntegerField(required=False)
    sensor_field = serializers.ChoiceField(choices=["temperature", "humidity", "battery"], required=False)
    operator = serializers.ChoiceField(choices=["gt", "lt", "gte", "lte"], required=False)
    threshold_value = serializers.FloatField(required=False)
    action = serializers.ChoiceField(choices=["on", "off"], required=False)
    cooldown_minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False)
    counter_action_minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False, allow_null=True)
    source_device_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        sensor = attrs.get("sensor_field")
        threshold = attrs.get("threshold_value")
        if sensor and threshold is not None:
            if sensor == "temperature" and not (-40 <= threshold <= 80):
                raise serializers.ValidationError(
                    {"threshold_value": "Temperature threshold must be between -40 and 80."}
                )
            if sensor == "humidity" and not (0 <= threshold <= 100):
                raise serializers.ValidationError(
                    {"threshold_value": "Humidity threshold must be between 0 and 100."}
                )
            if sensor == "battery" and not (0 <= threshold <= 100):
                raise serializers.ValidationError(
                    {"threshold_value": "Battery threshold must be between 0 and 100."}
                )
        return attrs

    def update(self, schedule, validated_data):
        from apps.devices.models import Device

        rule = schedule.automation

        if "relay_id" in validated_data:
            schedule.relay_id = validated_data["relay_id"]
            schedule.save(update_fields=["relay_id"])

        if "sensor_field" in validated_data:
            rule.sensor_field = validated_data["sensor_field"]
        if "operator" in validated_data:
            rule.operator = validated_data["operator"]
        if "threshold_value" in validated_data:
            rule.threshold_value = validated_data["threshold_value"]
        if "action" in validated_data:
            rule.action = validated_data["action"]
        if "cooldown_minutes" in validated_data:
            rule.cooldown_minutes = validated_data["cooldown_minutes"]
        if "counter_action_minutes" in validated_data:
            rule.counter_action_minutes = validated_data["counter_action_minutes"]
        if "source_device_id" in validated_data:
            sid = validated_data["source_device_id"]
            if sid:
                rule.source_device = Device.objects.get(device_id=sid)
            else:
                rule.source_device = None

        rule.save()
        return schedule
