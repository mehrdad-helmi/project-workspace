import { NgTemplateOutlet } from '@angular/common';
import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	contentChild,
	effect,
	ElementRef,
	inject,
	Injector,
	input,
	output,
	signal,
	TemplateRef,
	viewChild,
	viewChildren,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { TableModule } from 'primeng/table';
import { InputText } from 'primeng/inputtext';
import { RouterLink } from '@angular/router';
import { Icon } from '../../icons';
import type {
	DataTableColumn,
	DataTableEdit,
	DataTableRow,
	DataTableSort,
} from './data-table.model';

interface CellContext {
	$implicit: DataTableRow;
	column: DataTableColumn;
}

@Component({
	selector: 'pl-data-table',
	imports: [
		TableModule,
		InputText,
		FormField,
		NgTemplateOutlet,
		RouterLink,
		Icon,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	templateUrl: './data-table.component.html',
	styleUrl: './data-table.component.scss',
})
export class DataTable {
	readonly rows = input.required<readonly DataTableRow[]>();
	readonly columns = input.required<readonly DataTableColumn[]>();
	readonly selectedId = input<string | null>(null);
	readonly emptyLabel = input('No matching items');
	readonly selected = output<string | null>();
	readonly edited = output<DataTableEdit>();
	readonly serverSorting = input(false);
	readonly sort = input<DataTableSort | null>(null);
	readonly sortChanged = output<DataTableSort>();
	protected sortColumn(field: string): void {
		const direction =
			this.sort()?.field === field && this.sort()?.direction === 'asc'
				? 'desc'
				: 'asc';
		this.sortChanged.emit({ field, direction });
	}
	protected readonly values = computed(() => [...this.rows()]);
	protected readonly selection = computed(
		() => this.rows().find((row) => row.id === this.selectedId()) ?? null,
	);
	protected readonly cellTemplate =
		contentChild<TemplateRef<CellContext>>('cell');
	protected readonly actionsTemplate =
		contentChild<TemplateRef<{ $implicit: DataTableRow }>>('rowActions');
	protected readonly expansionTemplate =
		contentChild<TemplateRef<{ $implicit: DataTableRow }>>('expandedRow');
	protected readonly editing = signal<{ rowId: string; column: string } | null>(
		null,
	);
	private readonly editModel = signal({ value: '' });
	protected readonly invalidEdit = signal(false);
	protected readonly editForm = form(this.editModel);
	private readonly editor =
		viewChild<ElementRef<HTMLInputElement>>('cellEditor');
	private readonly editButtons =
		viewChildren<ElementRef<HTMLButtonElement>>('editButton');
	private readonly injector = inject(Injector);

	constructor() {
		effect(() => {
			const editor = this.editor();
			if (editor) {
				editor.nativeElement.focus();
				editor.nativeElement.select();
			}
		});
	}

	protected selectRow(row: DataTableRow | DataTableRow[] | undefined): void {
		if (row && !Array.isArray(row)) this.selected.emit(row.id);
	}

	protected startEdit(
		event: Event,
		row: DataTableRow,
		column: DataTableColumn,
	): void {
		event.stopPropagation();
		this.editModel.set({ value: String(row.cells[column.key] ?? '') });
		this.invalidEdit.set(false);
		this.editing.set({ rowId: row.id, column: column.key });
		this.selected.emit(row.id);
	}

	protected finishEdit(restoreFocus = false): void {
		const editing = this.editing();
		if (!editing) return;
		const value = this.editModel().value.trim();
		if (!value) {
			this.invalidEdit.set(true);
			this.editor()?.nativeElement.focus();
			return;
		}
		this.editing.set(null);
		this.edited.emit({ ...editing, value });
		if (restoreFocus) this.restoreEditFocus(editing);
	}

	protected cancelEdit(event: Event): void {
		event.preventDefault();
		event.stopPropagation();
		const editing = this.editing();
		this.editing.set(null);
		if (editing) this.restoreEditFocus(editing);
	}

	private restoreEditFocus(editing: { rowId: string; column: string }): void {
		afterNextRender(
			() => {
				this.editButtons()
					.find(
						({ nativeElement }) =>
							nativeElement.dataset['rowId'] === editing.rowId &&
							nativeElement.dataset['column'] === editing.column,
					)
					?.nativeElement.focus();
			},
			{ injector: this.injector },
		);
	}
}
