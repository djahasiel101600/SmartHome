from django.contrib import admin

from .models import AutomationRule, RecurringSchedule, Schedule, TimerSchedule


class TimerInline(admin.StackedInline):
    model = TimerSchedule
    extra = 0


class RecurringInline(admin.StackedInline):
    model = RecurringSchedule
    extra = 0


class AutomationInline(admin.StackedInline):
    model = AutomationRule
    extra = 0


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = ("relay", "schedule_type", "is_active", "created_at")
    list_filter = ("schedule_type", "is_active")
    inlines = [TimerInline, RecurringInline, AutomationInline]


@admin.register(TimerSchedule)
class TimerScheduleAdmin(admin.ModelAdmin):
    list_display = ("schedule", "duration_minutes", "action", "counter_action_minutes", "started_at", "expires_at")
    list_filter = ("action",)
    readonly_fields = ("started_at",)


@admin.register(RecurringSchedule)
class RecurringScheduleAdmin(admin.ModelAdmin):
    list_display = ("schedule", "time", "days_of_week", "action", "counter_action_minutes")
    list_filter = ("action",)


@admin.register(AutomationRule)
class AutomationRuleAdmin(admin.ModelAdmin):
    list_display = ("schedule", "sensor_field", "operator", "threshold_value", "action", "cooldown_minutes", "counter_action_minutes", "last_triggered_at")
    list_filter = ("sensor_field", "operator", "action")
    readonly_fields = ("last_triggered_at",)
