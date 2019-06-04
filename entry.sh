#!/bin/bash

DBUS_SYSTEM_BUS_ADDRESS=unix:path=/host/run/dbus/system_bus_socket avahi-daemon -D --no-drop-root

npm start