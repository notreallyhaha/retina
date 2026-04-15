FROM python:3.11-slim

# Install system dependencies required by OpenCV and other native libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer-cache friendly)
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY server/ .

# Expose the application port
EXPOSE 8080

# Use Railway's PORT env var if set, otherwise default to 8080
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
