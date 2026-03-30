"""
Chiffrement AES-128 (Fernet) des messages du chat.
La clé est stockée dans site_config.json — jamais en base de données.
Même l'admin ne peut pas lire les messages sans la clé serveur.
"""
import json
import os
import frappe


def _get_or_create_key():
	"""Retourne la clé Fernet depuis site_config.json, la génère si absente."""
	key = frappe.conf.get("coltom_chat_key")
	if key:
		return key.encode() if isinstance(key, str) else key

	# Générer et persister dans site_config.json
	from cryptography.fernet import Fernet
	key = Fernet.generate_key().decode()

	site_config_path = frappe.get_site_path("site_config.json")
	try:
		with open(site_config_path, "r") as f:
			config = json.load(f)
		config["coltom_chat_key"] = key
		with open(site_config_path, "w") as f:
			json.dump(config, f, indent=1)
	except Exception:
		pass  # Si on ne peut pas écrire, utiliser la clé en mémoire pour cette session

	frappe.local.conf["coltom_chat_key"] = key
	return key.encode()


def _get_cipher():
	from cryptography.fernet import Fernet
	return Fernet(_get_or_create_key())


def encrypt(text):
	"""Chiffre un texte. Retourne le texte chiffré en base64."""
	if not text:
		return text
	try:
		return _get_cipher().encrypt(text.encode("utf-8")).decode("ascii")
	except Exception:
		return text


def decrypt(text):
	"""Déchiffre un texte. Retourne le texte original, ou le texte tel quel si invalide (anciens messages)."""
	if not text:
		return text
	try:
		return _get_cipher().decrypt(text.encode("ascii")).decode("utf-8")
	except Exception:
		# Message non chiffré (ancienne donnée) ou erreur — retourner tel quel
		return text
