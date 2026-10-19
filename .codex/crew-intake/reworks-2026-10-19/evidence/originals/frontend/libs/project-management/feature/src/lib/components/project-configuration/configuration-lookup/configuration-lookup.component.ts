import {
	ChangeDetectionStrategy,
	Component,
	effect,
	inject,
	input,
	untracked,
} from '@angular/core';
import { FormField, type Field } from '@angular/forms/signals';
import { HubConfigurationStore } from '@planicam/hub/state';
@Component({
	selector: 'planicam-configuration-lookup',
	imports: [FormField],
	providers: [HubConfigurationStore],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<fieldset [disabled]="disabled() || !path()">
			<label
				>{{ label()
				}}<select [formField]="field()">
					<option value="">Not set</option>
					@if (field()().value()) {
						<option [value]="field()().value()">Current selection</option>
					}
					@for (option of store.records(); track option.id) {
						<option [value]="option.id">{{ option.name || option.id }}</option>
					}
				</select></label
			>
		</fieldset>
		@if (store.loading()) {
			<small>Loading choices…</small>
		}
		@if (store.error(); as error) {
			<small role="alert">{{ error.message }}</small>
		}`,
	styles: `
		:host {
			display: block;
		}
		fieldset {
			border: 0;
			padding: 0;
			margin: 0;
			min-width: 0;
		}
		label {
			display: grid;
			gap: 8px;
		}
		select {
			width: 100%;
			padding: 10px;
			background: var(--p-form-field-background);
			color: var(--p-text-color);
			border: 1px solid var(--p-form-field-border-color);
			border-radius: var(--p-border-radius-md);
		}
	`,
})
export class ConfigurationLookup {
	readonly path = input.required<string>();
	readonly label = input.required<string>();
	readonly field = input.required<Field<string>>();
	readonly disabled = input(false);
	protected readonly store = inject(HubConfigurationStore);
	constructor() {
		effect(() => {
			const path = this.path();
			if (path) untracked(() => this.store.load(path));
		});
	}
}
