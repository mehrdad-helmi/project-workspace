import {
	ChangeDetectionStrategy,
	Component,
	computed,
	ElementRef,
	inject,
	output,
	signal,
	viewChild,
} from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { of, firstValueFrom } from 'rxjs';
import { projectRectangle } from '@planicam/calc/temporary-engine';
import { HubCatalogStore } from '@planicam/hub/state';
import {
	PositionsStore,
	type Position,
} from '@planicam/project-management/state';
import { InputField } from '@planicam/shared/ui/input-field';
import { Button } from '@planicam/shared/ui/button';
@Component({
	selector: 'planicam-position-form',
	imports: [FormField, InputField, Button],
	providers: [HubCatalogStore],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<dialog
		#dialog
		aria-labelledby="position-form-title"
		(cancel)="cancel($event)"
	>
		<form (submit)="save($event)">
			<header>
				<h2 id="position-form-title">
					{{ editing() ? 'Edit position information' : 'New position' }}
				</h2>
				<button
					type="button"
					aria-label="Close position form"
					(click)="close()"
				>
					×
				</button>
			</header>
			<fieldset [disabled]="!!created() || busy()">
				<legend>Position information</legend>
				<pl-input-field label="Name" [field]="fields.name" />
				@if (!editing()) {
					<label
						>System<select [formField]="fields.systemId">
							<option value="">Choose a system</option>
							@for (system of catalog.systems(); track system.id) {
								<option [value]="system.id">{{ system.name }}</option>
							}
						</select></label
					><label
						>Position type<select [formField]="fields.type">
							<option value="">System default</option>
							@for (
								type of catalog.options()['positionTypes'];
								track type.value
							) {
								<option [value]="type.value">{{ type.label }}</option>
							}
						</select></label
					>
					<p class="pl-body-sm pl-text-muted">
						The position number is assigned when saved. A new position starts
						with one element. Optional rectangular design can be initialized
						below.
					</p>
				}
				<label
					>Phase<select [formField]="fields.phaseId">
						<option value="">No phase</option>
						@for (phase of store.phases(); track phase.id) {
							<option [value]="phase.id">{{ phase.name }}</option>
						}
					</select></label
				><label
					>Brief description<textarea
						[formField]="fields.briefDescription"
						rows="3"
					></textarea></label
				><label
					>Model description<textarea
						[formField]="fields.modelDescription"
						rows="3"
					></textarea>
				</label>
			</fieldset>
			@if (!editing()) {
				<fieldset [disabled]="busy()">
					<legend>Rectangular design (optional)</legend>
					<label
						><input
							type="checkbox"
							[checked]="initialize()"
							[disabled]="!!created()"
							(change)="initialize.set($any($event.target).checked)"
						/>Initialize design now</label
					>
					@if (initialize()) {
						<pl-input-field
							label="Overall width"
							unit="mm"
							[field]="geometryFields.width"
						/>
						<pl-input-field
							label="Overall height"
							unit="mm"
							[field]="geometryFields.height"
						/>
						@for (axis of axes; track axis.key) {
							<label
								>{{ axis.countLabel
								}}<input
									type="number"
									min="1"
									max="100"
									step="1"
									[value]="geometry()[axis.key].length"
									(change)="resizeAxis(axis.key, $event)"
							/></label>
							<p class="pl-caption">
								Leave a partial blank for Auto. Automatic fields share the
								remaining dimension equally.
							</p>
							<div class="partials">
								@for (
									partial of geometry()[axis.key];
									track $index;
									let index = $index
								) {
									<pl-input-field
										[label]="axis.partialLabel + ' ' + (index + 1)"
										[field]="geometryFields[axis.key][index]"
										placeholder="Auto"
										[leadingText]="partial.trim() === '' ? 'Auto' : ''"
										unit="mm"
									/>
								}
							</div>
						}
						@if (projection(); as result) {
							@if (result.kind === 'invalid') {
								<p role="alert">{{ result.message }}</p>
							} @else {
								<p>
									{{ result.projection.columns.length }} columns ×
									{{ result.projection.rows.length }} rows ·
									{{ result.projection.fields.length }} fields
								</p>
							}
						}
					}
				</fieldset>
			}
			@if (created()) {
				<p role="status">
					The position has been created. Design initialization has not
					completed. Retry saves the design to this same position.
				</p>
				<pl-button
					label="Finish without design"
					variant="outlined"
					[disabled]="busy()"
					(pressed)="finishCreated()"
				/>
			}
			@if (store.error(); as error) {
				<p role="alert">{{ error.message }}</p>
			}
			@if (catalog.error(); as error) {
				<p role="alert">{{ error.message }}</p>
			}
			<footer>
				<pl-button
					label="Cancel"
					variant="outlined"
					(pressed)="close()"
				/><pl-button
					[label]="
						created()
							? 'Retry design initialization'
							: editing()
								? 'Save position'
								: 'Create position'
					"
					type="submit"
					[disabled]="
						fields().invalid() ||
						store.saving() ||
						busy() ||
						(initialize() && projection().kind === 'invalid')
					"
				/>
			</footer>
		</form>
	</dialog>`,
	styles: `
		dialog {
			width: 640px;
			max-height: 85vh;
			border: 1px solid var(--p-content-border-color);
			border-radius: 12px;
			background: var(--p-content-background);
			color: var(--p-text-color);
			padding: 24px;
		}
		form {
			display: grid;
			gap: 20px;
		}
		header,
		footer {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
		}
		label {
			display: grid;
			gap: 8px;
		}
		fieldset {
			display: grid;
			gap: 16px;
			border: 1px solid var(--p-content-border-color);
		}
		select,
		input[type='number'],
		textarea {
			padding: 10px;
			font: inherit;
			background: var(--p-form-field-background);
			color: var(--p-text-color);
			border: 1px solid var(--p-content-border-color);
			border-radius: 6px;
		}
		footer {
			justify-content: flex-end;
		}
		.partials {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 12px;
		}
	`,
})
export class PositionForm {
	protected readonly store = inject(PositionsStore);
	protected readonly catalog = inject(HubCatalogStore);
	private readonly dialog =
		viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
	protected readonly editing = signal<Position | null>(null);
	protected readonly model = signal({
		name: '',
		systemId: '',
		type: '',
		phaseId: '',
		briefDescription: '',
		modelDescription: '',
	});
	protected readonly fields = form(this.model, (p) => {
		required(p.name);
		required(p.systemId);
	});
	protected readonly created = signal<Position | null>(null);
	protected readonly busy = signal(false);
	protected readonly initialize = signal(false);
	protected readonly axes = [
		{
			key: 'columns',
			countLabel: 'Fields in width',
			partialLabel: 'Partial width',
		},
		{
			key: 'rows',
			countLabel: 'Fields in height',
			partialLabel: 'Partial height',
		},
	] as const;
	protected readonly geometry = signal({
		width: '1200',
		height: '1500',
		columns: [''],
		rows: [''],
	});
	protected readonly geometryFields = form(this.geometry);
	protected readonly geometryInput = computed(() => {
		const value = this.geometry();
		const axis = (parts: readonly string[]) =>
			parts.map((part) => (part.trim() === '' ? null : Number(part)));
		return {
			widthMillimeters: Number(value.width),
			heightMillimeters: Number(value.height),
			columns: axis(value.columns),
			rows: axis(value.rows),
		};
	});
	protected readonly projection = computed(() =>
		projectRectangle(this.geometryInput()),
	);
	readonly saved = output<string>();
	protected resizeAxis(axis: 'columns' | 'rows', event: Event): void {
		const input = event.target as HTMLInputElement;
		const count = Number(input.value);
		if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
			input.value = String(this.geometry()[axis].length);
			return;
		}
		this.geometry.update((value) => ({
			...value,
			[axis]: Array.from(
				{ length: count },
				(_, index) => value[axis][index] ?? '',
			),
		}));
	}
	open(position: Position | null = null, phaseId = '') {
		this.editing.set(position);
		this.created.set(null);
		this.initialize.set(false);
		this.geometryFields().reset({
			width: '1200',
			height: '1500',
			columns: [''],
			rows: [''],
		});
		this.fields().reset(
			position
				? {
						name: position.name,
						systemId: position.systemId,
						type: position.type,
						phaseId: position.phaseId ?? '',
						briefDescription: position.briefDescription ?? '',
						modelDescription: position.modelDescription ?? '',
					}
				: {
						name: '',
						systemId: '',
						type: '',
						phaseId,
						briefDescription: '',
						modelDescription: '',
					},
		);
		this.catalog.load();
		this.dialog().nativeElement.showModal();
	}
	protected cancel(event: Event): void {
		event.preventDefault();
		this.close();
	}
	protected close(): void {
		if (this.busy() || this.store.saving()) return;
		const created = this.created();
		this.dialog().nativeElement.close();
		if (created) this.saved.emit(created.id);
	}
	protected finishCreated(): void {
		this.close();
	}

	protected save(event: Event) {
		event.preventDefault();
		if (
			this.busy() ||
			(this.initialize() && this.projection().kind === 'invalid')
		)
			return;
		void submit(this.fields, async () => {
			this.busy.set(true);
			try {
				const value = this.model();
				const position = this.editing();
				const metadata = {
					name: value.name.trim(),
					phaseId: value.phaseId || null,
					briefDescription: value.briefDescription || null,
					modelDescription: value.modelDescription || null,
				};
				const created = this.created();
				const result = await firstValueFrom(
					created
						? of({ kind: 'success' as const, value: created })
						: position
							? this.store.update(position.id, position.version, metadata)
							: this.store.create({
									...metadata,
									projectId: this.store.project()?.id ?? '',
									systemId: value.systemId,
									...(value.type ? { type: value.type } : {}),
								}),
				);
				if (result.kind === 'success') {
					if (!position && this.initialize()) {
						this.created.set(result.value);
						const design = await firstValueFrom(
							this.store.initializeDesign(
								result.value.id,
								result.value.version,
								{ ...this.geometryInput() },
							),
						);
						if (design.kind !== 'success') return;
					}
					this.created.set(null);
					this.dialog().nativeElement.close();
					this.saved.emit(result.value.id);
				}
			} finally {
				this.busy.set(false);
			}
		});
	}
}
