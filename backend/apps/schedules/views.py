from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Schedule
from .serializers import (
    RecurringCreateSerializer,
    ScheduleSerializer,
    TimerCreateSerializer,
)


class RelayScheduleListView(generics.ListAPIView):
    serializer_class = ScheduleSerializer

    def get_queryset(self):
        return Schedule.objects.filter(
            relay_id=self.kwargs["relay_id"]
        ).select_related("timer", "recurring", "relay")


class ScheduleListView(generics.ListAPIView):
    serializer_class = ScheduleSerializer
    queryset = Schedule.objects.select_related("timer", "recurring", "relay").all()


class ScheduleDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = ScheduleSerializer
    queryset = Schedule.objects.select_related("timer", "recurring", "relay").all()

    def perform_destroy(self, instance):
        # Cancel Celery task if it's a timer
        if instance.schedule_type == "timer" and hasattr(instance, "timer"):
            task_id = instance.timer.celery_task_id
            if task_id:
                from config.celery import app

                app.control.revoke(task_id)
        instance.delete()


class ScheduleToggleView(APIView):
    def post(self, request, pk):
        try:
            schedule = Schedule.objects.get(pk=pk)
        except Schedule.DoesNotExist:
            return Response({"detail": "Schedule not found."}, status=status.HTTP_404_NOT_FOUND)

        schedule.is_active = not schedule.is_active
        schedule.save(update_fields=["is_active"])
        return Response(ScheduleSerializer(schedule).data)


class TimerCreateView(APIView):
    def post(self, request):
        serializer = TimerCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        schedule = serializer.save()
        return Response(
            ScheduleSerializer(schedule).data,
            status=status.HTTP_201_CREATED,
        )


class RecurringCreateView(APIView):
    def post(self, request):
        serializer = RecurringCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        schedule = serializer.save()
        return Response(
            ScheduleSerializer(schedule).data,
            status=status.HTTP_201_CREATED,
        )
