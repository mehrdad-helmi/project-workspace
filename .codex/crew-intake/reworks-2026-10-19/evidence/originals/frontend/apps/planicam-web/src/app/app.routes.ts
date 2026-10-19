import { Route } from '@angular/router';
import { computed, inject } from '@angular/core';
import { authGuard } from '@planicam/auth/state/session';
import { CurrentUserStore } from '@planicam/users/state';
import type { HubSessionPresentation } from '@planicam/hub/shell';

function sessionPresentation(): HubSessionPresentation {
	const currentUser = inject(CurrentUserStore);
	return {
		userName: currentUser.displayName,
		isLoading: currentUser.isLoading,
		profileUnavailable: computed(() => currentUser.status() === 'error'),
		membershipRole: computed(() => {
			const role = currentUser.membership()?.role;
			return role ? role.charAt(0) + role.slice(1).toLowerCase() : '';
		}),
		organizationName: computed(() => currentUser.organization()?.name ?? ''),
	};
}

export const appRoutes: Route[] = [
	{
		path: '',
		pathMatch: 'full',
		redirectTo: 'hub',
	},
	{
		path: 'auth',
		loadChildren: () =>
			import('@planicam/auth/feature').then((module) => module.AUTH_ROUTES),
	},
	{
		path: 'hub',
		canActivate: [authGuard],
		loadChildren: () =>
			import('@planicam/hub/shell').then((module): Route[] => [
				{
					path: '',
					component: module.HubShell,
					providers: [
						{
							provide: module.HUB_SESSION_PRESENTATION,
							useFactory: sessionPresentation,
						},
					],
					children: [
						{
							path: 'preferences',
							data: { breadcrumb: 'Preferences', area: 'preferences' },
							loadComponent: () =>
								import('@planicam/hub/feature').then(
									(feature) => feature.OrganizationSettingsPage,
								),
						},
						{
							path: 'estimation-settings',
							data: { breadcrumb: 'Estimation Settings', area: 'estimation' },
							loadComponent: () =>
								import('@planicam/hub/feature').then(
									(feature) => feature.OrganizationSettingsPage,
								),
						},
						{
							path: 'printouts',
							data: { breadcrumb: 'Printout selection' },
							loadComponent: () =>
								import('@planicam/hub/feature').then(
									(feature) => feature.PrintoutsPage,
								),
						},
						{
							path: 'contacts',
							data: { breadcrumb: 'Contacts' },
							loadComponent: () =>
								import('@planicam/contacts/feature').then(
									(feature) => feature.ContactsPage,
								),
						},
						{
							path: 'fabrication-batches',
							data: { breadcrumb: 'Fabrication Batches' },
							loadComponent: () =>
								import('@planicam/fabrication/feature').then(
									(feature) => feature.FabricationPage,
								),
						},
						{
							path: '',
							pathMatch: 'full',
							redirectTo: 'projects',
						},
						{
							path: 'projects',
							data: { breadcrumb: 'Projects' },
							loadChildren: () =>
								import('@planicam/project-management/feature').then(
									(module) => module.PROJECT_MANAGEMENT_ROUTES,
								),
						},
						{
							path: 'database',
							data: { breadcrumb: 'Database Browser' },
							loadChildren: () =>
								import('@planicam/database-browser/feature').then(
									(module) => module.DATABASE_BROWSER_ROUTES,
								),
						},
					],
				},
			]),
	},
	{
		path: 'positions/:positionId/editor',
		canActivate: [authGuard],
		loadChildren: () =>
			import('@planicam/hub/shell').then((module): Route[] => [
				{
					path: '',
					component: module.EditorShell,
					providers: [
						{
							provide: module.HUB_SESSION_PRESENTATION,
							useFactory: sessionPresentation,
						},
					],
					children: [
						{
							path: '',
							loadChildren: () =>
								import('@planicam/position-editor/feature').then(
									(editor): Route[] => [
										{
											path: '',
											component: editor.PositionEditorPage,
											canDeactivate: [editor.editorUnsavedChangesGuard],
										},
									],
								),
						},
					],
				},
			]),
	},
	{
		path: '**',
		redirectTo: 'hub',
	},
];
