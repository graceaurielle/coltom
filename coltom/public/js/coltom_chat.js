/* Coltom Chat Widget - Chat privé pour Frappe/ERPNext */
(function () {
	'use strict';

	/* ── Initialisation robuste ── */
	function tryInit() {
		if (window._coltomChatLoaded) return;
		if (typeof frappe === 'undefined' || !frappe.session || !frappe.session.user || frappe.session.user === 'Guest') {
			setTimeout(tryInit, 600);
			return;
		}
		window._coltomChatLoaded = true;
		ColtomChat.init();
	}

	$(document).ready(function () { setTimeout(tryInit, 800); });

	/* ═══════════════════════════════════════════
	   OBJET PRINCIPAL
	═══════════════════════════════════════════ */
	const ColtomChat = {
		channels: [],
		activeChannel: null,
		_refreshTimer: null,

		/* ── Démarrage ── */
		init() {
			this.renderButton();
			this.renderModal();
			this.bindRealtime();
			this.loadUnreadBadge();
			this.requestBrowserNotifPermission();
		},

		/* ══════════════════ BOUTON ══════════════════ */
		renderButton() {
			if ($('#coltom-chat-btn').length) return;
			$('body').append(`
				<div id="coltom-chat-btn" title="Chat Privé">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
						<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
					</svg>
					<span id="coltom-chat-badge" class="coltom-badge" style="display:none">0</span>
				</div>
			`);
			$('#coltom-chat-btn').on('click', () => this.toggleModal());
		},

		updateBadge(count) {
			const badge = $('#coltom-chat-badge');
			if (count > 0) {
				badge.text(count > 99 ? '99+' : count).show();
				$('#coltom-chat-btn').addClass('has-notif');
			} else {
				badge.hide();
				$('#coltom-chat-btn').removeClass('has-notif');
			}
		},

		loadUnreadBadge() {
			frappe.call({
				method: 'coltom.api.chat.get_unread_count',
				callback: (r) => { if (r.message !== undefined) this.updateBadge(r.message); }
			});
		},

		/* ══════════════════ MODAL ══════════════════ */
		renderModal() {
			if ($('#coltom-chat-modal').length) return;
			$('body').append(`
				<div id="coltom-chat-modal" style="display:none">
					<div class="coltom-chat-header">
						<span class="coltom-chat-title">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="15" height="15" style="margin-right:6px;vertical-align:middle">
								<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
							</svg>
							Chat Privé
						</span>
						<div class="coltom-header-actions">
							<button class="coltom-icon-btn coltom-btn-new-msg" title="Nouveau message direct">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
									<path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/>
								</svg>
							</button>
							<button class="coltom-icon-btn coltom-btn-new-group" title="Nouveau groupe">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
									<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
								</svg>
							</button>
							<button class="coltom-icon-btn coltom-btn-close" title="Fermer">✕</button>
						</div>
					</div>
					<div class="coltom-chat-body">
						<div class="coltom-sidebar">
							<div class="coltom-search-box">
								<input type="text" class="coltom-search-input" placeholder="Rechercher...">
							</div>
							<div class="coltom-channel-list"></div>
						</div>
						<div class="coltom-main">
							<div class="coltom-empty-state">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" width="56" height="56">
									<circle cx="32" cy="32" r="30" fill="#EEF2FF"/>
									<path d="M20 22h24c1.1 0 2 .9 2 2v14c0 1.1-.9 2-2 2H22l-4 4V24c0-1.1.9-2 2-2z" fill="#C7D7FF" stroke="#5B8AF0" stroke-width="1.5"/>
								</svg>
								<p>Sélectionnez une conversation<br><small>ou cliquez sur ✉ pour en démarrer une</small></p>
							</div>
							<div class="coltom-messages-area" style="display:none">
								<div class="coltom-conv-header">
									<div class="coltom-conv-info">
										<div class="coltom-conv-avatar-wrap" id="coltom-conv-avatar"></div>
										<div>
											<div class="coltom-conv-name" id="coltom-conv-name"></div>
											<div class="coltom-conv-sub" id="coltom-conv-members"></div>
										</div>
									</div>
								</div>
								<div class="coltom-messages" id="coltom-messages"></div>
								<div class="coltom-input-area">
									<textarea class="coltom-msg-input" id="coltom-msg-input"
										placeholder="Écrire un message… (Entrée pour envoyer)" rows="1"></textarea>
									<button class="coltom-send-btn" id="coltom-send-btn" title="Envoyer">
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
											<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
										</svg>
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			`);
			this.bindModalEvents();
		},

		toggleModal() {
			const modal = $('#coltom-chat-modal');
			if (modal.is(':visible')) {
				modal.hide();
				this.stopRefresh();
			} else {
				modal.show();
				this.loadChannels();
				this.startRefresh();
			}
		},

		startRefresh() {
			this.stopRefresh();
			this._refreshTimer = setInterval(() => {
				if (!$('#coltom-chat-modal').is(':visible')) { this.stopRefresh(); return; }
				if (this.activeChannel) this.loadMessages(this.activeChannel, true);
				this.loadChannels();
			}, 4000);
		},

		stopRefresh() {
			if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
		},

		bindModalEvents() {
			$(document).on('click', '.coltom-btn-close', () => this.toggleModal());
			$(document).on('click', '.coltom-btn-new-msg', () => this.showUserPicker());
			$(document).on('click', '.coltom-btn-new-group', () => this.showGroupCreator());
			$(document).on('click', '#coltom-send-btn', () => this.sendMessage());

			$(document).on('keydown', '#coltom-msg-input', (e) => {
				if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
			});

			$(document).on('input', '#coltom-msg-input', function () {
				this.style.height = 'auto';
				this.style.height = Math.min(this.scrollHeight, 100) + 'px';
			});

			$(document).on('input', '.coltom-search-input', function () {
				const q = this.value.toLowerCase();
				$('.coltom-channel-item').each(function () {
					$(this).toggle($(this).find('.coltom-ch-name').text().toLowerCase().includes(q));
				});
			});
		},

		/* ══════════════════ CHANNELS ══════════════════ */
		loadChannels() {
			frappe.call({
				method: 'coltom.api.chat.get_channels',
				callback: (r) => {
					this.channels = r.message || [];
					this.renderChannelList();
					this.loadUnreadBadge();
				}
			});
		},

		renderChannelList() {
			const list = $('.coltom-channel-list');
			list.empty();
			if (!this.channels.length) {
				list.html('<div class="coltom-no-channels">Aucune conversation.<br>Cliquez sur ✉ pour démarrer.</div>');
				return;
			}
			this.channels.forEach(ch => {
				const avatar = ch.other_user_image
					? `<img src="${ch.other_user_image}" class="coltom-avatar-img">`
					: `<div class="coltom-avatar-fallback ${ch.type === 'Groupe' ? 'coltom-avatar-group' : ''}">${ch.type === 'Groupe' ? '&#128101;' : this.getInitials(ch.display_name)}</div>`;
				const item = $(`
					<div class="coltom-channel-item ${this.activeChannel === ch.name ? 'active' : ''}" data-id="${ch.name}">
						<div class="coltom-ch-avatar">${avatar}</div>
						<div class="coltom-ch-info">
							<div class="coltom-ch-top">
								<span class="coltom-ch-name">${frappe.utils.escape_html(ch.display_name)}</span>
								<span class="coltom-ch-time">${ch.last_time ? this.formatTime(ch.last_time) : ''}</span>
							</div>
							<div class="coltom-ch-bottom">
								<span class="coltom-ch-preview">${frappe.utils.escape_html((ch.last_message || '').substring(0, 40))}</span>
								${ch.unread > 0 ? `<span class="coltom-ch-unread">${ch.unread}</span>` : ''}
							</div>
						</div>
					</div>
				`);
				item.on('click', () => this.openChannel(ch));
				list.append(item);
			});
		},

		openChannel(ch) {
			this.activeChannel = ch.name;
			$('.coltom-channel-item').removeClass('active');
			$(`.coltom-channel-item[data-id="${ch.name}"]`).addClass('active');
			$('.coltom-empty-state').hide();
			$('.coltom-messages-area').show();
			$('#coltom-conv-name').text(ch.display_name);
			$('#coltom-conv-members').text(ch.type === 'Groupe' ? `Groupe · ${(ch.members || []).length} membres` : '');
			const avatarHtml = ch.other_user_image
				? `<img src="${ch.other_user_image}" class="coltom-avatar-img">`
				: `<div class="coltom-avatar-fallback ${ch.type === 'Groupe' ? 'coltom-avatar-group' : ''}">${ch.type === 'Groupe' ? '&#128101;' : this.getInitials(ch.display_name)}</div>`;
			$('#coltom-conv-avatar').html(avatarHtml);
			this.loadMessages(ch.name);
			frappe.call({ method: 'coltom.api.chat.mark_as_read', args: { channel: ch.name } });
			ch.unread = 0;
			this.renderChannelList();
			this.loadUnreadBadge();
			setTimeout(() => $('#coltom-msg-input').focus(), 100);
		},

		/* ══════════════════ MESSAGES ══════════════════ */
		_lastMsgCount: 0,

		loadMessages(channelId) {
			frappe.call({
				method: 'coltom.api.chat.get_messages',
				args: { channel: channelId, limit: 80 },
				callback: (r) => {
					const msgs = r.message || [];
					const container = $('#coltom-messages');
					const wasAtBottom = !container[0] || (container[0].scrollHeight - container[0].scrollTop - container[0].clientHeight < 60);
					this.renderMessages(msgs, wasAtBottom);
					// Marquer comme lus si conversation ouverte
					if (this.activeChannel === channelId) {
						frappe.call({ method: 'coltom.api.chat.mark_as_read', args: { channel: channelId } });
					}
				}
			});
		},

		renderMessages(messages) {
			const container = $('#coltom-messages');
			const wasAtBottom = !container[0] || (container[0].scrollHeight - container[0].scrollTop - container[0].clientHeight < 80);
			container.empty();
			const me = frappe.session.user;
			let lastDate = null;

			messages.forEach(msg => {
				const isMine = msg.sender === me;
				const dateStr = (msg.sent_time || '').substring(0, 10);
				if (dateStr && dateStr !== lastDate) {
					container.append(`<div class="coltom-date-divider"><span>${this.formatDateLabel(dateStr)}</span></div>`);
					lastDate = dateStr;
				}
				const timeStr = this.formatTimeOnly(msg.sent_time);
				const bubble = $(`
					<div class="coltom-msg-wrapper ${isMine ? 'mine' : 'theirs'}" data-id="${msg.name}">
						${!isMine ? `<div class="coltom-msg-sender">${frappe.utils.escape_html(msg.sender_full_name || msg.sender)}</div>` : ''}
						<div class="coltom-msg-bubble">
							<div class="coltom-msg-text">${this.formatMessageText(msg.message)}</div>
							<div class="coltom-msg-meta">
								<span class="coltom-msg-time">${timeStr}</span>
								${isMine ? `<span class="coltom-read-tick ${msg.is_read ? 'read' : ''}">✓✓</span>` : ''}
							</div>
						</div>
					</div>
				`);
				container.append(bubble);
			});

			if (wasAtBottom) {
				container.scrollTop(container[0] ? container[0].scrollHeight : 0);
			}
		},

		sendMessage() {
			const input = $('#coltom-msg-input');
			const message = input.val().trim();
			if (!message || !this.activeChannel) return;
			input.val('').css('height', 'auto');
			frappe.call({
				method: 'coltom.api.chat.send_message',
				args: { channel: this.activeChannel, message },
				callback: (r) => {
					if (r.message) {
						this.loadMessages(this.activeChannel);
						this.loadChannels();
					}
				}
			});
		},

		/* ══════════════════ REALTIME ══════════════════ */
		bindRealtime() {
			frappe.realtime.on('coltom_chat_message', (data) => {
				// Rafraîchir si c'est la conversation ouverte
				if (data.channel === this.activeChannel && $('#coltom-chat-modal').is(':visible')) {
					this.loadMessages(this.activeChannel);
					frappe.call({ method: 'coltom.api.chat.mark_as_read', args: { channel: data.channel } });
				} else {
					// Notification visuelle + badge
					this.showInAppNotif(data);
					this.playBeep();
				}
				this.loadChannels();
				this.loadUnreadBadge();
			});

			frappe.realtime.on('coltom_chat_new_channel', () => {
				this.loadChannels();
				this.loadUnreadBadge();
			});
		},

		showInAppNotif(data) {
			// Notification Frappe (toast en haut)
			frappe.show_alert({
				message: `<b>${frappe.utils.escape_html(data.sender_full_name || data.sender)}</b> : ${frappe.utils.escape_html((data.message || '').substring(0, 60))}`,
				indicator: 'blue'
			}, 6);

			// Notification navigateur
			if (Notification && Notification.permission === 'granted') {
				const n = new Notification('Chat Privé — ' + (data.sender_full_name || data.sender), {
					body: (data.message || '').substring(0, 100),
					icon: '/assets/coltom/images/chat-icon.png'
				});
				n.onclick = () => {
					window.focus();
					if (!$('#coltom-chat-modal').is(':visible')) this.toggleModal();
					const ch = this.channels.find(c => c.name === data.channel);
					if (ch) this.openChannel(ch);
				};
				setTimeout(() => n.close(), 5000);
			}
		},

		requestBrowserNotifPermission() {
			if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
				setTimeout(() => Notification.requestPermission(), 3000);
			}
		},

		playBeep() {
			try {
				const AudioCtx = window.AudioContext || window['webkitAudioContext'];
				if (!AudioCtx) return;
				const ctx = new AudioCtx();
				const osc = ctx.createOscillator();
				const gain = ctx.createGain();
				osc.connect(gain); gain.connect(ctx.destination);
				osc.frequency.setValueAtTime(880, ctx.currentTime);
				gain.gain.setValueAtTime(0.08, ctx.currentTime);
				gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
				osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25);
			} catch (e) {}
		},

		/* ══════════════════ SÉLECTEUR UTILISATEUR ══════════════════ */
		showUserPicker() {
			frappe.call({
				method: 'coltom.api.chat.get_users',
				callback: (r) => {
					const users = r.message || [];
					if (!users.length) { frappe.msgprint('Aucun autre utilisateur disponible.'); return; }
					const d = new frappe.ui.Dialog({ title: '💬 Nouveau message direct', fields: [{ fieldtype: 'HTML', fieldname: 'user_list' }] });
					let html = '<div class="coltom-user-picker">';
					users.forEach(u => {
						const av = u.user_image ? `<img src="${u.user_image}" class="coltom-avatar-img">` : `<div class="coltom-avatar-fallback">${this.getInitials(u.full_name || u.name)}</div>`;
						html += `<div class="coltom-user-item" data-user="${u.name}"><div class="coltom-ch-avatar">${av}</div><div class="coltom-user-name">${frappe.utils.escape_html(u.full_name || u.name)}</div></div>`;
					});
					html += '</div>';
					d.fields_dict.user_list.$wrapper.html(html);
					d.fields_dict.user_list.$wrapper.on('click', '.coltom-user-item', (e) => {
						const targetUser = $(e.currentTarget).data('user');
						d.hide();
						frappe.call({
							method: 'coltom.api.chat.get_or_create_direct_channel',
							args: { other_user: targetUser },
							callback: (r) => {
								if (r.message) {
									frappe.call({
										method: 'coltom.api.chat.get_channels',
										callback: (r2) => {
											this.channels = r2.message || [];
											this.renderChannelList();
											if (!$('#coltom-chat-modal').is(':visible')) this.toggleModal();
											const found = this.channels.find(c => c.name === r.message);
											if (found) this.openChannel(found);
										}
									});
								}
							}
						});
					});
					d.show();
				}
			});
		},

		/* ══════════════════ CRÉATEUR DE GROUPE ══════════════════ */
		showGroupCreator() {
			frappe.call({
				method: 'coltom.api.chat.get_users',
				callback: (r) => {
					const users = r.message || [];
					const d = new frappe.ui.Dialog({
						title: '👥 Nouveau groupe',
						fields: [
							{ fieldtype: 'Data', fieldname: 'group_name', label: 'Nom du groupe', reqd: 1 },
							{ fieldtype: 'HTML', fieldname: 'users_html', label: 'Membres (cochez)' }
						],
						primary_action_label: 'Créer',
						primary_action: (vals) => {
							const selected = [];
							d.fields_dict.users_html.$wrapper.find('.coltom-user-item.selected').each(function () {
								selected.push($(this).data('user'));
							});
							if (!selected.length) { frappe.msgprint('Sélectionnez au moins 1 membre.'); return; }
							frappe.call({
								method: 'coltom.api.chat.create_group_channel',
								args: { users: selected, group_name: vals.group_name },
								callback: (r) => {
									if (r.message) {
										d.hide();
										frappe.call({
											method: 'coltom.api.chat.get_channels',
											callback: (r2) => {
												this.channels = r2.message || [];
												this.renderChannelList();
												if (!$('#coltom-chat-modal').is(':visible')) this.toggleModal();
												const found = this.channels.find(c => c.name === r.message);
												if (found) this.openChannel(found);
											}
										});
									}
								}
							});
						}
					});
					let html = '<div class="coltom-user-picker coltom-multi-select">';
					users.forEach(u => {
						const av = u.user_image ? `<img src="${u.user_image}" class="coltom-avatar-img">` : `<div class="coltom-avatar-fallback">${this.getInitials(u.full_name || u.name)}</div>`;
						html += `<div class="coltom-user-item" data-user="${u.name}"><div class="coltom-ch-avatar">${av}</div><div class="coltom-user-name">${frappe.utils.escape_html(u.full_name || u.name)}</div><span class="coltom-check">✓</span></div>`;
					});
					html += '</div>';
					d.fields_dict.users_html.$wrapper.html(html);
					d.fields_dict.users_html.$wrapper.on('click', '.coltom-user-item', function () { $(this).toggleClass('selected'); });
					d.show();
				}
			});
		},

		/* ══════════════════ UTILITAIRES ══════════════════ */
		getInitials(name) {
			if (!name) return '?';
			return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
		},
		formatTime(dt) {
			if (!dt) return '';
			const d = new Date(dt.replace(' ', 'T')), now = new Date(), diff = now - d, day = 86400000;
			if (diff < day && d.getDate() === now.getDate()) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
			if (diff < 7 * day) return d.toLocaleDateString('fr-FR', { weekday: 'short' });
			return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
		},
		formatTimeOnly(dt) {
			if (!dt) return '';
			return new Date(dt.replace(' ', 'T')).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
		},
		formatDateLabel(dateStr) {
			const d = new Date(dateStr), now = new Date();
			const diff = Math.floor((now - d) / 86400000);
			if (diff === 0) return "Aujourd'hui";
			if (diff === 1) return 'Hier';
			return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
		},
		formatMessageText(text) {
			if (!text) return '';
			return frappe.utils.escape_html(text).replace(/\n/g, '<br>');
		}
	};

})();
