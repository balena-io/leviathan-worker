#!/bin/bash

ROOT_DIR=$(git rev-parse --show-toplevel)

for i in "$@"
do
    case $i in
        -p=*|--platform=*)
            PLATFORM="${i#*=}"
            shift # past argument=value
        ;;
        -b=*|--build)
            BUILD="true"
            shift # past argument=value
        ;;
        *)
        ;;
    esac
done

if [[ "$PLATFORM" != 'balena' ]] && [[ "$PLATFORM" != 'generic-x86' ]]; then
    echo 'Unsupported deploy platform.'
    exit 1
fi

ln -sf "${ROOT_DIR}/compose/${PLATFORM}.yml" "${ROOT_DIR}/docker-compose.yml"

if [[ "$PLATFORM" == 'generic-x86' ]]; then
    npx dockerfile-template -d BALENA_MACHINE_NAME="intel-nuc" > "${ROOT_DIR}/Dockerfile"
fi

if [ ! -z BUILD ]; then
    cd $ROOT_DIR
    docker-compose build
    cd -
fi