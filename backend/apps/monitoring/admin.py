from django.contrib import admin

from .models import SensorReading


@admin.register(SensorReading)
class SensorReadingAdmin(admin.ModelAdmin):
    list_display = ("device", "temperature", "humidity", "recorded_at")
    list_filter = ("device",)
    readonly_fields = ("recorded_at",)
