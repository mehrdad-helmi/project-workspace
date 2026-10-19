import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';

export interface SettingField {
	readonly key: string;
	readonly label: string;
	readonly type?: 'text' | 'decimal' | 'number' | 'boolean' | 'select';
	readonly required?: boolean;
	readonly options?: readonly {
		readonly value: string;
		readonly label: string;
	}[];
	readonly readonly?: boolean;
}
export function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
export function title(value: string): string {
	return value
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/^./, (letter) => letter.toUpperCase());
}
export function readPath(source: unknown, path: string): unknown {
	return path
		.split('.')
		.reduce<unknown>((value, key) => record(value)[key], source);
}
export function writePath(
	target: Record<string, unknown>,
	path: string,
	value: unknown,
): void {
	const keys = path.split('.');
	const leaf = keys.pop();
	if (!leaf) return;
	let parent = target;
	for (const key of keys) {
		parent[key] = { ...record(parent[key]) };
		parent = record(parent[key]);
	}
	if (value === undefined) delete parent[leaf];
	else parent[leaf] = value;
}
export function fieldValue(value: string, field: SettingField): unknown {
	if (value === '') return undefined;
	return field.type === 'boolean'
		? value === 'true'
		: field.type === 'number'
			? Number(value)
			: value;
}
export function fieldErrors(
	values: Record<string, string>,
	fields: readonly SettingField[],
): string[] {
	return fields.flatMap((field) => {
		const value = values[field.key] ?? '';
		if (field.required && !value.trim()) return [field.label + ' is required.'];
		if (!value) return [];
		if (field.type === 'decimal' && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
			return [field.label + ' must be a decimal number.'];
		if (
			field.type === 'number' &&
			(!Number.isFinite(Number(value)) || Number(value) < 0)
		)
			return [field.label + ' must be a nonnegative number.'];
		return [];
	});
}
let nextFieldsId = 0;
@Component({
	selector: 'planicam-configuration-fields',
	imports: [FormField],
	template: `@for (field of descriptors(); track field.key) {
		<label [attr.for]="id + field.key"
			>{{ field.label }}
			@if (field.required) {
				<span aria-hidden="true">*</span>
			}
			@if (field.readonly) {
				<input
					[id]="id + field.key"
					[value]="fields()[field.key]().value()"
					readonly
				/>
			} @else if (field.type === 'boolean' || field.type === 'select') {
				<select [id]="id + field.key" [formField]="fields()[field.key]">
					<option value="">Not configured</option>
					@if (field.type === 'boolean') {
						<option value="true">Yes</option>
						<option value="false">No</option>
					}
					@for (option of field.options ?? []; track option.value) {
						<option [value]="option.value">{{ option.label }}</option>
					}
					@if (
						fields()[field.key]().value() &&
						field.type === 'select' &&
						!hasOption(field, fields()[field.key]().value())
					) {
						<option [value]="fields()[field.key]().value()">
							Existing selection (catalog unavailable)
						</option>
					}
				</select>
			} @else {
				<input
					[id]="id + field.key"
					[formField]="fields()[field.key]"
					[attr.inputmode]="
						field.type === 'decimal' || field.type === 'number'
							? 'decimal'
							: null
					"
				/>
			}
		</label>
	}`,
	styles: [
		`
			:host {
				display: grid;
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: 16px;
			}
			label {
				display: flex;
				flex-direction: column;
				gap: 8px;
				font-size: 14px;
			}
			input,
			select {
				padding: 10px;
				border: 1px solid var(--p-form-field-border-color);
				border-radius: var(--p-border-radius-md);
				background: var(--p-form-field-background);
				color: var(--p-text-color);
				font: inherit;
				min-width: 0;
			}
			input:focus-visible,
			select:focus-visible {
				outline: 2px solid var(--p-focus-ring-color);
				outline-offset: 2px;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurationFields {
	readonly id = `configuration-fields-${nextFieldsId++}-`;
	readonly descriptors = input.required<readonly SettingField[]>();
	readonly fields = input.required<FieldTree<Record<string, string>>>();
	hasOption(field: SettingField, value: string): boolean {
		return !!field.options?.some((option) => option.value === value);
	}
}
