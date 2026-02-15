#!/usr/bin/env bash
# Render build script — installs deps and builds the frontend

set -o errexit  # Exit on error
set -x          # Print commands

echo "========================================="
echo "Starting FleetBridge build..."
echo "========================================="

# Install Python dependencies
echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r backend/requirements.txt

# Build frontend
echo "Building frontend..."
cd frontend
npm ci --prefer-offline --no-audit
npm run build
cd ..

echo "========================================="
echo "Build completed successfully!"
echo "========================================="
ls -la frontend/dist/
