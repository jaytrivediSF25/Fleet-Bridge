#!/usr/bin/env bash
cd "$(dirname "$0")/backend"
pip3 install -r requirements.txt --quiet 2>/dev/null
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
