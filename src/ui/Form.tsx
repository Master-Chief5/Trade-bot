import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';

export function Field({ label, help, error, children }: { label: ReactNode; help?: ReactNode; error?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {help && !error && <div className="help">{help}</div>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

export function TextInput({ label, help, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; help?: ReactNode; error?: string }) {
  return (
    <Field label={label} help={help} error={error}>
      {(id) => <input id={id} className={`input ${error ? 'error' : ''}`} {...rest} />}
    </Field>
  );
}

export function SelectInput({ label, help, error, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; help?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <Field label={label} help={help} error={error}>
      {(id) => (
        <select id={id} className="select" {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function TextArea({ label, help, error, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; help?: ReactNode; error?: string }) {
  return (
    <Field label={label} help={help} error={error}>
      {(id) => <textarea id={id} className="textarea" {...rest} />}
    </Field>
  );
}

export function Toggle({ label, help, checked, onChange, disabled }: { label: ReactNode; help?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="toggle">
      <div className="text">
        <span className="t" id={id}>
          {label}
        </span>
        {help && <span className="h">{help}</span>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.value} type="button" className={`chip ${value === o.value ? 'on' : ''}`} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
