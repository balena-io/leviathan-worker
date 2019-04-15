import setup, { Options } from '../lib/index';

(async function(): Promise<void> {
	let port: number = 80;
	let devicePath: string;
	let network: Options['network'] = undefined;

	if (process.env.DEVICE_PATH != null) {
		devicePath = process.env.DEVICE_PATH;

		if (process.env.PORT != null) {
			port = parseInt(process.env.PORT);
		}
	} else {
		throw new Error("Path to worker's interface not specified");
	}

	if (process.env.AP_WIFI_IFACE != null || process.env.AP_WIRED_IFACE != null) {
		// We do not know which interface will be defined, but it doesn't matter
		// given that any users of the return of this function will be required
		// to check so we cast explicitly here
		const apWifiIface = process.env.AP_WIFI_IFACE as string;
		const apWiredIface = process.env.AP_WIRED_IFACE as string;

		network = {
			apWifiIface,
			apWiredIface,
		};
	}

	const app = await setup({
		testbot: {
			devicePath,
		},
		network,
	});

	/**
	 * Start Express Server
	 */
	const server = app.listen(port, () => {
		const address = server.address();

		if (typeof address !== 'string') {
			console.log(`Worker listening on port ${address.port}`);
		} else {
			throw new Error('Failed to allocate server address.');
		}
	});
})();
