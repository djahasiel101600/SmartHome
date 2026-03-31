"""
Celery configuration for Smart Home Automation project.
"""

import os
import sys

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("smart_home")
app.config_from_object("django.conf:settings", namespace="CELERY")

# Windows does not support the prefork pool (billiard multiprocessing bugs).
# Use the solo pool which runs tasks sequentially in the main process.
if sys.platform == "win32":
    app.conf.worker_pool = "solo"

app.autodiscover_tasks()


@app.on_after_finalize.connect
def setup_periodic_tasks(sender, **kwargs):
    """Register periodic tasks after Celery is fully initialized.

    Ensures check_recurring_schedules runs every 60 seconds so that
    recurring Schedule entries actually trigger relay actions.
    """
    sender.add_periodic_task(
        60.0,
        sender.signature("apps.schedules.tasks.check_recurring_schedules"),
        name="check-recurring-schedules-every-minute",
    )
