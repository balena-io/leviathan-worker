#!/bin/bash

set -e

if [ ! -z ${CI} ]; then
    echo 'CI run. No firmware needed.'
    exit 0
fi

teensy_flash() {
    until teensy_loader_cli -v -s -mmcu=mk66fx1m0 ${1}
    do 
        echo 'Teensy flash failed. Retrying...'
        sleep 2
    done
}

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
CONFIGURED_USB='/dev/disk/by-id/usb-PTX_sdmux_HS-SD_MMC_1234-0:0' 
UNCONFIGURED_USB='/dev/disk/by-id/usb-Generic_Ultra_HS-SD_MMC_000008264001-0:0'

if [ -L ${UNCONFIGURED_USB} ]; then
    teensy_flash ${DIR}/SDcardSwitch.ino.hex
    echo 'Waiting for the Arduino sketch to finish'
    sleep 20
    udevadm settle
    usbsdmux-configure $(readlink -f ${UNCONFIGURED_USB}) 1234
fi

teensy_flash ${DIR}/StandardFirmataPlus.ino.hex
