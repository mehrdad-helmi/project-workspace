import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form } from '@angular/forms/signals';
import { distinctUntilChanged, map } from 'rxjs';
import { HubPrintoutSelectionStore } from '@planicam/hub/state';
import { Button } from '@planicam/shared/ui/button';
import { InputField } from '@planicam/shared/ui/input-field';

@Component({
	selector: 'planicam-printouts-page',
	imports: [Button, InputField],
	providers: [HubPrintoutSelectionStore],
	changeDetection: ChangeDetectionStrategy.OnPush,
	templateUrl: './printouts.page.html',
	styleUrl: './printouts.page.scss',
})
export class PrintoutsPage {
	protected readonly store = inject(HubPrintoutSelectionStore);
	private readonly route = inject(ActivatedRoute);
	protected readonly category = signal<string | null>(null);
	protected readonly search = signal({ report: '', position: '' });
	protected readonly searchForm = form(this.search);
	protected readonly categories = computed(() => [
		...new Set(this.store.types().map((type) => type.category)),
	]);
	protected readonly reports = computed(() => {
		const query = this.search().report.trim().toLowerCase();
		return this.store
			.types()
			.filter(
				(type) =>
					(!this.category() || type.category === this.category()) &&
					(!query ||
						`${type.name} ${type.description ?? ''}`
							.toLowerCase()
							.includes(query)),
			);
	});
	protected readonly positions = computed(() => {
		const query = this.search().position.trim().toLowerCase();
		return this.store
			.positions()
			.filter(
				(position) =>
					!query ||
					`${position.number} ${position.name} ${position.projectName}`
						.toLowerCase()
						.includes(query),
			);
	});
	protected readonly sourceLabel = computed(() => {
		switch (this.store.query()?.inputType) {
			case 'PROJECT':
				return 'Project';
			case 'PROJECT_PHASE':
				return 'Project phase';
			case 'POSITIONS':
				return 'Selected positions';
			case 'ELEMENTS':
				return 'Selected elements';
			case 'FABRICATION_BATCH':
				return 'Fabrication batch';
			default:
				return 'Position catalog';
		}
	});

	constructor() {
		this.route.queryParamMap
			.pipe(
				map((params) => ({
					inputType: params.get('inputType'),
					inputId: params.get('inputId'),
					inputIds: params.get('inputIds'),
					projectId: params.get('projectId'),
					positionId: params.get('positionId'),
				})),
				distinctUntilChanged(
					(left, right) => JSON.stringify(left) === JSON.stringify(right),
				),
				takeUntilDestroyed(),
			)
			.subscribe((query) => {
				this.category.set(null);
				this.store.load(query);
			});
	}
	protected refresh(): void {
		const query = this.store.query();
		if (query) this.store.load(query);
	}
	protected selectVisible(selected: boolean): void {
		this.store.selectPositions(
			this.positions().map((position) => position.id),
			selected,
		);
	}
}
