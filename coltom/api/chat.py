import frappe
from frappe import _
from frappe.utils import now_datetime, add_days


def is_channel_member(channel_name):
	"""Vérifie si l'utilisateur courant est membre du canal."""
	user = frappe.session.user
	return frappe.db.exists(
		"Coltom Chat Channel Member",
		{"parent": channel_name, "user": user}
	)


@frappe.whitelist()
def get_users():
	"""Retourne tous les utilisateurs système actifs (sauf l'utilisateur courant)."""
	users = frappe.get_all(
		"User",
		filters={
			"enabled": 1,
			"user_type": "System User",
			"name": ["!=", frappe.session.user]
		},
		fields=["name", "full_name", "user_image"],
		order_by="full_name asc"
	)
	return users


@frappe.whitelist()
def get_channels():
	"""Retourne tous les canaux dont l'utilisateur courant est membre."""
	user = frappe.session.user

	# Récupère les IDs des canaux où l'utilisateur est membre
	member_rows = frappe.get_all(
		"Coltom Chat Channel Member",
		filters={"user": user},
		fields=["parent"]
	)
	channel_ids = list(set(r.parent for r in member_rows))

	if not channel_ids:
		return []

	channels = []
	for channel_id in channel_ids:
		channel = frappe.db.get_value(
			"Coltom Chat Channel",
			channel_id,
			["name", "channel_name", "type", "creation"],
			as_dict=True
		)
		if not channel:
			continue

		# Compte les messages non lus
		unread = frappe.db.count(
			"Coltom Chat Message",
			filters={
				"channel": channel_id,
				"sender": ["!=", user],
				"is_read": 0
			}
		)

		# Dernier message
		last_msg = frappe.db.get_value(
			"Coltom Chat Message",
			filters={"channel": channel_id},
			fieldname=["message", "sent_time", "sender"],
			as_dict=True,
			order_by="sent_time desc"
		)

		# Membres du canal
		members = frappe.get_all(
			"Coltom Chat Channel Member",
			filters={"parent": channel_id},
			fields=["user", "full_name"]
		)

		# Pour message direct, le nom = l'autre utilisateur
		display_name = channel.channel_name
		other_user_image = None
		if channel.type == "Direct":
			other = next((m for m in members if m.user != user), None)
			if other:
				display_name = other.full_name or other.user
				other_user_image = frappe.db.get_value("User", other.user, "user_image")

		channel["display_name"] = display_name
		channel["unread"] = unread
		channel["last_message"] = last_msg.message[:60] if last_msg else ""
		channel["last_time"] = last_msg.sent_time if last_msg else channel.creation
		channel["members"] = members
		channel["other_user_image"] = other_user_image
		channels.append(channel)

	# Trier par dernier message
	channels.sort(key=lambda x: x["last_time"], reverse=True)
	return channels


@frappe.whitelist()
def get_or_create_direct_channel(other_user):
	"""Crée ou retrouve un canal direct entre l'utilisateur courant et other_user."""
	user = frappe.session.user

	if user == other_user:
		frappe.throw(_("Vous ne pouvez pas vous envoyer un message à vous-même."))

	# Cherche un canal direct existant entre ces deux utilisateurs
	user_channels = frappe.get_all(
		"Coltom Chat Channel Member",
		filters={"user": user},
		fields=["parent"]
	)
	user_channel_ids = [r.parent for r in user_channels]

	other_channels = frappe.get_all(
		"Coltom Chat Channel Member",
		filters={"user": other_user},
		fields=["parent"]
	)
	other_channel_ids = [r.parent for r in other_channels]

	common = set(user_channel_ids) & set(other_channel_ids)

	for channel_id in common:
		channel_type = frappe.db.get_value("Coltom Chat Channel", channel_id, "type")
		if channel_type == "Direct":
			# Vérifier qu'il n'y a que 2 membres
			member_count = frappe.db.count(
				"Coltom Chat Channel Member",
				{"parent": channel_id}
			)
			if member_count == 2:
				return channel_id

	# Créer un nouveau canal direct
	other_full_name = frappe.db.get_value("User", other_user, "full_name")
	my_full_name = frappe.db.get_value("User", user, "full_name")

	channel = frappe.get_doc({
		"doctype": "Coltom Chat Channel",
		"channel_name": f"{my_full_name} & {other_full_name}",
		"type": "Direct",
		"is_direct_message": 1,
		"created_by": user,
		"members": [
			{"user": user, "full_name": my_full_name},
			{"user": other_user, "full_name": other_full_name}
		]
	})
	channel.insert(ignore_permissions=True)
	frappe.db.commit()

	# Notifier l'autre utilisateur
	frappe.publish_realtime(
		"coltom_chat_new_channel",
		{"channel": channel.name},
		user=other_user
	)

	return channel.name


@frappe.whitelist()
def create_group_channel(users, group_name):
	"""Crée un groupe de chat avec plusieurs utilisateurs."""
	import json
	if isinstance(users, str):
		users = json.loads(users)

	current_user = frappe.session.user
	if current_user not in users:
		users.insert(0, current_user)

	if len(users) < 2:
		frappe.throw(_("Un groupe doit avoir au moins 2 membres."))

	members = []
	for u in users:
		full_name = frappe.db.get_value("User", u, "full_name")
		members.append({"user": u, "full_name": full_name})

	channel = frappe.get_doc({
		"doctype": "Coltom Chat Channel",
		"channel_name": group_name or _("Groupe"),
		"type": "Groupe",
		"is_direct_message": 0,
		"created_by": current_user,
		"members": members
	})
	channel.insert(ignore_permissions=True)
	frappe.db.commit()

	# Notifier tous les membres
	for u in users:
		if u != current_user:
			frappe.publish_realtime(
				"coltom_chat_new_channel",
				{"channel": channel.name},
				user=u
			)

	return channel.name


@frappe.whitelist()
def send_message(channel, message, message_type="Text"):
	"""Envoie un message dans un canal."""
	user = frappe.session.user

	if not is_channel_member(channel):
		frappe.throw(_("Vous n'êtes pas membre de ce canal."))

	full_name = frappe.db.get_value("User", user, "full_name")

	msg = frappe.get_doc({
		"doctype": "Coltom Chat Message",
		"channel": channel,
		"sender": user,
		"sender_full_name": full_name,
		"message": message,
		"message_type": message_type,
		"sent_time": now_datetime(),
		"is_read": 0
	})
	msg.insert(ignore_permissions=True)
	frappe.db.commit()

	# Récupère les membres pour les notifier en temps réel
	members = frappe.get_all(
		"Coltom Chat Channel Member",
		filters={"parent": channel},
		fields=["user"]
	)

	payload = {
		"id": msg.name,
		"channel": channel,
		"sender": user,
		"sender_full_name": full_name,
		"message": message,
		"message_type": message_type,
		"sent_time": str(msg.sent_time)
	}

	for member in members:
		frappe.publish_realtime(
			"coltom_chat_message",
			payload,
			user=member.user
		)

	return payload


@frappe.whitelist()
def get_messages(channel, before=None, limit=50):
	"""Retourne les messages d'un canal (50 derniers ou avant un certain ID)."""
	if not is_channel_member(channel):
		frappe.throw(_("Vous n'êtes pas membre de ce canal."))

	filters = {"channel": channel}

	messages = frappe.get_all(
		"Coltom Chat Message",
		filters=filters,
		fields=["name", "sender", "sender_full_name", "message", "message_type", "sent_time", "is_read"],
		order_by="sent_time asc",
		limit_page_length=int(limit)
	)

	# Marquer comme lus les messages des autres
	user = frappe.session.user
	for msg in messages:
		if msg.sender != user and not msg.is_read:
			frappe.db.set_value("Coltom Chat Message", msg.name, "is_read", 1)

	frappe.db.commit()
	return messages


@frappe.whitelist()
def mark_as_read(channel):
	"""Marque tous les messages d'un canal comme lus."""
	user = frappe.session.user
	if not is_channel_member(channel):
		return

	frappe.db.sql("""
		UPDATE `tabColtom Chat Message`
		SET is_read = 1
		WHERE channel = %s AND sender != %s AND is_read = 0
	""", (channel, user))
	frappe.db.commit()
	return True


@frappe.whitelist()
def get_unread_count():
	"""Retourne le total des messages non lus pour l'utilisateur courant."""
	user = frappe.session.user

	member_rows = frappe.get_all(
		"Coltom Chat Channel Member",
		filters={"user": user},
		fields=["parent"]
	)
	channel_ids = [r.parent for r in member_rows]

	if not channel_ids:
		return 0

	count = frappe.db.count(
		"Coltom Chat Message",
		filters={
			"channel": ["in", channel_ids],
			"sender": ["!=", user],
			"is_read": 0
		}
	)
	return count


@frappe.whitelist()
def add_member_to_group(channel, user):
	"""Ajoute un membre à un groupe existant."""
	current_user = frappe.session.user

	channel_doc = frappe.get_doc("Coltom Chat Channel", channel)
	if channel_doc.type != "Groupe":
		frappe.throw(_("Impossible d'ajouter un membre à un canal direct."))

	# Vérifier si déjà membre
	if frappe.db.exists("Coltom Chat Channel Member", {"parent": channel, "user": user}):
		frappe.throw(_("Cet utilisateur est déjà membre du groupe."))

	full_name = frappe.db.get_value("User", user, "full_name")
	channel_doc.append("members", {"user": user, "full_name": full_name})
	channel_doc.save(ignore_permissions=True)
	frappe.db.commit()

	frappe.publish_realtime(
		"coltom_chat_new_channel",
		{"channel": channel},
		user=user
	)
	return True
