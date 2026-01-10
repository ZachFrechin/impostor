const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { getRandomWordPair } = require('./words');

const app = express();
const server = createServer(app);

// Support for reverse proxy with sub-path (e.g., /impostor/)
const BASE_PATH = process.env.BASE_PATH || '';

const io = new Server(server, {
	path: `${BASE_PATH}/socket.io`,
	cors: {
		origin: "*",
		methods: ["GET", "POST"]
	}
});

const PORT = process.env.PORT || 3000;

// Injecter le BASE_PATH dans le HTML
app.get('/', (req, res) => {
	res.send(getHtmlWithBasePath());
});

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Fonction pour générer le HTML avec le bon path
function getHtmlWithBasePath() {
	const fs = require('fs');
	let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

	// Injecter le BASE_PATH comme variable globale
	const scriptTag = `<script>window.BASE_PATH = "${BASE_PATH}";</script>`;
	html = html.replace('</head>', `${scriptTag}</head>`);

	// Corriger le chemin vers socket.io.js
	html = html.replace('/socket.io/socket.io.js', `${BASE_PATH}/socket.io/socket.io.js`);

	return html;
}

// État des salles en mémoire
const rooms = new Map();

/**
 * Génère un code de salle aléatoire (6 caractères)
 */
function generateRoomCode() {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let code = '';
	for (let i = 0; i < 6; i++) {
		code += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return code;
}

/**
 * Crée une nouvelle salle
 */
function createRoom(hostId, hostName) {
	let code;
	do {
		code = generateRoomCode();
	} while (rooms.has(code));

	const room = {
		code,
		hostId,
		players: [{
			id: hostId,
			name: hostName,
			isHost: true,
			isImpostor: false,
			word: null,
			hints: [],
			vote: null,
			hasVoted: false
		}],
		state: 'lobby', // lobby, playing, voting, results, match-results, game-over
		currentRound: 0,
		maxRounds: 2,
		currentMatch: 0,
		maxMatches: 10,
		wordPair: null,
		impostorId: null,
		currentPlayerIndex: 0,
		scores: {} // { odId: score }
	};

	rooms.set(code, room);
	return room;
}

/**
 * Trouve une salle par son code
 */
function getRoom(code) {
	return rooms.get(code?.toUpperCase());
}

/**
 * Supprime un joueur d'une salle
 */
function removePlayerFromRoom(roomCode, playerId) {
	const room = getRoom(roomCode);
	if (!room) return null;

	room.players = room.players.filter(p => p.id !== playerId);

	// Si la salle est vide, la supprimer
	if (room.players.length === 0) {
		rooms.delete(roomCode);
		return null;
	}

	// Si l'hôte part, transférer à un autre joueur
	if (room.hostId === playerId && room.players.length > 0) {
		room.hostId = room.players[0].id;
		room.players[0].isHost = true;
	}

	return room;
}

/**
 * Démarre une partie
 */
function startGame(room) {
	// Initialiser les scores si première manche
	if (room.currentMatch === 0) {
		room.scores = {};
		room.players.forEach(p => {
			room.scores[p.id] = 0;
		});
	}

	room.currentMatch++;

	// Mélanger l'ordre des joueurs pour cette manche (ordre de jeu aléatoire)
	room.playOrder = [...room.players].sort(() => Math.random() - 0.5);

	// Sélectionner un imposteur vraiment aléatoire
	const impostorIndex = Math.floor(Math.random() * room.players.length);
	room.impostorId = room.players[impostorIndex].id;

	// Sélectionner une paire de mots
	room.wordPair = getRandomWordPair();

	// Distribuer les mots
	room.players.forEach(player => {
		player.isImpostor = player.id === room.impostorId;
		player.word = player.isImpostor ? room.wordPair.impostor : room.wordPair.citizen;
		player.hints = [];
		player.vote = null;
		player.hasVoted = false;
	});

	room.state = 'playing';
	room.currentRound = 1;
	// Commencer avec un joueur aléatoire (premier du playOrder mélangé)
	room.currentPlayerIndex = 0;

	return room;
}

/**
 * Get the current player whose turn it is (from shuffled playOrder)
 */
function getCurrentPlayer(room) {
	return room.playOrder[room.currentPlayerIndex];
}

/**
 * Advance to the next player's turn
 * Returns true if moved to next player, false if round is complete
 */
function advanceToNextPlayer(room) {
	room.currentPlayerIndex++;
	if (room.currentPlayerIndex >= room.playOrder.length) {
		// All players have played this round
		return false;
	}
	return true;
}

/**
 * Vérifie si tous les joueurs ont donné leur indice pour ce tour
 */
function allPlayersSubmittedHint(room) {
	return room.players.every(p => p.hints.length >= room.currentRound);
}

/**
 * Vérifie si tous les joueurs ont voté
 */
function allPlayersVoted(room) {
	return room.players.every(p => p.hasVoted);
}

/**
 * Calcule le résultat du vote
 */
function calculateVoteResult(room) {
	const voteCount = {};

	room.players.forEach(player => {
		if (player.vote) {
			voteCount[player.vote] = (voteCount[player.vote] || 0) + 1;
		}
	});

	// Trouver le joueur avec le plus de votes
	let maxVotes = 0;
	let eliminated = null;
	let tie = false;

	for (const [playerId, count] of Object.entries(voteCount)) {
		if (count > maxVotes) {
			maxVotes = count;
			eliminated = playerId;
			tie = false;
		} else if (count === maxVotes) {
			tie = true;
		}
	}

	const impostorFound = eliminated === room.impostorId;
	const impostorName = room.players.find(p => p.id === room.impostorId)?.name;
	const eliminatedPlayer = room.players.find(p => p.id === eliminated);

	// Calculer les scores (points augmentés pour les citoyens)
	const votesAgainstImpostor = voteCount[room.impostorId] || 0;
	const scoreChanges = {};

	room.players.forEach(player => {
		let change = 0;
		if (impostorFound) {
			// Citoyens gagnent
			if (player.id === room.impostorId) {
				// Imposteur perd points selon nombre de votes contre lui
				change = -50 * votesAgainstImpostor;
			} else {
				// Citoyen gagne s'il a voté correctement
				if (player.vote === room.impostorId) {
					change = 150; // Augmenté de 100 à 150
				}
			}
		} else {
			// Imposteur gagne
			if (player.id === room.impostorId) {
				change = 150;
			} else {
				// Citoyens
				if (player.vote === room.impostorId) {
					change = 50; // Augmenté de 25 à 50 (consolation)
				} else {
					change = -25;
				}
			}
		}
		scoreChanges[player.id] = change;
		room.scores[player.id] = (room.scores[player.id] || 0) + change;
	});

	// Créer la liste des votes détaillés (qui a voté qui)
	const playerVotes = room.players.map(p => ({
		odId: p.id,
		voterName: p.name,
		votedForId: p.vote,
		votedForName: room.players.find(x => x.id === p.vote)?.name || null
	}));

	return {
		votes: voteCount,
		playerVotes, // Détails: qui a voté pour qui
		tie,
		impostorFound,
		impostorName,
		impostorWord: room.wordPair.impostor,
		citizenWord: room.wordPair.citizen,
		scoreChanges,
		scores: { ...room.scores },
		currentMatch: room.currentMatch,
		maxMatches: room.maxMatches,
		isLastMatch: room.currentMatch >= room.maxMatches
	};
}

// Gestion des connexions Socket.io
io.on('connection', (socket) => {
	console.log(`Joueur connecté: ${socket.id}`);

	let currentRoom = null;

	// Créer une salle
	socket.on('create-room', ({ playerName }) => {
		const room = createRoom(socket.id, playerName);
		currentRoom = room.code;
		socket.join(room.code);

		socket.emit('room-created', { roomCode: room.code });
		io.to(room.code).emit('room-update', {
			players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
			state: room.state
		});
	});

	// Rejoindre une salle
	socket.on('join-room', ({ roomCode, playerName }) => {
		const room = getRoom(roomCode);

		if (!room) {
			socket.emit('error', { message: 'Salle introuvable' });
			return;
		}

		if (room.state !== 'lobby') {
			socket.emit('error', { message: 'La partie a déjà commencé' });
			return;
		}

		if (room.players.length >= 10) {
			socket.emit('error', { message: 'La salle est pleine (max 10 joueurs)' });
			return;
		}

		// Vérifier que le nom n'est pas déjà pris
		if (room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
			socket.emit('error', { message: 'Ce nom est déjà utilisé' });
			return;
		}

		room.players.push({
			id: socket.id,
			name: playerName,
			isHost: false,
			isImpostor: false,
			word: null,
			hints: [],
			vote: null,
			hasVoted: false
		});

		currentRoom = room.code;
		socket.join(room.code);

		socket.emit('room-joined', { roomCode: room.code });
		io.to(room.code).emit('room-update', {
			players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
			state: room.state
		});
	});

	// Lancer la partie
	socket.on('start-game', (rules = {}) => {
		const room = getRoom(currentRoom);

		if (!room) {
			socket.emit('error', { message: 'Salle introuvable' });
			return;
		}

		if (room.hostId !== socket.id) {
			socket.emit('error', { message: 'Seul l\'hôte peut lancer la partie' });
			return;
		}

		if (room.players.length < 3) {
			socket.emit('error', { message: 'Il faut au moins 3 joueurs' });
			return;
		}

		// Apply game rules from client
		room.maxRounds = rules.maxRounds || 2;
		room.maxMatches = rules.maxMatches || 10;
		room.showImpostorBanner = rules.showImpostorBanner !== false;

		startGame(room);

		// Envoyer à chaque joueur son mot
		const currentPlayer = getCurrentPlayer(room);
		room.players.forEach(player => {
			io.to(player.id).emit('game-started', {
				word: player.word,
				isImpostor: player.isImpostor,
				currentRound: room.currentRound,
				maxRounds: room.maxRounds,
				currentMatch: room.currentMatch,
				maxMatches: room.maxMatches,
				players: room.players.map(p => ({ id: p.id, name: p.name })),
				showImpostorBanner: room.showImpostorBanner,
				currentPlayerId: currentPlayer.id,
				currentPlayerName: currentPlayer.name,
				scores: room.scores
			});
		});
	});

	// Soumettre un indice
	socket.on('submit-hint', ({ hint }) => {
		const room = getRoom(currentRoom);

		if (!room || room.state !== 'playing') {
			socket.emit('error', { message: 'Impossible de soumettre un indice' });
			return;
		}

		const player = room.players.find(p => p.id === socket.id);
		if (!player) return;

		// Vérifier que c'est bien le tour de ce joueur
		const currentPlayer = getCurrentPlayer(room);
		if (currentPlayer.id !== socket.id) {
			socket.emit('error', { message: 'Ce n\'est pas votre tour !' });
			return;
		}

		// Vérifier que le joueur n'a pas déjà soumis pour ce tour
		if (player.hints.length >= room.currentRound) {
			socket.emit('error', { message: 'Vous avez déjà donné un indice pour ce tour' });
			return;
		}

		player.hints.push(hint);

		// Informer tous les joueurs
		io.to(room.code).emit('hint-submitted', {
			playerId: player.id,
			playerName: player.name,
			hint,
			round: room.currentRound
		});

		// Passer au joueur suivant ou au tour/vote suivant
		if (advanceToNextPlayer(room)) {
			// C'est le tour du joueur suivant
			const nextPlayer = getCurrentPlayer(room);
			io.to(room.code).emit('next-player-turn', {
				currentPlayerId: nextPlayer.id,
				currentPlayerName: nextPlayer.name,
				currentRound: room.currentRound
			});
		} else {
			// Tous les joueurs ont joué ce tour
			if (room.currentRound < room.maxRounds) {
				// Nouveau tour
				room.currentRound++;
				room.currentPlayerIndex = 0; // Reset to first player
				const firstPlayer = getCurrentPlayer(room);
				io.to(room.code).emit('new-round', {
					currentRound: room.currentRound,
					maxRounds: room.maxRounds,
					currentPlayerId: firstPlayer.id,
					currentPlayerName: firstPlayer.name
				});
			} else {
				// Tous les tours sont terminés - informer que l'hôte peut lancer les votes
				room.canStartVoting = true;
				io.to(room.code).emit('ready-to-vote', {
					message: 'Tous les indices ont été donnés',
					hostId: room.hostId
				});
			}
		}
	});

	// Lancer les votes (hôte uniquement, peut le faire à tout moment)
	socket.on('start-voting', () => {
		const room = getRoom(currentRoom);

		if (!room || room.state !== 'playing') {
			socket.emit('error', { message: 'Impossible de lancer les votes maintenant' });
			return;
		}

		if (room.hostId !== socket.id) {
			socket.emit('error', { message: 'Seul l\'hôte peut lancer les votes' });
			return;
		}

		room.state = 'voting';
		io.to(room.code).emit('voting-phase', {
			players: room.players.map(p => ({
				id: p.id,
				name: p.name,
				hints: p.hints
			}))
		});
	});

	// Soumettre un vote
	socket.on('submit-vote', ({ votedPlayerId }) => {
		const room = getRoom(currentRoom);

		if (!room || room.state !== 'voting') {
			socket.emit('error', { message: 'Impossible de voter maintenant' });
			return;
		}

		const player = room.players.find(p => p.id === socket.id);
		if (!player) return;

		if (player.hasVoted) {
			socket.emit('error', { message: 'Vous avez déjà voté' });
			return;
		}

		// Ne peut pas voter pour soi-même
		if (votedPlayerId === socket.id) {
			socket.emit('error', { message: 'Vous ne pouvez pas voter pour vous-même' });
			return;
		}

		player.vote = votedPlayerId;
		player.hasVoted = true;

		io.to(room.code).emit('player-voted', {
			playerId: player.id,
			playerName: player.name
		});

		// Vérifier si tout le monde a voté
		if (allPlayersVoted(room)) {
			room.state = 'results';
			const result = calculateVoteResult(room);
			io.to(room.code).emit('vote-result', result);
		}
	});

	// Manche suivante
	socket.on('next-match', () => {
		const room = getRoom(currentRoom);

		if (!room) return;
		if (room.hostId !== socket.id) {
			socket.emit('error', { message: 'Seul l\'hôte peut lancer la manche suivante' });
			return;
		}

		if (room.currentMatch >= room.maxMatches) {
			socket.emit('error', { message: 'Toutes les manches ont été jouées' });
			return;
		}

		// Démarrer nouvelle manche (sans reset des scores)
		startGame(room);

		const currentPlayer = getCurrentPlayer(room);
		room.players.forEach(player => {
			io.to(player.id).emit('match-started', {
				word: player.word,
				isImpostor: player.isImpostor,
				currentRound: room.currentRound,
				maxRounds: room.maxRounds,
				currentMatch: room.currentMatch,
				maxMatches: room.maxMatches,
				players: room.players.map(p => ({ id: p.id, name: p.name })),
				showImpostorBanner: room.showImpostorBanner,
				currentPlayerId: currentPlayer.id,
				currentPlayerName: currentPlayer.name,
				scores: room.scores
			});
		});
	});

	// Rejouer (nouvelle partie complète)
	socket.on('play-again', () => {
		const room = getRoom(currentRoom);

		if (!room) return;
		if (room.hostId !== socket.id) {
			socket.emit('error', { message: 'Seul l\'hôte peut relancer une partie' });
			return;
		}

		// Réinitialiser complètement la salle
		room.state = 'lobby';
		room.currentRound = 0;
		room.currentMatch = 0;
		room.scores = {};
		room.wordPair = null;
		room.impostorId = null;
		room.players.forEach(p => {
			p.isImpostor = false;
			p.word = null;
			p.hints = [];
			p.vote = null;
			p.hasVoted = false;
			room.scores[p.id] = 0;
		});

		io.to(room.code).emit('room-update', {
			players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
			state: room.state
		});
	});

	// Déconnexion
	socket.on('disconnect', () => {
		console.log(`Joueur déconnecté: ${socket.id}`);

		if (currentRoom) {
			const room = removePlayerFromRoom(currentRoom, socket.id);

			if (room) {
				io.to(room.code).emit('player-left', { playerId: socket.id });
				io.to(room.code).emit('room-update', {
					players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
					state: room.state
				});
			}
		}
	});
});

// Démarrer le serveur
server.listen(PORT, () => {
	console.log(`🎮 Jeu de l'Imposteur lancé sur http://localhost:${PORT}`);
});
