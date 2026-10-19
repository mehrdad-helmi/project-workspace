import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
	output,
} from '@angular/core';
import { TreeModule } from 'primeng/tree';
import type { TreeNode } from 'primeng/api';
import { Icon } from '../../icons';
import type { TreeItem } from './tree.model';

@Component({
	selector: 'pl-tree',
	imports: [TreeModule, Icon],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<p-tree
		[value]="nodes()"
		selectionMode="single"
		[selection]="selection()"
		[metaKeySelection]="false"
		[filter]="true"
		filterPlaceholder="Search Elements"
		[ariaLabel]="label()"
		(onNodeSelect)="selected.emit($event.node.key ?? null)"
		(onNodeUnselect)="selected.emit(null)"
		><ng-template #node let-node>
			@if (node.data; as icon) {
				<svg [plIcon]="icon" size="14" aria-hidden="true" />
			}
			<span>{{ node.label }}</span></ng-template
		></p-tree
	>`,
	styles: `
		:host {
			display: block;
			--p-tree-padding: 0;
			--p-tree-gap: 2px;
			--p-tree-node-padding: 7px;
		}
		svg {
			flex-shrink: 0;
			margin-right: 7px;
		}
	`,
})
export class Tree {
	readonly items = input.required<readonly TreeItem[]>();
	readonly selectedId = input<string | null>(null);
	readonly label = input.required<string>();
	readonly selected = output<string | null>();
	protected readonly nodes = computed(() => this.mapNodes(this.items()));
	protected readonly selection = computed(() =>
		this.findNode(this.nodes(), this.selectedId()),
	);
	private mapNodes(items: readonly TreeItem[]): TreeNode[] {
		return items.map((item) => ({
			key: item.id,
			label: item.label,
			data: item.icon,
			expanded: item.expanded,
			children: item.children ? this.mapNodes(item.children) : undefined,
		}));
	}
	private findNode(nodes: TreeNode[], id: string | null): TreeNode | null {
		for (const node of nodes) {
			if (node.key === id) return node;
			const found = this.findNode(node.children ?? [], id);
			if (found) return found;
		}
		return null;
	}
}
