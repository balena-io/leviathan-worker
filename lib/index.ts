import * as express from 'express';
import * as bodyParser from 'body-parser';
import TestBot from './workers/testbot';
import { Server } from 'http';

async function setup(devicePath: string, port: number = 80): Promise<Server> {
	/**
	 * Server context
	 */
	const app = express();
	app.use(bodyParser.json());
	app.use(
		bodyParser.urlencoded({
			// to support URL-encoded bodies
			extended: true,
		}),
	);

	const worker = new TestBot(devicePath);

	/**
	 * Get worker ready
	 */
	await worker.ready();

	/**
	 * Setup DeviceUnderTest routes
	 */
	app.post(
		'/dut/on',
		async (req: express.Request, res: express.Response): Promise<void> => {
			await worker.powerOnDUT();
			res.send('OK');
		},
	);
	app.post('/dut/off', async (req: express.Request, res: express.Response) => {
		await worker.powerOffDUT();
		res.send('OK');
	});
	app.post(
		'/dut/flash',
		async (req: express.Request, res: express.Response) => {
			function keepAlive() {
				res.write('Still flashing');
			}

			worker.on('progress', keepAlive);
			await worker.flashDUT(req);
			worker.removeListener('progress', keepAlive);

			res.end('OK');
		},
	);

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

	return server;
}

if (process.env.TEST == null) {
	if (process.env.DEVICE_PATH != null) {
		setup(
			process.env.DEVICE_PATH,
			process.env.PORT != null ? parseInt(process.env.PORT) : undefined,
		);
	} else {
		throw new Error("Path to worker's interface not specified");
	}
}

export default setup;
