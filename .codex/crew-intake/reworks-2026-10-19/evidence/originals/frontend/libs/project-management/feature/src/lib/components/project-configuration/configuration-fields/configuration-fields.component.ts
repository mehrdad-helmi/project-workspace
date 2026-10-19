import {
	ChangeDetectionStrategy,
	Component,
	input,
	linkedSignal,
	output,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import type {
	ConfigObject,
	Currency,
	SystemProfile,
} from '@planicam/hub/state';
import { InputField } from '@planicam/shared/ui/input-field';
import { ConfigurationLookup } from '../configuration-lookup/configuration-lookup.component';
import {
	fieldInput,
	writeFields,
	type ConfigurationField,
} from '../project-configuration.model';
@Component({
	selector: 'planicam-configuration-fields',
	imports: [InputField, FormField, ConfigurationLookup],
	changeDetection: ChangeDetectionStrategy.OnPush,
	templateUrl: './configuration-fields.component.html',
	styles: `
		.fields {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 20px;
		}
		label {
			display: grid;
			gap: 8px;
		}
		fieldset {
			border: 0;
			padding: 0;
			margin: 0;
			min-width: 0;
		}
		select {
			width: 100%;
			padding: 10px;
			background: var(--p-form-field-background);
			color: var(--p-text-color);
			border: 1px solid var(--p-form-field-border-color);
			border-radius: var(--p-border-radius-md);
		}
		small {
			color: var(--p-text-muted-color);
		}
	`,
})
export class ConfigurationFields {
	readonly value = input.required<ConfigObject>();
	readonly fields = input.required<readonly ConfigurationField[]>();
	readonly systems = input.required<readonly SystemProfile[]>();
	readonly currencies = input.required<readonly Currency[]>();
	readonly disabled = input(false);
	readonly changed = output<ConfigObject>();
	protected readonly model = linkedSignal({
		source: () => ({ value: this.value(), fields: this.fields() }),
		computation: (source, previous): { values: Record<string, string> } => {
			if (
				previous &&
				source.fields === previous.source.fields &&
				source.fields.every((field) => {
					const parsed = fieldInput(field, previous.value.values[field.key]);
					return (
						Object.is(parsed, source.value[field.key]) ||
						(parsed === undefined && source.value[field.key] === null)
					);
				})
			)
				return previous.value;
			return {
				values: {
					_lookupSupplierId: '',
					...Object.fromEntries(
						source.fields.map((field) => [
							field.key,
							source.value[field.key] === undefined ||
							source.value[field.key] === null
								? ''
								: String(source.value[field.key]),
						]),
					),
				},
			};
		},
	});
	protected readonly controls = form(this.model);
	protected hasSupplierField(): boolean {
		return this.fields().some((field) => field.key === 'supplierId');
	}
	protected groupPath(): string {
		const supplier =
			this.model().values['supplierId'] ||
			this.model().values['_lookupSupplierId'];
		return supplier
			? 'discount-groups?supplierId=' + encodeURIComponent(supplier)
			: '';
	}
	protected clearGroup(): void {
		this.model.update((value) => ({
			values: { ...value.values, groupId: '' },
		}));
	}
	protected publish(): void {
		this.changed.emit(
			writeFields(this.value(), this.fields(), this.model().values),
		);
	}
	protected missingChoice(field: ConfigurationField): boolean {
		const value = this.model().values[field.key];
		if (!value) return false;
		if (field.kind === 'system')
			return !this.systems().some((item) => item.id === value);
		if (field.kind === 'currency')
			return !this.currencies().some((item) => item.code === value);
		return false;
	}
}
