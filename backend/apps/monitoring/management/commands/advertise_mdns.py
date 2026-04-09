"""
Management command to advertise the Smart Home server via mDNS.

Usage:
    python manage.py advertise_mdns
    python manage.py advertise_mdns --port 8000

The ESP32 firmware discovers this service automatically on the local network,
eliminating the need for users to manually enter the server IP address.

Requires: pip install zeroconf
"""

import signal
import socket
import time

from django.core.management.base import BaseCommand
from zeroconf import ServiceInfo, Zeroconf


class Command(BaseCommand):
    help = "Advertise the Smart Home backend via mDNS (_smarthome._tcp)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--port",
            type=int,
            default=8000,
            help="Port to advertise (default: 8000)",
        )

    def handle(self, *args, **options):
        port = options["port"]
        hostname = socket.gethostname()
        local_ip = self._get_local_ip()

        service_type = "_smarthome._tcp.local."
        service_name = f"SmartHome-{hostname}.{service_type}"

        info = ServiceInfo(
            type_=service_type,
            name=service_name,
            addresses=[socket.inet_aton(local_ip)],
            port=port,
            properties={"path": "/ws/device/"},
            server=f"{hostname}.local.",
        )

        zeroconf = Zeroconf()
        zeroconf.register_service(info)

        self.stdout.write(
            self.style.SUCCESS(
                f"mDNS: advertising {service_name} at {local_ip}:{port}"
            )
        )

        # Handle graceful shutdown
        shutdown = False

        def signal_handler(sig, frame):
            nonlocal shutdown
            shutdown = True

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        try:
            while not shutdown:
                time.sleep(1)
        finally:
            zeroconf.unregister_service(info)
            zeroconf.close()
            self.stdout.write(self.style.WARNING("mDNS service unregistered"))

    def _get_local_ip(self):
        """Get the local IP address that's reachable on the LAN."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"
