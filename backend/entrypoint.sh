#!/bin/sh
set -e

# Wait for PostgreSQL if we're using it
if [ "$DB_ENGINE" = "django.db.backends.postgresql" ]; then
    echo "Waiting for PostgreSQL..."

    until pg_isready \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME"
    do
        echo "PostgreSQL is unavailable - retrying in 2 seconds..."
        sleep 2
    done

    echo "PostgreSQL is ready!"
fi

if [ "$RUN_MIGRATIONS" = "true" ]; then
    echo "Running migrations..."
    python manage.py migrate --noinput

    echo "Collecting static files..."
    python manage.py collectstatic --noinput
fi

echo "Starting application..."
exec "$@"