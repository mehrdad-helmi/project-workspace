import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	ElementRef,
	inject,
	signal,
	untracked,
	viewChild,
} from '@angular/core';
import {
	disabled,
	form,
	FormField,
	required,
	submit,
	validate,
} from '@angular/forms/signals';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EstimationDataset } from './estimation-dataset/estimation-dataset.component';
import { LaborHours } from './labor-hours/labor-hours.component';
import {
	HubCatalogStore,
	HubConfigurationStore,
	type ConfigurationRecord,
	type ConfigObject,
} from '@planicam/hub/state';
import { Button } from '@planicam/shared/ui/button';
import { InputField } from '@planicam/shared/ui/input-field';
import {
	WorkspaceHeader,
	WorkspaceLayout,
} from '@planicam/shared/ui/workspace-layout';

function object(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
@Component({
	selector: 'planicam-organization-settings',
	imports: [
		Button,
		InputField,
		FormField,
		WorkspaceHeader,
		WorkspaceLayout,
		EstimationDataset,
		LaborHours,
	],
	providers: [HubCatalogStore, HubConfigurationStore],
	templateUrl: './organization-settings.page.html',
	styleUrl: './organization-settings.page.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationSettingsPage {
	readonly store = inject(HubConfigurationStore);
	readonly catalog = inject(HubCatalogStore);
	private readonly route = inject(ActivatedRoute);
	private readonly confirmation =
		viewChild<ElementRef<HTMLDialogElement>>('confirmation');
	readonly section = signal(
		this.route.snapshot.data['area'] === 'preferences' ? 'system' : 'datasets',
	);
	readonly sections = [
		{ id: 'general', label: 'Organization' },
		{ id: 'system', label: 'Profile systems' },
		{ id: 'color', label: 'Colors' },
		{ id: 'filling', label: 'Fillings' },
		{ id: 'other', label: 'Other preferences' },
		{ id: 'datasets', label: 'Estimation datasets' },
		{ id: 'costs', label: 'Allocated costs' },
		{ id: 'vat', label: 'VAT rates' },
		{ id: 'rates', label: 'Currency rates' },
		{ id: 'labor', label: 'Labor hours' },
	] as const;
	readonly sectionLabel = computed(
		() =>
			this.sections.find((item) => item.id === this.section())?.label ??
			'Settings',
	);
	readonly path = computed(() => {
		const section = this.section();
		return section === 'general'
			? 'organization/settings'
			: section === 'datasets'
				? 'organization/estimation-data-sets'
				: section === 'costs'
					? 'organization/allocated-costs'
					: section === 'vat'
						? 'organization/vat-rates'
						: section === 'rates'
							? 'organization/currency-rates'
							: section === 'labor'
								? 'organization/labor-hours'
								: 'organization/preferences/' + section;
	});
	readonly listing = computed(() =>
		['datasets', 'costs', 'vat', 'rates'].includes(this.section()),
	);
	readonly editing = signal<ConfigurationRecord | null>(null);
	readonly showForm = signal(false);
	readonly removalTarget = signal<ConfigurationRecord | null>(null);
	readonly preferredSystems = signal<string[]>([]);
	readonly model = signal(this.empty());
	readonly fields = form(this.model, (path) => {
		disabled(path.name, () => this.protectedRecord(this.editing()));
		disabled(path.estimationSector, () => this.protectedRecord(this.editing()));
		required(path.name, {
			when: () => ['datasets', 'costs', 'vat'].includes(this.section()),
		});
		validate(path, ({ value }) => {
			const draft = value(),
				section = this.section();
			const number =
				section === 'rates'
					? draft.rate
					: section === 'vat'
						? draft.percentage
						: section === 'costs'
							? draft.price
							: null;
			if (number !== null && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(number))
				return { kind: 'decimal', message: 'Enter a valid decimal value.' };
			if (
				section === 'rates' &&
				(draft.fromCurrencyCode === draft.toCurrencyCode ||
					Number(draft.rate) <= 0)
			)
				return {
					kind: 'rate',
					message: 'Choose different currencies and a positive rate.',
				};
			if (section === 'vat' && Number(draft.percentage) < 0)
				return { kind: 'vat', message: 'VAT must be nonnegative.' };
			if (section === 'general' && !draft.projectNumberPrefix.trim())
				return {
					kind: 'prefix',
					message: 'Project number prefix is required.',
				};
			return null;
		});
	});
	readonly confirmationModel = signal({ confirmed: true });
	readonly confirmationForm = form(this.confirmationModel);
	private empty() {
		return {
			name: '',
			projectNumberPrefix: 'PC',
			preferredCurrencyCode: 'USD',
			price: '0',
			currencyCode: 'USD',
			allocationBasis: 'PER_ELEMENT',
			quotationDisplay: 'HIDDEN',
			estimationSector: 'ELEMENT',
			percentage: '0',
			fromCurrencyCode: 'USD',
			toCurrencyCode: 'EUR',
			rate: '',
			defaultSystemId: '',
			applyTimeSuggestions: 'false',
			finishMode: '',
		};
	}
	constructor() {
		this.store.load(this.path);
		this.catalog.load();
		effect(() => {
			const row = this.store.record();
			if (row && !this.listing()) {
				untracked(() => this.open(row));
			}
		});
	}
	selectSection(id: string): void {
		this.section.set(id);
		this.editing.set(null);
		this.showForm.set(false);
	}
	open(row: ConfigurationRecord | null = null): void {
		this.editing.set(row);
		const value = this.empty(),
			data = object(row),
			config = object(data['config']);
		for (const key of [
			'name',
			'projectNumberPrefix',
			'preferredCurrencyCode',
			'price',
			'currencyCode',
			'allocationBasis',
			'quotationDisplay',
			'estimationSector',
			'percentage',
			'fromCurrencyCode',
			'toCurrencyCode',
			'rate',
		] as const)
			if (data[key] !== undefined && data[key] !== null)
				value[key] = String(data[key]);
		value.defaultSystemId = String(config['defaultSystemId'] ?? '');
		value.applyTimeSuggestions = String(
			config['applyTimeSuggestions'] ?? false,
		);
		value.finishMode = String(config['finishMode'] ?? '');
		this.preferredSystems.set(
			Array.isArray(config['preferredSystemIds'])
				? ([...config['preferredSystemIds']] as string[])
				: [],
		);
		this.fields().reset(value);
		this.showForm.set(true);
	}
	recordLabel(row: ConfigurationRecord): string {
		return (
			row.name ??
			(row['fromCurrencyCode']
				? String(row['fromCurrencyCode']) +
					' → ' +
					String(row['toCurrencyCode'])
				: 'Settings')
		);
	}
	protectedRecord(row: ConfigurationRecord | null): boolean {
		return !!row && (row['isStandard'] === true || !!row['builtinType']);
	}
	toggleSystem(id: string, event: Event): void {
		this.preferredSystems.update((ids) =>
			(event.target as HTMLInputElement).checked
				? [...ids, id]
				: ids.filter((value) => value !== id),
		);
	}
	async save(event: Event): Promise<void> {
		event.preventDefault();
		await submit(this.fields, async () => {
			const row = this.editing(),
				value = this.model(),
				section = this.section();
			let path = this.path(),
				method: 'PUT' | 'POST' | 'PATCH' = 'PUT';
			let body: Record<string, unknown> = {};
			if (section === 'general')
				body = {
					projectNumberPrefix: value.projectNumberPrefix,
					preferredCurrencyCode: value.preferredCurrencyCode,
				};
			else if (section === 'costs') {
				body = {
					name: value.name,
					price: value.price,
					currencyCode: value.currencyCode,
					allocationBasis: value.allocationBasis,
					quotationDisplay: value.quotationDisplay,
					estimationSector: value.estimationSector,
				};
				method = row ? 'PATCH' : 'POST';
				if (row) path += '/' + row.id;
			} else if (section === 'vat') {
				body = { name: value.name, percentage: value.percentage };
				method = row ? 'PATCH' : 'POST';
				if (row) path += '/' + row.id;
			} else if (section === 'rates')
				body = {
					fromCurrencyCode: value.fromCurrencyCode,
					toCurrencyCode: value.toCurrencyCode,
					rate: value.rate,
				};
			else if (section === 'system')
				body = {
					config: {
						...object(row?.['config']),
						schemaVersion: 1,
						preferredSystemIds: this.preferredSystems(),
					},
				};
			else if (section === 'other')
				body = {
					config: {
						...object(row?.['config']),
						schemaVersion: 1,
						defaultSystemId: value.defaultSystemId || null,
						applyTimeSuggestions: value.applyTimeSuggestions === 'true',
					},
				};
			else if (section === 'color') {
				const config: Record<string, unknown> = {
					...object(row?.['config']),
					schemaVersion: 1,
				};
				if (value.finishMode) config['finishMode'] = value.finishMode;
				else delete config['finishMode'];
				body = { config };
			} else return;
			if (row) body['expectedVersion'] = row.version;
			const result = await firstValueFrom(
				this.store.save(path, body as ConfigObject, method),
			);
			if (result.kind === 'success' && this.listing()) this.showForm.set(false);
		});
	}
	readonly persistDataset = async (body: ConfigObject): Promise<void> => {
		const row = this.editing();
		const result = await firstValueFrom(
			this.store.save(
				this.path() + (row ? '/' + row.id : ''),
				{ ...body, ...(row ? { expectedVersion: row.version } : {}) },
				row ? 'PUT' : 'POST',
			),
		);
		if (result.kind === 'success') this.showForm.set(false);
	};
	reload(): void {
		this.showForm.set(false);
		this.editing.set(null);
		this.store.load(this.path());
	}
	confirmRemoval(row: ConfigurationRecord): void {
		if (this.protectedRecord(row)) return;
		this.removalTarget.set(row);
		this.confirmation()?.nativeElement.showModal();
	}
	closeConfirmation(): void {
		if (!this.store.saving()) this.confirmation()?.nativeElement.close();
	}
	async remove(event: Event): Promise<void> {
		event.preventDefault();
		await submit(this.confirmationForm, async () => {
			const row = this.removalTarget();
			if (!row) return;
			const path =
				this.section() === 'rates'
					? this.path() +
						'/' +
						String(row['fromCurrencyCode']) +
						'/' +
						String(row['toCurrencyCode'])
					: this.path() + '/' + row.id;
			const result = await firstValueFrom(
				this.store.save(path, { expectedVersion: row.version }, 'DELETE'),
			);
			if (result.kind === 'success') this.confirmation()?.nativeElement.close();
		});
	}
}
