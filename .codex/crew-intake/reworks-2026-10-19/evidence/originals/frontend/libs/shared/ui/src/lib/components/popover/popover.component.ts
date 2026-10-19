import {
	ChangeDetectionStrategy,
	Component,
	input,
	signal,
} from '@angular/core';
import { PopoverModule } from 'primeng/popover';
import { IconButton } from '../icon-button';
import type { IconName } from '../../icons';

@Component({
	selector: 'pl-popover',
	imports: [PopoverModule, IconButton],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<pl-icon-button
			[label]="label()"
			[icon]="icon()"
			[expanded]="open()"
			popup="dialog"
			(pressed)="panel.toggle($event)"
		/><p-popover
			#panel
			[ariaLabel]="label()"
			appendTo="body"
			(onShow)="open.set(true)"
			(onHide)="open.set(false)"
			><ng-content
		/></p-popover>`,
})
export class Popover {
	readonly label = input.required<string>();
	readonly icon = input.required<IconName>();
	protected readonly open = signal(false);
}
