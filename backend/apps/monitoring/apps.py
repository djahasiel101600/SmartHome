from django.apps import AppConfig


class MonitoringConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.monitoring"

    def ready(self):
        from django.db.models.signals import post_migrate
        post_migrate.connect(_reset_devices_offline, sender=self)


def _reset_devices_offline(sender, **kwargs):
    """On server start (after migrations), mark all devices offline.
    They will be set online again when they reconnect via WebSocket."""
    from apps.devices.models import Device
    count = Device.objects.filter(is_online=True).update(is_online=False)
    if count:
        import logging
        logging.getLogger(__name__).info(f"Reset {count} device(s) to offline on startup")
