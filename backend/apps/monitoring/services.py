import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from openai import OpenAI

from apps.devices.models import Device

from .models import SensorInsight, SensorReading

logger = logging.getLogger(__name__)

client = OpenAI(api_key=settings.OPENAI_API_KEY)

THRESHOLDS = settings.SENSOR_COMFORT_THRESHOLDS


def check_thresholds(temperature: float, humidity: float) -> bool:
    return (
        temperature < THRESHOLDS["temp_min"]
        or temperature > THRESHOLDS["temp_max"]
        or humidity < THRESHOLDS["humidity_min"]
        or humidity > THRESHOLDS["humidity_max"]
    )


def determine_severity(temperature: float, humidity: float) -> str:
    temp_min, temp_max = THRESHOLDS["temp_min"], THRESHOLDS["temp_max"]
    hum_min, hum_max = THRESHOLDS["humidity_min"], THRESHOLDS["humidity_max"]

    temp_deviation = max(temp_min - temperature, temperature - temp_max, 0)
    hum_deviation = max(hum_min - humidity, humidity - hum_max, 0)

    max_deviation = max(temp_deviation, hum_deviation)

    if max_deviation >= 10:
        return "critical"
    elif max_deviation >= 5:
        return "warning"
    return "info"


def is_cached(device: Device) -> bool:
    cache_cutoff = timezone.now() - timedelta(minutes=settings.INSIGHT_CACHE_MINUTES)
    return SensorInsight.objects.filter(
        device=device, created_at__gte=cache_cutoff
    ).exists()


def generate_insight(
    device: Device,
    temperature: float,
    humidity: float,
) -> SensorInsight:
    history = SensorReading.objects.filter(
        device=device,
        recorded_at__gte=timezone.now() - timedelta(hours=1),
    ).order_by("recorded_at")[:60]

    history_lines = "\n".join(
        f"  {r.recorded_at.strftime('%H:%M:%S')} | {r.temperature:.1f}°C | {r.humidity:.1f}%"
        for r in history
    )

    severity = determine_severity(temperature, humidity)

    system_prompt = (
        "You are a smart home environment advisor. Analyze room sensor data and provide "
        "concise, actionable insights. Cover these aspects in 2-4 short sentences:\n"
        "1. Comfort assessment — is the room comfortable?\n"
        "2. Trend — are values rising, falling, or stable?\n"
        "3. Actionable recommendation — what should the user do?\n"
        "4. Health/mold risk — any concerns about mold, respiratory issues, etc.?\n\n"
        f"Comfortable ranges: {THRESHOLDS['temp_min']}-{THRESHOLDS['temp_max']}°C temperature, "
        f"{THRESHOLDS['humidity_min']}-{THRESHOLDS['humidity_max']}% humidity."
    )

    user_prompt = (
        f"Current reading: {temperature:.1f}°C, {humidity:.1f}% humidity\n"
        f"Severity: {severity}\n\n"
        f"Last 1 hour of readings (Time | Temp | Humidity):\n{history_lines or '  No prior data'}"
    )

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=300,
        temperature=0.7,
    )

    insight_text = response.choices[0].message.content.strip()

    insight = SensorInsight.objects.create(
        device=device,
        insight_text=insight_text,
        temperature=temperature,
        humidity=humidity,
        severity=severity,
    )

    logger.info(f"Generated insight for {device.name}: [{severity}]")
    return insight
