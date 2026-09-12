#!/bin/bash
# Локальный просмотр сайта: двойной клик → откроется браузер.
cd "$(dirname "$0")"
PORT=8099
echo "Three Dimension → http://localhost:$PORT"
( sleep 1; open "http://localhost:$PORT" ) &
python3 -m http.server $PORT
