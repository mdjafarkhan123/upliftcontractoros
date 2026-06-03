self.addEventListener('push', (event) => {
	if (!event.data) return;

	let payload;
	try {
		payload = event.data.json();
	} catch {
		return;
	}

	const title = payload.title || 'Notification';
	const options = {
		body: payload.body || '',
		tag: `${payload.type}:${payload.resource_id}`,
		renotify: true,
		requireInteraction: payload.require_interaction === true,
		data: { route: payload.route || '/' }
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const route = event.notification.data?.route || '/';

	event.waitUntil(
		clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((windowClients) => {
				// Focus existing tab if already open
				for (const client of windowClients) {
					if (client.url.includes(self.location.origin) && 'focus' in client) {
						client.navigate(route);
						return client.focus();
					}
				}
				// Otherwise open a new tab
				if (clients.openWindow) {
					return clients.openWindow(route);
				}
			})
	);
});
