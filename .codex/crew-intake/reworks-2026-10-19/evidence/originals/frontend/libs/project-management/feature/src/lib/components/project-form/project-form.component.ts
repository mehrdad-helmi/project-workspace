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
import {
	form,
	FormField,
	pattern,
	required,
	submit,
} from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import type { Contact } from '@planicam/contacts/state';
import { CustomerSelector } from '../customer-selector/customer-selector.component';
import { Stepper } from '@planicam/shared/ui/stepper';
import { ProjectAttachments } from '../project-attachments/project-attachments.component';
import { ProjectConfiguration } from '../project-configuration/project-configuration.component';
import { HubCatalogStore } from '@planicam/hub/state';
import {
	ProjectsStore,
	type Project,
	type ProjectInput,
} from '@planicam/project-management/state';
import type { PricingAdjustment } from '@planicam/shared/models';
import { InputField } from '@planicam/shared/ui/input-field';
import { Button } from '@planicam/shared/ui/button';

@Component({
	selector: 'planicam-project-form',
	imports: [
		FormField,
		InputField,
		Button,
		CustomerSelector,
		Stepper,
		ProjectAttachments,
		ProjectConfiguration,
	],
	providers: [HubCatalogStore],
	changeDetection: ChangeDetectionStrategy.OnPush,
	templateUrl: './project-form.component.html',
	styleUrl: './project-form.component.scss',
})
export class ProjectForm {
	protected readonly store = inject(ProjectsStore);

	protected readonly catalog = inject(HubCatalogStore);
	private readonly dialog =
		viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
	readonly saved = output<string>();
	protected readonly editing = signal<Project | null>(null);
	protected readonly step = signal(0);
	protected readonly steps = [
		'Project details',
		'Images and documents',
		'Addresses',
		'Preferences',
		'Estimation and conditions',
		'Allocated costs',
	];
	protected readonly created = signal<Project | null>(null);
	protected readonly customerName = signal('');
	protected readonly addresses = signal<{ label: string; value: string }[]>([]);
	protected readonly preferenceSection = signal('System');
	protected readonly estimationSection = signal('Basic');

	protected readonly model = signal(this.empty());
	protected readonly capCurrency = computed(() => {
		const dataset = this.catalog
			.estimationDataSets()
			.find((row) => row.id === this.model().estimationDataSetId);
		const standard = dataset?.['standardEstimation'];
		return standard &&
			typeof standard === 'object' &&
			'estimationCurrency' in standard
			? String(standard.estimationCurrency)
			: 'project estimation currency';
	});
	protected readonly fields = form(this.model, (p) => {
		required(p.name);
		required(p.customerId);
		required(p.positionPrefix);
		pattern(p.positionPrefix, /^[A-Z0-9]{2,3}$/u, {
			message: 'Use two or three uppercase letters or digits.',
		});
	});

	protected readonly adjustments = signal<readonly PricingAdjustment[]>([]);
	protected readonly formError = signal('');
	private adjustmentsTouched = false;
	protected readonly adjustmentModel = signal({
		label: '',
		direction: 'SURCHARGE',
		percentage: '0',
		cap: '',
	});
	protected readonly adjustmentFields = form(this.adjustmentModel, (p) => {
		required(p.label);
		pattern(p.cap, /^(?:(?:0|[1-9]\d*)(?:\.\d+)?)?$/u);
		pattern(p.percentage, /^(?:0|[1-9]\d*)(?:\.\d+)?$/u);
	});
	private empty() {
		return {
			name: '',
			customerId: '',
			positionPrefix: '',
			folderId: '',
			estimationDataSetId: '',
			responsiblePerson: '',
			conditions: '',
			street: '',
			city: '',
			postalCode: '',
			country: '',
		};
	}
	open(project: Project | null = null, folderId = ''): void {
		this.editing.set(project);
		this.step.set(0);
		this.formError.set('');
		this.adjustmentsTouched = false;
		this.created.set(null);
		this.customerName.set(project?.customer.name ?? '');
		this.addresses.set(
			Object.entries(project?.otherAddresses ?? {}).map(([label, value]) => ({
				label,
				value,
			})),
		);
		this.catalog.load();
		this.fields().reset(
			project
				? {
						name: project.name,
						customerId: project.customerId,
						positionPrefix: project.positionPrefix,
						folderId: project.folderId ?? '',
						estimationDataSetId: '',
						responsiblePerson: project.responsiblePerson ?? '',
						conditions: project.conditions ?? '',
						street: project.street ?? '',
						city: project.city ?? '',
						postalCode: project.postalCode ?? '',
						country: project.country ?? '',
					}
				: { ...this.empty(), folderId },
		);
		this.adjustments.set(project?.pricingAdjustments ?? []);
		this.dialog().nativeElement.showModal();
	}
	protected cancel(event: Event): void {
		event.preventDefault();
		this.close();
	}
	protected close(): void {
		if (this.store.saving()) return;
		this.dialog().nativeElement.close();
		const created = this.created();
		if (created) this.saved.emit(created.id);
	}

	protected selectCustomer(contact: Contact): void {
		this.customerName.set(contact.name);
		this.model.update((value) => ({ ...value, customerId: contact.id }));
		if (this.editing()) return;
		this.model.update((value) => ({
			...value,
			...Object.fromEntries(
				(['street', 'city', 'postalCode', 'country', 'conditions'] as const)
					.filter((key) => !this.fields[key]().dirty())
					.map((key) => [key, contact[key] ?? '']),
			),
			...(!this.fields.estimationDataSetId().dirty()
				? { estimationDataSetId: contact.defaultEstimationDataSetId ?? '' }
				: {}),
		}));
		if (!this.adjustmentsTouched)
			this.adjustments.set(contact.pricingAdjustments ?? []);
	}
	protected addAddress(): void {
		this.addresses.update((rows) => [...rows, { label: '', value: '' }]);
	}
	protected setAddress(
		index: number,
		key: 'label' | 'value',
		event: Event,
	): void {
		const value = (event.target as HTMLInputElement).value;
		this.addresses.update((rows) =>
			rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
		);
	}
	protected removeAddress(index: number): void {
		this.addresses.update((rows) => rows.filter((_, i) => i !== index));
	}
	protected createAndContinue(event: Event): void {
		this.save(event, true);
	}
	protected finishSetup(): void {
		const project = this.created();
		if (project) {
			this.close();
		}
	}
	protected next() {
		this.step.update((value) => Math.min(5, value + 1));
	}
	protected back() {
		this.step.update((value) => Math.max(0, value - 1));
	}
	protected addAdjustment() {
		this.adjustmentsTouched = true;
		void submit(this.adjustmentFields, async () => {
			const value = this.adjustmentModel();
			this.adjustments.update((items) => [
				...items,
				{
					label: value.label,
					direction: value.direction as PricingAdjustment['direction'],
					percentage: value.percentage,
					...(value.cap ? { cap: value.cap } : {}),
				},
			]);
			this.adjustmentModel.set({
				label: '',
				direction: 'SURCHARGE',
				percentage: '0',
				cap: '',
			});
		});
	}
	protected removeAdjustment(index: number) {
		this.adjustmentsTouched = true;
		this.adjustments.update((items) => items.filter((_, i) => i !== index));
	}
	protected moveAdjustment(index: number, delta: number) {
		this.adjustmentsTouched = true;
		this.adjustments.update((items) => {
			const next = [...items];
			const target = index + delta;
			if (target < 0 || target >= next.length) return items;
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});
	}
	protected save(event: Event, continueSetup = false) {
		event.preventDefault();
		if (this.created()) return;
		this.formError.set('');
		const labels = this.addresses().map((row) => row.label.trim());
		if (
			labels.some((label) => !label) ||
			new Set(labels).size !== labels.length
		) {
			this.formError.set('Each additional address needs a unique label.');
			return;
		}
		void submit(this.fields, async () => {
			const value = this.model();
			const project = this.editing();
			const input: ProjectInput = {
				name: value.name.trim(),
				customerId: value.customerId,
				positionPrefix: value.positionPrefix,
				folderId: value.folderId || null,
				...(value.estimationDataSetId
					? { estimationDataSetId: value.estimationDataSetId }
					: {}),
				responsiblePerson: value.responsiblePerson || null,
				conditions: value.conditions || null,
				street: value.street || null,
				city: value.city || null,
				postalCode: value.postalCode || null,
				country: value.country || null,
				otherAddresses: Object.fromEntries(
					this.addresses().map((row) => [row.label.trim(), row.value]),
				),
				pricingAdjustments: this.adjustments(),
			};
			const result = await firstValueFrom(
				project
					? this.store.update(project.id, project.version, {
							name: input.name,
							customerId: input.customerId,
							folderId: input.folderId,
							responsiblePerson: input.responsiblePerson,
							conditions: input.conditions,
							street: input.street,
							city: input.city,
							postalCode: input.postalCode,
							country: input.country,
							otherAddresses: input.otherAddresses,
							pricingAdjustments: input.pricingAdjustments,
						})
					: this.store.create(input),
			);
			if (result.kind === 'success') {
				if (!project && continueSetup) {
					this.created.set(result.value);
					this.step.set(1);
				} else {
					this.close();
					this.saved.emit(result.value.id);
				}
			}
		});
	}
}
