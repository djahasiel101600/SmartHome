import logging
from datetime import timedelta

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
from django.utils import timezone

logger = logging.getLogger(__name__)


def _send_relay_command(relay, new_state):
    """Helper to update relay state, send device command, and broadcast to dashboard."""
    relay.state = new_state
    relay.save(update_fields=["state"])

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


@shared_task
def execute_counter_action(relay_id, reverse_state):
    """Execute the reverse/counter action on a relay after a delay."""
    from apps.devices.models import Relay

    try:
        relay = Relay.objects.select_related("device").get(id=relay_id)
    except Relay.DoesNotExist:
        logger.warning(f"Relay {relay_id} not found for counter action.")
        return

    # Idempotency: skip if relay already in target state
    if relay.state == reverse_state:
        logger.info(f"Relay {relay.relay_number} already in state {reverse_state}, skipping counter action.")
        return

    _send_relay_command(relay, reverse_state)
    logger.info(f"Counter action executed: relay {relay.relay_number} → {'ON' if reverse_state else 'OFF'}")


@shared_task
def execute_timer_action(schedule_id):
    """Execute a timer schedule action (turn relay on/off after duration expires)."""
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

    _send_relay_command(relay, new_state)

    # Schedule counter action if configured
    if timer.counter_action_minutes:
        counter_eta = timezone.now() + timedelta(minutes=timer.counter_action_minutes)
        reverse_state = not new_state
        task = execute_counter_action.apply_async(
            args=[relay.id, reverse_state],
            eta=counter_eta,
        )
        timer.counter_task_id = task.id
        timer.save(update_fields=["counter_task_id"])
        logger.info(f"Counter action scheduled for relay {relay.relay_number} in {timer.counter_action_minutes}min")

    # Deactivate the timer schedule after execution
    schedule.is_active = False
    schedule.save(update_fields=["is_active"])
    logger.info(f"Timer schedule {schedule_id} executed: relay {relay.relay_number} → {timer.action}")


@shared_task
def check_recurring_schedules():
    """Check and execute any recurring schedules that match the current time and day."""
    from .models import RecurringSchedule

    now = timezone.localtime(timezone.now())
    current_time = now.time().replace(second=0, microsecond=0)
    current_day = now.weekday()  # 0=Monday, 6=Sunday

    recurring_schedules = RecurringSchedule.objects.filter(
        schedule__is_active=True,
    ).select_related("schedule", "schedule__relay", "schedule__relay__device")

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

        _send_relay_command(relay, new_state)

        # Schedule counter action if configured
        if recurring.counter_action_minutes:
            counter_eta = timezone.now() + timedelta(minutes=recurring.counter_action_minutes)
            reverse_state = not new_state
            execute_counter_action.apply_async(
                args=[relay.id, reverse_state],
                eta=counter_eta,
            )
            logger.info(f"Counter action scheduled for relay {relay.relay_number} in {recurring.counter_action_minutes}min")

        logger.info(
            f"Recurring schedule executed: relay {relay.relay_number} → {recurring.action}"
        )


def _read_battery_sysfs():
    """Try reading battery info from /sys/class/power_supply/."""
    import glob

    level = None
    status = None

    # Auto-discover battery paths (BAT0, BAT1, CMB0, CMB1, etc.)
    capacity_files = sorted(glob.glob("/sys/class/power_supply/*/capacity"))
    for cap_path in capacity_files:
        try:
            with open(cap_path, "r") as f:
                level = int(f.read().strip())
            # Read status from the same power supply directory
            status_path = cap_path.replace("capacity", "status")
            try:
                with open(status_path, "r") as f:
                    status = f.read().strip().lower()
            except (FileNotFoundError, PermissionError):
                status = "unknown"
            break
        except (FileNotFoundError, ValueError, PermissionError):
            continue

    return level, status


def _read_battery_upower():
    """Try reading battery info via upower (auto-discovers battery device)."""
    import re
    import subprocess

    # First, enumerate available upower devices to find a battery
    try:
        enum_result = subprocess.run(
            ["upower", "-e"],
            capture_output=True, text=True, timeout=5,
        )
        battery_path = None
        for line in enum_result.stdout.splitlines():
            if "battery" in line.lower():
                battery_path = line.strip()
                break
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None, None

    if not battery_path:
        return None, None

    try:
        result = subprocess.run(
            ["upower", "-i", battery_path],
            capture_output=True, text=True, timeout=5,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None, None

    output = result.stdout
    level = None
    status = None

    percent_match = re.search(r"percentage:\s+(\d+)%", output)
    if percent_match:
        level = int(percent_match.group(1))

    status_match = re.search(r"state:\s+(\S+)", output)
    if status_match:
        status = status_match.group(1).lower()

    return level, status


@shared_task
def check_battery_level():
    """Read the host machine battery level and status, cache it, and broadcast to dashboard."""
    level, status = _read_battery_sysfs()

    if level is None:
        level, status = _read_battery_upower()

    if level is None:
        logger.debug("No battery detected on this system")
        return

    status = status or "unknown"

    from django.core.cache import cache

    prev_level = cache.get("server_battery_level")
    prev_status = cache.get("server_battery_status")

    cache.set("server_battery_level", level, timeout=300)
    cache.set("server_battery_status", status, timeout=300)

    # Broadcast to dashboard when value changes (or first reading)
    if level != prev_level or status != prev_status:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "dashboard",
            {
                "type": "battery_update",
                "data": {
                    "level": level,
                    "status": status,
                },
            },
        )

    logger.debug(f"Battery level: {level}% ({status})")


@shared_task
def evaluate_automation_rules(device_id=None):
    """Evaluate sensor-triggered automation rules and execute matching ones."""
    from django.core.cache import cache
    from django.db.models import Q

    from apps.monitoring.models import SensorReading

    from .models import AutomationRule

    now = timezone.now()

    rules_qs = AutomationRule.objects.filter(
        schedule__is_active=True,
    ).select_related("schedule", "schedule__relay", "schedule__relay__device", "source_device")

    if device_id is not None:
        # Include rules for this device AND battery rules (server-side, no source_device)
        rules_qs = rules_qs.filter(
            Q(source_device__device_id=device_id) | Q(sensor_field="battery")
        )

    for rule in rules_qs:
        # Get the sensor value
        if rule.sensor_field == "battery":
            value = cache.get("server_battery_level")
            if value is None:
                continue
        else:
            if not rule.source_device:
                continue
            latest_reading = (
                SensorReading.objects.filter(device=rule.source_device)
                .order_by("-recorded_at")
                .first()
            )
            if not latest_reading:
                continue
            value = getattr(latest_reading, rule.sensor_field, None)
            if value is None:
                continue

        # Evaluate the condition
        if not rule.evaluate(value):
            continue

        # Check cooldown
        if rule.last_triggered_at:
            cooldown_elapsed = (now - rule.last_triggered_at).total_seconds() / 60
            if cooldown_elapsed < rule.cooldown_minutes:
                continue

        relay = rule.schedule.relay
        new_state = rule.action == "on"

        # Idempotency: skip if relay already in desired state
        if relay.state == new_state:
            continue

        _send_relay_command(relay, new_state)

        rule.last_triggered_at = now
        rule.save(update_fields=["last_triggered_at"])

        # Schedule counter action if configured
        if rule.counter_action_minutes:
            counter_eta = now + timedelta(minutes=rule.counter_action_minutes)
            reverse_state = not new_state
            execute_counter_action.apply_async(
                args=[relay.id, reverse_state],
                eta=counter_eta,
            )
            logger.info(f"Counter action scheduled for relay {relay.relay_number} in {rule.counter_action_minutes}min")

        logger.info(
            f"Automation rule executed: {rule.sensor_field} {rule.operator} {rule.threshold_value} "
            f"(value={value}) → relay {relay.relay_number} {rule.action}"
        )
