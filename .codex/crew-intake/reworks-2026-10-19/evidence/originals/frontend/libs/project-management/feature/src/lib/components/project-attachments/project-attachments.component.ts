import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	effect,
	inject,
	input,
	output,
	signal,
	untracked,
} from '@angular/core';
import { Button } from '@planicam/shared/ui/button';
import {
	ProjectAttachmentsStore,
	ATTACHMENT_ACCEPT,
	ATTACHMENT_MAX_BYTES,
	ATTACHMENT_MIME_TYPES,
	type ProjectAttachment,
} from '@planicam/project-management/state';

@Component({
	selector: 'planicam-project-attachments',
	imports: [Button],
	providers: [ProjectAttachmentsStore],
	changeDetection: ChangeDetectionStrategy.OnPush,
	templateUrl: './project-attachments.component.html',
	styleUrl: './project-attachments.component.scss',
})
export class ProjectAttachments {
	readonly projectId = input.required<string>();
	readonly projectVersion = input.required<number>();
	readonly archived = input(false);
	readonly changed = output<void>();
	protected readonly store = inject(ProjectAttachmentsStore);
	private readonly destroyRef = inject(DestroyRef);
	protected readonly reading = signal(false);
	protected readonly accept = ATTACHMENT_ACCEPT;
	private emittedRevision = 0;
	private emittedProjectId = '';

	constructor() {
		effect(() => {
			const context = {
				projectId: this.projectId(),
				projectVersion: this.projectVersion(),
				archived: this.archived(),
			};
			untracked(() => this.store.setContext(context));
		});
		effect(() => {
			const id = this.store.projectId();
			const revision = this.store.mutationRevision();
			if (id !== this.emittedProjectId) {
				this.emittedProjectId = id;
				this.emittedRevision = 0;
			}
			if (revision > this.emittedRevision) {
				this.emittedRevision = revision;
				untracked(() => this.changed.emit());
			}
		});
	}
	protected async chooseFile(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const context = this.projectId();
		const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
		const mimeType = ATTACHMENT_MIME_TYPES[extension];
		if (!mimeType || !file.size || file.size > ATTACHMENT_MAX_BYTES) {
			this.store.reportFailure(
				'Choose a supported image or document between 1 byte and 10 MiB.',
			);
			return;
		}
		this.reading.set(true);
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			if (!this.destroyRef.destroyed && this.projectId() === context)
				this.store.upload({ originalFilename: file.name, mimeType, bytes });
		} catch {
			if (!this.destroyRef.destroyed && this.projectId() === context)
				this.store.reportFailure(
					'The selected file could not be read. Choose the file again.',
				);
		} finally {
			if (!this.destroyRef.destroyed) this.reading.set(false);
		}
	}
	protected remove(attachment: ProjectAttachment): void {
		if (
			window.confirm(
				`Remove attachment “${attachment.originalFilename}” from this project?`,
			)
		)
			this.store.remove(attachment.id);
	}
	protected canPreview(attachment: ProjectAttachment): boolean {
		return /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(
			attachment.mimeType,
		);
	}
}
