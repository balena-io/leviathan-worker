import 'mocha';
import * as _ from 'lodash';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as testBot from '../lib/workers/testbot';
import setup from '../lib/index';
import { ImportMock, MockManager } from 'ts-mock-imports';

import chaiHttp = require('chai-http');

chai.use(chaiHttp);
chai.use(chaiAsPromised);

const { expect } = chai;

describe('API', async () => {
	const mockManager: MockManager<testBot.TestBot> = ImportMock.mockClass<
		testBot.TestBot
	>(testBot, 'default');
	const app: Express.Application = await setup('/path/to/fake/worker');
	const errTest = new Error('TEST ERROR');

	it('call /dut/on should turn testbot ON', async () => {
		const spy = mockManager.mock('powerOn');

		const res = await chai.request(app).post('/dut/on');

		expect(res.text).to.be.equal('OK');
		expect(res).to.have.status(200);
		expect(spy.callCount).to.be.equal(1);
	});

	it('call /dut/on should handle errors correctly', async () => {
		const spy = mockManager.mock('powerOn').rejects(errTest);

		const res = await chai.request(app).post('/dut/on');

		expect(res.text).to.be.equal(errTest.message);
		expect(res).to.have.status(500);
		expect(spy.callCount).to.be.equal(1);
	});

	it('call /dut/off should turn testbot off', async () => {
		const spy = mockManager.mock('powerOff');

		const res = await chai.request(app).post('/dut/off');

		expect(res.text).to.be.equal('OK');
		expect(res).to.have.status(200);
		expect(spy.callCount).to.be.equal(1);
	});

	it('call /dut/off should handle errors correctly', async () => {
		const spy = mockManager.mock('powerOff').rejects(errTest);

		const res = await chai.request(app).post('/dut/off');

		expect(res.text).to.be.equal(errTest.message);
		expect(res).to.have.status(500);
		expect(spy.callCount).to.be.equal(1);
	});

	it('call /dut/flash should turn testbot flash', async () => {
		const spy = mockManager.mock('flash');

		const res = await chai.request(app).post('/dut/flash');

		expect(res).to.have.status(202);
		expect(spy.callCount).to.be.equal(1);
	});

	afterEach(() => {
		mockManager.restore();
	});
});
