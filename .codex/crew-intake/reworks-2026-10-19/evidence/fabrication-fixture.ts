async (page) => {
	// Isolated browser-only fixtures: every API request is intercepted; no user data is read or written.
	const now = '2026-10-19T10:00:00.000Z';
	const future = '2099-01-01T00:00:00.000Z';
	const userId = '10000000-0000-4000-8000-000000000001';
	const organizationId = '10000000-0000-4000-8000-000000000002';
	const projectId = '10000000-0000-4000-8000-000000000003';
	const batches = Array.from({ length: 125 }, (_, index) => ({ id: `batch-${index + 1}`, version: 1, name: `Batch ${String(index + 1).padStart(3, '0')}`, number: `FB-${String(index + 1).padStart(3, '0')}`, status: 'PLANNING', responsiblePerson: 'Fixture coordinator', description: 'Isolated verification batch', deploymentDate: null, archivedAt: null, createdAt: now, updatedAt: now, elementCount: index === 0 ? 105 : 0 }));
	let elements = Array.from({ length: 105 }, (_, index) => ({ id: `element-${index + 1}`, version: 1, number: `EL-${String(index + 1).padStart(3, '0')}`, positionId: `position-${index + 1}`, description: `Physical instance ${index + 1}`, buildingLocation: `Level ${index % 4 + 1}`, isExcluded: false, position: { id: `position-${index + 1}`, name: `Window ${index + 1}`, number: `P-${index + 1}`, archivedAt: null, deletedAt: null, project: { id: projectId, name: 'Fixture Project', archivedAt: null, deletedAt: null } } }));
	const options = { fabricationBatchStatuses: [{ value: 'PLANNING', label: 'Planning' }, { value: 'IN_PROGRESS', label: 'In progress' }], positionTypes: [{ value: 'WINDOW', label: 'Window' }] };
	const envelope = (data) => ({ statusCode: 200, message: 'Fixture response', data });
	const slice = (values, url) => { const pageNumber = Number(url.searchParams.get('page') || 1); const pageSize = Number(url.searchParams.get('pageSize') || 25); return { items: values.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), total: values.length, page: pageNumber, pageSize }; };
	const requestLog = [];
	await page.route(/http:\/\/(?:localhost|127\.0\.0\.1):3000\/v1\//, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const path = url.pathname.replace('/v1/', '');
		const method = request.method();
		requestLog.push({ path, method });
		const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
		if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
		let data;
		if (path === 'users/me') data = { user: { id: userId, email: 'fixture@example.invalid', status: 'ACTIVE', emailVerifiedAt: now, lastLoginAt: now, passwordChangedAt: null, createdAt: now, updatedAt: now }, profile: null, organization: { id: organizationId, name: 'Isolated QA', organizationIdentifier: 'isolated-qa', legalName: null, slug: 'isolated-qa', status: 'ACTIVE', logoAssetId: null, website: null, primaryEmail: null, primaryPhone: null, registrationNumber: null, taxNumber: null, countryCode: null, createdAt: now, updatedAt: now }, membership: { id: 'fixture-membership', role: 'OWNER', status: 'ACTIVE', jobTitle: null, department: null, employeeNumber: null, workEmail: null, workPhone: null, joinedAt: now, createdAt: now, updatedAt: now } };
		else if (path === 'hub/options') data = options;
		else if (path === 'project-folders') data = [];
		else if (path === 'projects/statistics') data = { active: 1, archived: 0, favorites: 0, root: 1, folders: {} };
		else if (path === 'system-profiles' || path === 'currencies' || path === 'printout-types' || path === 'suppliers' || path === 'discount-groups' || path === 'organization/vat-rates' || path === 'organization/estimation-data-sets') data = [];
		else if (path === 'fabrication-batches' && method === 'GET') {
			let values = batches.filter((batch) => url.searchParams.get('archive') === 'archived' ? !!batch.archivedAt : !batch.archivedAt);
			const query = (url.searchParams.get('q') || '').toLowerCase();
			if (query) values = values.filter((batch) => batch.name.toLowerCase().includes(query) || batch.number.toLowerCase().includes(query));
			data = slice(values, url);
		} else if (/^fabrication-batches\/[^/]+$/.test(path) && method === 'GET') {
			const batch = batches.find((entry) => entry.id === path.split('/')[1]);
			data = { ...batch, elements: batch.id === 'batch-1' ? elements : [] };
		} else if (/^fabrication-batches\/[^/]+\/archive$/.test(path) && method === 'PUT') {
			const batch = batches.find((entry) => entry.id === path.split('/')[1]);
			batch.archivedAt = request.postDataJSON().archived ? now : null;
			batch.version++;
			data = batch;
		} else if (/^fabrication-batches\/[^/]+\/assignments\/[^/]+$/.test(path) && method === 'DELETE') {
			const elementId = path.split('/')[3];
			elements = elements.filter((element) => element.id !== elementId);
			batches[0].version++;
			batches[0].elementCount = elements.length;
			data = { ...batches[0], elements };
		} else if (path === 'projects' && method === 'GET') data = slice([{ id: projectId, version: 1, name: 'Fixture Project', number: 'PR-001', positionPrefix: 'QA', customerId: 'fixture-customer', archivedAt: null, deletedAt: null, createdAt: now, updatedAt: now, customer: { id: 'fixture-customer', name: 'Fixture Customer', number: 'C001' }, positionCount: 105, phaseCount: 0, elementCount: 105, effectiveElementCount: 105, warningCount: 0, isFavorite: false }], url);
		else if (/^fabrication-batches\/[^/]+\/assignments$/.test(path) && method === 'POST') data = { id: path.split('/')[1], version: 2, assigned: [], skipped: [{ id: 'already-assigned', reason: 'ASSIGNED' }] };
		else return route.fulfill({ status: 501, headers, contentType: 'application/json', body: JSON.stringify({ statusCode: 501, message: `Unhandled isolated fixture ${method} ${path}` }) });
		return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(envelope(data)) });
	});
	await page.addInitScript(({ userId, organizationId, future }) => { sessionStorage.setItem('planicam.auth.session', JSON.stringify({ version: 2, session: { tokenType: 'Bearer', accessToken: 'isolated-fixture-token', refreshToken: 'isolated-fixture-refresh', identity: { userId, organizationId }, session: { id: 'isolated-fixture-session', rememberMe: false, accessTokenExpiresAt: future, idleExpiresAt: future, absoluteExpiresAt: future } } })); }, { userId, organizationId, future });
	await page.setViewportSize({ width: 1600, height: 1000 });
	await page.goto('http://localhost:4300/hub/fabrication-batches');
	await page.waitForLoadState('networkidle');
	return { url: page.url(), title: await page.title(), requests: requestLog, note: 'All API traffic intercepted in fresh browser session; no real account or database access.' };
}

