import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, distinctUntilChanged, map } from 'rxjs';
import { Button } from '@planicam/shared/ui/button';
import { Tree, type TreeItem } from '@planicam/shared/ui/tree';
import { PositionEditorStore } from '@planicam/position-editor/state';
import { PositionEditorCanvas } from '../../components/position-editor-canvas/position-editor-canvas.component';
import { PositionEditorProperties } from '../../components/position-editor-properties/position-editor-properties.component';
import { PositionEditorRibbon } from '../../components/position-editor-ribbon/position-editor-ribbon.component';

@Component({
	selector: 'planicam-position-editor-entry',
	imports: [
		Tree,
		Button,
		PositionEditorCanvas,
		PositionEditorProperties,
		PositionEditorRibbon,
	],
	providers: [PositionEditorStore],
	changeDetection: ChangeDetectionStrategy.OnPush,
	templateUrl: './position-editor.page.html',
	styleUrl: './position-editor.page.scss',
	host: { '(window:beforeunload)': 'beforeUnload($event)' },
})
export class PositionEditorPage {
	protected readonly store = inject(PositionEditorStore);
	private readonly route = inject(ActivatedRoute);
	protected readonly layerTree = computed<readonly TreeItem[]>(() => [
		{
			id: 'position',
			label: this.store.position()?.number ?? 'Position',
			expanded: true,
			children:
				this.store.projection()?.fields.map((_, index) => ({
					id: String(index),
					label: `Field ${index + 1}`,
					icon: 'gridView' as const,
				})) ?? [],
		},
	]);
	protected readonly selectedId = computed(() =>
		this.store.selectedField() === null
			? 'position'
			: String(this.store.selectedField()),
	);

	constructor() {
		combineLatest(this.route.pathFromRoot.map((route) => route.paramMap))
			.pipe(
				map(
					(params) =>
						params
							.map((value) => value.get('positionId'))
							.find((value) => value !== null) ?? '',
				),
				distinctUntilChanged(),
				takeUntilDestroyed(),
			)
			.subscribe((id) => {
				if (id) this.store.load(id);
			});
	}
	protected selectLayer(id: string | null): void {
		this.store.selectField(
			id === null || id === 'position' ? null : Number(id),
		);
	}
	protected reload(): void {
		if (this.canLeave()) this.store.load(this.store.positionId());
	}
	canLeave(): boolean {
		return (
			(!this.store.dirty() && !this.store.saving()) ||
			window.confirm(
				this.store.saving()
					? 'A save is still in progress. Leave this editor?'
					: 'Discard unsaved design changes?',
			)
		);
	}
	protected beforeUnload(event: BeforeUnloadEvent): void {
		if (this.store.dirty() || this.store.saving()) {
			event.preventDefault();
			event.returnValue = '';
		}
	}
}
