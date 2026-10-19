import {
	ChangeDetectionStrategy,
	Component,
	computed,
	ElementRef,
	inject,
	signal,
	viewChild,
} from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { DateTime } from 'luxon';
import { firstValueFrom } from 'rxjs';
import {
	FabricationStore,
	type FabricationBatch,
	type BatchElement,
} from '@planicam/fabrication/state';
import { ProjectsStore } from '@planicam/project-management/state';
import { HubCatalogStore } from '@planicam/hub/state';
import { Button } from '@planicam/shared/ui/button';
import { InputField } from '@planicam/shared/ui/input-field';
import {
	DataTable,
	type DataTableColumn,
	type DataTableRow,
	type DataTableSort,
} from '@planicam/shared/ui/data-table';
import { Tabs } from '@planicam/shared/ui/tabs';
import {
	WorkspaceHeader,
	WorkspaceLayout,
} from '@planicam/shared/ui/workspace-layout';

@Component({
	selector: 'planicam-fabrication',
	imports: [
		Button,
		InputField,
		DataTable,
		Tabs,
		WorkspaceHeader,
		WorkspaceLayout,
		FormField,
	],
	providers: [FabricationStore, ProjectsStore, HubCatalogStore],
	templateUrl: './fabrication.page.html',
	styleUrl: './fabrication.page.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FabricationPage {
	readonly store = inject(FabricationStore);
	readonly projects = inject(ProjectsStore);
	readonly catalog = inject(HubCatalogStore);
	private readonly router = inject(Router);
	private readonly editor = viewChild<ElementRef<HTMLDialogElement>>('editor');
	private readonly assignment =
		viewChild<ElementRef<HTMLDialogElement>>('assignment');
	private readonly confirmation =
		viewChild<ElementRef<HTMLDialogElement>>('confirmation');
	readonly editing = signal<{ id: string; version: number } | null>(null);
	readonly activeFilter = signal('all');
	readonly propertiesTab = signal<string | number>('detail');
	readonly tabs = [
		{ id: 'detail', label: 'Detail' },
		{ id: 'elements', label: 'Elements' },
	] as const;
	readonly model = signal({
		name: '',
		responsiblePerson: '',
		description: '',
		status: 'PLANNING',
		deploymentDate: '',
	});
	readonly batchForm = form(this.model, (path) =>
		required(path.name, { message: 'Enter a batch name.' }),
	);
	readonly searchModel = signal({ query: '' });
	readonly searchForm = form(this.searchModel);
	readonly assignmentModel = signal({ projectId: '' });
	readonly assignmentSearchModel = signal({ query: '' });
	readonly assignmentSearchForm = form(this.assignmentSearchModel);
	readonly assignmentForm = form(this.assignmentModel, (path) =>
		required(path.projectId, { message: 'Select a project.' }),
	);
	readonly confirmationModel = signal({ confirmed: true });
	readonly confirmationForm = form(this.confirmationModel);
	readonly pendingAction = signal<
		| { kind: 'archive'; batch: FabricationBatch }
		| { kind: 'unassign'; batch: FabricationBatch; element: BatchElement }
		| null
	>(null);
	readonly assignmentMessage = signal('');
	readonly filters = [
		{ id: 'all', label: 'All batches' },
		{ id: 'recent', label: 'Recent' },
		{ id: 'archived', label: 'Archived' },
	] as const;
	readonly columns: readonly DataTableColumn[] = [
		{ key: 'number', label: 'Number' },
		{ key: 'name', label: 'Name' },
		{ key: 'responsiblePerson', label: 'Responsible person', sortable: false },
		{ key: 'status', label: 'Status' },
		{ key: 'elements', label: 'Elements', sortable: false },
		{ key: 'updatedAt', label: 'Last modified' },
	];
	readonly rows = computed<readonly DataTableRow[]>(() =>
		this.store.items().map((batch) => ({
			id: batch.id,
			cells: {
				number: batch.number,
				name: batch.name,
				responsiblePerson: batch.responsiblePerson ?? null,
				status:
					this.catalog
						.options()
						[
							'fabricationBatchStatuses'
						]?.find((option) => option.value === batch.status)?.label ??
					batch.status,
				elements: batch.elementCount ?? 0,
				updatedAt: DateTime.fromISO(batch.updatedAt).toLocaleString(
					DateTime.DATE_MED,
				),
			},
		})),
	);
	readonly groups = computed(() => {
		const groups = new Map<
			string,
			{
				id: string;
				name: string;
				number: string;
				projectName: string;
				elements: BatchElement[];
			}
		>();
		for (const element of this.store.selected()?.elements ?? []) {
			const position = element.position;
			let group = groups.get(element.positionId);
			if (!group) {
				group = {
					id: element.positionId,
					name: position.name,
					number: position.number,
					projectName: position.project.name,
					elements: [],
				};
				groups.set(element.positionId, group);
			}
			group.elements.push(element);
		}
		return [...groups.values()];
	});
	readonly groupById = computed(
		() => new Map(this.groups().map((group) => [group.id, group])),
	);
	readonly elementColumns: readonly DataTableColumn[] = [
		{ key: 'number', label: 'Position' },
		{ key: 'name', label: 'Name' },
		{ key: 'count', label: 'Elements' },
	];
	readonly elementRows = computed<readonly DataTableRow[]>(() =>
		this.groups().map((group) => ({
			id: group.id,
			cells: {
				number: group.number,
				name: group.name,
				count: group.elements.length,
			},
		})),
	);
	constructor() {
		this.store.load({
			page: 1,
			pageSize: 25,
			archive: 'active',
			sortBy: 'updatedAt',
			sortDirection: 'desc',
		});
		this.catalog.load();
	}
	statusLabel(status: string): string {
		return (
			this.catalog
				.options()
				['fabricationBatchStatuses']?.find((option) => option.value === status)
				?.label ?? status
		);
	}
	filter(id: string): void {
		this.activeFilter.set(id);
		this.store.select(null);
		this.store.load({
			...this.store.query(),
			page: 1,
			archive: id === 'archived' ? 'archived' : 'active',
			sortBy: 'updatedAt',
			sortDirection: 'desc',
		});
	}
	search(): void {
		this.store.load({
			...this.store.query(),
			q: this.searchModel().query,
			page: 1,
		});
	}
	readonly sort = computed<DataTableSort>(() => ({
		field: this.store.query().sortBy ?? 'updatedAt',
		direction: this.store.query().sortDirection ?? 'desc',
	}));
	changeSort(sort: DataTableSort): void {
		if (this.activeFilter() === 'recent') this.activeFilter.set('all');
		this.store.load({
			...this.store.query(),
			page: 1,
			sortBy: sort.field,
			sortDirection: sort.direction,
		});
	}
	page(offset: number): void {
		this.store.load({
			...this.store.query(),
			page: Math.max(1, (this.store.query().page ?? 1) + offset),
		});
	}
	openEditor(batch?: FabricationBatch): void {
		this.editing.set(batch ? { id: batch.id, version: batch.version } : null);
		this.batchForm().reset({
			name: batch?.name ?? '',
			responsiblePerson: batch?.responsiblePerson ?? '',
			description: batch?.description ?? '',
			status: batch?.status ?? 'PLANNING',
			deploymentDate: batch?.deploymentDate?.slice(0, 10) ?? '',
		});
		this.store.clearError();
		this.editor()?.nativeElement.showModal();
	}
	closeEditor(): void {
		if (!this.store.saving()) this.editor()?.nativeElement.close();
	}
	async save(event: Event): Promise<void> {
		event.preventDefault();
		await submit(this.batchForm, async () => {
			const value = this.model(),
				input = { ...value, deploymentDate: value.deploymentDate || null },
				editing = this.editing();
			const result = await firstValueFrom(
				editing
					? this.store.update(editing.id, editing.version, input)
					: this.store.create(input),
			);
			if (result.kind === 'success') this.editor()?.nativeElement.close();
		});
	}
	openAssignment(): void {
		this.assignmentSearchForm().reset({ query: '' });
		this.assignmentForm().reset({ projectId: '' });
		this.assignmentMessage.set('');
		this.store.clearError();
		this.projects.load({
			page: 1,
			pageSize: 25,
			archive: 'active',
			sortBy: 'name',
			sortDirection: 'asc',
		});
		this.assignment()?.nativeElement.showModal();
	}
	searchAssignment(page = 1): void {
		this.assignmentForm().reset({ projectId: '' });
		this.projects.load({
			...this.projects.query(),
			page,
			q: this.assignmentSearchModel().query,
		});
	}
	closeAssignment(): void {
		if (!this.store.saving()) this.assignment()?.nativeElement.close();
	}
	async assign(event: Event): Promise<void> {
		event.preventDefault();
		await submit(this.assignmentForm, async () => {
			const batch = this.store.selected();
			if (!batch) return;
			const result = await firstValueFrom(
				this.store.assign(batch.id, batch.version, {
					projectIds: [this.assignmentModel().projectId],
				}),
			);
			if (result.kind === 'success') {
				this.assignmentMessage.set(
					result.value.assigned.length +
						' elements added; ' +
						result.value.skipped.length +
						' skipped because they were unavailable, excluded, or already assigned.',
				);
				this.assignment()?.nativeElement.close();
			}
		});
	}
	requestArchive(batch: FabricationBatch): void {
		this.pendingAction.set({ kind: 'archive', batch });
		this.store.clearError();
		this.confirmation()?.nativeElement.showModal();
	}
	requestUnassign(batch: FabricationBatch, element: BatchElement): void {
		this.pendingAction.set({ kind: 'unassign', batch, element });
		this.store.clearError();
		this.confirmation()?.nativeElement.showModal();
	}
	closeConfirmation(): void {
		if (!this.store.saving()) this.confirmation()?.nativeElement.close();
	}
	async confirm(event: Event): Promise<void> {
		event.preventDefault();
		await submit(this.confirmationForm, async () => {
			const action = this.pendingAction();
			if (!action) return;
			const result = await firstValueFrom(
				action.kind === 'archive'
					? this.store.archive(
							action.batch.id,
							action.batch.version,
							!action.batch.archivedAt,
						)
					: this.store.unassign(
							action.batch.id,
							action.element.id,
							action.batch.version,
						),
			);
			if (result.kind === 'success') this.confirmation()?.nativeElement.close();
		});
	}
	printout(): void {
		const batch = this.store.selected();
		if (batch)
			void this.router.navigate(['/hub/printouts'], {
				queryParams: { inputType: 'FABRICATION_BATCH', inputId: batch.id },
			});
	}
}
