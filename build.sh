#!/usr/bin/env bash
# Render build script — installs deps and builds the frontend

set -o errexit

# Python deps
pip install -r backend/requirements.txt

# Frontend build
cd frontend
npm install
npm run build
cd ..
