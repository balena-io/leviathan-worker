import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import * as Board from 'firmata';
import * as sdk from 'etcher-sdk';
import * as retry from 'bluebird-retry';
import * as visuals from 'resin-cli-visuals';
import { promiseStream, getDrive } from '../helpers';
import { fs } from 'mz';
import { Mutex } from 'async-mutex';
import { homedir } from 'os';
import { withFile } from 'tmp-promise';

/**
 * TestBot Hardware config
 */
const DEV_ID_LINK = '/dev/disk/by-id/usb-PTX_sdmux_HS-SD_MMC_1234-0:0';
const HW_SERIAL5: Board.SERIAL_PORT_ID = 5;
const BAUD_RATE = 9600;
enum GPIO {
	WRITE_DAC_REG = 0x00,
	ENABLE_VOUT_SW = 0x03,
	DISABLE_VOUT_SW = 0x04,
	ENABLE_VREG = 0x07,
	ENABLE_FAULTRST = 0x10,
	SD_RESET_ENABLE = 0x12,
	SD_RESET_DISABLE = 0x13,
}

enum PINS {
	LED_PIN = 13,
	SD_MUX_SEL_PIN = 28,
	USB_MUX_SEL_PIN = 29,
}

/**
 * Signal handling function
 */
async function manageHandlers(
	handler: (signal: NodeJS.Signals) => Promise<void>,
	options: { register: boolean },
): Promise<void> {
	for (const signal of ['SIGINT', 'SIGTERM'] as Array<NodeJS.Signals>) {
		if (options.register) {
			process.on(signal, handler);
		} else {
			process.removeListener(signal, handler);
		}
	}
}

interface WorkerOptions {
	diskDev: string;
}
export class TestBot {
	private board: Board;
	private options: WorkerOptions;
	private mutex: Mutex;
	private signalHandler: (signal: NodeJS.Signals) => Promise<void>;

	/**
	 * Represents a TestBot
	 */
	// Firmata types devicePath as any, will do the same
	constructor(devicePath: any, options?: WorkerOptions) {
		this.board = new Board(devicePath);

		this.board.serialConfig({
			portId: HW_SERIAL5,
			baud: BAUD_RATE,
		});

		if (options != null) {
			this.options = options;

			if (process.platform === 'linux' && this.options.diskDev == null) {
				throw new Error(
					'We cannot automatically detect the testbot interface, please provide it manually',
				);
			}
		}

		this.mutex = new Mutex();
		this.signalHandler = this.disconnect.bind(this);
	}

	/**
	 * Critical Section function
	 */
	private async criticalSection(
		section: (args: IArguments) => unknown,
		args: IArguments,
	): Promise<void> {
		const release = await this.mutex.acquire();

		try {
			await Reflect.apply(section, this, args);
		} finally {
			release();
		}
	}

	/**
	 * Get dev interface of the SD card
	 */
	private getDevInterface(
		timeout: retry.Options = { max_tries: 5, interval: 5000 },
	): Bluebird<string> {
		return retry(() => {
			return fs.realpath(
				this.options.diskDev == null ? DEV_ID_LINK : this.options.diskDev,
			);
		}, _.assign({ throw_original: true }, timeout));
	}

	/**
	 * Send an array of bytes over the selected serial port
	 */
	private async sendCommand(
		command: number,
		settle: number = 0,
		a: number = 0,
		b: number = 0,
	): Promise<void> {
		this.board.serialWrite(HW_SERIAL5, [command, a, b]);
		await Bluebird.delay(settle);
	}

	/**
	 * Reset SD card controller
	 */
	private async resetSdCard(): Promise<void> {
		await this.sendCommand(GPIO.SD_RESET_ENABLE, 10);
		await this.sendCommand(GPIO.SD_RESET_DISABLE);
	}

	/**
	 * Connected the SD card interface to DUT
	 */
	private async switchSdToDUT(settle: number = 0): Promise<void> {
		console.log('Switching SD card to device...');
		await this.resetSdCard();
		this.board.digitalWrite(PINS.LED_PIN, this.board.LOW);
		this.board.digitalWrite(PINS.SD_MUX_SEL_PIN, this.board.LOW);

		await Bluebird.delay(settle);
	}

	/**
	 * Connected the SD card interface to the host
	 *
	 */
	private async switchSdToHost(settle: number = 0): Promise<void> {
		console.log('Switching SD card to host...');
		await this.resetSdCard();
		this.board.digitalWrite(PINS.LED_PIN, this.board.HIGH);
		this.board.digitalWrite(PINS.SD_MUX_SEL_PIN, this.board.HIGH);

		await Bluebird.delay(settle);
	}

	/**
	 * Power on DUT
	 */

	private async powerOnDUT(): Promise<void> {
		console.log('Switching testbot on...');
		await this.sendCommand(GPIO.ENABLE_VOUT_SW, 500);
	}

	/**
	 * Power off DUT
	 */
	private async powerOffDUT(): Promise<void> {
		console.log('Switching testbot off...');
		await this.sendCommand(GPIO.DISABLE_VOUT_SW, 500);
	}

	/**
	 * Flash SD card with operating system
	 */
	public async flash(stream: NodeJS.ReadableStream): Promise<void> {
		await this.off();

		await this.criticalSection(async () => {
			await withFile(
				async ({ path, fd }) => {
					await promiseStream(stream.pipe(fs.createWriteStream(path)));
					// For linux, udev will provide us with a nice id for the testbot

					const drive = await getDrive(await this.getDevInterface());
					const source = new sdk.sourceDestination.File(
						path,
						sdk.sourceDestination.File.OpenFlags.Read,
					);
					const progressBar: { [key: string]: any } = {
						flashing: new visuals.Progress('Flashing'),
						verifying: new visuals.Progress('Validating'),
					};

					await sdk.multiWrite.pipeSourceToDestinations(
						source,
						[drive],
						(destination, error) => {
							console.error(error);
						},
						(progress: sdk.multiWrite.MultiDestinationProgress) => {
							progressBar[progress.type].update(progress);
						},
						true,
					);
				},
				{
					dir: homedir(),
				},
			);
		}, arguments);
	}

	/**
	 * Get TestBot ready to function
	 */
	public async ready(): Promise<void> {
		await this.criticalSection(async () => {
			await new Promise((resolve, reject) => {
				this.board.once('ready', async () => {
					// Power managment configuration
					// We set the regulator (DAC_REG) to 5V and start the managment unit (VREG)
					await this.sendCommand(GPIO.ENABLE_FAULTRST, 1000);
					this.board.pinMode(PINS.LED_PIN, this.board.MODES.OUTPUT);
					await this.sendCommand(GPIO.WRITE_DAC_REG, 1000, 5);
					await this.sendCommand(GPIO.ENABLE_VREG, 1000);

					// SD card managment configuration
					// We enable the SD/USB multiplexers and leave them disconnected
					this.board.pinMode(PINS.SD_MUX_SEL_PIN, this.board.MODES.OUTPUT);
					this.board.digitalWrite(PINS.SD_MUX_SEL_PIN, this.board.LOW);
					this.board.pinMode(PINS.USB_MUX_SEL_PIN, this.board.MODES.OUTPUT);
					this.board.digitalWrite(PINS.USB_MUX_SEL_PIN, this.board.LOW);

					await Bluebird.delay(1000);
					console.log('Worker ready');

					resolve();
				});
				this.board.once('error', reject);
			});
		}, arguments);
	}

	/**
	 * Turn on DUT
	 */
	public async on(): Promise<void> {
		await this.criticalSection(async () => {
			await this.switchSdToDUT(5000);
			await this.powerOnDUT();

			manageHandlers(this.signalHandler, {
				register: true,
			});
		}, arguments);
	}

	/**
	 * Turn off DUT
	 */
	public async off(): Promise<void> {
		await this.criticalSection(async () => {
			await this.powerOffDUT();
			await this.switchSdToHost(5000);

			manageHandlers(this.signalHandler, {
				register: false,
			});
		}, arguments);
	}

	/**
	 * Disconnect worker from our framework
	 */
	public async disconnect(signal?: NodeJS.Signals): Promise<void> {
		await this.off();
		this.board.serialClose(HW_SERIAL5);

		if (signal != null) {
			process.kill(process.pid, signal);
		}
	}
}

export default TestBot;
