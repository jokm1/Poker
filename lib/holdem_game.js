var Gamer = require('./gamer'),
	Room = require('./room'),
	Poker = require('./poker'),
	Jinhua = require('./holdem_poker');

exports = module.exports = HoldemGame;

function HoldemGame( casino, typeid, roomid, options ) {
	var defaults = {
		max_seats: 10,
		no_joker: true,
		no_color: [],
		no_number: [],
		ready_countdown: 10,
		turn_countdown: 10,
		limit_texas: true,
		chip_base: 50,
		chip_base2: 100,
		pot_limit: false,
		no_limit: false
	};
	if(options && (typeof options === 'object')) {
		for(var i in options) defaults[i] = options[i];
	}
	
	Room.call(this, casino, typeid, roomid, defaults);
	
	this.first_turn = 0;
	
	this.ready_gamers = 0;
	this.ready_countdown = -1;
	
	this.is_ingame = false;
	
	this.turn_countdown = -1;
	this.in_gamers = [];
	this.cards = {};
	this.chips = {};
	
	this.all_chips = [];
	this.chip_total = 0;
	this.chip_min = 0;
	
	this.knowncards = {};
}

HoldemGame.prototype = Object.create(Room.prototype);

HoldemGame.prototype.constructor = HoldemGame;

HoldemGame.prototype.details = function() {
	var data = Room.prototype.details.call(this);
	
	// cards is not visible unless checked or showed
	data.cards = this.knowncards;
	data.chips = this.chips;
	data.all_chips = this.all_chips;
	data.chip_total = this.chip_total;
	data.chip_min = this.chip_min;
	
	return data;
};

HoldemGame.prototype.tick = function() {
	Room.prototype.tick.call(this);
	
	var room = this;
	if(room.is_ingame) {
		var gamer = room.in_gamers[0];
		if(room.turn_countdown > 0) {
			room.notifyAll('countdown', {
				seat: gamer.seat,
				sec: room.turn_countdown
			});
			room.turn_countdown --;
			
		} else if(room.turn_countdown === 0) {
			// TODO: for test only
			room.gamerMoveTurn(true);
			//room.gamerGiveUp( gamer );
			
		} else {
			// not started, just wait
		}
		
	} else {
		if(room.ready_countdown > 0) {
			room.notifyAll('countdown', {
				seat: -1,
				sec: room.ready_countdown
			});
			room.ready_countdown --;
			
		} else if(room.ready_countdown === 0) {
			room.gameStart();
			
		} else {
			// not ready, just wait
		}
	}
};

HoldemGame.prototype.gameStart = function() {
	var room = this;
	var seats = room.seats;
	var gamers = room.gamers;
	
	room.is_ingame = true;
	room.ready_countdown = -1;
	
	room.all_chips = []; // n, n, n, ...
	room.chip_total = 0;
	room.chip_min = room.options.chip_base;

	var in_gamers = room.in_gamers = [];
	var roomcards = room.cards = {};
	var knowncards = room.knowncards = {};
	var roomchips = room.chips = {};
	var i, j, uid, gamer, len=seats.length, first = this.first_turn;
	
	for(i=first; i<len; i++) {
		uid = seats[i];
		if(uid) {
			gamer = gamers[ uid ];
			if(gamer.is_ready) {
				in_gamers.push( gamer );
			}
		}
	}
	for(i=0; i<first; i++) {
		uid = seats[i];
		if(uid) {
			gamer = gamers[ uid ];
			if(gamer.is_ready) {
				in_gamers.push( gamer );
			}
		}
	}
	
	var ingame_seats = [];
	var deals = [];
	var fullcards = Poker.newSet(room.options);
	var unknown_cards = [0,0,0];
	var seat;
	for(j=0, len=in_gamers.length; j<len; j++) {
		gamer = in_gamers[j];
		seat = gamer.seat;
		
		room.ready_gamers --;
		
		gamer.is_ready = false;
		gamer.is_ingame = true;
		gamer.is_cardchecked = false;
		gamer.is_cardshowed = false;
		gamer.profile.coins -= room.chip_min;
		ingame_seats.push( seat );
		
		var gamercards = Poker.draw(fullcards, 3);
		deals.push( [ seat, unknown_cards ] );
		
		roomcards[ seat ] = gamercards;
		roomchips[ seat ] = 0;
		knowncards[ seat ] = unknown_cards;
	}
	
	room.notifyAll('deal', {
		seats: ingame_seats,
		chip: room.chip_min,
		deals: deals,
		delay: 3
	});
	
	setTimeout(function(){
		room.notifyAll('prompt', {
			giveup: true,
			checkcard: true
		});
		
		room.gamerMoveTurn(false);
		
	}, 3000);
};

HoldemGame.prototype.gameOver = function() {
	var room = this;
	
	var in_gamers = room.in_gamers;
	
	if(in_gamers.length === 1) {
		var winner = in_gamers.shift();
		winner.coins += room.chip_total;
		winner.is_ingame = false;
		room.notifyAll('gameover',{
			seat: winner.seat,
			uid: winner.uid,
			prize: room.chip_total,
			cards: room.cards,
			chips: room.chips
		});
	} else {
		for(var i=0,len=in_gamers.length; i<len; i++) {
			in_gamers[i].is_ingame = false;
		}
		room.notifyAll('gameover', {
			seat: -1,
			uid: null,
			prize: 0,
			cards: {},
			chips: {}
		});
	}
	
	room.notifyAll('prompt', {
		giveup: null,
		pk: null,
		addchip: null,
		follow: null,
		showcard: null,
		checkcard: null,
		ready: true
	});

	room.is_ingame = false;
	room.turn_countdown = -1;
	room.in_gamers = [];	// [ gamer, gamer, ... ]
	room.cards = {};	// seat -> cards
	room.chips = {}; 	// seat -> n
	room.all_chips = []; // n, n, n, ...
	room.chip_total = 0;
	room.chip_min = room.options.chip_base;
};

HoldemGame.prototype.gamerMoveTurn = function(move) {
	var room = this;
	var in_gamers = room.in_gamers;
	
	if(move) {
		var last = in_gamers.shift();
		in_gamers.push( last );
		
		room.notify(last.uid, 'prompt', {
			pk: null,
			addchip: null,
			follow: null,
			showcard: null
		});
	}

	var next = in_gamers[0];
	room.turn_countdown = room.options.turn_countdown;
	
	room.notifyAll('moveturn', {
		seat: next.seat,
		uid: next.uid,
		countdown: room.turn_countdown
	});
	
	var pk_targets = [];
	for(var i=1; i<in_gamers.length; i++) {
		pk_targets.push(in_gamers[i].uid);
	}
	
	room.notify(next.uid, 'prompt', {
		pk: pk_targets,
		addchip: [ room.chip_min * 2, room.chip_min * 3, room.chip_min * 4 ],
		follow: true,
		showcard: (next.is_cardshowed) ? null : true
	});
};

HoldemGame.prototype.gamerGiveUp = function( gamer ) {
	var room = this;
	
	room.notifyAll('giveup', {
		seat: gamer.seat,
		uid: gamer.uid
	});
	
	room.gamerLose( gamer );
};

HoldemGame.prototype.gamerLose = function(gamer) {
	var room = this;
	
	var is_myturn = false;
	var in_gamers = room.in_gamers;
	for(var i=0, len=in_gamers.length; i<len; i++) {
		if(in_gamers[i].seat === gamer.seat) {
			in_gamers.splice(i, 1);
			is_myturn = (i === 0);
			break;
		}
	}
	
	gamer.is_ingame = false;

	room.notify(gamer.uid, 'prompt', {
		giveup: null,
		pk: null,
		addchip: null,
		follow: null,
		showcard: null,
		checkcard: null
	});
	
	if(in_gamers.length > 1) {
		if(is_myturn) room.gamerMoveTurn(false);
	} else {
		room.gameOver();
	}
};


HoldemGame.prototype.onGamer_ready = function(req, reply) {
	var room = this;
	var uid = req.uid;
	var gamer = room.gamers[ uid ];
	
	if(gamer.seat < 0) {
		reply(400, 'you must take a seat to play'); return;
	}
	
	if(room.is_ingame) {
		reply(400, 'game already started, wait next round'); return;
	}
	
	if(gamer.is_ingame) {
		reply(400, 'you already in game'); return;
	}
	
	if(gamer.is_ready) {
		reply(400, 'you already ready'); return;
	}
	
	gamer.is_ready = true;
	room.ready_gamers ++;
	
	room.notifyAll('ready', {
		uid: uid,
		where: gamer.seat
	});
	
	if(room.ready_gamers >= 2) {
		if(room.ready_gamers === room.seats_taken) {
			room.gameStart();
			
		} else if(room.ready_gamers === 2) {
			room.ready_countdown = room.options.ready_countdown;
			room.notifyAll('countdown', {
				seat: -1,
				sec: room.ready_countdown
			});
		}
	}
	
	reply(0, {
		cmds: {
			ready: null
		}
	});
};

HoldemGame.prototype.onGamer_takeseat = function(req, reply) {
	Room.prototype.onGamer_takeseat.call(this, req, function(err,ret){
		if(! err) {
			if(! ret.cmds) ret.cmds = {};
			ret.cmds.ready = true;
		}
		reply(err, ret);
	});
};

HoldemGame.prototype.onGamer_unseat = function(req, reply) {
	var room = this;
	var uid = req.uid;
	var gamer = room.gamers[ uid ];

	var cmds = {};
	
	if(gamer.is_ingame) {
		room.onGamer_giveup(req, function(e,r){
			if((!e) && r.cmds) {
				for(var i in r.cmds) cmds[i] = r.cmds[i];
			}
		});
	}

	if(gamer.is_ready) {
		gamer.is_ready = false;
		room.ready_gamers --;
	}
	
	cmds.ready = null;
	
	Room.prototype.onGamer_unseat.call(this, req, function(e,r){
		if((!e) && r.cmds) {
			for(var i in r.cmds) cmds[i] = r.cmds[i];
		}
	});
	
	reply(0, {
		cmds: cmds
	});
};

HoldemGame.prototype.onGamer_giveup = function(req, reply) {
	var room = this, uid = req.uid;
	var gamers = room.gamers;
	var gamer = gamers[ uid ];
	if(gamer.is_ingame) {
		room.gamerGiveUp( gamer );
		reply(0, {});
	} else {
		reply(400, 'no in game');
	}
	
};

HoldemGame.prototype.onGamer_follow = function(req, reply) {
	var room = this, uid = req.uid;
	var gamers = room.gamers;
	var gamer = gamers[ uid ];
	
	if(gamer.is_ingame) {
		var n = room.chip_min;
		if(n <= gamer.profile.coins) {
			gamer.profile.coins -= n;
			room.chip_total += n;
			room.all_chips.push(n);
			room.chips[ gamer.seat ] += n;
			
			room.notifyAll('follow', {
				seat: gamer.seat,
				uid: gamer.uid,
				chip: n
			});
			
			reply(0, {});
			
			room.gamerMoveTurn(true);
			
		} else {
			reply(400, 'no enough coins to follow: ' + n);
		}
		
	} else {
		reply(400, 'no in game'); return;
	}
	
};

HoldemGame.prototype.onGamer_addchip = function(req, reply) {
	var room = this, uid = req.uid;
	var gamers = room.gamers;
	var gamer = gamers[ uid ];
	if(gamer.is_ingame) {
		var n = parseInt( req.args );
		if((! isNaN(n)) && (n>=room.chip_min) && (n <= gamer.profile.coins)) {
			gamer.profile.coins -= n;
			room.chip_total += n;
			room.chip_min = n;
			room.all_chips.push(n);
			room.chips[ gamer.seat ] += n;
			
			room.notifyAll('addchip', {
				seat: gamer.seat,
				uid: gamer.uid,
				chip: n
			});
			
			reply(0, {});
			
			room.gamerMoveTurn(true);
			
		} else {
			reply(400, 'invalid chip to add: ' + n);
		}
		
	} else {
		reply(400, 'no in game');
	}
};

HoldemGame.prototype.onGamer_pk = function(req, reply) {
	var room = this, uid = req.uid;
	var gamers = room.gamers;
	var gamer = gamers[ uid ];
	if(gamer.is_ingame) {
		var pk_uid = req.args;
		var pk_gamer = gamers[ pk_uid ];
		if(pk_gamer && pk_gamer.is_ingame) {
			var roomcards = room.cards;
			var mycards = roomcards[ gamer.seat ];
			var pkcards = roomcards[ pk_gamer.seat ]; 
			
			var pk_win = (Jinhua.compare(mycards, pkcards) > 0);
			
			room.notifyAll('pk', {
				seat: gamer.seat,
				uid: gamer.uid,
				pk_seat: pk_gamer.seat,
				pk_uid: pk_uid,
				win: pk_win
			});
			
			reply(0, {});
			
			room.gamerLose( pk_win ? pk_gamer : gamer );
			
		} else {
			reply(400, 'pk target no in game');
		}
		
	} else {
		room.response(req, 400, 'no in game'); return;
	}
	
};

HoldemGame.prototype.onGamer_checkcard = function(req, reply) {
	var room = this, uid = req.uid;
	var gamers = room.gamers;
	var gamer = gamers[ uid ];
	if(gamer.is_ingame) {
		gamer.is_cardchecked = true;
		
		var mycards = room.cards[ gamer.seat ];
		room.notify(uid, 'checkcard', {
			seat: gamer.seat,
			uid: uid,
			cards: mycards
		});
		
		room.notifyAllExcept(uid, 'checkcard', {
			seat: gamer.seat,
			uid: uid
		});
		
		reply(0, {
			cmds: {
				checkcard: null
			}
		});

	} else {
		reply(400, 'no in game');
	}
	
};

HoldemGame.prototype.onGamer_showcard = function(req, reply) {
	var room = this, uid = req.uid;
	var gamers = room.gamers;
	var gamer = gamers[ uid ];
	if(gamer.is_ingame) {
		gamer.is_cardshowed = true;
		
		var mycards = room.cards[ gamer.seat ];
		room.knowncards[ gamer.seat ] = mycards;
		room.notifyAll('showcard', {
			seat: gamer.seat,
			uid: gamer.uid,
			cards: mycards
		});

		reply(0, {
			cmds: {
				showcard: null
			}
		});
		
	} else {
		reply(400, 'no in game');
	}
};

HoldemGame.prototype.onGamer_relogin = function(req, reply) {
	Room.prototype.onGamer_relogin.call(this, req, reply);

	var room = this, uid = req.uid;
	
	var gamer = room.gamers[ uid ];
	if(gamer.seat >= 0) {
		if(gamer.is_cardchecked) {
			room.notify(uid, 'checkcard', {
				seat: gamer.seat,
				uid: uid,
				cards: room.cards[ gamer.seat ]
			});
		}
		
		var is_myturn = false;
		var cmds = {
			ready: true,
			giveup: null,
			checkcard: null
		};
		if(gamer.is_ready || gamer.is_ingame) cmds.ready = null;
		if(gamer.is_ingame) {
			cmds.giveup = true;
			if((!gamer.is_cardchecked) && (!gamer.is_cardshowed)) cmds.checkcard = true;
			var next = room.in_gamers[0];
			is_myturn = (next.seat === gamer.seat);
		}
		room.notify(uid, 'prompt', cmds);
		
		if(is_myturn) {
			room.gamerMoveTurn(false);
		}
	}
};

HoldemGame.prototype.close = function() {
	var room = this;
	if(room.is_ingame) {
		room.gameOver();
	}

	Room.prototype.close.call(this);
};

