import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	inject,
	output,
	signal,
	viewChild,
} from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { FabricationStore } from '@planicam/fabrication/state';
import { PositionsStore } from '@planicam/project-management/state';
import { Button } from '@planicam/shared/ui/button';
import { InputField } from '@planicam/shared/ui/input-field';

type AssignmentSource = { label: string } & (
	| { projectId: string; positionId?: never; elementIds?: never }
	| { positionId: string; projectId?: never; elementIds?: never }
	| { elementIds: readonly string[]; projectId?: never; positionId?: never }
);

@Component({
	selector: 'planicam-batch-assignment',
	imports: [Button, InputField, FormField],
	providers: [FabricationStore, PositionsStore],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<dialog
		#dialog
		aria-labelledby="assign-batch-title"
		(cancel)="batches.saving() ? $event.preventDefault() : close()"
	>
		<form (submit)="assign($event)">
			<h2 id="assign-batch-title">
				Add {{ source()?.label }} to a fabrication batch
			</h2>
			<p>
				Only active, included, unassigned elements are added. Future elements
				are not added automatically.
			</p>
			@if (message()) {
				<p role="status">{{ message() }}</p>
			}
			@if (batches.error(); as error) {
				<p role="alert">{{ error.message }}</p>
			}
			@if (positions.error(); as error) {
				<p role="alert">{{ error.message }}</p>
			}
			@if (!complete()) {
				<div class="search">
					<pl-input-field
						[field]="searchForm.query"
						label="Find a batch"
					/><pl-button label="Search" variant="outlined" (pressed)="search()" />
				</div>
				@if (batches.loading() || positions.detailLoading()) {
					<p role="status">Loading…</p>
				}
				<label
					>Fabrication batch<select [formField]="fields.batchId">
						<option value="">Choose a batch</option>
						@for (batch of batches.items(); track batch.id) {
							<option [value]="batch.id">
								{{ batch.number }} · {{ batch.name }}
							</option>
						}
					</select></label
				>
				<div class="actions">
					<pl-button
						label="Previous"
						variant="text"
						[disabled]="(batches.query().page ?? 1) <= 1 || batches.loading()"
						(pressed)="page(-1)"
					/><span
						>Page {{ batches.query().page ?? 1 }} ·
						{{ batches.total() }} batches</span
					><pl-button
						label="Next"
						variant="text"
						[disabled]="
							(batches.query().page ?? 1) * 25 >= batches.total() ||
							batches.loading()
						"
						(pressed)="page(1)"
					/>
				</div>
			}
			<footer>
				<pl-button
					[label]="complete() ? 'Done' : 'Cancel'"
					variant="outlined"
					[disabled]="batches.saving()"
					(pressed)="close()"
				/>
				@if (!complete()) {
					<pl-button
						label="Add eligible elements"
						type="submit"
						[disabled]="
							fields().invalid() ||
							batches.loading() ||
							positions.detailLoading()
						"
						[loading]="batches.saving()"
					/>
				}
			</footer>
		</form>
	</dialog>`,
	styles: `
		dialog {
			width: 640px;
			max-height: 85vh;
			padding: 24px;
			background: var(--p-content-background);
			color: var(--p-text-color);
			border: 1px solid var(--p-content-border-color);
			border-radius: 12px;
		}
		form,
		label {
			display: grid;
			gap: 16px;
		}
		select {
			font: inherit;
			padding: 10px;
			background: var(--p-form-field-background);
			color: var(--p-text-color);
			border: 1px solid var(--p-form-field-border-color);
		}
		.search,
		.actions,
		footer {
			display: flex;
			align-items: center;
			gap: 12px;
		}
		footer {
			justify-content: flex-end;
		}
		.search pl-input-field {
			flex: 1;
		}
	`,
})
export class BatchAssignment {
	protected readonly batches = inject(FabricationStore);
	protected readonly positions = inject(PositionsStore);
	private readonly dialog =
		viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
	protected readonly source = signal<AssignmentSource | null>(null);
	protected readonly model = signal({ batchId: '' });
	protected readonly fields = form(this.model, (p) => required(p.batchId));
	protected readonly searchModel = signal({ query: '' });
	protected readonly searchForm = form(this.searchModel);
	protected readonly message = signal('');
	protected readonly complete = signal(false);
	readonly changed = output<void>();
	open(source: AssignmentSource): void {
		this.source.set(source);
		this.fields().reset({ batchId: '' });
		this.searchForm().reset({ query: '' });
		this.message.set('');
		this.complete.set(false);
		this.batches.load({
			page: 1,
			pageSize: 25,
			archive: 'active',
			sortBy: 'updatedAt',
			sortDirection: 'desc',
		});
		this.positions.select(source.positionId ?? null);
		this.dialog().nativeElement.showModal();
	}
	protected close(): void {
		if (!this.batches.saving()) this.dialog().nativeElement.close();
	}
	protected search(): void {
		this.batches.load({
			...this.batches.query(),
			page: 1,
			q: this.searchModel().query,
		});
	}
	protected page(offset: number): void {
		this.fields().reset({ batchId: '' });
		this.batches.load({
			...this.batches.query(),
			page: (this.batches.query().page ?? 1) + offset,
		});
	}
	protected async assign(event: Event): Promise<void> {
		event.preventDefault();
		await submit(this.fields, async () => {
			const source = this.source();
			const batch = this.batches
				.items()
				.find((b) => b.id === this.model().batchId);
			if (!source || !batch || this.complete()) return;
			if (
				source.positionId &&
				this.positions.selected()?.id !== source.positionId
			) {
				this.message.set('Wait for the position elements to load.');
				return;
			}
			const elementIds =
				source.elementIds ?? this.positions.elements().map((e) => e.id);
			if (!source.projectId && !elementIds.length) {
				this.message.set('This position has no physical elements to assign.');
				return;
			}
			const result = await firstValueFrom(
				this.batches.assign(
					batch.id,
					batch.version,
					source.projectId
						? { projectIds: [source.projectId] }
						: { elementIds },
				),
			);
			if (result.kind === 'success') {
				this.message.set(
					result.value.assigned.length +
						' elements added; ' +
						result.value.skipped.length +
						' skipped. ' +
						Object.entries(
							result.value.skipped.reduce<Record<string, number>>(
								(counts, item) => {
									counts[item.reason] = (counts[item.reason] ?? 0) + 1;
									return counts;
								},
								{},
							),
						)
							.map(
								([reason, count]) =>
									reason.replaceAll('_', ' ').toLowerCase() + ': ' + count,
							)
							.join('; '),
				);
				this.complete.set(true);
				this.changed.emit();
			}
		});
	}
}
