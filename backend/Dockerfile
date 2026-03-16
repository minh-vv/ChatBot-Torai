FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if needed (e.g., for some python packages)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run migrations and start server
# Using 0.0.0.0 is crucial for Docker
EXPOSE 8000
CMD python manage.py migrate && python manage.py runserver 0.0.0.0:8000
