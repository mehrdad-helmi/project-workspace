import {
	ChangeDetectionStrategy,
	Component,
	computed,
	ElementRef,
	inject,
	signal,
	viewChild,
} from '@angular/core';
import {
	email,
	form,
	FormField,
	required,
	submit,
} from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { DateTime } from 'luxon';
import { firstValueFrom } from 'rxjs';
import {
	ContactsStore,
	type Contact,
	type ContactInput,
} from '@planicam/contacts/state';
import { HubCatalogStore } from '@planicam/hub/state';
import { Button } from '@planicam/shared/ui/button';
import { InputField } from '@planicam/shared/ui/input-field';
import {
	DataTable,
	type DataTableColumn,
	type DataTableRow,
	type DataTableSort,
} from '@planicam/shared/ui/data-table';
import {
	WorkspaceHeader,
	WorkspaceLayout,
} from '@planicam/shared/ui/workspace-layout';

function emptyContact() {
	return {
		name: '',
		kind: 'PERSON',
		type: 'CUSTOMER',
		email: '',
		phone: '',
		secondaryPhone: '',
		commercialContact: '',
		technicalContact: '',
		street: '',
		city: '',
		postalCode: '',
		country: '',
		defaultEstimationDataSetId: '',
		conditions: '',
		notes: '',
		freeData: [] as { label: string; value: string }[],
		adjustments: [] as {
			label: string;
			direction: string;
			percentage: string;
			cap: string;
		}[],
	};
}
@Component({
	selector: 'planicam-contacts',
	imports: [
		Button,
		InputField,
		DataTable,
		WorkspaceHeader,
		WorkspaceLayout,
		FormField,
		RouterLink,
	],
	providers: [ContactsStore, HubCatalogStore],
	templateUrl: './contacts.page.html',
	styleUrl: './contacts.page.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactsPage {
	readonly store = inject(ContactsStore);
	readonly catalog = inject(HubCatalogStore);
	private readonly editor = viewChild<ElementRef<HTMLDialogElement>>('editor');
	private readonly removal =
		viewChild<ElementRef<HTMLDialogElement>>('removal');
	readonly editing = signal<{ id: string; version: number } | null>(null);
	readonly deleteTarget = signal<Contact | null>(null);
	readonly formError = signal('');
	readonly model = signal(emptyContact());
	readonly contactForm = form(this.model, (path) => {
		required(path.name, { message: 'Enter a contact name.' });
		required(path.kind);
		required(path.type);
		email(path.email);
	});
	readonly searchModel = signal({ query: '' });
	readonly searchForm = form(this.searchModel);
	private readonly removalModel = signal({ confirmed: true });
	readonly removalForm = form(this.removalModel);
	readonly columns: readonly DataTableColumn[] = [
		{ key: 'number', label: 'Number' },
		{ key: 'name', label: 'Name' },
		{ key: 'type', label: 'Type', sortable: false },
		{ key: 'email', label: 'Email', sortable: false },
		{ key: 'phone', label: 'Phone', sortable: false },
		{ key: 'updatedAt', label: 'Last modified' },
	];
	readonly rows = computed<readonly DataTableRow[]>(() =>
		this.store.items().map((contact) => ({
			id: contact.id,
			cells: {
				number: contact.number,
				name: contact.name,
				type:
					this.catalog
						.options()
						['contactTypes']?.find((option) => option.value === contact.type)
						?.label ?? contact.type,
				email: contact.email ?? null,
				phone: contact.phone ?? null,
				updatedAt: DateTime.fromISO(contact.updatedAt).toLocaleString(
					DateTime.DATE_MED,
				),
			},
		})),
	);
	readonly textFields = [
		{ key: 'email', label: 'Email', type: 'email' },
		{ key: 'phone', label: 'Phone', type: 'tel' },
		{ key: 'secondaryPhone', label: 'Secondary phone', type: 'tel' },
		{ key: 'commercialContact', label: 'Commercial contact', type: 'text' },
		{ key: 'technicalContact', label: 'Technical contact', type: 'text' },
		{ key: 'street', label: 'Street', type: 'text' },
		{ key: 'city', label: 'City', type: 'text' },
		{ key: 'postalCode', label: 'Postal code', type: 'text' },
		{ key: 'country', label: 'Country', type: 'text' },
	] as const;
	constructor() {
		this.store.load();
		this.catalog.load();
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
	openEditor(contact?: Contact): void {
		this.store.clearError();
		this.formError.set('');
		this.editing.set(
			contact ? { id: contact.id, version: contact.version } : null,
		);
		const value = emptyContact();
		if (contact) {
			for (const key of [
				'name',
				'kind',
				'type',
				'email',
				'phone',
				'secondaryPhone',
				'commercialContact',
				'technicalContact',
				'street',
				'city',
				'postalCode',
				'country',
				'defaultEstimationDataSetId',
				'conditions',
				'notes',
			] as const)
				value[key] = contact[key] ?? '';
			value.freeData = Object.entries(contact.freeData ?? {}).map(
				([label, value]) => ({ label, value }),
			);
			value.adjustments = (contact.pricingAdjustments ?? []).map((row) => ({
				...row,
				cap: row.cap ?? '',
			}));
		}
		this.contactForm().reset(value);
		this.editor()?.nativeElement.showModal();
	}
	closeEditor(): void {
		if (!this.store.saving()) this.editor()?.nativeElement.close();
	}
	addFreeData(): void {
		this.model.update((value) => ({
			...value,
			freeData: [...value.freeData, { label: '', value: '' }],
		}));
	}
	removeFreeData(index: number): void {
		this.model.update((value) => ({
			...value,
			freeData: value.freeData.filter((_, i) => i !== index),
		}));
	}
	addAdjustment(): void {
		this.model.update((value) => ({
			...value,
			adjustments: [
				...value.adjustments,
				{ label: '', direction: 'DISCOUNT', percentage: '', cap: '' },
			],
		}));
	}
	removeAdjustment(index: number): void {
		this.model.update((value) => ({
			...value,
			adjustments: value.adjustments.filter((_, i) => i !== index),
		}));
	}
	async save(event: Event): Promise<void> {
		event.preventDefault();
		await submit(this.contactForm, async () => {
			const value = this.model(),
				keys = value.freeData.map((row) => row.label.trim());
			if (keys.some((key) => !key) || new Set(keys).size !== keys.length) {
				this.formError.set('Free-data labels must be nonblank and unique.');
				return;
			}
			if (
				value.adjustments.some(
					(row) =>
						!row.label.trim() ||
						!/^\d+(\.\d+)?$/.test(row.percentage) ||
						(row.cap !== '' && !/^\d+(\.\d+)?$/.test(row.cap)),
				)
			) {
				this.formError.set(
					'Each adjustment needs a label, a nonnegative percentage and an optional nonnegative cap.',
				);
				return;
			}
			const { freeData, adjustments, ...fields } = value;
			const optional = Object.fromEntries(
				[
					...this.textFields.map((field) => field.key),
					'conditions',
					'notes',
				].map((key) => [key, fields[key as keyof typeof fields] || null]),
			);
			const input: ContactInput = {
				...fields,
				...optional,
				email: value.email || null,
				defaultEstimationDataSetId: value.defaultEstimationDataSetId || null,
				freeData: Object.fromEntries(
					freeData.map((row) => [row.label.trim(), row.value]),
				),
				pricingAdjustments: adjustments.map((row) => ({
					label: row.label.trim(),
					direction: row.direction === 'SURCHARGE' ? 'SURCHARGE' : 'DISCOUNT',
					percentage: row.percentage,
					...(row.cap ? { cap: row.cap } : {}),
				})),
			};
			const editing = this.editing(),
				result = await firstValueFrom(
					editing
						? this.store.update(editing.id, editing.version, input)
						: this.store.create(input),
				);
			if (result.kind === 'success') this.editor()?.nativeElement.close();
		});
	}
	confirmRemove(contact: Contact): void {
		this.store.clearError();
		this.deleteTarget.set(contact);
		this.removal()?.nativeElement.showModal();
	}
	closeRemoval(): void {
		if (!this.store.saving()) this.removal()?.nativeElement.close();
	}
	async remove(event: Event): Promise<void> {
		event.preventDefault();
		await submit(this.removalForm, async () => {
			const contact = this.deleteTarget();
			if (!contact) return;
			const result = await firstValueFrom(
				this.store.remove(contact.id, contact.version),
			);
			if (result.kind === 'success') this.removal()?.nativeElement.close();
		});
	}
}
