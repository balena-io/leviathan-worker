import * as express from 'express';
import * as bodyParser from 'body-parser';
import TestBot from './workers/testbot';
import * as http from 'http';
import { multiWrite } from 'etcher-sdk';
import NetworkManager from './nm';

export interface Options {
	testbot: {
		devicePath: string;
	};
	network?:
		| {
				apWifiIface: string;
				apWiredIface?: string;
		  }
		| {
				apWifiIface?: string;
				apWiredIface: string;
		  };
}

interface Worker {
	testbot: TestBot;
	network?: NetworkManager;
}

async function setup(options: Options): Promise<express.Application> {
	/**
	 * Server context
	 */
	const jsonParser = bodyParser.json();
	const app = express();
	const httpServer = http.createServer(app);
	const worker: Worker = {
		testbot: new TestBot(options.testbot),
		network:
			options.network != null ? new NetworkManager(options.network) : undefined,
	};

	/**
	 * Get worker ready
	 */
	await worker.testbot.ready();

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
				await worker.testbot.powerOn();
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
				await worker.testbot.powerOff();
				res.send('OK');
			} catch (err) {
				next(err);
			}
		},
	);
	app.post(
		'/dut/network',
		jsonParser,
		async (
			req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			try {
				if (worker.network == null) {
					res
						.status(501)
						.send('Network not configured on this worker. Ignoring...');
				} else {
					if (req.body.wireless != null) {
						if (
							req.body.wireless.ssid != null &&
							req.body.wireless.psk != null
						) {
							await worker.network.addWirelessConnection(req.body.wireless);
						} else {
							throw new Error('Wireless configuration incomplete');
						}
					} else {
						await worker.network.removeWirelessConnection();
					}

					if (req.body.wired != null) {
						await worker.network.addWiredConnection(req.body.wired);
					} else {
						await worker.network.removeWiredConnection();
					}
					res.send('OK');
				}
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
			function onProgress(progress: multiWrite.MultiDestinationProgress): void {
				res.write(`progress: ${JSON.stringify(progress)}`);
			}

			res.writeHead(202, {
				'Content-Type': 'text/event-stream',
				Connection: 'keep-alive',
			});

			const timer = setInterval(() => {
				res.write('status: pending');
			}, httpServer.keepAliveTimeout);

			try {
				worker.testbot.on('progress', onProgress);

				await worker.testbot.flash(req);
			} catch (e) {
				res.write(`error: ${e.message}`);
			} finally {
				worker.testbot.removeListener('progress', onProgress);
				res.write('status: done');
				res.end();
				clearInterval(timer);
			}
		},
	);

	return app;
}

export default setup;
