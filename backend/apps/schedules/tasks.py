import logging

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def execute_timer_action(schedule_id):
    """Execute a timer schedule action (turn relay on/off after duration expires)."""
    from apps.devices.models import Relay

    from .models import Schedule

    try:
        schedule = Schedule.objects.select_related("timer", "relay", "relay__device").get(
            id=schedule_id
        )
    except Schedule.DoesNotExist:
        logger.warning(f"Schedule {schedule_id} not found, skipping timer execution.")
        return

    if not schedule.is_active:
        logger.info(f"Schedule {schedule_id} is inactive, skipping.")
        return

    timer = schedule.timer
    relay = schedule.relay
    new_state = timer.action == "on"

    # Update relay state in DB
    relay.state = new_state
    relay.save(update_fields=["state"])

    # Send command to device
    channel_layer = get_channel_layer()
    device_group = f"device_{relay.device.device_id}"
    async_to_sync(channel_layer.group_send)(
        device_group,
        {
            "type": "send_command",
            "command": {
                "type": "command",
                "action": "set_relay",
                "relay": relay.relay_number,
                "state": new_state,
            },
        },
    )

    # Broadcast to dashboard
    async_to_sync(channel_layer.group_send)(
        "dashboard",
        {
            "type": "relay_update",
            "data": {
                "relay_id": relay.id,
                "relay_number": relay.relay_number,
                "state": new_state,
                "device_id": str(relay.device.device_id),
                "label": relay.label,
            },
        },
    )

    # Deactivate the timer schedule after execution
    schedule.is_active = False
    schedule.save(update_fields=["is_active"])
    logger.info(f"Timer schedule {schedule_id} executed: relay {relay.relay_number} → {timer.action}")


@shared_task
def check_recurring_schedules():
    """Check and execute any recurring schedules that match the current time and day."""
    from apps.devices.models import Relay

    from .models import RecurringSchedule

    now = timezone.localtime(timezone.now())
    current_time = now.time().replace(second=0, microsecond=0)
    current_day = now.weekday()  # 0=Monday, 6=Sunday

    recurring_schedules = RecurringSchedule.objects.filter(
        schedule__is_active=True,
    ).select_related("schedule", "schedule__relay", "schedule__relay__device")

    channel_layer = get_channel_layer()

    for recurring in recurring_schedules:
        # Check if current day is in the schedule's days_of_week
        if current_day not in recurring.days_of_week:
            continue

        # Check if current time matches (within the same minute)
        scheduled_time = recurring.time.replace(second=0, microsecond=0)
        if scheduled_time != current_time:
            continue

        relay = recurring.schedule.relay
        new_state = recurring.action == "on"

        # Update relay state
        relay.state = new_state
        relay.save(update_fields=["state"])

        # Send command to device
        device_group = f"device_{relay.device.device_id}"
        async_to_sync(channel_layer.group_send)(
            device_group,
            {
                "type": "send_command",
                "command": {
                    "type": "command",
                    "action": "set_relay",
                    "relay": relay.relay_number,
                    "state": new_state,
                },
            },
        )

        # Broadcast to dashboard
        async_to_sync(channel_layer.group_send)(
            "dashboard",
            {
                "type": "relay_update",
                "data": {
                    "relay_id": relay.id,
                    "relay_number": relay.relay_number,
                    "state": new_state,
                    "device_id": str(relay.device.device_id),
                    "label": relay.label,
                },
            },
        )

        logger.info(
            f"Recurring schedule executed: relay {relay.relay_number} → {recurring.action}"
        )
