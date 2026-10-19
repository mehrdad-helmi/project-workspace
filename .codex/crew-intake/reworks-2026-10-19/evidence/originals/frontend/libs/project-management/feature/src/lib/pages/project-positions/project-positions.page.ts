import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	linkedSignal,
	signal,
	viewChild,
	ElementRef,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
	form,
	FormField,
	required,
	min,
	max,
	submit,
} from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DateTime } from 'luxon';
import {
	PositionsStore,
	ProjectsStore,
	type Position,
	type PositionElement,
	type ProjectPhase,
} from '@planicam/project-management/state';
import { HubCatalogStore } from '@planicam/hub/state';
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
import { WorkspaceLayout } from '@planicam/shared/ui/workspace-layout';
import { PositionCard } from '../../components/position-card/position-card.component';
import { PositionForm } from '../../components/position-form/position-form.component';
import { ProjectForm } from '../../components/project-form/project-form.component';
import { ProjectConfiguration } from '../../components/project-configuration/project-configuration.component';
import { ProjectAttachments } from '../../components/project-attachments/project-attachments.component';
import { BatchAssignment } from '../../components/batch-assignment/batch-assignment.component';
import { presentPosition } from '../../models/position-presentation.model';
@Component({
	selector: 'planicam-project-positions-entry',
	imports: [
		RouterLink,
		Button,
		Icon,
		IconInputField,
		InputField,
		FormField,
		DataTable,
		Tabs,
		ActionMenu,
		WorkspaceLayout,
		PositionCard,
		PositionForm,
		ProjectForm,
		ProjectConfiguration,
		ProjectAttachments,
		BatchAssignment,
	],
	providers: [PositionsStore, ProjectsStore, HubCatalogStore],
	changeDetection: ChangeDetectionStrategy.OnPush,
	templateUrl: './project-positions.page.html',
	styleUrl: './project-positions.page.scss',
})
export class ProjectPositionsPage {
	readonly store = inject(PositionsStore);
	readonly projectStore = inject(ProjectsStore);
	readonly catalog = inject(HubCatalogStore);
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly parameters = toSignal(this.route.paramMap, {
		initialValue: this.route.snapshot.paramMap,
	});
	private readonly queryParameters = toSignal(this.route.queryParamMap, {
		initialValue: this.route.snapshot.queryParamMap,
	});
	readonly projectId = computed(() => this.parameters().get('projectId') ?? '');
	readonly positionForm = viewChild.required(PositionForm);
	readonly projectForm = viewChild.required(ProjectForm);
	readonly batchAssignment = viewChild.required(BatchAssignment);
	readonly thumbnailDialog =
		viewChild.required<ElementRef<HTMLDialogElement>>('thumbnailDialog');
	readonly thumbnailSide = signal<'Exterior' | 'Interior'>('Exterior');
	readonly sort = signal<DataTableSort>({
		field: 'updatedAt',
		direction: 'desc',
	});
	readonly sortModel = signal({ order: 'updatedAt:desc' });
	readonly sortForm = form(this.sortModel);
	readonly detailDialog =
		viewChild.required<ElementRef<HTMLDialogElement>>('detailDialog');
	readonly phaseDialog =
		viewChild.required<ElementRef<HTMLDialogElement>>('phaseDialog');
	readonly editingPhase = signal<ProjectPhase | null>(null);
	readonly phaseModel = signal({ name: '', description: '', sortOrder: 0 });
	readonly phaseFields = form(this.phaseModel, (p) => required(p.name));
	readonly detailMode = signal<'quantity' | 'element' | 'remove'>('quantity');
	readonly editingPosition = signal<Position | null>(null);
	readonly editingElement = signal<PositionElement | null>(null);
	readonly detailModel = signal({
		quantity: 1,
		description: '',
		buildingLocation: '',
	});
	readonly detailFields = form(this.detailModel, (p) => {
		min(p.quantity, 0);
		max(p.quantity, 10000);
	});
	readonly project = computed(() => {
		const p = this.store.project();
		return p
			? {
					...p,
					customer: p.customer.name,
					location: [p.city, p.country].filter(Boolean).join(', '),
					jobNumber: p.number,
					personInCharge: p.responsiblePerson ?? '–',
					updatedLabel: DateTime.fromISO(p.updatedAt).toLocaleString(
						DateTime.DATETIME_MED,
					),
				}
			: null;
	});
	readonly presentation = {
		tabs: [
			{ id: 'positions', label: 'Positions', sections: [] },
			{
				id: 'preferences',
				label: 'Project Preferences',
				sections: ['System', 'Colors', 'Fillings', 'Other'],
			},
			{
				id: 'estimation',
				label: 'Estimation Settings',
				sections: [
					'Basic',
					'Allocated Costs',
					'Discount/Factors',
					'Special Prices',
				],
			},
			{ id: 'attachments', label: 'Attachments', sections: [] },
		],
		propertyTabs: [
			{ id: 'info', label: 'Info' },
			{ id: 'elements', label: 'Elements' },
			{ id: 'history', label: 'History' },
		],
	};
	readonly activeTab = linkedSignal<string | number>(() => {
		this.projectId();
		const tab = this.queryParameters().get('tab');
		return this.presentation.tabs.some((value) => value.id === tab)
			? (tab ?? 'positions')
			: 'positions';
	});
	readonly activeFilter = linkedSignal(() => {
		this.projectId();
		return 'all';
	});
	readonly view = linkedSignal<'table' | 'card' | 'grid'>(() => {
		this.projectId();
		return 'table';
	});
	readonly page = linkedSignal(() => {
		this.projectId();
		return 1;
	});
	private readonly searchModel = linkedSignal(() => {
		this.projectId();
		return { query: '' };
	});
	readonly searchForm = form(this.searchModel);
	readonly currentTab = computed(
		() =>
			this.presentation.tabs.find((t) => t.id === this.activeTab()) ??
			this.presentation.tabs[0],
	);
	changeTab(tab: string | number): void {
		this.activeTab.set(tab);
		void this.router.navigate([], {
			relativeTo: this.route,
			queryParams: { tab },
			queryParamsHandling: 'merge',
			replaceUrl: true,
		});
	}
	readonly section = linkedSignal(() => this.currentTab().sections[0] ?? '');
	readonly showSidebar = computed(
		() =>
			this.activeTab() === 'positions' || this.currentTab().sections.length > 0,
	);
	readonly query = computed(() => {
		const filter = this.activeFilter();
		return {
			projectId: this.projectId(),
			query: {
				q: this.searchModel().query,
				page: this.page(),
				pageSize: 25,
				archive:
					filter === 'archived' ? ('archived' as const) : ('active' as const),
				favoritesOnly: filter === 'favorites',
				...(!['all', 'recent', 'favorites', 'archived'].includes(filter)
					? { phaseId: filter }
					: {}),
				sortBy: filter === 'recent' ? 'updatedAt' : this.sort().field,
				sortDirection:
					filter === 'recent' ? ('desc' as const) : this.sort().direction,
			},
		};
	});
	readonly positions = computed(() =>
		this.store
			.items()
			.map((p) =>
				presentPosition(
					p,
					this.label('positionTypes', p.type),
					this.label('positionCalculationStatuses', p.calculationStatus),
				),
			),
	);
	readonly activePositions = this.positions;
	readonly filteredPositions = this.positions;
	readonly positionFilters = [
		{ id: 'all', label: 'All Positions', icon: 'allProjects', count: null },
		{ id: 'recent', label: 'Recent', icon: 'recentProjects', count: null },
		{
			id: 'favorites',
			label: 'Favorites',
			icon: 'favoriteProjects',
			count: null,
		},
		{
			id: 'archived',
			label: 'Archived',
			icon: 'archivedProjects',
			count: null,
		},
	] as const;
	readonly selectedPositionId = computed(
		() => this.store.selected()?.id ?? null,
	);
	readonly selectedPosition = computed(() => {
		const p = this.store.selected();
		return p
			? presentPosition(
					p,
					this.label('positionTypes', p.type),
					this.label('positionCalculationStatuses', p.calculationStatus),
				)
			: null;
	});
	readonly selectedEditorLink = computed(() => {
		const position = this.store.selected();
		return position ? ['/positions', position.id, 'editor'] : undefined;
	});
	readonly propertiesTab = linkedSignal({
		source: () => ({
			projectId: this.projectId(),
			positionId: this.store.selected()?.id,
		}),
		computation: (): string | number => 'info',
	});
	readonly positionById = computed(
		() => new Map(this.positions().map((p) => [p.id, p])),
	);
	readonly rows = computed<readonly DataTableRow[]>(() =>
		this.positions().map((p) => ({
			id: p.id,
			cells: {
				number: p.number,
				name: p.name,
				system: p.system,
				type: p.type,
				dimension: p.dimension,
				quantity: p.quantity,
				warnings: p.warnings,
				updatedAt: p.updatedAt,
			},
		})),
	);
	readonly columns: readonly DataTableColumn[] = [
		{ key: 'number', label: 'Position Number' },
		{ key: 'name', label: 'Name', editable: true },
		{ key: 'system', label: 'System', sortable: false },
		{ key: 'type', label: 'Type', sortable: false },
		{ key: 'dimension', label: 'Dimension', sortable: false },
		{ key: 'quantity', label: 'Quantity', sortable: false },
		{ key: 'warnings', label: 'Warnings', sortable: false },
		{ key: 'updatedAt', label: 'Last Update' },
	];
	readonly menus = computed(
		() => new Map(this.store.items().map((p) => [p.id, this.buildMenu(p)])),
	);
	readonly emptyTitle = computed(() =>
		this.searchModel().query
			? 'No matching positions'
			: 'No positions in this view',
	);
	readonly emptyDescription = 'Create a position or select a different phase.';
	readonly lastUpdated = computed(
		() => this.selectedPosition()?.updatedLabel ?? '',
	);
	constructor() {
		this.store.load(this.query);
		this.catalog.load();
	}
	label(key: string, value: string) {
		return (
			this.catalog.options()[key]?.find((o) => o.value === value)?.label ??
			value
		);
	}
	previousPage() {
		this.page.update((p) => Math.max(1, p - 1));
	}
	changeSort(sort: DataTableSort): void {
		if (this.activeFilter() === 'recent') this.activeFilter.set('all');
		this.sort.set(sort);
		this.sortModel.set({ order: sort.field + ':' + sort.direction });
		this.page.set(1);
	}
	selectSort(): void {
		const [field, direction] = this.sortModel().order.split(':');
		this.changeSort({ field, direction: direction === 'asc' ? 'asc' : 'desc' });
	}
	openThumbnail(): void {
		this.thumbnailSide.set('Exterior');
		this.thumbnailDialog().nativeElement.showModal();
	}
	nextPage() {
		this.page.update((p) => p + 1);
	}
	selectFilter(id: string) {
		this.activeFilter.set(id);
		this.page.set(1);
		this.store.select(null);
	}
	selectPosition(id: string | null) {
		this.store.select(id);
	}
	newPosition() {
		this.positionForm().open(
			null,
			['all', 'recent', 'favorites', 'archived', 'none'].includes(
				this.activeFilter(),
			)
				? ''
				: this.activeFilter(),
		);
	}
	editProject() {
		const project = this.store.project();
		if (project && !project.archivedAt) this.projectForm().open(project);
	}
	rename(edit: DataTableEdit) {
		const position = this.store.items().find((p) => p.id === edit.rowId);
		if (
			position &&
			edit.column === 'name' &&
			edit.value.trim() &&
			!position.archivedAt
		)
			this.store.updateAction({ position, input: { name: edit.value.trim() } });
	}
	print() {
		void this.router.navigate(['/hub/printouts'], {
			queryParams: {
				inputType:
					this.activeFilter() === 'none' ||
					['all', 'recent', 'favorites', 'archived'].includes(
						this.activeFilter(),
					)
						? 'PROJECT'
						: 'PROJECT_PHASE',
				inputId:
					this.activeFilter() === 'none' ||
					['all', 'recent', 'favorites', 'archived'].includes(
						this.activeFilter(),
					)
						? this.projectId()
						: this.activeFilter(),
				projectId: this.projectId(),
			},
		});
	}
	action(id: string, action: string) {
		const p =
			this.store.items().find((v) => v.id === id) ?? this.store.selected();
		if (!p) return;
		if (action === 'favorite') this.store.favorite(p);
		else if (action === 'archive') this.store.archive(p);
		else if (action === 'edit') this.positionForm().open(p);
		else if (action === 'batch')
			this.batchAssignment().open({ label: p.name, positionId: p.id });
		else if (action === 'print')
			void this.router.navigate(['/hub/printouts'], {
				queryParams: {
					inputType: 'POSITIONS',
					inputId: p.id,
					projectId: this.projectId(),
				},
			});
		else if (action === 'quantity') {
			this.editingPosition.set(p);
			this.detailMode.set('quantity');
			this.detailModel.set({
				quantity: p.quantity,
				description: '',
				buildingLocation: '',
			});
			this.detailDialog().nativeElement.showModal();
		} else if (action.startsWith('phase:'))
			this.store.updateAction({
				position: p,
				input: { phaseId: action.slice(6) || null },
			});
	}
	editElement(element: PositionElement, remove = false) {
		this.editingElement.set(element);
		this.detailMode.set(remove ? 'remove' : 'element');
		this.detailModel.set({
			quantity: 1,
			description: element.description ?? '',
			buildingLocation: element.buildingLocation ?? '',
		});
		this.detailDialog().nativeElement.showModal();
	}
	closeDetail() {
		this.detailDialog().nativeElement.close();
	}
	saveDetail(event: Event) {
		event.preventDefault();
		void submit(this.detailFields, async () => {
			const value = this.detailModel();
			const element = this.editingElement();
			const position = this.editingPosition();
			if (this.detailMode() === 'remove' && element) {
				const result = await firstValueFrom(this.store.removeElement(element));
				if (result.kind === 'success') this.closeDetail();
				return;
			}
			const result =
				this.detailMode() === 'element' && element
					? await firstValueFrom(
							this.store.updateElement(
								element.positionId,
								element.id,
								element.version,
								{
									description: value.description || null,
									buildingLocation: value.buildingLocation || null,
								},
							),
						)
					: await firstValueFrom(
							this.store.quantity(
								position?.id ?? '',
								position?.version ?? 0,
								value.quantity,
							),
						);
			if (result.kind === 'success') this.closeDetail();
			else if (
				result.kind === 'failure' &&
				result.error.code === 'ELEMENT_SELECTION_REQUIRED'
			) {
				this.propertiesTab.set('elements');
				this.store.select(position?.id ?? null);
			}
		});
	}
	openPhase(phase: ProjectPhase | null = null) {
		this.editingPhase.set(phase);
		this.phaseModel.set({
			name: phase?.name ?? '',
			description: phase?.description ?? '',
			sortOrder: phase?.sortOrder ?? 0,
		});
		this.phaseDialog().nativeElement.showModal();
	}
	closePhase() {
		this.phaseDialog().nativeElement.close();
	}
	savePhase(event: Event) {
		event.preventDefault();
		void submit(this.phaseFields, async () => {
			const value = this.phaseModel();
			const phase = this.editingPhase();
			const result = await firstValueFrom(
				phase
					? this.store.updatePhase(phase, {
							name: value.name,
							description: value.description || null,
							sortOrder: value.sortOrder,
						})
					: this.store.createPhase(value.name),
			);
			if (result.kind === 'success') this.closePhase();
		});
	}
	private buildMenu(p: Position): readonly ActionMenuItem[] {
		return [
			{
				id: 'open',
				label: 'Open Position Editor',
				icon: 'openPosition',
				link: ['/positions', p.id, 'editor'],
			},
			{
				id: 'open-tab',
				label: 'Open in new tab',
				icon: 'openInNewTab',
				link: ['/positions', p.id, 'editor'],
				target: '_blank',
			},
			{ id: 'print', label: 'Printout', icon: 'printout' },
			...(!p.archivedAt && !p.projectArchivedAt
				? [
						{
							id: 'batch',
							label: 'Add to fabrication batch',
							icon: 'fabricationBatch' as const,
						},
						{ id: 'edit', label: 'Edit information', icon: 'edit' as const },
						{ id: 'quantity', label: 'Change quantity', icon: 'edit' as const },
						{
							id: 'move',
							label: 'Move to phase',
							icon: 'phase' as const,
							items: [
								{ id: 'phase:', label: 'No phase' },
								...this.store.phases().map((phase) => ({
									id: 'phase:' + phase.id,
									label: phase.name,
								})),
							],
						},
					]
				: []),
			{
				id: 'favorite',
				label: p.isFavorite ? 'Remove from favorites' : 'Favorite',
				icon: 'favoriteProjects',
			},
			{
				id: 'archive',
				label: p.archivedAt ? 'Restore' : 'Archive',
				icon: 'archivedProjects',
				destructive: !p.archivedAt,
			},
		];
	}
}
