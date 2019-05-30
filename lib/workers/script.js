const { Board } = require('firmata');
const { EventEmitter } = require('events');

const ee = new EventEmitter();

Board.prototype.emit.bind(this);
const board = new Board('/fake');
try {
	board.on('error', function(error) {
		console.log('here');
		ee.emit('error', error);
	});
} catch (error) {
	console.log('ere');
}
