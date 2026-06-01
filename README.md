### Coltom

cette application represente les couleurs du sites ainsi que les modifications effectuees mais aussi une appli avec sert de chat d'entreprise, elle permet de pouvoir converser à deux ou en groupe dans frappe/erpnext ( seuls les utilisateurs internes de frappe ont accès)  avec des données criptées donc impossible à dechiffrer)

### Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch version-16
bench install-app coltom
```

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/coltom
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### License

mit
