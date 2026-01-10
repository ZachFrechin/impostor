# 🕵️ L'Imposteur - Jeu Multijoueur

Un jeu de société en ligne où tous les joueurs reçoivent un mot secret, sauf l'imposteur qui reçoit un mot différent. Trouvez l'imposteur avant qu'il ne vous trompe !

## 🎮 Comment jouer

1. **Créez une salle** ou **rejoignez** avec un code
2. Attendez d'être **au moins 3 joueurs**
3. L'hôte lance la partie
4. Chaque joueur reçoit un **mot secret** (l'imposteur a un mot différent)
5. Donnez des **indices** liés à votre mot (sans le révéler !)
6. Après tous les tours, **votez** pour éliminer l'imposteur
7. Si l'imposteur est trouvé → les citoyens gagnent !

## 🚀 Lancer le jeu

```bash
# Installer les dépendances
npm install

# Lancer le serveur
npm start

# Ouvrir http://localhost:3000 dans votre navigateur
```

## 🌐 Déploiement

### Render (gratuit)

1. Créez un compte sur [render.com](https://render.com)
2. New → Web Service
3. Connectez votre repo GitHub
4. **Build Command**: `npm install`
5. **Start Command**: `npm start`
6. Deploy !

### Railway

```bash
# Installer Railway CLI
npm install -g @railway/cli

# Login et déployer
railway login
railway init
railway up
```

### Docker

```bash
docker build -t impostor-game .
docker run -p 3000:3000 impostor-game
```

## 📁 Structure

```
/impostor
├── public/
│   ├── index.html    # Interface du jeu
│   ├── style.css     # Styles modernes
│   └── app.js        # Logique client
├── server.js         # Serveur Express + Socket.io
├── words.js          # 70+ paires de mots français
└── package.json
```

## ⚙️ Configuration

| Variable | Par défaut | Description |
|----------|------------|-------------|
| `PORT`   | 3000       | Port du serveur |

## 📜 Licence

MIT
