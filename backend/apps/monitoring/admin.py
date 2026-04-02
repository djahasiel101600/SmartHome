from django.contrib import admin

from .models import SensorInsight, SensorReading


@admin.register(SensorReading)
class SensorReadingAdmin(admin.ModelAdmin):
    list_display = ("device", "temperature", "humidity", "recorded_at")
    list_filter = ("device",)
    readonly_fields = ("recorded_at",)


@admin.register(SensorInsight)
class SensorInsightAdmin(admin.ModelAdmin):
    list_display = ("device", "severity", "temperature", "humidity", "created_at")
    list_filter = ("device", "severity")
    readonly_fields = ("created_at",)
