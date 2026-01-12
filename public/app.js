const state = {
	socket: null,
	roomCode: null,
	playerName: null,
	playerId: null,
	isHost: false,
	isImpostor: false,
	showImpostorBanner: true,
	word: null,
	currentRound: 1,
	maxRounds: 2,
	currentMatch: 1,
	maxMatches: 10,
	players: [],
	playerHints: {},
	hasSubmittedHint: false,
	hasVoted: false,
	currentPlayerId: null,
	currentPlayerName: null,
	scores: {},
	scoreChanges: {}
};

// ===== Éléments DOM =====
const screens = {
	home: document.getElementById('home-screen'),
	lobby: document.getElementById('lobby-screen'),
	game: document.getElementById('game-screen'),
	vote: document.getElementById('vote-screen'),
	result: document.getElementById('result-screen')
};

const elements = {
	// Home
	createForm: document.getElementById('create-form'),
	createName: document.getElementById('create-name'),
	joinForm: document.getElementById('join-form'),
	joinName: document.getElementById('join-name'),
	joinCode: document.getElementById('join-code'),

	// Theme
	themeToggle: document.getElementById('theme-toggle'),
	themeOptions: document.getElementById('theme-options'),

	// Lobby
	roomCode: document.getElementById('room-code'),
	copyCode: document.getElementById('copy-code'),
	playerList: document.getElementById('player-list'),
	playerCount: document.getElementById('player-count'),
	startGameBtn: document.getElementById('start-game-btn'),
	startMessage: document.getElementById('start-message'),
	leaveLobby: document.getElementById('leave-lobby'),
	rulesConfig: document.getElementById('rules-config'),
	ruleShowImpostor: document.getElementById('rule-show-impostor'),

	// Game
	currentRound: document.getElementById('current-round'),
	maxRounds: document.getElementById('max-rounds'),
	currentMatch: document.getElementById('current-match'),
	maxMatches: document.getElementById('max-matches'),
	secretWord: document.getElementById('secret-word'),
	impostorAlert: document.getElementById('impostor-alert'),
	hintForm: document.getElementById('hint-form'),
	hintInput: document.getElementById('hint-input'),
	hintStatus: document.getElementById('hint-status'),
	hintsGrid: document.getElementById('hints-grid'),
	leaderboardList: document.getElementById('leaderboard-list'),
	startVotingBtn: document.getElementById('start-voting-btn'),

	// Vote
	votePlayers: document.getElementById('vote-players'),
	votersStatus: document.getElementById('voters-status'),

	// Result
	resultContent: document.getElementById('result-content'),
	playAgainBtn: document.getElementById('play-again-btn'),
	nextMatchBtn: document.getElementById('next-match-btn'),
	backHomeBtn: document.getElementById('back-home-btn'),
	resultCurrentMatch: document.getElementById('result-current-match'),
	resultMaxMatches: document.getElementById('result-max-matches'),
	resultLeaderboardList: document.getElementById('result-leaderboard-list'),

	// Chat
	chatForm: document.getElementById('chat-form'),
	chatInput: document.getElementById('chat-input'),
	chatMessages: document.getElementById('chat-messages'),

	// Toast
	toast: document.getElementById('toast')
};

// ===== Theme Management =====
function initTheme() {
	const savedTheme = localStorage.getItem('impostor-theme') || 'violet';
	setTheme(savedTheme);
}

function setTheme(themeName) {
	document.documentElement.setAttribute('data-theme', themeName);
	localStorage.setItem('impostor-theme', themeName);

	// Update active button
	document.querySelectorAll('.theme-btn').forEach(btn => {
		btn.classList.toggle('active', btn.dataset.theme === themeName);
	});
}

function toggleThemeOptions() {
	elements.themeOptions.classList.toggle('hidden');
}

// ===== Fonctions utilitaires =====
function showScreen(screenName) {
	Object.values(screens).forEach(screen => screen.classList.remove('active'));
	screens[screenName].classList.add('active');
}

function showToast(message, type = 'info') {
	elements.toast.textContent = message;
	elements.toast.className = `toast show ${type}`;

	setTimeout(() => {
		elements.toast.classList.remove('show');
	}, 3000);
}

function getPlayerEmoji(index) {
	const emojis = ['🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐸', '🐵', '🦄', '🐲'];
	return emojis[index % emojis.length];
}

function getPlayerIndex(playerId) {
	return state.players.findIndex(p => p.id === playerId);
}

// ===== Session Management =====
const SESSION_KEY = 'impostor-session';

function saveSession(roomCode, sessionToken, playerName) {
	localStorage.setItem(SESSION_KEY, JSON.stringify({
		roomCode,
		sessionToken,
		playerName,
		timestamp: Date.now()
	}));
}

function getSession() {
	try {
		const data = localStorage.getItem(SESSION_KEY);
		if (!data) return null;
		const session = JSON.parse(data);
		// Session expires after 1 hour
		if (Date.now() - session.timestamp > 3600000) {
			clearSession();
			return null;
		}
		return session;
	} catch {
		return null;
	}
}

function clearSession() {
	localStorage.removeItem(SESSION_KEY);
}

// ===== Initialisation Socket.io =====
function initSocket() {
	const basePath = window.BASE_PATH || '';
	state.socket = io({
		path: `${basePath}/socket.io`
	});

	// Try to reconnect existing session
	const existingSession = getSession();
	if (existingSession) {
		state.socket.emit('reconnect-session', { sessionToken: existingSession.sessionToken });
	}

	// === Événements de salle ===
	state.socket.on('room-created', ({ roomCode, sessionToken }) => {
		state.roomCode = roomCode;
		state.isHost = true;
		const playerName = elements.createName.value.trim();
		saveSession(roomCode, sessionToken, playerName);
		elements.roomCode.textContent = roomCode;
		updateRulesVisibility();
		showScreen('lobby');
		showToast('Salle créée !', 'success');
	});

	state.socket.on('room-joined', ({ roomCode, sessionToken }) => {
		state.roomCode = roomCode;
		const playerName = elements.joinName.value.trim();
		saveSession(roomCode, sessionToken, playerName);
		elements.roomCode.textContent = roomCode;
		updateRulesVisibility();
		showScreen('lobby');
		showToast('Salle rejointe !', 'success');
	});

	state.socket.on('room-update', ({ players, state: roomState }) => {
		state.players = players;
		updatePlayerList(players);

		// Mise à jour du statut d'hôte
		const me = players.find(p => p.id === state.socket.id);
		if (me) {
			state.isHost = me.isHost;
		}
		updateRulesVisibility();

		// Mise à jour du bouton Lancer
		const canStart = players.length >= 3 && state.isHost;
		elements.startGameBtn.disabled = !canStart;

		if (players.length < 3) {
			elements.startMessage.textContent = `Il faut au moins 3 joueurs (${players.length}/3)`;
		} else if (!state.isHost) {
			elements.startMessage.textContent = 'En attente de l\'hôte...';
		} else {
			elements.startMessage.textContent = 'Prêt à jouer !';
		}

		// Si on revient au lobby
		if (roomState === 'lobby') {
			showScreen('lobby');
		}
	});

	state.socket.on('player-left', ({ playerId }) => {
		showToast('Un joueur a quitté la partie');
	});

	// === Événements de jeu ===
	state.socket.on('game-started', ({ word, isImpostor, currentRound, maxRounds, currentMatch, maxMatches, players, showImpostorBanner, currentPlayerId, currentPlayerName, scores }) => {
		state.word = word;
		state.isImpostor = isImpostor;
		state.currentRound = currentRound;
		state.maxRounds = maxRounds;
		state.currentMatch = currentMatch;
		state.maxMatches = maxMatches;
		state.players = players;
		state.hasSubmittedHint = false;
		state.showImpostorBanner = showImpostorBanner;
		state.playerHints = {};
		state.currentPlayerId = currentPlayerId;
		state.currentPlayerName = currentPlayerName;
		state.scores = scores || {};

		// Initialize playerHints structure
		players.forEach(p => {
			state.playerHints[p.id] = [];
		});

		elements.secretWord.textContent = word;
		if (elements.currentRound) elements.currentRound.textContent = currentRound;
		if (elements.maxRounds) elements.maxRounds.textContent = maxRounds;
		if (elements.currentMatch) elements.currentMatch.textContent = currentMatch;
		if (elements.maxMatches) elements.maxMatches.textContent = maxMatches;

		// Only show impostor alert if rule is enabled
		const shouldShowAlert = isImpostor && showImpostorBanner;
		elements.impostorAlert.classList.toggle('hidden', !shouldShowAlert);

		initHintsGrid();
		updateLeaderboard();
		elements.hintInput.value = '';

		// Enable/disable input based on whose turn it is
		const isMyTurn = currentPlayerId === state.socket.id;
		elements.hintInput.disabled = !isMyTurn;
		elements.hintForm.querySelector('button').disabled = !isMyTurn;
		updateTurnStatus();

		// Afficher le bouton de vote pour l'hôte dès le début
		if (state.isHost && elements.startVotingBtn) {
			elements.startVotingBtn.classList.remove('hidden');
		}

		showScreen('game');

		if (showImpostorBanner) {
			showToast(isImpostor ? '🕵️ Vous êtes l\'imposteur !' : '👥 Vous êtes un citoyen', 'info');
		} else {
			showToast(`Manche ${currentMatch}/${maxMatches} - C'est parti !`, 'info');
		}
	});

	// === Nouvelle manche (sans reset des scores) ===
	state.socket.on('match-started', ({ word, isImpostor, currentRound, maxRounds, currentMatch, maxMatches, players, showImpostorBanner, currentPlayerId, currentPlayerName, scores }) => {
		state.word = word;
		state.isImpostor = isImpostor;
		state.currentRound = currentRound;
		state.maxRounds = maxRounds;
		state.currentMatch = currentMatch;
		state.maxMatches = maxMatches;
		state.players = players;
		state.hasSubmittedHint = false;
		state.showImpostorBanner = showImpostorBanner;
		state.playerHints = {};
		state.currentPlayerId = currentPlayerId;
		state.currentPlayerName = currentPlayerName;
		state.scores = scores || {};

		players.forEach(p => {
			state.playerHints[p.id] = [];
		});

		elements.secretWord.textContent = word;
		if (elements.currentRound) elements.currentRound.textContent = currentRound;
		if (elements.maxRounds) elements.maxRounds.textContent = maxRounds;
		if (elements.currentMatch) elements.currentMatch.textContent = currentMatch;
		if (elements.maxMatches) elements.maxMatches.textContent = maxMatches;

		const shouldShowAlert = isImpostor && showImpostorBanner;
		elements.impostorAlert.classList.toggle('hidden', !shouldShowAlert);

		initHintsGrid();
		updateLeaderboard();
		elements.hintInput.value = '';

		const isMyTurn = currentPlayerId === state.socket.id;
		elements.hintInput.disabled = !isMyTurn;
		elements.hintForm.querySelector('button').disabled = !isMyTurn;
		updateTurnStatus();

		// Afficher le bouton de vote pour l'hôte
		if (state.isHost && elements.startVotingBtn) {
			elements.startVotingBtn.classList.remove('hidden');
		}

		showScreen('game');
		showToast(`Manche ${currentMatch}/${maxMatches} - Nouveau mot !`, 'info');
	});

	state.socket.on('hint-submitted', ({ playerId, playerName, hint, round }) => {
		addHintToGrid(playerId, playerName, hint, round);

		if (playerId === state.socket.id) {
			state.hasSubmittedHint = true;
			elements.hintInput.disabled = true;
			elements.hintForm.querySelector('button').disabled = true;
			elements.hintStatus.textContent = '✓ Indice envoyé ! En attente des autres joueurs...';
		}
	});

	state.socket.on('new-round', ({ currentRound, maxRounds, currentPlayerId, currentPlayerName }) => {
		state.currentRound = currentRound;
		state.hasSubmittedHint = false;
		state.currentPlayerId = currentPlayerId;
		state.currentPlayerName = currentPlayerName;

		if (elements.currentRound) elements.currentRound.textContent = currentRound;
		elements.hintInput.value = '';

		// Enable/disable input based on whose turn it is
		const isMyTurn = currentPlayerId === state.socket.id;
		elements.hintInput.disabled = !isMyTurn;
		elements.hintForm.querySelector('button').disabled = !isMyTurn;
		updateTurnStatus();

		showToast(`Tour ${currentRound}/${maxRounds}`, 'info');
	});

	// === Nouveau: Changement de tour de joueur ===
	state.socket.on('next-player-turn', ({ currentPlayerId, currentPlayerName, currentRound }) => {
		state.currentPlayerId = currentPlayerId;
		state.currentPlayerName = currentPlayerName;

		// Enable/disable input based on whose turn it is
		const isMyTurn = currentPlayerId === state.socket.id;
		elements.hintInput.disabled = !isMyTurn;
		elements.hintForm.querySelector('button').disabled = !isMyTurn;
		updateTurnStatus();

		if (isMyTurn) {
			showToast('🎯 C\'est votre tour !', 'info');
		}
	});

	// === Joueur déconnecté - Auto-skip ===
	state.socket.on('player-disconnected-turn', ({ playerName, skipInSeconds }) => {
		elements.hintStatus.textContent = `⏳ ${playerName} déconnecté - Passage auto dans ${skipInSeconds}s...`;
		elements.hintStatus.classList.add('disconnected-turn');
	});

	// === L'hôte peut lancer les votes ===
	state.socket.on('ready-to-vote', ({ hostId }) => {
		// Afficher le bouton pour l'hôte
		if (state.isHost && elements.startVotingBtn) {
			elements.startVotingBtn.classList.remove('hidden');
		}
		elements.hintStatus.textContent = '✅ Tous les indices ont été donnés !';
		elements.hintStatus.classList.remove('my-turn');
		showToast(state.isHost ? '🗳️ Vous pouvez lancer les votes !' : '⏳ L\'hôte va lancer les votes...', 'info');
	});

	// === Phase de vote ===
	state.socket.on('voting-phase', ({ players }) => {
		// Cacher le bouton de vote si visible
		if (elements.startVotingBtn) {
			elements.startVotingBtn.classList.add('hidden');
		}
		state.hasVoted = false;
		renderVotingCards(players);
		showScreen('vote');
		showToast('🗳️ C\'est l\'heure du vote !', 'info');
	});

	state.socket.on('player-voted', ({ playerId, playerName }) => {
		updateVotersStatus(playerId, playerName);
	});

	// === Résultats ===
	state.socket.on('vote-result', (result) => {
		renderResults(result);
		showScreen('result');
	});

	// ===== Reconnection =====
	state.socket.on('reconnected', ({ roomCode, playerName, isHost, gameState, word, isImpostor, currentRound, maxRounds, currentMatch, maxMatches, players, scores }) => {
		console.log('Reconnected to game:', roomCode);
		state.roomCode = roomCode;
		state.isHost = isHost;
		state.players = players;

		elements.roomCode.textContent = roomCode;
		updatePlayerList(players);

		if (gameState === 'lobby') {
			showScreen('lobby');
			showToast('🔄 Session restaurée !', 'success');
		} else if (gameState === 'playing') {
			state.isImpostor = isImpostor;
			elements.secretWord.textContent = word || '??????';
			elements.currentMatch.textContent = currentMatch;
			elements.maxMatches.textContent = maxMatches;
			if (isImpostor && elements.impostorAlert) {
				elements.impostorAlert.classList.remove('hidden');
			}
			renderLeaderboard(scores, players);
			clearChat();
			showScreen('game');
			showToast('🔄 Partie restaurée !', 'success');
		} else if (gameState === 'voting') {
			renderVotingCards(players);
			showScreen('vote');
			showToast('🔄 Session restaurée, votez !', 'success');
		} else {
			showScreen('lobby');
			showToast('🔄 Session restaurée !', 'success');
		}
	});

	state.socket.on('reconnect-failed', ({ message }) => {
		console.log('Reconnection failed:', message);
		clearSession();
		// Stay on home screen, session expired
	});

	state.socket.on('player-disconnected', ({ playerName }) => {
		addChatMessage(null, `⚠️ ${playerName} s'est déconnecté`, true);
	});

	state.socket.on('player-reconnected', ({ playerName }) => {
		addChatMessage(null, `✅ ${playerName} s'est reconnecté`, true);
		showToast(`${playerName} est de retour !`, 'success');
	});

	// ===== Chat =====
	state.socket.on('chat-message', ({ playerName, message }) => {
		addChatMessage(playerName, message);
	});

	state.socket.on('error', ({ message }) => {
		showToast(message, 'error');
	});

	state.socket.on('connect_error', () => {
		showToast('Erreur de connexion au serveur', 'error');
	});
}

// ===== Rules Visibility =====
function updateRulesVisibility() {
	if (elements.rulesConfig) {
		// Only host can modify rules - hide inputs but show values for non-hosts
		const inputs = elements.rulesConfig.querySelectorAll('input, button');
		inputs.forEach(input => {
			input.disabled = !state.isHost;
		});
	}
}

// ===== Hints Grid (Columns per Player) =====
function initHintsGrid() {
	elements.hintsGrid.innerHTML = state.players.map((player, index) => `
    <div class="player-hints-column" data-player-id="${player.id}">
      <div class="column-header">
        <div class="player-avatar">${getPlayerEmoji(index)}</div>
        <span class="player-name">${escapeHtml(player.name)}</span>
      </div>
      <div class="hints"></div>
    </div>
  `).join('');
}

function addHintToGrid(playerId, playerName, hint, round) {
	// Store hint in state
	if (!state.playerHints[playerId]) {
		state.playerHints[playerId] = [];
	}
	state.playerHints[playerId].push({ hint, round });

	// Find the player's column
	const column = elements.hintsGrid.querySelector(`[data-player-id="${playerId}"]`);
	if (column) {
		const hintsContainer = column.querySelector('.hints');
		const hintElement = document.createElement('div');
		hintElement.className = 'hint-word';
		hintElement.textContent = escapeHtml(hint);
		hintsContainer.appendChild(hintElement);
	}

	// Highlight current player column
	updateCurrentPlayerHighlight();
}

/**
 * Update the turn status message
 */
function updateTurnStatus() {
	const isMyTurn = state.currentPlayerId === state.socket.id;
	if (state.hasSubmittedHint) {
		elements.hintStatus.textContent = '✓ Indice envoyé ! En attente des autres joueurs...';
	} else if (isMyTurn) {
		elements.hintStatus.textContent = '🎯 C\'est votre tour ! Donnez un indice.';
		elements.hintStatus.classList.add('my-turn');
	} else {
		elements.hintStatus.textContent = `⏳ C'est au tour de ${state.currentPlayerName}...`;
		elements.hintStatus.classList.remove('my-turn');
	}
	updateCurrentPlayerHighlight();
}

/**
 * Highlight the current player's column in the hints grid
 */
function updateCurrentPlayerHighlight() {
	// Remove highlight from all columns
	document.querySelectorAll('.player-hints-column').forEach(col => {
		col.classList.remove('current-turn');
	});
	// Add highlight to current player's column
	const currentColumn = elements.hintsGrid.querySelector(`[data-player-id="${state.currentPlayerId}"]`);
	if (currentColumn) {
		currentColumn.classList.add('current-turn');
	}
}

// ===== Mise à jour de l'UI =====
function updatePlayerList(players) {
	elements.playerCount.textContent = `(${players.length}/10)`;
	elements.playerList.innerHTML = players.map((player, index) => `
    <li>
      <div class="player-avatar">${getPlayerEmoji(index)}</div>
      <span class="player-name">${escapeHtml(player.name)}</span>
      ${player.isHost ? '<span class="player-badge">Hôte</span>' : ''}
    </li>
  `).join('');
}

function renderVotingCards(players) {
	elements.votePlayers.innerHTML = players
		.filter(p => p.id !== state.socket.id)
		.map((player, index) => `
      <div class="vote-card" data-player-id="${player.id}">
        <div class="vote-card-header">
          <div class="player-avatar">${getPlayerEmoji(getPlayerIndex(player.id))}</div>
          <span class="player-name">${escapeHtml(player.name)}</span>
        </div>
        <div class="vote-card-hints">
          ${player.hints.map(h => `<span>${escapeHtml(h)}</span>`).join('')}
        </div>
      </div>
    `).join('');

	// Ajouter les événements de clic
	document.querySelectorAll('.vote-card').forEach(card => {
		card.addEventListener('click', () => {
			if (state.hasVoted) return;

			const playerId = card.dataset.playerId;
			state.socket.emit('submit-vote', { votedPlayerId: playerId });
			state.hasVoted = true;

			document.querySelectorAll('.vote-card').forEach(c => c.classList.add('disabled'));
			card.classList.remove('disabled');
			card.classList.add('voted');
		});
	});

	// Initialiser le statut des votants
	elements.votersStatus.innerHTML = state.players.map(p => `
    <span class="voter-chip" data-voter-id="${p.id}">${escapeHtml(p.name)}</span>
  `).join('');
}

function updateVotersStatus(playerId, playerName) {
	const chip = elements.votersStatus.querySelector(`[data-voter-id="${playerId}"]`);
	if (chip) {
		chip.classList.add('voted');
		chip.textContent = `✓ ${playerName}`;
	}
}

/**
 * Update leaderboard display
 */
function updateLeaderboard(scoreChanges = null) {
	const sortedPlayers = [...state.players].sort((a, b) => {
		return (state.scores[b.id] || 0) - (state.scores[a.id] || 0);
	});

	const renderList = (container) => {
		if (!container) return;
		container.innerHTML = sortedPlayers.map((player, index) => {
			const score = state.scores[player.id] || 0;
			const change = scoreChanges ? scoreChanges[player.id] : null;
			const rankClass = index < 3 ? `rank-${index + 1}` : '';
			const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

			return `
				<div class="leaderboard-item ${rankClass}">
					<span class="leaderboard-rank">${rankEmoji}</span>
					<span class="leaderboard-name">${escapeHtml(player.name)}</span>
					<span class="leaderboard-score">${score}</span>
					${change !== null ? `<span class="leaderboard-change ${change >= 0 ? 'positive' : 'negative'}">${change >= 0 ? '+' : ''}${change}</span>` : ''}
				</div>
			`;
		}).join('');
	};

	renderList(elements.leaderboardList);
	renderList(elements.resultLeaderboardList);
}

function renderResults(result) {
	const impostorWon = !result.impostorFound;

	// Update state with new scores
	state.scores = result.scores || state.scores;
	state.scoreChanges = result.scoreChanges || {};

	// Update result leaderboard match info
	if (elements.resultCurrentMatch) elements.resultCurrentMatch.textContent = result.currentMatch;
	if (elements.resultMaxMatches) elements.resultMaxMatches.textContent = result.maxMatches;

	// Update leaderboard with score changes
	updateLeaderboard(result.scoreChanges);

	// Build score changes HTML
	const scoreChangesHtml = state.players.map(player => {
		const change = result.scoreChanges[player.id] || 0;
		const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : '';
		const changeText = change >= 0 ? `+${change}` : `${change}`;
		return `
			<div class="score-change-item ${changeClass}">
				<span>${escapeHtml(player.name)}</span>
				<span class="change">${changeText} pts</span>
			</div>
		`;
	}).join('');

	// Build who voted for whom HTML
	const playerVotesHtml = (result.playerVotes || []).map(pv => {
		return `<div class="vote-detail">${escapeHtml(pv.voterName)} → ${pv.votedForName ? escapeHtml(pv.votedForName) : '?'}</div>`;
	}).join('');

	elements.resultContent.innerHTML = `
    <div class="result-icon">${impostorWon ? '🕵️' : '🎉'}</div>
    <h2 class="result-title ${impostorWon ? 'danger' : 'success'}">
      ${impostorWon ? 'L\'imposteur a gagné !' : 'Les citoyens ont gagné !'}
    </h2>
    
    <div class="result-words">
      <div class="result-word-card">
        <div class="label">Mot des citoyens</div>
        <div class="word">${result.citizenWord}</div>
      </div>
      <div class="result-word-card">
        <div class="label">Mot de l'imposteur</div>
        <div class="word">${result.impostorWord}</div>
      </div>
    </div>
    
    <p>🕵️ L'imposteur était : <strong>${result.impostorName}</strong></p>

    <div class="score-changes">
      <h3>Points gagnés</h3>
      <div class="score-changes-grid">${scoreChangesHtml}</div>
    </div>

    <div class="result-votes">
      <h3>Qui a voté pour qui ?</h3>
      <div class="votes-detail-grid">${playerVotesHtml}</div>
    </div>
  `;

	// Show/hide buttons based on host and match status
	if (state.isHost) {
		if (result.isLastMatch) {
			elements.nextMatchBtn.classList.add('hidden');
			elements.playAgainBtn.classList.remove('hidden');
		} else {
			elements.nextMatchBtn.classList.remove('hidden');
			elements.playAgainBtn.classList.add('hidden');
		}
	} else {
		elements.nextMatchBtn.classList.add('hidden');
		elements.playAgainBtn.classList.add('hidden');
	}
}

function renderVoteBars(votes) {
	const maxVotes = Math.max(...Object.values(votes), 1);

	return state.players.map(player => {
		const voteCount = votes[player.id] || 0;
		const percentage = (voteCount / maxVotes) * 100;
		const isEliminated = voteCount === maxVotes && voteCount > 0;

		return `
      <div class="vote-result-item ${isEliminated ? 'eliminated' : ''}">
        <span style="min-width: 100px">${escapeHtml(player.name)}</span>
        <div class="vote-bar">
          <div class="vote-bar-fill" style="width: ${percentage}%"></div>
        </div>
        <span style="min-width: 30px; text-align: right">${voteCount}</span>
      </div>
    `;
	}).join('');
}

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// ===== Game Rules =====
function getGameRules() {
	// Collect selected categories from checkboxes
	const categoryCheckboxes = document.querySelectorAll('[data-category]');
	const categories = Array.from(categoryCheckboxes)
		.filter(cb => cb.checked)
		.map(cb => cb.dataset.category);

	return {
		showImpostorBanner: elements.ruleShowImpostor?.checked ?? true,
		maxRounds: state.maxRounds,
		maxMatches: state.maxMatches,
		categories: categories.length > 0 ? categories : ['classic', 'culture', 'fun', 'geo', 'science', 'opposites', 'food', 'animals', 'jobs', 'home', 'history', 'sports', 'nature', 'tech']
	};
}

// ===== Gestionnaires d'événements =====
elements.createForm.addEventListener('submit', (e) => {
	e.preventDefault();
	const name = elements.createName.value.trim();
	if (!name) return;

	state.playerName = name;
	state.socket.emit('create-room', { playerName: name });
});

elements.joinForm.addEventListener('submit', (e) => {
	e.preventDefault();
	const name = elements.joinName.value.trim();
	const code = elements.joinCode.value.trim().toUpperCase();
	if (!name || !code) return;

	state.playerName = name;
	state.socket.emit('join-room', { roomCode: code, playerName: name });
});

elements.copyCode.addEventListener('click', async () => {
	try {
		await navigator.clipboard.writeText(state.roomCode);
		showToast('Code copié !', 'success');
	} catch {
		showToast('Impossible de copier', 'error');
	}
});

elements.startGameBtn.addEventListener('click', () => {
	const rules = getGameRules();
	state.socket.emit('start-game', rules);
});

elements.leaveLobby.addEventListener('click', () => {
	location.reload();
});

elements.hintForm.addEventListener('submit', (e) => {
	e.preventDefault();
	const hint = elements.hintInput.value.trim();
	if (!hint || state.hasSubmittedHint) return;

	state.socket.emit('submit-hint', { hint });
});

elements.playAgainBtn.addEventListener('click', () => {
	state.socket.emit('play-again');
});

elements.nextMatchBtn?.addEventListener('click', () => {
	state.socket.emit('next-match');
});

elements.startVotingBtn?.addEventListener('click', () => {
	state.socket.emit('start-voting');
});

elements.backHomeBtn.addEventListener('click', () => {
	location.reload();
});

// Theme selector events
elements.themeToggle?.addEventListener('click', toggleThemeOptions);

document.querySelectorAll('.theme-btn').forEach(btn => {
	btn.addEventListener('click', () => {
		setTheme(btn.dataset.theme);
		elements.themeOptions.classList.add('hidden');
	});
});

// Close theme options when clicking outside
document.addEventListener('click', (e) => {
	if (!e.target.closest('.theme-selector')) {
		elements.themeOptions?.classList.add('hidden');
	}
});

// Rounds selector
document.querySelectorAll('.round-btn').forEach(btn => {
	btn.addEventListener('click', () => {
		if (!state.isHost) return;

		document.querySelectorAll('.round-btn').forEach(b => b.classList.remove('active'));
		btn.classList.add('active');
		state.maxRounds = parseInt(btn.dataset.rounds);
	});
});

// Matches selector
document.querySelectorAll('.match-btn').forEach(btn => {
	btn.addEventListener('click', () => {
		if (!state.isHost) return;

		document.querySelectorAll('.match-btn').forEach(b => b.classList.remove('active'));
		btn.classList.add('active');
		state.maxMatches = parseInt(btn.dataset.matches);
	});
});
// ===== Chat =====
elements.chatForm?.addEventListener('submit', (e) => {
	e.preventDefault();
	const message = elements.chatInput.value.trim();
	if (!message) return;

	state.socket.emit('chat-message', { message });
	elements.chatInput.value = '';
});

function addChatMessage(playerName, message, isSystem = false) {
	const msgDiv = document.createElement('div');
	msgDiv.className = 'chat-message' + (isSystem ? ' system' : '');

	if (isSystem) {
		msgDiv.textContent = message;
	} else {
		msgDiv.innerHTML = `<span class="chat-author">${escapeHtml(playerName)}:</span><span class="chat-text">${escapeHtml(message)}</span>`;
	}

	elements.chatMessages?.appendChild(msgDiv);
	elements.chatMessages?.scrollTo(0, elements.chatMessages.scrollHeight);
}

function clearChat() {
	if (elements.chatMessages) {
		elements.chatMessages.innerHTML = '';
	}
}

// ===== Démarrage =====
document.addEventListener('DOMContentLoaded', () => {
	initTheme();
	initSocket();
});
