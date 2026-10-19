import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	signal,
	viewChild,
	ElementRef,
} from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { DateTime } from 'luxon';
import { Router, RouterLink } from '@angular/router';
import {
	ProjectsStore,
	PositionsStore,
	type Project,
	type ProjectFolder,
} from '@planicam/project-management/state';
import { Button } from '@planicam/shared/ui/button';
import { Icon } from '@planicam/shared/ui/icons';
import { IconInputField } from '@planicam/shared/ui/icon-input-field';
import { InputField } from '@planicam/shared/ui/input-field';
import {
	ActionMenu,
	type ActionMenuItem,
} from '@planicam/shared/ui/action-menu';
import {
	DataTable,
	type DataTableColumn,
	type DataTableEdit,
	type DataTableRow,
	type DataTableSort,
} from '@planicam/shared/ui/data-table';
import { Tabs } from '@planicam/shared/ui/tabs';
import {
	WorkspaceHeader,
	WorkspaceLayout,
} from '@planicam/shared/ui/workspace-layout';
import { ProjectForm } from '../../components/project-form/project-form.component';
import { ProjectAttachments } from '../../components/project-attachments/project-attachments.component';
import { BatchAssignment } from '../../components/batch-assignment/batch-assignment.component';
@Component({
	selector: 'planicam-project-management-entry',
	imports: [
		Button,
		Icon,
		IconInputField,
		InputField,
		FormField,
		ActionMenu,
		DataTable,
		Tabs,
		WorkspaceHeader,
		WorkspaceLayout,
		ProjectForm,
		ProjectAttachments,
		BatchAssignment,
		RouterLink,
	],
	providers: [ProjectsStore, PositionsStore],
	templateUrl: './project-management.page.html',
	styleUrl: './project-management.page.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectManagementPage {
	readonly store = inject(ProjectsStore);
	readonly preview = inject(PositionsStore);
	private readonly router = inject(Router);
	readonly projectForm = viewChild.required(ProjectForm);
	readonly batchAssignment = viewChild.required(BatchAssignment);
	private readonly folderDialog =
		viewChild.required<ElementRef<HTMLDialogElement>>('folderDialog');
	readonly activeFilter = signal('all');
	readonly selectedProjectId = this.store.selectedId;
	readonly propertiesTab = signal<string | number>('detail');
	readonly page = signal(1);
	readonly sort = signal<DataTableSort>({
		field: 'updatedAt',
		direction: 'desc',
	});
	private readonly searchModel = signal({ query: '' });
	readonly searchForm = form(this.searchModel);
	readonly folderModel = signal({ name: '', parentId: '' });
	readonly folderFields = form(this.folderModel, (p) => required(p.name));
	readonly editingFolder = signal<ProjectFolder | null>(null);
	readonly filters = [
		{ id: 'all', label: 'All Projects', icon: 'allProjects', count: true },
		{ id: 'recent', label: 'Recent', icon: 'recentProjects', count: null },
		{
			id: 'favorites',
			label: 'Favorites',
			icon: 'favoriteProjects',
			count: true,
		},
		{
			id: 'archived',
			label: 'Archived',
			icon: 'archivedProjects',
			count: true,
		},
	] as const;
	readonly presentation = { filters: this.filters };
	readonly recentFolders = signal(false);
	readonly folders = computed(() =>
		this.recentFolders()
			? [...this.store.folders()]
					.sort(
						(a, b) =>
							b.updatedAt.localeCompare(a.updatedAt) ||
							a.id.localeCompare(b.id),
					)
					.slice(0, 5)
			: this.store.folders(),
	);
	readonly query = computed(() => {
		const filter = this.activeFilter();
		return {
			q: this.searchModel().query,
			page: this.page(),
			pageSize: 25,
			archive:
				filter === 'archived' ? ('archived' as const) : ('active' as const),
			favoritesOnly: filter === 'favorites',
			...(filter === 'root'
				? { folderId: 'root' }
				: filter.startsWith('folder:')
					? { folderId: filter.slice(7) }
					: {}),
			sortBy: filter === 'recent' ? 'updatedAt' : this.sort().field,
			sortDirection:
				filter === 'recent' ? ('desc' as const) : this.sort().direction,
		};
	});
	readonly projects = computed(() =>
		this.store.items().map((p) => this.present(p)),
	);
	readonly projectById = computed(
		() => new Map(this.projects().map((p) => [p.id, p])),
	);
	readonly selectedProject = computed(() => {
		const p = this.store.selected();
		return p ? this.present(p) : null;
	});
	readonly filteredProjects = this.projects;
	readonly rows = computed<readonly DataTableRow[]>(() =>
		this.projects().map((p) => ({
			id: p.id,
			links: { name: ['/hub/projects', p.id, 'positions'] },
			cells: {
				number: p.number,
				location: p.location,
				name: p.name,
				customer: p.customer,
				positions: p.positions,
				phases: p.phases,
				warnings: p.warnings,
				updatedAt: p.updatedAt,
			},
		})),
	);
	readonly columns: readonly DataTableColumn[] = [
		{ key: 'number', label: 'Number' },
		{ key: 'name', label: 'Project Name', editable: true },
		{ key: 'customer', label: 'Customer', sortable: false },
		{ key: 'location', label: 'Location', sortable: false },
		{ key: 'positions', label: 'Positions', sortable: false },
		{ key: 'phases', label: 'Phases', sortable: false },
		{ key: 'warnings', label: 'Warning', sortable: false },
		{ key: 'updatedAt', label: 'Last Update' },
	];
	readonly tabs = [
		{ id: 'detail', label: 'Detail' },
		{ id: 'positions', label: 'Positions' },
		{ id: 'attachment', label: 'Attachment' },
	];
	readonly menus = computed(
		() => new Map(this.store.items().map((p) => [p.id, this.buildMenu(p)])),
	);
	readonly details = computed(() => {
		const p = this.selectedProject();
		return p
			? [
					{ label: 'Customer', value: p.customer },
					{ label: 'Location', value: p.location },
					{ label: 'Project Number', value: p.jobNumber },
					{ label: 'Person in Charge', value: p.personInCharge },
					{ label: 'Phases', value: p.phases },
					{ label: 'Positions', value: p.positions },
					{ label: 'Elements', value: p.elementCount },
					{ label: 'Included Elements', value: p.effectiveElementCount },
					{ label: 'Warnings/errors', value: p.warningCount, warning: true },
				]
			: [];
	});
	readonly lastUpdated = computed(
		() => this.selectedProject()?.updatedLabel ?? '',
	);
	constructor() {
		this.store.load(this.query);
		effect(() => {
			const project = this.store.selected();
			if (project)
				this.preview.load({
					projectId: project.id,
					query: {
						page: 1,
						pageSize: 5,
						sortBy: 'updatedAt',
						sortDirection: 'desc',
					},
				});
		});
	}
	print(): void {
		const project = this.store.selected();
		if (project)
			void this.router.navigate(['/hub/printouts'], {
				queryParams: { inputType: 'PROJECT', inputId: project.id },
			});
	}
	openPreferences(): void {
		const project = this.store.selected();
		if (project)
			void this.router.navigate(['/hub/projects', project.id, 'positions'], {
				queryParams: { tab: 'preferences' },
			});
	}
	private present(p: Project) {
		return {
			...p,
			customer: p.customer.name,
			positions: p.positionCount,
			phases: p.phaseCount,
			warnings: p.warningCount,
			updatedLabel: DateTime.fromISO(p.updatedAt).toLocaleString(
				DateTime.DATETIME_MED,
			),
			favorite: p.isFavorite,
			archived: !!p.archivedAt,
			location: [p.city, p.country].filter(Boolean).join(', '),
			quotationNumber: p.number,
			personInCharge: p.responsiblePerson ?? '–',
			jobNumber: p.number,
			description: p.conditions ?? '',
			attachments: [] as readonly string[],
		};
	}
	filterCount(id: string) {
		const stats = this.store.statistics();
		return stats
			? id === 'favorites'
				? stats.favorites
				: id === 'archived'
					? stats.archived
					: stats.active
			: '–';
	}
	folderCount(id: string | null) {
		const stats = this.store.statistics();
		return stats ? (id ? (stats.folders[id] ?? 0) : stats.root) : '–';
	}
	changeSort(sort: DataTableSort): void {
		if (this.activeFilter() === 'recent') this.activeFilter.set('all');
		this.sort.set(sort);
		this.page.set(1);
	}
	previousPage(): void {
		this.page.update((page) => Math.max(1, page - 1));
	}
	nextPage(): void {
		this.page.update((page) => page + 1);
	}
	selectFilter(id: string) {
		this.activeFilter.set(id);
		this.page.set(1);
		this.store.select(null);
		this.propertiesTab.set('detail');
	}
	selectProject(id: string | null) {
		this.store.select(id);
		this.propertiesTab.set('detail');
	}
	renameProject(edit: DataTableEdit) {
		const project = this.store.items().find((p) => p.id === edit.rowId);
		if (
			project &&
			!project.archivedAt &&
			edit.column === 'name' &&
			edit.value.trim()
		)
			this.store.updateAction({ project, input: { name: edit.value.trim() } });
	}
	openProjectForm(id?: string) {
		this.projectForm().open(
			id ? (this.store.items().find((p) => p.id === id) ?? null) : null,
			this.activeFilter().startsWith('folder:')
				? this.activeFilter().slice(7)
				: '',
		);
	}
	folderForm(folder: ProjectFolder | null = null) {
		this.editingFolder.set(folder);
		this.folderModel.set({
			name: folder?.name ?? '',
			parentId: folder?.parentId ?? '',
		});
		this.folderDialog().nativeElement.showModal();
	}
	closeFolder() {
		this.folderDialog().nativeElement.close();
	}
	saveFolder(event: Event) {
		event.preventDefault();
		void submit(this.folderFields, async () => {
			const value = this.folderModel();
			const editing = this.editingFolder();
			const result = await firstValueFrom(
				editing
					? this.store.updateFolder(
							editing.id,
							editing.version,
							value.name,
							value.parentId || null,
						)
					: this.store.createFolder(value.name, value.parentId || null),
			);
			if (result.kind === 'success') this.closeFolder();
		});
	}
	action(id: string, action: string) {
		const project = this.store.items().find((p) => p.id === id);
		if (!project) return;
		if (action === 'favorite') this.store.favorite(project);
		else if (action === 'archive') this.store.archive(project);
		else if (action === 'headers') this.projectForm().open(project);
		else if (action === 'batch')
			this.batchAssignment().open({
				label: project.name,
				projectId: project.id,
			});
		else if (action === 'print') {
			this.store.select(project.id);
			void this.router.navigate(['/hub/printouts'], {
				queryParams: { inputType: 'PROJECT', inputId: project.id },
			});
		} else if (action.startsWith('move:'))
			this.store.updateAction({
				project,
				input: { folderId: action.slice(5) || null },
			});
	}
	private buildMenu(p: Project): readonly ActionMenuItem[] {
		const link = ['/hub/projects', p.id, 'positions'];
		const menu: readonly ActionMenuItem[] = [
			{ id: 'open', label: 'Open', icon: 'projects', link },
			{
				id: 'open-tab',
				label: 'Open in new tab',
				icon: 'openInNewTab',
				link,
				target: '_blank',
			},
			...(!p.archivedAt
				? [
						{
							id: 'batch',
							label: 'Add to fabrication batch',
							icon: 'fabricationBatch' as const,
						},
						{
							id: 'headers',
							label: 'Edit headers',
							icon: 'editHeaders' as const,
							separatorBefore: true,
						},
						{
							id: 'preferences',
							label: 'Project Preference',
							icon: 'projectPreferences' as const,
							link: ['/hub/projects', p.id, 'positions'],
							queryParams: { tab: 'preferences' },
						},
					]
				: []),
			{ id: 'print', label: 'Printout', icon: 'printout' },
			{
				id: 'move',
				label: 'Move to folder',
				icon: 'folder',
				items: [
					{ id: 'move:', label: 'No folder', icon: 'folder' },
					...this.store.folders().map((f) => ({
						id: 'move:' + f.id,
						label: f.name,
						icon: 'folder' as const,
					})),
				],
			},
			{
				id: 'favorite',
				label: p.isFavorite ? 'Remove from favorites' : 'Favorite',
				icon: 'favoriteProjects',
				separatorBefore: true,
			},
			{
				id: 'archive',
				label: p.archivedAt ? 'Restore' : 'Archive',
				icon: 'archivedProjects',
				destructive: !p.archivedAt,
				separatorBefore: true,
			},
		];
		return menu.filter((item) => !p.archivedAt || item.id !== 'move');
	}
}
