import * as express from 'express';
import * as bodyParser from 'body-parser';
import TestBot from './workers/testbot';
import { Server } from 'http';

async function setup(devicePath: string): Promise<express.Application> {
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
			res.status(202).send('In Progress');
			await worker.flash(req.body.url);
		},
	);

	return app;
}

export default setup;
