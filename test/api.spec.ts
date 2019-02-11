import 'mocha';
import * as _ from 'lodash';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as TestBot from '../lib/workers/testbot';
import setup from '../lib/index';
import { ImportMock } from 'ts-mock-imports';
import { Server } from 'http';

import chaiHttp = require('chai-http');

chai.use(chaiHttp);
chai.use(chaiAsPromised);

const { expect } = chai;

describe('API', async () => {
	let mockManager = ImportMock.mockClass(TestBot);
	let server: Server = await setup('/path/to/fake/worker', 9999);

	it('call /dut/on should turn testbot ON', async () => {
		const spy = mockManager.mock('on');

		const res = await chai.request(server).post('/dut/on');

		expect(res).to.have.status(200);
		expect(spy.callCount).to.be.equal(1);
	});

	it('call /dut/off should turn testbot off', async () => {
		const spy = mockManager.mock('off');

		const res = await chai.request(server).post('/dut/off');

		expect(res).to.have.status(200);
		expect(spy.callCount).to.be.equal(1);
	});

	it('call /dut/flash should turn testbot flash', async () => {
		const spy = mockManager.mock('flash');

		const res = await chai.request(server).post('/dut/flash');

		expect(res).to.have.status(202);
		expect(spy.callCount).to.be.equal(1);
	});

	afterEach(() => {
		mockManager.restore();
	});

	after(() => {
		server.close();
	});
});
