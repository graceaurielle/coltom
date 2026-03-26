import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class ColtomChatMessage(Document):

	def before_insert(self):
		# Auto-setter l'heure d'envoi — jamais laissé à l'utilisateur
		self.sent_time = now_datetime()
		if not self.sender:
			self.sender = frappe.session.user
		if not self.sender_full_name:
			self.sender_full_name = frappe.db.get_value("User", self.sender, "full_name")

	def validate(self):
		# Empêcher la modification d'un message déjà enregistré
		if not self.is_new():
			frappe.throw(_("Les messages ne peuvent pas être modifiés après envoi."))

	def has_permission(self, ptype, user=None):
		user = user or frappe.session.user
		if ptype in ("write", "delete"):
			return user == "Administrator"
		if ptype == "read":
			return bool(frappe.db.exists(
				"Coltom Chat Channel Member",
				{"parent": self.channel, "user": user}
			))
		return True
