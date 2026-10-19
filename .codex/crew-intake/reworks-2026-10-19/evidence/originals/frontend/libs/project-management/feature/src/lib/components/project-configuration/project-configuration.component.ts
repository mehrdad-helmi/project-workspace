import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
	signal,
	untracked,
} from '@angular/core';
import { form, FormField, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import {
	HubCatalogStore,
	HubConfigurationStore,
	type ConfigObject,
	type ConfigurationRecord,
} from '@planicam/hub/state';
import { Button } from '@planicam/shared/ui/button';
import { ConfigurationFields } from './configuration-fields/configuration-fields.component';
import {
	at,
	object,
	replaceAt,
	validateFields,
	BASIC_TABLES,
	DISCOUNT_TABLES,
	SPECIAL_TABLES,
	STANDARD_SECTIONS,
	PREFERENCE_FIELDS,
	PREFERENCE_TABLES,
	type ConfigurationField,
	type ConfigurationSection,
} from './project-configuration.model';

@Component({
	selector: 'planicam-project-configuration',
	imports: [Button, FormField, ConfigurationFields],
	providers: [HubConfigurationStore, HubCatalogStore],
	changeDetection: ChangeDetectionStrategy.OnPush,
	templateUrl: './project-configuration.component.html',
	styleUrl: './project-configuration.component.scss',
})
export class ProjectConfiguration {
	readonly projectId = input.required<string>();
	readonly area = input.required<'preferences' | 'estimation'>();
	readonly section = input('');
	readonly archived = input(false);
	protected readonly store = inject(HubConfigurationStore);
	protected readonly catalog = inject(HubCatalogStore);
	protected readonly preferenceKind = computed(
		() =>
			({
				System: 'system',
				Colors: 'color',
				Fillings: 'filling',
				Other: 'other',
			})[this.section()] ?? 'system',
	);
	protected readonly costs = computed(
		() => this.area() === 'estimation' && this.section() === 'Allocated Costs',
	);
	protected readonly path = computed(
		() =>
			`projects/${this.projectId()}/${this.area() === 'preferences' ? 'preferences/' + this.preferenceKind() : this.costs() ? 'allocated-costs' : 'estimation-settings'}`,
	);
	protected readonly disabled = computed(
		() =>
			this.archived() ||
			this.store.loading() ||
			this.store.saving() ||
			(!this.costs() && !this.snapshotReady()),
	);
	protected readonly draft = signal<ConfigObject>({});
	protected readonly baseline = signal<ConfigurationRecord | null>(null);
	protected readonly dirty = signal(false);
	protected readonly message = signal<string | null>(null);
	private readonly baselinePath = signal('');
	protected readonly snapshotReady = computed(
		() => this.baseline() !== null && this.baselinePath() === this.path(),
	);
	private readonly cache = new Map<
		string,
		{ baseline: ConfigurationRecord; draft: ConfigObject }
	>();
	protected readonly scalarSections = computed<readonly ConfigurationSection[]>(
		() =>
			this.area() === 'preferences'
				? [
						{
							path: 'config',
							title: 'Preferences',
							fields: PREFERENCE_FIELDS[this.preferenceKind()] ?? [],
						},
					]
				: this.section() === 'Basic' || !this.section()
					? STANDARD_SECTIONS
					: [],
	);
	protected readonly tables = computed<readonly ConfigurationSection[]>(() =>
		this.area() === 'preferences'
			? (PREFERENCE_TABLES[this.preferenceKind()] ?? [])
			: this.section() === 'Discount/Factors'
				? DISCOUNT_TABLES
				: this.section() === 'Special Prices'
					? SPECIAL_TABLES
					: this.section() === 'Basic' || !this.section()
						? BASIC_TABLES
						: [],
	);
	private readonly submission = signal({ confirmed: true });
	protected readonly submissionForm = form(this.submission);
	protected readonly source = signal({ estimationDataSetId: '' });
	protected readonly sourceForm = form(this.source);
	protected readonly editingCost = signal(false);
	protected readonly costBase = signal<ConfigurationRecord | null>(null);
	protected readonly costDraft = signal<ConfigObject>({});
	protected readonly costFields = computed<readonly ConfigurationField[]>(
		() => [
			...(!this.costBase()?.['builtinType']
				? [
						{ key: 'name', label: 'Name', required: true },
						{
							key: 'estimationSector',
							label: 'Estimation sector',
							kind: 'choice' as const,
							choices:
								this.catalog
									.options()
									['estimationSectors']?.map((value) => value.value) ?? [],
							required: true,
						},
					]
				: []),
			{ key: 'price', label: 'Price', kind: 'decimal', required: true },
			{
				key: 'currencyCode',
				label: 'Currency',
				kind: 'currency',
				required: true,
			},
			{
				key: 'allocationBasis',
				label: 'Allocation basis',
				kind: 'choice',
				choices:
					this.catalog
						.options()
						['allocationBases']?.map((value) => value.value) ?? [],
				required: true,
			},
			{
				key: 'quotationDisplay',
				label: 'Quotation display',
				kind: 'choice',
				choices:
					this.catalog
						.options()
						['allocatedCostQuotationDisplays']?.map((value) => value.value) ??
					[],
				required: true,
			},
		],
	);
	constructor() {
		this.store.load(this.path);
		this.catalog.load();
		effect(() => {
			const row = this.store.record();
			const path = this.path();
			const actualPath = this.store.path();
			if (!row || path !== actualPath) return;
			untracked(() => {
				const cached = this.cache.get(path);
				if (cached) {
					this.baselinePath.set(path);
					this.baseline.set(cached.baseline);
					this.draft.set(cached.draft);
					this.dirty.set(true);
				} else this.accept(row);
			});
		});
		effect(() => {
			this.path();
			untracked(() => {
				this.editingCost.set(false);
				this.costBase.set(null);
				this.message.set(null);
			});
		});
	}
	protected value(path: string): ConfigObject {
		return object(at(this.draft(), path));
	}
	protected rows(path: string): readonly ConfigObject[] {
		const values = at(this.draft(), path);
		return Array.isArray(values) ? values.map(object) : [];
	}
	protected update(path: string, value: ConfigObject): void {
		this.updateDraft(replaceAt(this.draft(), path, value));
	}
	protected updateRow(path: string, index: number, value: ConfigObject): void {
		this.updateDraft(
			replaceAt(
				this.draft(),
				path,
				this.rows(path).map((row, i) => (i === index ? value : row)),
			),
		);
	}
	protected addRow(section: ConfigurationSection): void {
		if (this.disabled() || !section.canAdd) return;
		const row = Object.fromEntries(
			section.fields
				.filter((field) => field.required)
				.map((field) => [field.key, '']),
		);
		this.updateDraft(
			replaceAt(this.draft(), section.path, [...this.rows(section.path), row]),
		);
	}
	protected removeRow(path: string, index: number): void {
		if (!this.disabled())
			this.updateDraft(
				replaceAt(
					this.draft(),
					path,
					this.rows(path).filter((_, i) => i !== index),
				),
			);
	}
	protected moveRow(path: string, index: number, offset: number): void {
		if (this.disabled()) return;
		const rows = [...this.rows(path)];
		const target = index + offset;
		if (target < 0 || target >= rows.length) return;
		[rows[index], rows[target]] = [rows[target], rows[index]];
		this.updateDraft(replaceAt(this.draft(), path, rows));
	}
	private updateDraft(value: ConfigObject): void {
		if (this.disabled()) return;
		this.draft.set(value);
		this.dirty.set(true);
		const baseline = this.baseline();
		if (baseline) this.cache.set(this.path(), { baseline, draft: value });
		this.message.set(null);
	}
	protected preferredSystems(): readonly string[] {
		const ids = this.value('config')['preferredSystemIds'];
		return Array.isArray(ids)
			? ids.filter((id): id is string => typeof id === 'string')
			: [];
	}
	protected toggleSystem(id: string, event: Event): void {
		const selected = (event.target as HTMLInputElement).checked;
		const ids = this.preferredSystems();
		this.update('config', {
			...this.value('config'),
			preferredSystemIds: selected
				? [...new Set([...ids, id])]
				: ids.filter((value) => value !== id),
		});
	}
	protected fillingIds(key: string): readonly string[] {
		const ids = this.value('config')[key];
		return Array.isArray(ids)
			? ids.filter((id): id is string => typeof id === 'string')
			: [];
	}
	protected removeFilling(key: string, index: number): void {
		this.update('config', {
			...this.value('config'),
			[key]: this.fillingIds(key).filter((_, i) => i !== index),
		});
	}
	private accept(row: ConfigurationRecord): void {
		this.baselinePath.set(this.path());
		this.baseline.set(structuredClone(row));
		this.draft.set(
			this.area() === 'preferences'
				? { config: structuredClone(object(row['config'])) }
				: ({
						standardEstimation: structuredClone(
							object(row['standardEstimation']),
						),
						discountsAndFactors: structuredClone(
							object(row['discountsAndFactors']),
						),
						specialPrices: structuredClone(
							Array.isArray(row['specialPrices']) ? row['specialPrices'] : [],
						),
					} as ConfigObject),
		);
		this.dirty.set(false);
		this.message.set(null);
	}
	private validation(): string | null {
		const scalars =
			this.area() === 'preferences'
				? [
						{
							path: 'config',
							title: 'Preferences',
							fields: PREFERENCE_FIELDS[this.preferenceKind()] ?? [],
						},
					]
				: STANDARD_SECTIONS;
		const tables =
			this.area() === 'preferences'
				? (PREFERENCE_TABLES[this.preferenceKind()] ?? [])
				: [...BASIC_TABLES, ...DISCOUNT_TABLES, ...SPECIAL_TABLES];
		for (const section of scalars) {
			const error = validateFields(this.value(section.path), section.fields);
			if (error) return section.title + ': ' + error;
		}
		for (const section of tables)
			for (const row of this.rows(section.path)) {
				const error = validateFields(row, section.fields);
				if (error) return section.title + ': ' + error;
			}
		return null;
	}
	protected async save(event: Event): Promise<void> {
		event.preventDefault();
		await submit(this.submissionForm, async () => {
			const baseline = this.baseline();
			if (!baseline || this.disabled()) return;
			const error = this.validation();
			if (error) {
				this.message.set(error);
				return;
			}
			const path = this.path();
			let draft = this.draft();
			if (this.area() === 'preferences' && this.preferenceKind() === 'other')
				draft = {
					config: {
						...this.value('config'),
						defaultSystemId: this.value('config')['defaultSystemId'] ?? null,
					},
				};
			const result = await firstValueFrom(
				this.store.save(path, { expectedVersion: baseline.version, ...draft }),
			);
			if (result.kind === 'success' && this.path() === path) {
				this.cache.delete(path);
				this.accept(result.value);
				this.message.set('Settings saved.');
			}
		});
	}
	protected async replaceSource(event: Event): Promise<void> {
		event.preventDefault();
		await submit(this.sourceForm, async () => {
			const baseline = this.baseline();
			if (!baseline || this.disabled()) return;
			if (this.area() === 'estimation' && !this.source().estimationDataSetId) {
				this.message.set('Choose an estimation source.');
				return;
			}
			if (
				!window.confirm(
					'Replace this project snapshot from the selected organization source? Current project values and unsaved changes in this snapshot will be replaced.',
				)
			)
				return;
			const path = this.path();
			const body: ConfigObject = {
				expectedVersion: baseline.version,
				confirmed: true,
				...(this.area() === 'estimation'
					? { estimationDataSetId: this.source().estimationDataSetId }
					: {}),
			};
			const result = await firstValueFrom(
				this.store.save(path + '/replace-source', body, 'POST'),
			);
			if (result.kind === 'success' && this.path() === path) {
				this.cache.delete(path);
				this.accept(result.value);
				this.message.set('Project snapshot replaced.');
			}
		});
	}
	protected reload(): void {
		if (this.store.loading() || this.store.saving()) return;
		if (
			(this.dirty() || this.editingCost()) &&
			!window.confirm(
				'Discard this snapshot draft and load the current server values?',
			)
		)
			return;
		this.cache.delete(this.path());
		this.editingCost.set(false);
		this.costBase.set(null);
		this.store.load(this.path());
	}
	protected editCost(row: ConfigurationRecord | null): void {
		this.costBase.set(row ? structuredClone(row) : null);
		this.costDraft.set(
			row
				? (Object.fromEntries(
						[
							'name',
							'estimationSector',
							'allocationBasis',
							'quotationDisplay',
							'price',
							'currencyCode',
						].map((key) => [key, row[key] ?? '']),
					) as ConfigObject)
				: {
						name: '',
						estimationSector: '',
						allocationBasis: '',
						quotationDisplay: '',
						price: '0',
						currencyCode: '',
					},
		);
		this.editingCost.set(true);
		this.message.set(null);
	}
	protected async saveCost(event: Event): Promise<void> {
		event.preventDefault();
		await submit(this.submissionForm, async () => {
			if (this.disabled()) return;
			const error = validateFields(this.costDraft(), this.costFields());
			if (error) {
				this.message.set(error);
				return;
			}
			const price = this.costDraft()['price'];
			if (typeof price !== 'string' || price.startsWith('-')) {
				this.message.set('Cost price must be nonnegative.');
				return;
			}
			const base = this.costBase();
			const path = this.path();
			const result = await firstValueFrom(
				this.store.save(
					path + (base ? '/' + base.id : ''),
					{
						...(base ? { expectedVersion: base.version } : {}),
						...this.costDraft(),
					},
					base ? 'PATCH' : 'POST',
				),
			);
			if (result.kind === 'success' && this.path() === path) {
				this.editingCost.set(false);
				this.message.set('Allocated cost saved.');
			}
		});
	}
	protected async removeCost(row: ConfigurationRecord): Promise<void> {
		if (
			this.disabled() ||
			row['builtinType'] ||
			!window.confirm(`Remove allocated cost “${row.name}”?`)
		)
			return;
		await submit(this.submissionForm, async () => {
			const path = this.path();
			const result = await firstValueFrom(
				this.store.save(
					path + '/' + row.id,
					{ expectedVersion: row.version },
					'DELETE',
				),
			);
			if (result.kind === 'success' && this.path() === path) {
				if (this.costBase()?.id === row.id) this.editingCost.set(false);
				this.message.set('Allocated cost removed.');
			}
		});
	}
}
