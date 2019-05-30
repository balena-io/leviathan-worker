import { EventEmitter } from 'events';

declare global {
	namespace Leviathan {
		interface Worker extends EventEmitter {
			flash(stream: Stream.Readable): Promise<void>;
			powerOn(): Promise<void>;
			powerOff(): Promise<void>;
			setup(): Promise<void>;
			teardown(signal?: NodeJS.Signals): Promise<void>;
			network(configuration): Promise<void>;
		}

		interface Options {
			worker: {
				disk?: string;
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
	}
}
