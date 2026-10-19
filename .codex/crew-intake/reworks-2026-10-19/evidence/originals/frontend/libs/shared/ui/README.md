# Shared UI

`@planicam/shared/ui` is Planicam's domain-neutral Angular design-system API and the sole direct boundary for PrimeNG, PrimeIcons, and PrimeUI packages. Consumers use only its Planicam-owned standalone primitives and never import vendor symbols.

Controls are thin Signal Forms-aware adapters: they bind `[formField]` directly to the native or PrimeNG control inside the adapter and use PrimeNG state and appearance APIs rather than recreating component visuals. SCSS is limited to layout, labels, and help/error placement.

`PlIcons` exposes semantic icon names and `Icon` renders them. Add an entry only when a shared semantic use exists; feature code must not reference vendor icon names.

The root `src/index.ts` is the only public entry point. Add explicit named exports there; do not export raw PrimeNG or PrimeIcons symbols.

## Logo

Import `Logo` from `@planicam/shared/ui/logo` and render `<pl-logo width="136" height="24" variant="full" />`. The variants are `full` (default), `sign-only`, and `text-only`. Height defaults to 24px; omitted width follows the selected variant's aspect ratio. Supplying both dimensions fits the artwork inside that box without stretching it. Set `priority` for an above-the-fold logo that should load eagerly.

The component uses the separate sign and text SVG assets through `NgOptimizedImage`. Both images stay mounted when the variant changes, allowing the text to fade while the sign stays the same size during sidebar collapse. The text adapts to the dark theme, and transitions respect reduced-motion preferences.

## Toast feedback

`ToastService` is the Planicam-owned global feedback API. Consumers call `success`, `error`, `warning`, or `info`; PrimeNG `MessageService` and its `warn` severity remain private implementation details. The application root renders one `ToastHost`, and feature/domain templates never render `<p-toast>` directly.

The global HTTP response-message interceptor reaches this service only through an application-owned adapter. `shared/ui` does not depend on `shared/data-access`, and routine API reads never create toast noise.

## Form fields

`InputField`, `IconInputField`, and `PasswordField` compose the internal `FieldShell`. Only the shell renders optional PrimeNG labels, required indicators, hints, and all touched/invalid Signal Forms errors. Validation rules and messages stay in the feature's form schema. The public `[field]` input accepts a Signal Forms field directly; feature templates do not compute error strings for these controls.

Use `pl-input-field` for plain inputs and `pl-icon-input-field` with optional semantic `leftIcon` / `rightIcon` names for icon inputs. `pl-password-field` preserves `leadingIcon` and provides a keyboard-accessible visibility toggle. PrimeNG 22 deprecates `p-password`, so PasswordField uses the documented `pInputPassword` directive.

Each field accepts an optional `id`, `label`, `hint`, `placeholder`, and `autocomplete`. IDs identify the actual input only, with generated defaults. Supply `ariaLabel` when omitting the visible label. Disabled, readonly, and required state come from the Signal Forms schema. For `type="number"`, bind a numeric form model.

Angular 22 reserves `[invalid]` on `[formField]` elements. The controls therefore bind the PrimeNG `p-invalid` class to the shell's touched/invalid state; ARIA state uses that same shell state. Hint and error IDs are generated centrally, and both are described while errors are visible. Error rows track their index so multiple validators with the same error kind remain visible.

Before changing PrimeNG controls, read [`primeng-llms.txt`](../../../docs/development/primeng-llms.txt), use the relevant PrimeNG skill, and consult its current documentation and installed Angular APIs. Sources used for these primitives: [Label](https://primeng.dev/label), [InputText](https://primeng.dev/inputtext), [IconField](https://primeng.dev/iconfield), [InputPassword](https://primeng.dev/inputpassword), [Message](https://primeng.dev/message), and [Toast](https://primeng.dev/toast).

## Validation

Run `bun nx lint shared-ui`.
