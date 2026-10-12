import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useId,
	useState,
	type ReactNode,
	type FormEvent,
} from 'react';
import { Link, useBlocker, type LinkProps } from 'react-router-dom';
import { X, AlertCircle, CheckCircle2, Inbox } from 'lucide-react';

const FeedbackContext = createContext<{
	notify: (message: string, error?: boolean) => void;
	confirm: (message: string) => Promise<boolean>;
	dirty: boolean;
	setDirty: (dirty: boolean) => void;
	errorMessage: string | null;
	clearError: () => void;
}>({
	notify: () => {},
	confirm: async () => false,
	dirty: false,
	setDirty: () => {},
	errorMessage: null,
	clearError: () => {},
});
export const useFeedback = () => useContext(FeedbackContext);
export function FeedbackProvider({ children }: { children: ReactNode }) {
	const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
	const [dirty, setDirtyState] = useState(false);
	const dirtyRef = useRef(false);
	const setDirty = (value: boolean) => {
		dirtyRef.current = value;
		setDirtyState(value);
	};
	const blocker = useBlocker(() => dirtyRef.current);
	const [confirmation, setConfirmation] = useState<{
		message: string;
		resolve: (value: boolean) => void;
	} | null>(null);
	useEffect(() => {
		if (blocker.state !== 'blocked') return;
		setConfirmation({
			message: 'Discard the unsaved document draft?',
			resolve: (discard) => {
				if (discard) {
					setDirty(false);
					blocker.proceed();
				} else blocker.reset();
			},
		});
	}, [blocker.state]);
	useEffect(() => {
		if (toast && !toast.error) {
			const timer = setTimeout(() => setToast(null), 5000);
			return () => clearTimeout(timer);
		}
	}, [toast]);
	useEffect(() => {
		const listener = (event: BeforeUnloadEvent) => {
			if (dirty) {
				event.preventDefault();
				event.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', listener);
		return () => window.removeEventListener('beforeunload', listener);
	}, [dirty]);
	return (
		<FeedbackContext.Provider
			value={{
				notify: (message, error = false) => setToast({ message, error }),
				confirm: (message) => new Promise((resolve) => setConfirmation({ message, resolve })),
				dirty,
				setDirty,
				errorMessage: toast?.error ? toast.message : null,
				clearError: () => setToast(null),
			}}
		>
			{children}
			{toast && (
				<div
					className={`toast ${toast.error ? 'error' : ''}`}
					role={toast.error ? 'alert' : 'status'}
				>
					{toast.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
					<span>{toast.message}</span>
					<button aria-label="Dismiss message" onClick={() => setToast(null)}>
						<X size={16} />
					</button>
				</div>
			)}
			{confirmation && (
				<Modal
					title="Confirm action"
					onClose={() => {
						confirmation.resolve(false);
						setConfirmation(null);
					}}
				>
					<p>{confirmation.message}</p>
					<div className="form-actions">
						<button
							onClick={() => {
								confirmation.resolve(false);
								setConfirmation(null);
							}}
						>
							Cancel
						</button>
						<button
							className="primary"
							onClick={() => {
								confirmation.resolve(true);
								setConfirmation(null);
							}}
						>
							Confirm
						</button>
					</div>
				</Modal>
			)}
		</FeedbackContext.Provider>
	);
}
export function GuardLink({ onClick, ...props }: LinkProps) {
	return <Link {...props} onClick={onClick} />;
}
export function Modal({
	title,
	onClose,
	children,
	wide = false,
}: {
	title: string;
	onClose: () => void;
	children: ReactNode;
	wide?: boolean;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const { errorMessage, clearError } = useFeedback();
	useEffect(() => {
		clearError();
		const element = ref.current!;
		element.showModal();
		element
			.querySelector<HTMLElement>(
				'input:not([disabled]),textarea:not([disabled]),select:not([disabled])',
			)
			?.focus();
		return () => element.close();
	}, []);
	return (
		<dialog
			ref={ref}
			aria-labelledby={titleId}
			className={wide ? 'wide' : ''}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
		>
			<div className="dialog-header">
				<h2 id={titleId}>{title}</h2>
				<button aria-label="Close dialog" onClick={onClose}>
					<X size={18} />
				</button>
			</div>
			<div className="dialog-body">
				{errorMessage && <ErrorBox error={new Error(errorMessage)} />}
				{children}
			</div>
		</dialog>
	);
}
export function Panel({
	title,
	children,
	actions,
	className = '',
}: {
	title: string;
	children: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<section className={`panel ${className}`}>
			<div className="panel-header">
				<h2>{title}</h2>
				{actions}
			</div>
			{children}
		</section>
	);
}
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
	return (
		<div className="empty">
			<Inbox size={24} />
			<p>{children}</p>
			{action}
		</div>
	);
}
export function Loading() {
	return (
		<div className="loading" role="status">
			<span className="status-dot" />
			Loading workspace…
		</div>
	);
}
export function ErrorBox({ error }: { error: unknown }) {
	return (
		<div className="inline-error" role="alert">
			{error instanceof Error ? error.message : 'Unable to load this view.'}
		</div>
	);
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label className="field">
			<span>{label}</span>
			{children}
		</label>
	);
}
export function useAction() {
	const [busy, setBusy] = useState(false);
	const { notify, clearError } = useFeedback();
	return {
		busy,
		run: async <T,>(operation: () => Promise<T>, success?: (value: T) => void) => {
			clearError();
			setBusy(true);
			try {
				const value = await operation();
				success?.(value);
				return value;
			} catch (error) {
				notify(error instanceof Error ? error.message : 'The operation failed.', true);
			} finally {
				setBusy(false);
			}
		},
	};
}
export function submit(callback: () => void) {
	return (event: FormEvent) => {
		event.preventDefault();
		callback();
	};
}
export function Prompt({
	title,
	label = 'Title',
	initial = '',
	onClose,
	onSubmit,
	hint,
}: {
	title: string;
	label?: string;
	initial?: string;
	onClose: () => void;
	onSubmit: (value: string) => Promise<void>;
	hint?: string;
}) {
	const [value, setValue] = useState(initial);
	const { busy, run } = useAction();
	return (
		<Modal title={title} onClose={onClose}>
			<form onSubmit={submit(() => void run(() => onSubmit(value), onClose))}>
				<Field label={label}>
					<input
						autoFocus
						value={value}
						onChange={(event) => setValue(event.target.value)}
						required
						maxLength={1000}
					/>
				</Field>
				{hint && <p className="muted">{hint}</p>}
				<div className="form-actions">
					<button type="button" onClick={onClose}>
						Cancel
					</button>
					<button className="primary" disabled={busy}>
						Save
					</button>
				</div>
			</form>
		</Modal>
	);
}
