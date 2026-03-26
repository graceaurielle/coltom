import frappe
from frappe.utils import add_days, now_datetime


def delete_old_messages():
	"""Supprime les messages de plus de 35 jours."""
	cutoff = add_days(now_datetime(), -35)
	old_messages = frappe.get_all(
		"Coltom Chat Message",
		filters={"sent_time": ["<", cutoff]},
		fields=["name"]
	)
	for msg in old_messages:
		frappe.delete_doc("Coltom Chat Message", msg.name, ignore_permissions=True, force=True)

	if old_messages:
		frappe.db.commit()
		frappe.logger().info(f"Coltom Chat: {len(old_messages)} message(s) supprimé(s) (> 35 jours)")
