import { inject, Injectable } from '@angular/core';
import type { CollectionQuery } from '@planicam/shared/models';
import type { ContactInput } from './contact.model';
import { ContactsGateway } from './contacts.gateway';
@Injectable({ providedIn: 'root' })
export class ContactsService {
	private readonly gateway = inject(ContactsGateway);
	list(query: CollectionQuery) {
		return this.gateway.list(query);
	}
	detail(id: string) {
		return this.gateway.detail(id);
	}
	create(input: ContactInput) {
		return this.gateway.create(input);
	}
	update(id: string, version: number, input: Partial<ContactInput>) {
		return this.gateway.update(id, version, input);
	}
	remove(id: string, version: number) {
		return this.gateway.remove(id, version);
	}
}
