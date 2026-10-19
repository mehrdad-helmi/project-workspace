import type { NavigationGroup } from '@planicam/shared/ui/navigation-layout';

export const HUB_NAVIGATION = [
	{
		id: 'work',
		label: 'Projects and fabrication',
		placement: 'top',
		items: [
			{
				id: 'projects',
				label: 'Projects',
				icon: 'projects',
				link: '/hub/projects',
			},
			{
				id: 'fabrication-batches',
				label: 'Fabrication Batches',
				icon: 'fabricationBatch',
				link: '/hub/fabrication-batches',
			},
		],
	},
	{
		id: 'defaults',
		label: 'Organization defaults',
		placement: 'top',
		items: [
			{
				id: 'preferences',
				label: 'Preferences',
				icon: 'projectPreferences',
				link: '/hub/preferences',
			},
			{
				id: 'estimation-settings',
				label: 'Estimation Settings',
				icon: 'estimation',
				link: '/hub/estimation-settings',
			},
		],
	},
	{
		id: 'catalogs',
		label: 'Catalogs',
		placement: 'top',
		items: [
			{
				id: 'supplier-catalogs',
				label: 'Supplier Catalogs',
				icon: 'database',
				link: '/hub/database',
			},
			{
				id: 'organization-catalog',
				label: 'Organization Catalog',
				icon: 'userDatabase',
				link: '/hub/organization-catalog',
				disabled: true,
			},
		],
	},
	{
		id: 'libraries',
		label: 'Libraries and contacts',
		placement: 'top',
		items: [
			{
				id: 'position-library',
				label: 'Position Library',
				icon: 'positionTemplates',
				link: '/hub/position-library',
				disabled: true,
			},
			{
				id: 'contacts',
				label: 'Contacts',
				icon: 'profile',
				link: '/hub/contacts',
			},
		],
	},
] as const satisfies readonly NavigationGroup[];
