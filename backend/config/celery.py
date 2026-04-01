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
