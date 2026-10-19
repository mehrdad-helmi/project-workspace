async (page) => {
	const results = [];
	const endpoint = /http:\/\/(?:localhost|127\.0\.0\.1):3000\/v1\/fabrication-batches\/batch-1\/assignments$/;
	for (const outcome of ['success', 'failure']) {
		await page.evaluate(() => ng.getComponent(document.querySelector('planicam-fabrication-batch')).router.navigate(['/hub/fabrication-batches/batch-1']));
		await page.getByRole('heading', { name: 'Batch 001', exact: true }).waitFor();
		let release;
		let started;
		const pending = new Promise((resolve) => started = resolve);
		const gate = new Promise((resolve) => release = resolve);
		const handler = async (route) => {
			if (route.request().method() !== 'POST') return route.fallback();
			started();
			await gate;
			await route.fulfill({ status: outcome === 'success' ? 200 : 409, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(outcome === 'success' ? { statusCode: 200, message: 'Fixture', data: { id: 'batch-1', version: 3, assigned: [], skipped: [] } } : { statusCode: 409, message: 'Old Batch fixture conflict' }) });
		};
		await page.route(endpoint, handler);
		try {
			await page.getByRole('button', { name: 'Add project elements', exact: true }).click();
			const dialog = page.getByRole('dialog', { name: 'Add project elements', exact: true });
			await dialog.getByRole('combobox', { name: 'Project', exact: true }).click();
			await page.getByRole('option', { name: 'PR-001 · Fixture Project', exact: true }).click();
			await dialog.getByRole('button', { name: 'Add elements', exact: true }).click();
			await page.getByRole('alertdialog').filter({ hasText: 'Only active, included, unassigned elements are added. Future elements are not added automatically.' }).getByRole('button', { name: 'Confirm', exact: true }).click();
			await pending;
			// Harness uses the actual Angular Router to exercise parameter reuse while the real UI mutation waits.
			await page.evaluate(() => ng.getComponent(document.querySelector('planicam-fabrication-batch')).router.navigate(['/hub/fabrication-batches/batch-2']));
			await page.getByRole('heading', { name: 'Batch 002', exact: true }).waitFor();
			await dialog.waitFor({ state: 'hidden' });
			release();
			await page.waitForFunction(() => !ng.getComponent(document.querySelector('planicam-fabrication-batch')).store.saving());
			const state = await page.evaluate(() => {
				const component = ng.getComponent(document.querySelector('planicam-fabrication-batch'));
				return { selected: component.store.selectedId(), batch: component.batch()?.id, error: component.store.error(), message: component.assignmentMessage() };
			});
			if (state.selected !== 'batch-2' || state.batch !== 'batch-2' || state.error || state.message) throw new Error(`Stale ${outcome} altered Batch B: ${JSON.stringify(state)}`);
			results.push({ outcome, ...state, dialogHiddenWhilePending: true });
		} finally {
			release();
			await page.unroute(endpoint, handler);
		}
	}
	return { results, note: 'API-intercepted fixture; actual UI submission and Router parameter reuse, no store state injection or personal data.' };
}
