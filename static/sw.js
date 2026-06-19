const CACHE_NAME = 'cos-assets-v1';

// On install: activate immediately without waiting for old tabs to close.
self.addEventListener('install', () => {
	self.skipWaiting();
});

// On activate: delete any old cache versions, then claim all open tabs.
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
			)
			.then(() => self.clients.claim())
	);
});

// Fetch: cache-first for SvelteKit's hashed immutable assets, network for everything else.
// These assets carry a content hash in their filename, so they are safe to cache forever —
// a new deploy produces new filenames, and the activate handler purges old cache versions.
self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	if (event.request.method !== 'GET' || !url.pathname.startsWith('/_app/immutable/')) {
		return; // fall through to network
	}

	event.respondWith(
		caches.open(CACHE_NAME).then(async (cache) => {
			const cached = await cache.match(event.request);
			if (cached) return cached;
			const response = await fetch(event.request);
			if (response.ok) {
				cache.put(event.request, response.clone());
			}
			return response;
		})
	);
});

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
