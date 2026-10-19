import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	signal,
	untracked,
} from '@angular/core';
import { form, FormField, submit, validate } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import {
	HubCatalogStore,
	HubConfigurationStore,
	type ConfigObject,
} from '@planicam/hub/state';
import { Button } from '@planicam/shared/ui/button';
import {
	ConfigurationFields,
	fieldErrors,
	fieldValue,
	record,
	title,
	type SettingField,
} from '../configuration-fields/configuration-fields.component';
interface OperationDraft {
	enabled: boolean;
	values: Record<string, string>;
	rules: Record<string, string>[];
}
interface LaborDraft {
	maps: Record<string, Record<string, OperationDraft>>;
}
const simpleFields: SettingField[] = [
	'fabrication',
	'installation',
	'dismantling',
	'workPreparation',
].flatMap((name) =>
	['Piece', 'Meter'].map((unit) => ({
		key: name + 'MinutesPer' + unit,
		label: title(name) + ' minutes per ' + unit.toLowerCase(),
		type: 'number' as const,
	})),
);
const numericRuleFields = [
	'quantity',
	'timeMinutesPerMeter',
	'timeMinutesPerPiece',
	'timeMinutesPerSquareMeter',
	'widthMinInclusive',
	'widthMaxExclusive',
	'heightMinInclusive',
	'heightMaxExclusive',
	'areaMinInclusive',
	'areaMaxExclusive',
];
@Component({
	selector: 'planicam-labor-hours',
	imports: [Button, FormField, ConfigurationFields],
	providers: [HubConfigurationStore],
	templateUrl: './labor-hours.component.html',
	styleUrl: './labor-hours.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LaborHours {
	readonly store = inject(HubConfigurationStore);
	readonly catalog = inject(HubCatalogStore);
	readonly systemId = signal('');
	readonly scope = signal('always');
	readonly operation = signal('');
	readonly path = computed(
		() =>
			'organization/labor-hours' +
			(this.systemId() ? '/systems/' + this.systemId() : ''),
	);
	readonly operations = computed(
		() => this.catalog.options()['laborOperations'] ?? [],
	);
	readonly scopes = computed(() =>
		this.systemId()
			? [{ value: 'overrides', label: 'System overrides' }]
			: [
					{ value: 'always', label: 'Always' },
					...(this.catalog.options()['systemProfileCategories'] ?? []),
				],
	);
	readonly selectedOperation = computed(() =>
		this.operations().find((option) => option.value === this.operation()),
	);
	readonly simpleFields = simpleFields;
	readonly ruleFields = computed<SettingField[]>(() => [
		...numericRuleFields.map(
			(key): SettingField => ({
				key,
				label: title(key),
				type: 'number',
				required: key === 'quantity',
			}),
		),
		{
			key: 'description',
			label: 'Work category',
			type: 'select',
			required: true,
			options: [
				'DISMANTLING',
				'FABRICATION',
				'INSTALLATION',
				'WORK_PREPARATION',
			].map((value) => ({
				value,
				label: title(value.toLowerCase().replaceAll('_', ' ')),
			})),
		},
		{
			key: 'materialType',
			label: 'Material',
			type: 'select',
			options: this.catalog.options()['laborMaterials'] ?? [],
		},
		{ key: 'subsystem', label: 'Subsystem' },
		{ key: 'comment', label: 'Comment' },
	]);
	readonly model = signal<LaborDraft>({ maps: {} });
	readonly fields = form(this.model, (path) =>
		validate(path, ({ value }) => {
			const errors = Object.values(value().maps).flatMap((map) =>
				Object.entries(map).flatMap(([key, draft]) => {
					if (!draft.enabled) return [];
					const definition = this.operations().find(
						(option) => option.value === key,
					);
					return definition?.['kind'] === 'SIMPLE'
						? fieldErrors(draft.values, this.simpleFields)
						: draft.rules.flatMap((rule) =>
								fieldErrors(rule, this.ruleFields()),
							);
				}),
			);
			return errors.map((message) => ({ kind: 'labor', message }));
		}),
	);
	constructor() {
		this.store.load(this.path);
		effect(() => {
			const row = this.store.record();
			if (!row) return;
			const maps: LaborDraft['maps'] = {};
			for (const scope of this.scopes()) {
				const source = record(
					scope.value === 'always'
						? row['alwaysRecords']
						: scope.value === 'overrides'
							? row['overrides']
							: record(row['categoryRecords'])[scope.value],
				);
				maps[scope.value] = Object.fromEntries(
					this.operations().map((operation) => {
						const stored = record(source[operation.value]);
						const values = Object.fromEntries(
							simpleFields.map((field) => [
								field.key,
								String(stored[field.key] ?? ''),
							]),
						);
						const rules = Array.isArray(stored['rules'])
							? stored['rules'].map((rule) =>
									Object.fromEntries(
										this.ruleFields().map((field) => [
											field.key,
											String(record(rule)[field.key] ?? ''),
										]),
									),
								)
							: [];
						return [
							operation.value,
							{ enabled: !!stored['kind'], values, rules },
						];
					}),
				);
			}
			untracked(() => {
				this.fields().reset({ maps });
				if (!this.operation() && this.operations().length)
					this.operation.set(this.operations()[0].value);
			});
		});
	}
	changeSystem(event: Event): void {
		this.scope.set(
			(event.target as HTMLSelectElement).value ? 'overrides' : 'always',
		);
		this.systemId.set((event.target as HTMLSelectElement).value);
	}
	changeScope(event: Event): void {
		this.scope.set((event.target as HTMLSelectElement).value);
	}
	changeOperation(event: Event): void {
		this.operation.set((event.target as HTMLSelectElement).value);
	}
	addRule(): void {
		const row = Object.fromEntries(
			this.ruleFields().map((field) => [
				field.key,
				field.key === 'quantity'
					? '1'
					: field.key === 'description'
						? 'FABRICATION'
						: '',
			]),
		);
		this.updateRules((rules) => [...rules, row]);
	}
	removeRule(index: number): void {
		this.updateRules((rules) => rules.filter((_, i) => index !== i));
	}
	private updateRules(
		update: (rows: Record<string, string>[]) => Record<string, string>[],
	): void {
		this.model.update((draft) => {
			const map = draft.maps[this.scope()],
				operation = map[this.operation()];
			return {
				maps: {
					...draft.maps,
					[this.scope()]: {
						...map,
						[this.operation()]: {
							...operation,
							rules: update(operation.rules),
						},
					},
				},
			};
		});
	}
	reload(): void {
		this.store.load(this.path());
	}
	async save(event: Event): Promise<void> {
		event.preventDefault();
		await submit(this.fields, async () => {
			const row = this.store.record();
			if (!row) return;
			const build = (scope: string): Record<string, unknown> => {
				const source = record(
					scope === 'always'
						? row['alwaysRecords']
						: scope === 'overrides'
							? row['overrides']
							: record(row['categoryRecords'])[scope],
				);
				const result = { ...source };
				for (const operation of this.operations()) {
					const draft = this.model().maps[scope][operation.value];
					if (!draft.enabled) {
						delete result[operation.value];
						continue;
					}
					const convert = (
						values: Record<string, string>,
						fields: readonly SettingField[],
					) =>
						Object.fromEntries(
							fields.flatMap((field) => {
								const value = fieldValue(values[field.key], field);
								return value === undefined ? [] : [[field.key, value]];
							}),
						);
					result[operation.value] =
						operation['kind'] === 'SIMPLE'
							? { kind: 'SIMPLE', ...convert(draft.values, this.simpleFields) }
							: {
									kind: 'RULE_BASED',
									rules: draft.rules.map((rule) =>
										convert(rule, this.ruleFields()),
									),
								};
				}
				return result;
			};
			const body = this.systemId()
				? {
						overrides: build('overrides'),
						...(row.version ? { expectedVersion: row.version } : {}),
					}
				: {
						alwaysRecords: build('always'),
						categoryRecords: Object.fromEntries(
							this.scopes()
								.filter((scope) => scope.value !== 'always')
								.map((scope) => [scope.value, build(scope.value)]),
						),
						expectedVersion: row.version,
					};
			await firstValueFrom(
				this.store.save(this.path(), body as ConfigObject, 'PUT'),
			);
		});
	}
}
