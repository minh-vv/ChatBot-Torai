FROM python:3.11-slim
WORKDIR /app

# Cài các thư viện hệ thống cần thiết cho OpenCV / PDF / OCR
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    build-essential \
    libpoppler-cpp-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Cài các package cơ bản ổn định
COPY requirements-base.txt .
RUN pip install --no-cache-dir -r requirements-base.txt

# Cài các package thay đổi thường xuyên
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt