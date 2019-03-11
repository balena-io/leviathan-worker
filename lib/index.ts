import * as express from 'express';
import TestBot from './workers/testbot';
import * as http from 'http';

async function setup(devicePath: string): Promise<express.Application> {
	/**
	 * Server context
	 */
	const app = express();
	const httpServer = http.createServer(app);

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
			res.send('OK');
			await worker.on();
		},
	);
	app.post('/dut/off', async (req: express.Request, res: express.Response) => {
		res.send('OK');
		await worker.off();
	});
	app.post(
		'/dut/flash',
		async (req: express.Request, res: express.Response) => {
			const timer = setInterval(() => {
				res.write('Still Flashing');
			}, httpServer.keepAliveTimeout);

			await worker.flash(req);

			clearInterval(timer);
			res.status(200).end('OK');
		},
	);

	return app;
}

export default setup;
