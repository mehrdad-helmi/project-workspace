import {
	ChangeDetectionStrategy,
	Component,
	input,
	model,
} from '@angular/core';
import { StepperModule } from 'primeng/stepper';

/** Progress headers; the owner renders each step's form and submission actions. */
@Component({
	selector: 'pl-stepper',
	imports: [StepperModule],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<p-stepper [value]="value() + 1" (valueChange)="select($event)">
			<p-step-list>
				@for (label of steps(); track $index; let index = $index) {
					<p-step [value]="index + 1" [disabled]="disabled()">{{
						label
					}}</p-step>
				}
			</p-step-list>
		</p-stepper>
	`,
})
export class Stepper {
	readonly steps = input.required<readonly string[]>();
	readonly value = model(0);
	readonly disabled = input(false);
	protected select(value: number | undefined): void {
		if (!this.disabled() && value !== undefined) this.value.set(value - 1);
	}
}
