#!/bin/bash

set -e

until bash firmware/entry.sh
do
    echo 'Firmware flash failed. Retrying...'
    sleep 2
done
npm start
