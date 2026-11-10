#!/bin/bash
# usage: ./shot.sh 01-today   (renders one page at 1440x900 @2x, sequential only)
D="/Users/theaimogul/dev/hackathon%20-%20community/tidewatch/mockups/upgrades"
cd "/Users/theaimogul/dev/hackathon - community/tidewatch/mockups/upgrades"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 --force-device-scale-factor=2 --virtual-time-budget=9000 --screenshot="$1.png" "file://$D/$1.html" 2>/dev/null
ls -la "$1.png"
