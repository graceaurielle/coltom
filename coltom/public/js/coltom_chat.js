/* Coltom Chat Widget - Chat privé pour Frappe/ERPNext */
(function () {
	'use strict';

	// Initialisation après chargement complet de Frappe
	function tryInit() {
		if (window._coltomChatLoaded) return;
		if (typeof frappe === 'undefined' || !frappe.session || !frappe.session.user || frappe.session.user === 'Guest') {
			setTimeout(tryInit, 600);
			return;
		}
		window._coltomChatLoaded = true;
		initChat();
	}

	$(document).ready(function () {
		setTimeout(tryInit, 1000);
	});

	function initChat() {

		const Chat = {
			channels: [],
			activeChannel: null,
			pollInterval: null,

			init() {
				this.renderButton();
				this.renderModal();
				this.bindRealtime();
				this.loadUnreadBadge();
			},

			/* ===== BOUTON FLOTTANT ===== */
			renderButton() {
				const btn = $(`
					<div id="coltom-chat-btn" title="Chat Privé">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
							<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
							<path d="M7 9h10M7 12h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
						</svg>
						<span id="coltom-chat-badge" class="coltom-badge" style="display:none">0</span>
					</div>
				`);
				$('body').append(btn);
				btn.on('click', () => this.toggleModal());
			},

			updateBadge(count) {
				const badge = $('#coltom-chat-badge');
				if (count > 0) {
					badge.text(count > 99 ? '99+' : count).show();
				} else {
					badge.hide();
				}
			},

			loadUnreadBadge() {
				frappe.call({
					method: 'coltom.api.chat.get_unread_count',
					callback: (r) => {
						if (r.message !== undefined) this.updateBadge(r.message);
					}
				});
			},

			/* ===== MODAL ===== */
			renderModal() {
				const modal = $(`
					<div id="coltom-chat-modal" style="display:none">
						<div class="coltom-chat-header">
							<span class="coltom-chat-title">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="margin-right:6px">
									<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
								</svg>
								Chat Privé
							</span>
							<div class="coltom-header-actions">
								<button class="coltom-icon-btn coltom-btn-new-msg" title="Nouveau message">
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
										<path d="M19 3H5c-1.1 0-2 .9-2 2v14l4-4h12c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 10H8v-2h4V7h2v4h4v2h-4v4h-2v-4z"/>
									</svg>
								</button>
								<button class="coltom-icon-btn coltom-btn-new-group" title="Nouveau groupe">
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
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
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#c8c8c8" width="48" height="48">
										<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
									</svg>
									<p>Sélectionnez une conversation<br>ou commencez-en une nouvelle</p>
								</div>
								<div class="coltom-messages-area" style="display:none">
									<div class="coltom-conv-header">
										<div class="coltom-conv-info">
											<div class="coltom-conv-avatar" id="coltom-conv-avatar"></div>
											<div>
												<div class="coltom-conv-name" id="coltom-conv-name"></div>
												<div class="coltom-conv-members" id="coltom-conv-members"></div>
											</div>
										</div>
									</div>
									<div class="coltom-messages" id="coltom-messages"></div>
									<div class="coltom-input-area">
										<textarea class="coltom-msg-input" id="coltom-msg-input" placeholder="Écrire un message... (Entrée pour envoyer)" rows="1"></textarea>
										<button class="coltom-send-btn" id="coltom-send-btn">
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
				$('body').append(modal);
				this.bindModalEvents();
			},

			toggleModal() {
				const modal = $('#coltom-chat-modal');
				if (modal.is(':visible')) {
					modal.hide();
					clearInterval(this.pollInterval);
				} else {
					modal.show();
					this.loadChannels();
					this.pollInterval = setInterval(() => this.refreshCurrentChannel(), 5000);
				}
			},

			bindModalEvents() {
				// Fermer
				$('.coltom-btn-close').on('click', () => {
					$('#coltom-chat-modal').hide();
					clearInterval(this.pollInterval);
				});

				// Nouveau message direct
				$('.coltom-btn-new-msg').on('click', () => this.showUserPicker());

				// Nouveau groupe
				$('.coltom-btn-new-group').on('click', () => this.showGroupCreator());

				// Envoyer message
				$('#coltom-send-btn').on('click', () => this.sendMessage());

				$('#coltom-msg-input').on('keydown', (e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						this.sendMessage();
					}
				});

				// Auto-resize textarea
				$('#coltom-msg-input').on('input', function () {
					this.style.height = 'auto';
					this.style.height = Math.min(this.scrollHeight, 100) + 'px';
				});

				// Recherche
				$('.coltom-search-input').on('input', (e) => {
					const q = e.target.value.toLowerCase();
					$('.coltom-channel-item').each(function () {
						const name = $(this).find('.coltom-ch-name').text().toLowerCase();
						$(this).toggle(name.includes(q));
					});
				});
			},

			/* ===== CHANNELS ===== */
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
					const initials = this.getInitials(ch.display_name);
					const avatar = ch.other_user_image
						? `<img src="${ch.other_user_image}" class="coltom-avatar-img">`
						: `<div class="coltom-avatar-fallback ${ch.type === 'Groupe' ? 'coltom-avatar-group' : ''}">${ch.type === 'Groupe' ? '👥' : initials}</div>`;

					const timeStr = ch.last_time ? this.formatTime(ch.last_time) : '';
					const unreadBadge = ch.unread > 0
						? `<span class="coltom-ch-unread">${ch.unread}</span>`
						: '';

					const item = $(`
						<div class="coltom-channel-item ${this.activeChannel === ch.name ? 'active' : ''}" data-id="${ch.name}">
							<div class="coltom-ch-avatar">${avatar}</div>
							<div class="coltom-ch-info">
								<div class="coltom-ch-top">
									<span class="coltom-ch-name">${frappe.utils.escape_html(ch.display_name)}</span>
									<span class="coltom-ch-time">${timeStr}</span>
								</div>
								<div class="coltom-ch-bottom">
									<span class="coltom-ch-preview">${frappe.utils.escape_html(ch.last_message || '')}</span>
									${unreadBadge}
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

				// Mettre en surbrillance
				$('.coltom-channel-item').removeClass('active');
				$(`.coltom-channel-item[data-id="${ch.name}"]`).addClass('active');

				// Afficher la zone messages
				$('.coltom-empty-state').hide();
				$('.coltom-messages-area').show();

				// En-tête conversation
				$('#coltom-conv-name').text(ch.display_name);
				$('#coltom-conv-members').text(
					ch.type === 'Groupe' ? `Groupe · ${ch.members.length} membres` : ''
				);

				// Avatar
				const initials = this.getInitials(ch.display_name);
				if (ch.other_user_image) {
					$('#coltom-conv-avatar').html(`<img src="${ch.other_user_image}" class="coltom-avatar-img">`);
				} else {
					$('#coltom-conv-avatar').html(
						`<div class="coltom-avatar-fallback ${ch.type === 'Groupe' ? 'coltom-avatar-group' : ''}">${ch.type === 'Groupe' ? '👥' : initials}</div>`
					);
				}

				this.loadMessages(ch.name);
				frappe.call({ method: 'coltom.api.chat.mark_as_read', args: { channel: ch.name } });
				ch.unread = 0;
				this.renderChannelList();
				this.loadUnreadBadge();
				$('#coltom-msg-input').focus();
			},

			/* ===== MESSAGES ===== */
			loadMessages(channelId) {
				frappe.call({
					method: 'coltom.api.chat.get_messages',
					args: { channel: channelId, limit: 60 },
					callback: (r) => {
						this.renderMessages(r.message || []);
					}
				});
			},

			refreshCurrentChannel() {
				if (!this.activeChannel || !$('#coltom-chat-modal').is(':visible')) return;
				this.loadMessages(this.activeChannel);
				this.loadChannels();
			},

			renderMessages(messages) {
				const container = $('#coltom-messages');
				const scrolledToBottom = container[0]
					? container[0].scrollHeight - container[0].scrollTop - container[0].clientHeight < 50
					: true;

				container.empty();
				const currentUser = frappe.session.user;
				let lastDate = null;

				messages.forEach(msg => {
					const isMine = msg.sender === currentUser;
					const msgDate = msg.sent_time ? msg.sent_time.substring(0, 10) : '';

					if (msgDate && msgDate !== lastDate) {
						container.append(`<div class="coltom-date-divider"><span>${this.formatDateLabel(msgDate)}</span></div>`);
						lastDate = msgDate;
					}

					const timeStr = msg.sent_time ? this.formatTimeOnly(msg.sent_time) : '';
					const bubble = $(`
						<div class="coltom-msg-wrapper ${isMine ? 'mine' : 'theirs'}">
							${!isMine ? `<div class="coltom-msg-sender">${frappe.utils.escape_html(msg.sender_full_name || msg.sender)}</div>` : ''}
							<div class="coltom-msg-bubble">
								<div class="coltom-msg-text">${this.formatMessageText(msg.message)}</div>
								<div class="coltom-msg-meta">
									<span class="coltom-msg-time">${timeStr}</span>
									${isMine ? `<span class="coltom-msg-status">${msg.is_read ? '✓✓' : '✓'}</span>` : ''}
								</div>
							</div>
						</div>
					`);
					container.append(bubble);
				});

				if (scrolledToBottom || messages.length <= 5) {
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
					args: { channel: this.activeChannel, message: message },
					callback: (r) => {
						if (r.message) {
							this.refreshCurrentChannel();
							this.loadChannels();
						}
					}
				});
			},

			/* ===== REALTIME ===== */
			bindRealtime() {
				frappe.realtime.on('coltom_chat_message', (data) => {
					if (data.channel === this.activeChannel) {
						this.loadMessages(this.activeChannel);
						frappe.call({ method: 'coltom.api.chat.mark_as_read', args: { channel: data.channel } });
					}
					this.loadChannels();
					this.loadUnreadBadge();

					// Notification sonore légère si pas dans le canal actif
					if (data.channel !== this.activeChannel) {
						this.playNotificationSound();
					}
				});

				frappe.realtime.on('coltom_chat_new_channel', () => {
					this.loadChannels();
					this.loadUnreadBadge();
				});
			},

			playNotificationSound() {
				try {
					const AudioCtx = window.AudioContext || window['webkitAudioContext'];
				const ctx = new AudioCtx();
					const osc = ctx.createOscillator();
					const gain = ctx.createGain();
					osc.connect(gain);
					gain.connect(ctx.destination);
					osc.frequency.setValueAtTime(880, ctx.currentTime);
					gain.gain.setValueAtTime(0.1, ctx.currentTime);
					gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
					osc.start(ctx.currentTime);
					osc.stop(ctx.currentTime + 0.3);
				} catch (e) {}
			},

			/* ===== SÉLECTEUR D'UTILISATEUR ===== */
			showUserPicker() {
				frappe.call({
					method: 'coltom.api.chat.get_users',
					callback: (r) => {
						const users = r.message || [];
						const d = new frappe.ui.Dialog({
							title: 'Nouveau message',
							fields: [
								{
									fieldtype: 'HTML',
									fieldname: 'user_list_html',
									label: 'Choisissez un utilisateur'
								}
							]
						});

						let html = '<div class="coltom-user-picker">';
						users.forEach(u => {
							const initials = this.getInitials(u.full_name || u.name);
							const avatar = u.user_image
								? `<img src="${u.user_image}" class="coltom-avatar-img">`
								: `<div class="coltom-avatar-fallback">${initials}</div>`;
							html += `
								<div class="coltom-user-item" data-user="${u.name}">
									<div class="coltom-ch-avatar">${avatar}</div>
									<div class="coltom-user-name">${frappe.utils.escape_html(u.full_name || u.name)}</div>
								</div>`;
						});
						html += '</div>';

						d.fields_dict.user_list_html.$wrapper.html(html);

						d.fields_dict.user_list_html.$wrapper.on('click', '.coltom-user-item', (e) => {
							const targetUser = $(e.currentTarget).data('user');
							d.hide();
							frappe.call({
								method: 'coltom.api.chat.get_or_create_direct_channel',
								args: { other_user: targetUser },
								callback: (r) => {
									if (r.message) {
										this.loadChannels();
										setTimeout(() => {
											const ch = this.channels.find(c => c.name === r.message);
											if (ch) this.openChannel(ch);
											else {
												frappe.call({
													method: 'coltom.api.chat.get_channels',
													callback: (res) => {
														this.channels = res.message || [];
														this.renderChannelList();
														const found = this.channels.find(c => c.name === r.message);
														if (found) this.openChannel(found);
													}
												});
											}
										}, 300);
									}
								}
							});
						});

						d.show();
					}
				});
			},

			/* ===== CRÉATEUR DE GROUPE ===== */
			showGroupCreator() {
				frappe.call({
					method: 'coltom.api.chat.get_users',
					callback: (r) => {
						const users = r.message || [];
						const d = new frappe.ui.Dialog({
							title: 'Nouveau groupe',
							fields: [
								{
									fieldtype: 'Data',
									fieldname: 'group_name',
									label: 'Nom du groupe',
									reqd: 1
								},
								{
									fieldtype: 'HTML',
									fieldname: 'users_html',
									label: 'Sélectionner les membres'
								}
							],
							primary_action_label: 'Créer le groupe',
							primary_action: (values) => {
								const selected = [];
								d.fields_dict.users_html.$wrapper.find('.coltom-user-item.selected').each(function () {
									selected.push($(this).data('user'));
								});
								if (selected.length < 1) {
									frappe.msgprint('Sélectionnez au moins 1 autre membre.');
									return;
								}
								frappe.call({
									method: 'coltom.api.chat.create_group_channel',
									args: { users: selected, group_name: values.group_name },
									callback: (res) => {
										if (res.message) {
											d.hide();
											this.loadChannels();
											setTimeout(() => {
												frappe.call({
													method: 'coltom.api.chat.get_channels',
													callback: (res2) => {
														this.channels = res2.message || [];
														this.renderChannelList();
														const found = this.channels.find(c => c.name === res.message);
														if (found) this.openChannel(found);
													}
												});
											}, 300);
										}
									}
								});
							}
						});

						let html = '<div class="coltom-user-picker coltom-multi-select">';
						users.forEach(u => {
							const initials = this.getInitials(u.full_name || u.name);
							const avatar = u.user_image
								? `<img src="${u.user_image}" class="coltom-avatar-img">`
								: `<div class="coltom-avatar-fallback">${initials}</div>`;
							html += `
								<div class="coltom-user-item" data-user="${u.name}">
									<div class="coltom-ch-avatar">${avatar}</div>
									<div class="coltom-user-name">${frappe.utils.escape_html(u.full_name || u.name)}</div>
									<div class="coltom-check">✓</div>
								</div>`;
						});
						html += '</div>';

						d.fields_dict.users_html.$wrapper.html(html);
						d.fields_dict.users_html.$wrapper.on('click', '.coltom-user-item', function () {
							$(this).toggleClass('selected');
						});

						d.show();
					}
				});
			},

			/* ===== UTILITAIRES ===== */
			getInitials(name) {
				if (!name) return '?';
				return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
			},

			formatTime(datetimeStr) {
				if (!datetimeStr) return '';
				const dt = new Date(datetimeStr.replace(' ', 'T'));
				const now = new Date();
				const diff = now - dt;
				const oneDay = 86400000;
				if (diff < oneDay && dt.getDate() === now.getDate()) {
					return dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
				}
				if (diff < 7 * oneDay) {
					return dt.toLocaleDateString('fr-FR', { weekday: 'short' });
				}
				return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
			},

			formatTimeOnly(datetimeStr) {
				if (!datetimeStr) return '';
				const dt = new Date(datetimeStr.replace(' ', 'T'));
				return dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
			},

			formatDateLabel(dateStr) {
				const dt = new Date(dateStr);
				const now = new Date();
				const diffDays = Math.floor((now - dt) / 86400000);
				if (diffDays === 0) return "Aujourd'hui";
				if (diffDays === 1) return 'Hier';
				return dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
			},

			formatMessageText(text) {
				if (!text) return '';
				return frappe.utils.escape_html(text).replace(/\n/g, '<br>');
			}
		};

		// Lancer le chat
		Chat.init();
	});
})();
