#!/bin/sh

CHROME="$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --screenshot "http://localhost/x/2025-roguelike-dev/?screenshot"

convert screenshot.png -trim screenshots/$(date +%Y-%m-%d:%H:%M).png
rm screenshot.png
