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
		async (
			_req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			try {
				await worker.on();
				res.send('OK');
			} catch (err) {
				next(err);
			}
		},
	);
	app.post(
		'/dut/off',
		async (
			_req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			try {
				await worker.off();
				res.send('OK');
			} catch (err) {
				next(err);
			}
		},
	);
	app.use(async function(
		err: Error,
		_req: express.Request,
		res: express.Response,
		_next: express.NextFunction,
	) {
		res.status(500).send(err.message);
	});

	app.post(
		'/dut/flash',
		async (req: express.Request, res: express.Response) => {
			const timer = setInterval(() => {
				res.write('Still Flashing');
			}, httpServer.keepAliveTimeout);

			try {
				res.status(202);
				await worker.flash(req);
			} catch (e) {
				res.write(e.message);
			} finally {
				res.end();
				clearInterval(timer);
			}
		},
	);

	return app;
}

export default setup;
