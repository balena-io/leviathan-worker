import { spawn, ChildProcess } from 'child_process';
import * as Bluebird from 'bluebird';
import * as retry from 'bluebird-retry';
import * as sdk from 'etcher-sdk';
import { EventEmitter } from 'events';
import * as libvirt from 'libvirt';
import { fs } from 'mz';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import * as visuals from 'resin-cli-visuals';
import * as Stream from 'stream';
import * as xml from 'xml-js';

class Qemu extends EventEmitter implements Leviathan.Worker {
	private image: string;
	private hypervisor: any;
	private libvirtdProc: ChildProcess;
	private virtlogdProc: ChildProcess;

	private references: { domain?: any; network?: any; pool?: any };

	constructor() {
		super();
		this.image = join(tmpdir(), 'qemu.img');
		this.references = {};
	}

	private static generateId(): string {
		return Math.random()
			.toString(36)
			.substring(2, 10);
	}

	private getNetworkConf({ id, nat }: { id: string; nat: boolean }): string {
		const conf: xml.Element = {
			elements: [
				{
					type: 'element',
					name: 'network',
					elements: [
						{
							type: 'element',
							name: 'name',
							elements: [{ type: 'text', text: id }],
						},
						{
							type: 'element',
							name: 'domain',
							attributes: { name: id },
						},

						{
							type: 'element',
							name: 'ip',
							attributes: {
								address: '192.168.100.1',
								netmask: '255.255.255.0',
							},
							elements: [
								{
									type: 'element',
									name: 'dhcp',
									elements: [
										{
											type: 'element',
											name: 'range',
											attributes: {
												start: '192.168.100.128',
												end: '192.168.100.254',
											},
										},
									],
								},
							],
						},
					],
				},
			],
		};

		// Even if our conf is constant, let s satisfy the types requirments
		if (
			nat != null &&
			nat &&
			conf.elements != null &&
			conf.elements[0].elements != null
		) {
			conf.elements[0].elements.push({
				type: 'element',
				name: 'forward',
				attributes: { mode: 'nat' },
			});
		}

		return xml.js2xml(conf);
	}

	private async getDomainConf({ id }: { id: string }): Promise<string> {
		const conf: xml.Element = {
			elements: [
				{
					type: 'element',
					name: 'domain',
					attributes: { type: 'kvm', id: '1' },
					elements: [
						{
							type: 'element',
							name: 'name',
							elements: [{ type: 'text', text: id }],
						},
						{
							type: 'element',
							name: 'memory',
							attributes: { unit: 'KiB' },
							elements: [{ type: 'text', text: '1048576' }],
						},
						{
							type: 'element',
							name: 'resource',
							elements: [
								{
									type: 'element',
									name: 'partition',
									elements: [{ type: 'text', text: '/machine' }],
								},
							],
						},
						{
							type: 'element',
							name: 'os',
							elements: [
								{
									type: 'element',
									name: 'type',
									attributes: { arch: 'x86_64', machine: 'pc' },
									elements: [{ type: 'text', text: 'hvm' }],
								},
								{ type: 'element', name: 'boot', attributes: { dev: 'hd' } },
							],
						},
						{
							type: 'element',
							name: 'on_reboot',
							elements: [{ type: 'text', text: 'restart' }],
						},
						{
							type: 'element',
							name: 'on_shutdown',
							elements: [{ type: 'text', text: 'shutdown' }],
						},
						{
							type: 'element',
							name: 'devices',
							elements: [
								{
									type: 'element',
									name: 'emulator',
									elements: [
										{ type: 'text', text: '/usr/bin/qemu-system-x86_64' },
									],
								},
								{
									type: 'element',
									name: 'disk',
									attributes: { type: 'file', device: 'disk' },
									elements: [
										{
											type: 'element',
											name: 'driver',
											attributes: { name: 'qemu', type: 'raw' },
										},
										{
											type: 'element',
											name: 'source',
											attributes: {
												file: this.image,
											},
										},
										{ type: 'element', name: 'backingStore' },
										{
											type: 'element',
											name: 'target',
											attributes: { dev: 'hda', bus: 'ide' },
										},
										{
											type: 'element',
											name: 'alias',
											attributes: { name: 'ide0-0-0' },
										},
										{
											type: 'element',
											name: 'address',
											attributes: {
												type: 'drive',
												controller: '0',
												bus: '0',
												target: '0',
												unit: '0',
											},
										},
									],
								},
								{
									type: 'element',
									name: 'serial',
									attributes: { type: 'pty' },
									elements: [
										{
											type: 'element',
											name: 'target',
											attributes: { port: '0' },
										},
									],
								},
								{
									type: 'element',
									name: 'console',
									attributes: { type: 'pty' },
									elements: [
										{
											type: 'element',
											name: 'target',
											attributes: { type: 'serial', port: '0' },
										},
									],
								},
							],
						},
					],
				},
			],
		};

		if (
			this.references.network != null &&
			conf.elements != null &&
			conf.elements[0].elements != null
		) {
			const reference = conf.elements[0].elements.find(
				(element: xml.Element) => {
					return element.name === 'devices';
				},
			);

			if (reference != null && reference.elements != null) {
				reference.elements.push({
					type: 'element',
					name: 'interface',
					attributes: { type: 'network' },
					elements: [
						{
							type: 'element',
							name: 'mac',
							attributes: { address: '52:54:00:f5:ae:e9' },
						},
						{
							type: 'element',
							name: 'source',
							attributes: {
								network: await this.references.network.getNameAsync(),
								bridge: 'virbr0',
							},
						},
						{
							type: 'element',
							name: 'target',
							attributes: { dev: 'vnet0' },
						},
						{
							type: 'element',
							name: 'model',
							attributes: { type: 'e1000' },
						},
						{
							type: 'element',
							name: 'alias',
							attributes: { name: 'net0' },
						},
						{
							type: 'element',
							name: 'address',
							attributes: {
								type: 'pci',
								domain: '0x0000',
								bus: '0x00',
								slot: '0x03',
								function: '0x0',
							},
						},
					],
				});
			}
		}

		return xml.js2xml(conf);
	}

	private getStoragePoolConf({ id }: { id: string }): string {
		return xml.js2xml({
			elements: [
				{
					type: 'element',
					name: 'pool',
					attributes: { type: 'dir' },
					elements: [
						{
							type: 'element',
							name: 'name',
							elements: [{ type: 'text', text: id }],
						},
						{
							type: 'element',
							name: 'target',
							elements: [
								{
									type: 'element',
									name: 'path',
									elements: [{ type: 'text', text: dirname(this.image) }],
								},
							],
						},
					],
				},
			],
		});
	}

	public async setup(): Promise<void> {
		this.libvirtdProc = spawn('libvirtd', { detached: true, stdio: 'ignore' });
		this.virtlogdProc = spawn('virtlogd', { detached: true, stdio: 'ignore' });

		// Wait for sockets to be available
		await retry(
			async () => {
				await fs.stat('/var/run/libvirt/libvirt-sock');
				await fs.stat('/var/run/libvirt/virtlogd-sock');
			},
			{ throw_original: true, max_tries: 10, interval: 1000 },
		);
		this.hypervisor = libvirt.createHypervisor('qemu:///system');

		await retry(
			() => {
				return new Bluebird((resolve, reject) => {
					this.hypervisor.connect((error: Error) => {
						if (error != null) {
							reject(error);
						}

						resolve();
					});
				});
			},
			{ throw_original: true, interval: 1000, max_tries: 10 },
		);

		this.references.pool = await this.hypervisor.createStoragePoolAsync(
			this.getStoragePoolConf({
				id: Qemu.generateId(),
			}),
		);
	}

	public async teardown(): Promise<void> {
		if (this.references.domain != null) {
			await this.references.domain.destroyAsync();
		}

		if (this.references.network != null) {
			await this.references.network.destroyAsync();
		}

		if (this.references.pool != null) {
			await this.references.pool.stopAsync();
		}

		this.libvirtdProc.kill('SIGKILL');
	}

	async flash(stream: Stream.Readable): Promise<void> {
		await this.powerOff();

		const source = new sdk.sourceDestination.StreamZipSource(
			new sdk.sourceDestination.SingleUseStreamSource(stream),
		);

		const progressBar: { [key: string]: any } = {
			flashing: new visuals.Progress('Flashing'),
			verifying: new visuals.Progress('Validating'),
		};

		const destination = new sdk.sourceDestination.File(
			this.image,
			sdk.sourceDestination.File.OpenFlags.ReadWrite,
		);

		await sdk.multiWrite.pipeSourceToDestinations(
			source,
			[destination],
			(_destination, error) => {
				console.error(error);
			},
			(progress: sdk.multiWrite.MultiDestinationProgress) => {
				this.emit('progress', progress);
				progressBar[progress.type].update(progress);
			},
			true,
		);
	}
	async powerOn(): Promise<void> {
		this.references.domain = await this.hypervisor.createDomainAsync(
			await this.getDomainConf({
				id: Qemu.generateId(),
			}),
		);
	}
	async powerOff(): Promise<void> {
		if (this.references.domain != null) {
			await this.references.domain.destroyAsync();
		}
	}

	async network(configuration: { wired?: { nat: boolean } }): Promise<void> {
		if (configuration.wired != null) {
			this.references.network = await this.hypervisor.createNetworkAsync(
				this.getNetworkConf({
					id: Qemu.generateId(),
					nat: configuration.wired.nat,
				}),
			);
		} else if (this.references.network != null) {
			await this.references.network.destroyAsync();
		}
	}
}

export default Qemu;
