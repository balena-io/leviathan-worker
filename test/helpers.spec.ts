import 'mocha';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as helpers from '../lib/helpers';
import { join } from 'path';
import { fs } from 'mz';
import { Writable } from 'readable-stream';
import { callback } from 'serialport';

chai.use(chaiAsPromised);
const { expect } = chai;

class DevNull extends Writable {
	constructor() {
		super();
	}

	_write(chunk: never, encoding: never, cb: callback) {
		setImmediate(cb);
	}
}

describe('promiseStream', () => {
	let stream: NodeJS.WritableStream;

	beforeEach(() => {
		const writable = new DevNull();
		stream = fs.createReadStream(join(__dirname, 'image')).pipe(writable);
	});

	it('should resolve when stream finished', async () => {
		expect(helpers.promiseStream(stream)).to.be.fulfilled;
	});
});
