import * as Bluebird from 'bluebird';
import * as net from 'net';
import * as WebSocket from 'ws';
import * as mdns from 'multicast-dns';

type State = {
	sReady: boolean;
	wsReady: boolean;
	wsBuffer?: Uint8Array[];
	sBuffer?: Uint8Array[];
};

class WsBridge {
	private wss: WebSocket.Server;

	constructor(private port: string = '8080') {
		console.log(`Worker wss listening on port: ${port}`);
		this.wss = new WebSocket.Server({ port: parseInt(port) });
	}

	private static async parseTarget(target: string) {
		let tmp;

		tmp = target.split(':');

		if (tmp[0] == null || tmp[1] == null) {
			throw new Error('Invalid address format. Expected format: address:port');
		}

		return {
			port: parseInt(tmp[1]),
			host: await WsBridge.resolveLocalTarget(tmp[0]),
		};
	}

	private static resolveLocalTarget(target: string): PromiseLike<string> {
		return new Bluebird((resolve, reject) => {
			if (/\.local$/.test(target)) {
				const socket = mdns();

				const timeout = setTimeout(() => {
					socket.destroy();
					reject(new Error(`Could not resolve ${target}`));
				}, 10000);

				socket.query([{ type: 'A', name: target }]);
				socket.on('error', () => {
					clearTimeout(timeout);
					socket.destroy();
					reject();
				});
				socket.on('response', function(response: any) {
					for (let i = 0; i < response.answers.length; i++) {
						const a = response.answers[i];
						if (a.name === target && a.type === 'A') {
							clearTimeout(timeout);
							resolve(a.data);
							socket.destroy();
						}
					}
				});
			} else {
				resolve(target);
			}
		});
	}

	public async toTcp(target?: string) {
		if (target == null) {
			throw new Error('Invalid tunnel configuration');
		}

		const parsedTarget = await WsBridge.parseTarget(target);

		this.destroy();

		await new Bluebird((resolve, reject) => {
			const socket = net.connect(parsedTarget);

			socket.on('error', reject);
			// Wait for the socket to connect
			socket.setTimeout(3000);
			socket.on('timeout', () => {
				if (socket != null) {
					socket.destroy();
				}
				reject(new Error(`Could not establish connnection to ${target}`));
			});
			socket.on('connect', () => {
				socket.destroy();
				resolve();
			});
		});

		console.log(`ws->tcp: forwarding port ${this.port} to ${target}`);
		this.wss.on('connection', ws => {
			const state = {
				sReady: false,
				wsReady: true,
				wsBuffer: [],
				sBuffer: [],
			};

			WsBridge.initSocketCallbacks(state, ws, net.connect(parsedTarget));
		});
	}

	private destroy() {
		this.wss.clients.forEach(client => {
			client.close();
		});
		this.wss.removeAllListeners('connection');
	}

	private static initSocketCallbacks(
		state: State,
		ws: WebSocket,
		socket: net.Socket,
	) {
		function flushSocketBuffer() {
			if (state.sBuffer != null && state.sBuffer.length > 0) {
				socket.write(Buffer.concat(state.sBuffer));
			}
			state.sBuffer = undefined;
		}

		function flushWebsocketBuffer() {
			if (state.wsBuffer != null && state.wsBuffer.length > 0) {
				ws.send(Buffer.concat(state.wsBuffer), { binary: true, mask: false });
			}
			state.wsBuffer = undefined;
		}

		socket.on('close', function() {
			ws.removeAllListeners('close');
			ws.close();
		});

		ws.on('close', function() {
			socket.removeAllListeners('close');
			socket.end();
		});

		ws.on('error', function(error) {
			console.log(`Websocket error; Error: ${error}`);
			ws.removeAllListeners('close');
			socket.removeAllListeners('close');
			ws.close();
			socket.end();
		});

		socket.on('error', function(error: Error) {
			console.log(`TCP socket error; Error: ${error}`);
			ws.removeAllListeners('close');
			socket.removeAllListeners('close');
			ws.close();
			socket.end();
		});

		socket.on('connect', function() {
			state.sReady = true;
			flushSocketBuffer();
		});

		ws.on('open', function() {
			state.wsReady = true;
			flushWebsocketBuffer();
		});

		socket.on('data', function(data: Uint8Array) {
			if (state.wsBuffer != null && !state.wsReady) {
				state.wsBuffer.push(data);
			} else {
				ws.send(data, { binary: true, mask: false });
			}
		});

		ws.on('message', function(msg: Uint8Array) {
			if (state.sBuffer != null && !state.sReady) {
				state.sBuffer.push(msg);
			} else {
				socket.write(msg);
			}
		});
	}
}

export default WsBridge;
