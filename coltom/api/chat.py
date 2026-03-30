import frappe
from frappe import _
from frappe.utils import now_datetime, add_days


def is_channel_member(channel_name):
	user = frappe.session.user
	return frappe.db.exists(
		"Coltom Chat Channel Member",
		{"parent": channel_name, "user": user}
	)


@frappe.whitelist()
def get_users():
	return frappe.get_all(
		"User",
		filters={"enabled": 1, "user_type": "System User", "name": ["!=", frappe.session.user]},
		fields=["name", "full_name", "user_image"],
		order_by="full_name asc"
	)


@frappe.whitelist()
def get_channels():
	user = frappe.session.user
	from coltom.utils.encryption import decrypt

	member_rows = frappe.get_all("Coltom Chat Channel Member", filters={"user": user}, fields=["parent"])
	channel_ids = list(set(r.parent for r in member_rows))
	if not channel_ids:
		return []

	channels = []
	for channel_id in channel_ids:
		channel = frappe.db.get_value(
			"Coltom Chat Channel",
			channel_id,
			["name", "channel_name", "type", "creation", "created_by"],
			as_dict=True
		)
		if not channel:
			continue

		unread = frappe.db.count("Coltom Chat Message", {"channel": channel_id, "sender": ["!=", user], "is_read": 0})
		last_msg = frappe.db.get_value(
			"Coltom Chat Message",
			filters={"channel": channel_id},
			fieldname=["message", "sent_time", "sender"],
			as_dict=True,
			order_by="sent_time desc"
		)
		members = frappe.get_all("Coltom Chat Channel Member", filters={"parent": channel_id}, fields=["user", "full_name"])

		display_name = channel.channel_name
		other_user_image = None
		if channel.type == "Direct":
			other = next((m for m in members if m.user != user), None)
			if other:
				display_name = other.full_name or other.user
				other_user_image = frappe.db.get_value("User", other.user, "user_image")

		channel["display_name"] = display_name
		channel["unread"] = unread
		channel["last_message"] = decrypt(last_msg.message)[:60] if last_msg else ""
		channel["last_time"] = last_msg.sent_time if last_msg else channel.creation
		channel["members"] = members
		channel["other_user_image"] = other_user_image
		channels.append(channel)

	channels.sort(key=lambda x: x["last_time"], reverse=True)
	return channels


@frappe.whitelist()
def get_or_create_direct_channel(other_user):
	user = frappe.session.user
	if user == other_user:
		frappe.throw(_("Vous ne pouvez pas vous envoyer un message à vous-même."))

	user_channels = [r.parent for r in frappe.get_all("Coltom Chat Channel Member", filters={"user": user}, fields=["parent"])]
	other_channels = [r.parent for r in frappe.get_all("Coltom Chat Channel Member", filters={"user": other_user}, fields=["parent"])]

	for channel_id in set(user_channels) & set(other_channels):
		if frappe.db.get_value("Coltom Chat Channel", channel_id, "type") == "Direct":
			if frappe.db.count("Coltom Chat Channel Member", {"parent": channel_id}) == 2:
				return channel_id

	my_full = frappe.db.get_value("User", user, "full_name")
	other_full = frappe.db.get_value("User", other_user, "full_name")
	channel = frappe.get_doc({
		"doctype": "Coltom Chat Channel",
		"channel_name": f"{my_full} & {other_full}",
		"type": "Direct", "is_direct_message": 1, "created_by": user,
		"members": [{"user": user, "full_name": my_full}, {"user": other_user, "full_name": other_full}]
	})
	channel.insert(ignore_permissions=True)
	frappe.db.commit()
	frappe.publish_realtime("coltom_chat_new_channel", {"channel": channel.name}, user=other_user)
	return channel.name


@frappe.whitelist()
def create_group_channel(users, group_name):
	import json
	if isinstance(users, str):
		users = json.loads(users)
	current_user = frappe.session.user
	if current_user not in users:
		users.insert(0, current_user)
	if len(users) < 2:
		frappe.throw(_("Un groupe doit avoir au moins 2 membres."))

	members = [{"user": u, "full_name": frappe.db.get_value("User", u, "full_name")} for u in users]
	channel = frappe.get_doc({
		"doctype": "Coltom Chat Channel",
		"channel_name": group_name or _("Groupe"),
		"type": "Groupe", "is_direct_message": 0,
		"created_by": current_user, "members": members
	})
	channel.insert(ignore_permissions=True)
	frappe.db.commit()
	for u in users:
		if u != current_user:
			frappe.publish_realtime("coltom_chat_new_channel", {"channel": channel.name}, user=u)
	return channel.name


@frappe.whitelist()
def send_message(channel, message, message_type="Text"):
	user = frappe.session.user
	if not is_channel_member(channel):
		frappe.throw(_("Vous n'êtes pas membre de ce canal."))

	full_name = frappe.db.get_value("User", user, "full_name")
	plaintext = message  # Garder le texte clair pour le realtime

	msg = frappe.get_doc({
		"doctype": "Coltom Chat Message",
		"channel": channel, "sender": user, "sender_full_name": full_name,
		"message": message,  # sera chiffré dans before_insert
		"message_type": message_type, "is_read": 0
	})
	msg.insert(ignore_permissions=True)
	frappe.db.commit()

	members = frappe.get_all("Coltom Chat Channel Member", filters={"parent": channel}, fields=["user"])
	payload = {
		"id": msg.name, "channel": channel, "sender": user,
		"sender_full_name": full_name,
		"message": plaintext,  # texte clair dans le realtime
		"message_type": message_type,
		"sent_time": str(msg.sent_time)
	}
	for member in members:
		frappe.publish_realtime("coltom_chat_message", payload, user=member.user)
	return payload


@frappe.whitelist()
def get_messages(channel, limit=50):
	if not is_channel_member(channel):
		frappe.throw(_("Vous n'êtes pas membre de ce canal."))

	from coltom.utils.encryption import decrypt

	messages = frappe.get_all(
		"Coltom Chat Message",
		filters={"channel": channel},
		fields=["name", "sender", "sender_full_name", "message", "message_type", "sent_time", "is_read"],
		order_by="sent_time asc",
		limit_page_length=int(limit)
	)
	user = frappe.session.user
	for msg in messages:
		msg.message = decrypt(msg.message)  # Déchiffrer avant envoi au client
		if msg.sender != user and not msg.is_read:
			frappe.db.set_value("Coltom Chat Message", msg.name, "is_read", 1)

	frappe.db.commit()
	return messages


@frappe.whitelist()
def mark_as_read(channel):
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
	user = frappe.session.user
	channel_ids = [r.parent for r in frappe.get_all("Coltom Chat Channel Member", filters={"user": user}, fields=["parent"])]
	if not channel_ids:
		return 0
	return frappe.db.count("Coltom Chat Message", {"channel": ["in", channel_ids], "sender": ["!=", user], "is_read": 0})


@frappe.whitelist()
def leave_channel(channel):
	"""Quitter un groupe (ne fonctionne pas sur les canaux directs)."""
	user = frappe.session.user
	channel_doc = frappe.get_doc("Coltom Chat Channel", channel)

	if channel_doc.type != "Groupe":
		frappe.throw(_("Vous ne pouvez pas quitter un canal direct."))

	# Retirer l'utilisateur des membres
	channel_doc.members = [m for m in channel_doc.members if m.user != user]

	if not channel_doc.members:
		# Dernier membre : supprimer le groupe
		frappe.db.delete("Coltom Chat Message", {"channel": channel})
		frappe.delete_doc("Coltom Chat Channel", channel, ignore_permissions=True)
	else:
		channel_doc.save(ignore_permissions=True)
		# Notifier les membres restants
		_notify_group_change(channel, channel_doc.members, f"{user} a quitté le groupe.")

	frappe.db.commit()
	return True


@frappe.whitelist()
def delete_channel(channel):
	"""Supprimer un groupe (réservé au créateur)."""
	user = frappe.session.user
	channel_doc = frappe.get_doc("Coltom Chat Channel", channel)

	if channel_doc.type != "Groupe":
		frappe.throw(_("Vous ne pouvez pas supprimer un canal direct."))

	if channel_doc.created_by != user and user != "Administrator":
		frappe.throw(_("Seul le créateur du groupe peut le supprimer."))

	members = frappe.get_all("Coltom Chat Channel Member", filters={"parent": channel}, fields=["user"])
	frappe.db.delete("Coltom Chat Message", {"channel": channel})
	frappe.delete_doc("Coltom Chat Channel", channel, ignore_permissions=True)
	frappe.db.commit()

	for m in members:
		if m.user != user:
			frappe.publish_realtime("coltom_chat_channel_deleted", {"channel": channel}, user=m.user)
	return True


@frappe.whitelist()
def add_member_to_group(channel, user):
	current_user = frappe.session.user
	channel_doc = frappe.get_doc("Coltom Chat Channel", channel)
	if channel_doc.type != "Groupe":
		frappe.throw(_("Impossible d'ajouter un membre à un canal direct."))
	if frappe.db.exists("Coltom Chat Channel Member", {"parent": channel, "user": user}):
		frappe.throw(_("Cet utilisateur est déjà membre du groupe."))
	full_name = frappe.db.get_value("User", user, "full_name")
	channel_doc.append("members", {"user": user, "full_name": full_name})
	channel_doc.save(ignore_permissions=True)
	frappe.db.commit()
	frappe.publish_realtime("coltom_chat_new_channel", {"channel": channel}, user=user)
	return True


def _notify_group_change(channel, members, message):
	for m in members:
		frappe.publish_realtime("coltom_chat_new_channel", {"channel": channel}, user=m.user)
