// Index des catégories de mots
const classic = require('./classic');
const culture = require('./culture');
const fun = require('./fun');
const geo = require('./geo');
const science = require('./science');
const opposites = require('./opposites');
const food = require('./food');
const animals = require('./animals');
const jobs = require('./jobs');
const home = require('./home');
const history = require('./history');
const sports = require('./sports');
const nature = require('./nature');
const tech = require('./tech');

// Toutes les catégories disponibles
const categories = {
	classic,
	culture,
	fun,
	geo,
	science,
	opposites,
	food,
	animals,
	jobs,
	home,
	history,
	sports,
	nature,
	tech
};

/**
 * Retourne une paire de mots aléatoire parmi les catégories sélectionnées
 * @param {string[]} selectedCategories - Liste des catégories à utiliser (ex: ['classic', 'fun'])
 * @returns {{ citizen: string, impostor: string }}
 */
function getRandomWordPair(selectedCategories = null) {
	// Si aucune catégorie spécifiée, utiliser toutes
	const categoriesToUse = selectedCategories && selectedCategories.length > 0
		? selectedCategories.filter(cat => categories[cat])
		: Object.keys(categories);

	// Combiner les mots des catégories sélectionnées
	const allWords = categoriesToUse.flatMap(cat => categories[cat] || []);

	if (allWords.length === 0) {
		// Fallback: utiliser classic
		const index = Math.floor(Math.random() * classic.length);
		return classic[index];
	}

	const index = Math.floor(Math.random() * allWords.length);
	return allWords[index];
}

/**
 * Retourne toutes les paires de mots des catégories sélectionnées
 * @param {string[]} selectedCategories - Liste des catégories
 * @returns {Array<{ citizen: string, impostor: string }>}
 */
function getAllWordPairs(selectedCategories = null) {
	const categoriesToUse = selectedCategories && selectedCategories.length > 0
		? selectedCategories.filter(cat => categories[cat])
		: Object.keys(categories);

	return categoriesToUse.flatMap(cat => categories[cat] || []);
}

/**
 * Retourne la liste des catégories disponibles
 * @returns {string[]}
 */
function getAvailableCategories() {
	return Object.keys(categories);
}

/**
 * Retourne le nombre de mots par catégorie
 * @returns {Object}
 */
function getCategoryStats() {
	return Object.entries(categories).reduce((acc, [name, words]) => {
		acc[name] = words.length;
		return acc;
	}, {});
}

module.exports = {
	getRandomWordPair,
	getAllWordPairs,
	getAvailableCategories,
	getCategoryStats,
	categories
};
