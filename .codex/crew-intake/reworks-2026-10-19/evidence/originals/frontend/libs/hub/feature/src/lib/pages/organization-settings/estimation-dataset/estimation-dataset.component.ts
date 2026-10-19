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
import { form, submit, validate } from '@angular/forms/signals';
import {
	HubCatalogStore,
	type ConfigurationRecord,
	type ConfigObject,
} from '@planicam/hub/state';
import { Button } from '@planicam/shared/ui/button';
import {
	ConfigurationFields,
	fieldErrors,
	fieldValue,
	readPath,
	record,
	title,
	writePath,
	type SettingField,
} from '../configuration-fields/configuration-fields.component';

const decimals = (prefix: string, names: string): SettingField[] =>
	names.split(' ').map((name) => ({
		key: prefix + '.' + name,
		label: title(name),
		type: 'decimal',
	}));
const choice = (key: string, values: string): SettingField => ({
	key,
	label: title(key.split('.').pop() ?? key),
	type: 'select',
	options: values.split(' ').map((value) => ({
		value,
		label: title(value.toLowerCase().replaceAll('_', ' ')),
	})),
});
const bool = (key: string): SettingField => ({
	key,
	label: title(key.split('.').pop() ?? key),
	type: 'boolean',
});
const standardSections = [
	{
		label: 'Profiles',
		fields: [
			bool('profiles.rollProfiles'),
			choice('profiles.rollingColorMode', 'SINGLE_COLOR DUAL_COLOR'),
			choice('profiles.wastageMode', 'FIXED_CUT_SURCHARGE OPTIMIZED'),
			...decimals(
				'profiles',
				'cutSurchargePercentage elementInputCutSurchargePercentage',
			),
			...[
				'assignResidualLengthsToWastage',
				'extrapolateToWholePackingUnits',
				'useSingleArticlesInsteadOfKits',
			].map((name) => bool('profiles.' + name)),
		],
	},
	{
		label: 'Costs',
		fields: decimals(
			'costs',
			'materialOverheadPercentage glassOverheadPercentage panelOverheadPercentage wageOverheadPercentage sealingToStructurePerMeter rollProfilePerMeter tapingPerMeter extraCostPerElement salesManagementPercentage interestPercentage transportPercentage vatPercentage',
		),
	},
	...['fabrication', 'installation', 'workPreparation', 'dismantling'].map(
		(name) => ({
			label: title(name) + ' labor rates',
			fields: decimals(
				'laborRates.' + name,
				'ratePerHour timeReductionPercentage',
			),
		}),
	),
	{
		label: 'Coating',
		fields: [
			choice('coating.calculationBasis', 'SURFACE_AREA PROFILE_WEIGHT'),
			choice('coating.surfaceOption', 'TOTAL_SURFACE VISIBLE_SURFACE'),
			choice('coating.weightOption', 'PROFILE_WEIGHT COMPOUND_WEIGHT'),
			...decimals(
				'coating',
				'supplierDualColorSurchargePerMeter packingPercentage',
			),
			{
				key: 'coating.minimumSurfaceAreaSquareMeters',
				label: 'Minimum surface area (m²)',
				type: 'number' as const,
			},
			bool('coating.excludeCurvedProfiles'),
		],
	},
	{
		label: 'Profit',
		fields: [
			...decimals(
				'profit',
				'materialPercentage wastagePercentage glassPurchasePercentage panelPercentage wagesPercentage elementPurchasePercentage otherCostsPercentage planningOfficePercentage commissionPercentage cashDiscountSurchargePercentage',
			),
			bool('profit.differentProfitOnWastage'),
		],
	},
	{
		label: 'Glazing',
		fields: decimals('glazing', 'glassSealingPerMeter siliconeGlazingPerMeter'),
	},
	...['windowsDoors', 'curtainWalls'].map((name) => ({
		label: title(name) + ' glazing',
		fields: decimals(
			'glazing.' + name,
			'glazingPerSquareMeter panelingPerSquareMeter minimumGlazingPerPiece minimumPanelingPerPiece',
		),
	})),
];
interface DatasetDraft {
	values: Record<string, string>;
	tables: Record<string, Record<string, string>[]>;
}
interface Table {
	key: string;
	label: string;
	fields: readonly SettingField[];
	add: boolean;
	root: 'standardEstimation' | 'discountsAndFactors' | 'specialPrices';
}
@Component({
	selector: 'planicam-estimation-dataset',
	imports: [Button, ConfigurationFields],
	templateUrl: './estimation-dataset.component.html',
	styleUrl: './estimation-dataset.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstimationDataset {
	readonly catalog = inject(HubCatalogStore);
	readonly row = input<ConfigurationRecord | null>(null);
	readonly saving = input(false);
	readonly persist = input.required<(body: ConfigObject) => Promise<void>>();
	readonly model = signal<DatasetDraft>({ values: {}, tables: {} });
	readonly sections = standardSections;
	readonly identity = computed<readonly SettingField[]>(() => [
		{ key: 'name', label: 'Name', required: true, readonly: this.protected() },
		...['formCurrency', 'estimationCurrency'].map((key) => ({
			key,
			label: title(key),
			type: 'select' as const,
			required: true,
			options: this.currencyOptions(),
		})),
		{
			key: 'vatRateId',
			label: 'VAT rate',
			type: 'select',
			options: this.catalog
				.vatRates()
				.map((row) => ({ value: row.id, label: row.name ?? 'VAT rate' })),
		},
	]);
	readonly tables = computed<Table[]>(() => {
		const group: SettingField = {
			key: 'groupId',
			label: 'Discount group',
			type: 'select',
			options: this.catalog
				.discountGroups()
				.map((row) => ({ value: row.id, label: row.name })),
		};
		const currency: SettingField = {
			key: 'currency',
			label: 'Currency',
			type: 'select',
			required: true,
			options: this.currencyOptions(),
		};
		const rowDecimals = (names: string) =>
			names
				.split(' ')
				.map(
					(key): SettingField => ({ key, label: title(key), type: 'decimal' }),
				);
		return [
			{
				key: 'pricingGroups',
				label: 'Discounts and factors by group',
				root: 'discountsAndFactors',
				add: true,
				fields: [
					{ ...group, required: true },
					{
						key: 'supplierId',
						label: 'Supplier',
						type: 'select',
						options: this.catalog
							.suppliers()
							.map((row) => ({ value: row.id, label: row.name })),
					},
					...rowDecimals('factor surchargePercentage discountPercentage'),
				],
			},
			{
				key: 'weightPrices',
				label: 'Weight prices',
				root: 'discountsAndFactors',
				add: true,
				fields: [
					group,
					{ ...rowDecimals('pricePerKilogram')[0], required: true },
					currency,
				],
			},
			...['glassUnits', 'singleGlass'].map(
				(key): Table => ({
					key,
					label: title(key),
					root: 'discountsAndFactors',
					add: true,
					fields: [group, ...rowDecimals('factor discountPercentage')],
				}),
			),
			{
				key: 'specialPrices',
				label: 'Special article prices',
				root: 'specialPrices',
				add: false,
				fields: [
					...rowDecimals('price discountPercentage'),
					currency,
					choice(
						'priceUnit',
						'PIECE METER SQUARE_METER KILOGRAM CUBIC_METER PACKAGE',
					),
					group,
				],
			},
			{
				key: 'coating.priceCategories',
				label: 'Coating price categories',
				root: 'standardEstimation',
				add: true,
				fields: [
					{ key: 'name', label: 'Category name', required: true },
					{ ...rowDecimals('rate')[0], required: true },
					{
						...choice(
							'unit',
							'PER_SQUARE_METER PER_KILOGRAM PER_METER PER_PIECE',
						),
						required: true,
					},
				],
			},
			{
				key: 'coating.colorPrices',
				label: 'Existing coating color prices',
				root: 'standardEstimation',
				add: false,
				fields: rowDecimals(
					'pricePerSquareMeter pricePerKilogram visibleSurfacePricePerSquareMeter',
				),
			},
		];
	});
	readonly fields = form(this.model, (path) =>
		validate(path, ({ value }) => {
			const draft = value();
			const errors = fieldErrors(draft.values, [
				...this.identity(),
				...this.sections.flatMap((section) => section.fields),
			]).concat(
				this.tables().flatMap((table) =>
					(draft.tables[table.key] ?? []).flatMap((row) =>
						fieldErrors(row, table.fields),
					),
				),
			);
			return errors.map((message) => ({ kind: 'configuration', message }));
		}),
	);
	constructor() {
		this.catalog.loadDiscountGroups(undefined);
		effect(() => {
			const row = this.row(),
				standard = record(row?.['standardEstimation']);
			const values: Record<string, string> = {
				name: row?.name ?? '',
				formCurrency: String(standard['formCurrency'] ?? 'USD'),
				estimationCurrency: String(standard['estimationCurrency'] ?? 'USD'),
				vatRateId: String(row?.['vatRateId'] ?? ''),
			};
			for (const field of standardSections.flatMap((section) => section.fields))
				values[field.key] = String(readPath(standard, field.key) ?? '');
			const tables: DatasetDraft['tables'] = {};
			for (const key of [
				'pricingGroups',
				'weightPrices',
				'glassUnits',
				'singleGlass',
				'specialPrices',
				'coating.priceCategories',
				'coating.colorPrices',
			]) {
				const source =
					key === 'specialPrices'
						? row?.['specialPrices']
						: readPath(
								key.startsWith('coating.')
									? standard
									: row?.['discountsAndFactors'],
								key,
							);
				const table = untracked(() =>
					this.tables().find((table) => table.key === key),
				);
				if (!table) continue;
				tables[key] = Array.isArray(source)
					? source.map((entry) => ({
							...Object.fromEntries(
								table.fields.map((field) => [field.key, '']),
							),
							...Object.fromEntries(
								Object.entries(record(entry)).map(([key, value]) => [
									key,
									String(value),
								]),
							),
						}))
					: [];
			}
			untracked(() => this.fields().reset({ values, tables }));
		});
	}
	protected(): boolean {
		return this.row()?.['isStandard'] === true;
	}
	currencyOptions() {
		return this.catalog
			.currencies()
			.map((currency) => ({ value: currency.code, label: currency.code }));
	}
	add(table: Table): void {
		const row = Object.fromEntries(
			table.fields.map((field) => [
				field.key,
				field.key === 'currency'
					? this.model().values['estimationCurrency']
					: '',
			]),
		);
		this.model.update((draft) => ({
			...draft,
			tables: {
				...draft.tables,
				[table.key]: [...draft.tables[table.key], row],
			},
		}));
	}
	remove(key: string, index: number): void {
		this.model.update((draft) => ({
			...draft,
			tables: {
				...draft.tables,
				[key]: draft.tables[key].filter((_, i) => i !== index),
			},
		}));
	}
	filterGroups(event: Event): void {
		this.catalog.loadDiscountGroups(
			(event.target as HTMLSelectElement).value || undefined,
		);
	}
	async save(event: Event): Promise<void> {
		event.preventDefault();
		await submit(this.fields, async () => {
			const row = this.row(),
				draft = this.model(),
				standard = structuredClone(record(row?.['standardEstimation'])),
				discounts = structuredClone(record(row?.['discountsAndFactors']));
			standard['schemaVersion'] = 1;
			discounts['schemaVersion'] = 1;
			standard['formCurrency'] = draft.values['formCurrency'];
			standard['estimationCurrency'] = draft.values['estimationCurrency'];
			for (const field of this.sections.flatMap((section) => section.fields))
				writePath(
					standard,
					field.key,
					fieldValue(draft.values[field.key], field),
				);
			let specialPrices: unknown[] = [];
			for (const table of this.tables()) {
				const rows = draft.tables[table.key].map((entry) => {
					const value: Record<string, unknown> = { ...entry };
					for (const field of table.fields) {
						if (entry[field.key] === undefined) continue;
						const next = fieldValue(entry[field.key], field);
						if (next === undefined) delete value[field.key];
						else value[field.key] = next;
					}
					return value;
				});
				if (table.root === 'specialPrices') specialPrices = rows;
				else
					writePath(
						table.root === 'standardEstimation' ? standard : discounts,
						table.key,
						rows,
					);
			}
			await this.persist()({
				name: this.protected()
					? (row?.name ?? '')
					: draft.values['name'].trim(),
				standardEstimation: standard,
				discountsAndFactors: discounts,
				specialPrices,
				vatRateId: draft.values['vatRateId'] || null,
			} as ConfigObject);
		});
	}
}
