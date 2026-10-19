import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	inject,
	input,
	output,
	signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TieredMenuModule } from 'primeng/tieredmenu';
import type { MenuItem } from 'primeng/api';
import { Icon, type IconName } from '../../icons';
import type { ActionMenuItem } from './action-menu.model';

interface MenuEntry extends MenuItem {
	readonly semanticIcon?: IconName;
	readonly destructive?: boolean;
}

let nextMenuId = 0;

@Component({
	selector: 'pl-action-menu',
	imports: [TieredMenuModule, RouterLink, Icon],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<button
			type="button"
			class="more-button"
			[attr.aria-label]="label()"
			aria-haspopup="menu"
			[attr.aria-controls]="menuId"
			[attr.aria-expanded]="open()"
			(click)="$event.stopPropagation(); menu.toggle($event)"
		>
			<svg plIcon="moreActions" [size]="16" aria-hidden="true" />
		</button>
		<p-tieredmenu
			#menu
			[id]="menuId"
			[model]="menuItems()"
			[popup]="true"
			appendTo="body"
			[ariaLabel]="label()"
			(onShow)="open.set(true)"
			(onHide)="open.set(false)"
		>
			<ng-template #item let-item let-hasSubmenu="hasSubmenu">
				<a
					class="p-tieredmenu-item-link"
					[routerLink]="item.routerLink"
					[queryParams]="item.queryParams"
					[target]="item.target"
					rel="noopener noreferrer"
					tabindex="-1"
					[class.is-destructive]="item.destructive"
				>
					@if (item.semanticIcon) {
						<svg [plIcon]="item.semanticIcon" [size]="16" aria-hidden="true" />
					}
					<span>{{ item.label }}</span>
					@if (hasSubmenu) {
						<svg
							class="submenu-arrow"
							plIcon="next"
							[size]="12"
							aria-hidden="true"
						/>
					}
				</a>
			</ng-template>
		</p-tieredmenu>
	`,
	styleUrl: './action-menu.component.scss',
})
export class ActionMenu {
	private readonly destroyRef = inject(DestroyRef);
	readonly items = input.required<readonly ActionMenuItem[]>();
	readonly label = input.required<string>();
	readonly selected = output<string>();
	protected readonly menuId = `pl-action-menu-${++nextMenuId}`;
	protected readonly open = signal(false);
	protected readonly menuItems = computed(() => this.mapItems(this.items()));

	private mapItems(items: readonly ActionMenuItem[]): MenuEntry[] {
		return items.flatMap((item) => [
			...(item.separatorBefore ? [{ separator: true }] : []),
			{
				id: item.id,
				label: item.label,
				semanticIcon: item.icon,
				destructive: item.destructive,
				routerLink: item.link ? [...item.link] : undefined,
				target: item.target,
				queryParams: item.queryParams,
				items: item.items ? this.mapItems(item.items) : undefined,
				command: () => {
					if (!this.destroyRef.destroyed && !item.link)
						this.selected.emit(item.id);
				},
			},
		]);
	}
}
