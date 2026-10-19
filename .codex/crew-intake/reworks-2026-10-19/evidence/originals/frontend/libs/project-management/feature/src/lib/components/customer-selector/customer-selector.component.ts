import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	inject,
	output,
	signal,
	viewChild,
} from '@angular/core';
import { form } from '@angular/forms/signals';
import { ContactsStore, type Contact } from '@planicam/contacts/state';
import { Button } from '@planicam/shared/ui/button';
import { InputField } from '@planicam/shared/ui/input-field';

@Component({
	selector: 'planicam-customer-selector',
	imports: [Button, InputField],
	providers: [ContactsStore],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<dialog #dialog aria-labelledby="customer-selector-title">
		<header>
			<h2 id="customer-selector-title">Choose customer</h2>
			<pl-button label="Close" variant="outlined" (pressed)="close()" />
		</header>
		<div class="search">
			<pl-input-field
				label="Search contacts"
				[field]="fields.query"
			/><pl-button label="Search" (pressed)="load(1)" />
		</div>
		@if (store.error(); as error) {
			<p role="alert">{{ error.message }}</p>
		}
		@if (store.loading()) {
			<p role="status">Loading contacts…</p>
		} @else {
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Number</th>
						<th>City</th>
						<th>Select</th>
					</tr>
				</thead>
				<tbody>
					@for (contact of store.items(); track contact.id) {
						<tr>
							<td>{{ contact.name }}</td>
							<td>{{ contact.number }}</td>
							<td>{{ contact.city }}</td>
							<td>
								<pl-button
									[label]="'Choose ' + contact.name"
									variant="outlined"
									(pressed)="choose(contact)"
								/>
							</td>
						</tr>
					} @empty {
						<tr>
							<td colspan="4">No contacts found.</td>
						</tr>
					}
				</tbody>
			</table>
		}
		<footer>
			<pl-button
				label="Previous"
				variant="outlined"
				[disabled]="page() <= 1 || store.loading()"
				(pressed)="load(page() - 1)"
			/><span>Page {{ page() }} · {{ store.total() }} contacts</span
			><pl-button
				label="Next"
				variant="outlined"
				[disabled]="page() * 25 >= store.total() || store.loading()"
				(pressed)="load(page() + 1)"
			/>
		</footer>
	</dialog>`,
	styles: `
		dialog {
			width: 760px;
			max-height: 80vh;
			border: 1px solid var(--p-content-border-color);
			border-radius: 12px;
			padding: 24px;
			background: var(--p-content-background);
			color: var(--p-text-color);
		}
		header,
		footer,
		.search {
			display: flex;
			gap: 16px;
			align-items: center;
			justify-content: space-between;
		}
		table {
			width: 100%;
			margin: 20px 0;
			border-collapse: collapse;
		}
		th,
		td {
			padding: 12px;
			text-align: left;
			border-bottom: 1px solid var(--p-content-border-color);
		}
	`,
})
export class CustomerSelector {
	protected readonly store = inject(ContactsStore);
	private readonly dialog =
		viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
	protected readonly query = signal({ query: '' });
	protected readonly fields = form(this.query);
	protected readonly page = signal(1);
	readonly selected = output<Contact>();
	open(): void {
		this.query.set({ query: '' });
		this.load(1);
		this.dialog().nativeElement.showModal();
	}
	protected load(page: number): void {
		this.page.set(page);
		this.store.load({
			q: this.query().query.trim(),
			page,
			pageSize: 25,
			sortBy: 'name',
			sortDirection: 'asc',
		});
	}
	protected close(): void {
		this.dialog().nativeElement.close();
	}
	protected choose(contact: Contact): void {
		this.selected.emit(contact);
		this.close();
	}
}
