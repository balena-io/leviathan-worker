import * as Bluebird from 'bluebird';
import * as path from 'path';
import * as express from 'express';
import * as sdk from 'etcher-sdk';

export async function getDrive(
	device: string,
): Promise<sdk.sourceDestination.BlockDevice> {
	// Do not include system drives in our search
	const adapter = new sdk.scanner.adapters.BlockDeviceAdapter(() => false);
	const scanner = new sdk.scanner.Scanner([adapter]);

	await scanner.start();

	let drive;

	try {
		drive = scanner.getBy('device', device);
	} finally {
		scanner.stop();
	}
	if (!(drive instanceof sdk.sourceDestination.BlockDevice)) {
		throw new Error(`Cannot find ${device}`);
	}

	return drive;
}
