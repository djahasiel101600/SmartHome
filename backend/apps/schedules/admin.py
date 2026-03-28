from django.contrib import admin

from .models import RecurringSchedule, Schedule, TimerSchedule


class TimerInline(admin.StackedInline):
    model = TimerSchedule
    extra = 0


class RecurringInline(admin.StackedInline):
    model = RecurringSchedule
    extra = 0


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = ("relay", "schedule_type", "is_active", "created_at")
    list_filter = ("schedule_type", "is_active")
    inlines = [TimerInline, RecurringInline]
