import setup from '../lib/index';

(async function(): Promise<void> {
	let port: number = 80;
	let devicePath: string;

	if (process.env.DEVICE_PATH != null) {
		devicePath = process.env.DEVICE_PATH;

		if (process.env.PORT != null) {
			port = parseInt(process.env.PORT);
		}
	} else {
		throw new Error("Path to worker's interface not specified");
	}

	const app = await setup(devicePath);

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
