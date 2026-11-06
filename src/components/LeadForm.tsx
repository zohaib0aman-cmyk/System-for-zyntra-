"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  addNicheAction,
  createLeadAction,
  mergeIntoLeadAction,
  updateLeadAction,
  type LeadActionState,
} from "@/app/(app)/leads/actions";
import { INDIAN_STATES, LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import {
  createLeadSchema,
  toFieldErrors,
  updateLeadSchema,
  type FieldErrors,
  type LeadField,
  type LeadFormValues,
} from "@/lib/validation";
import { LeadAvatar } from "./LeadAvatar";
import { Spinner } from "./Spinner";

type Props = {
  mode: "create" | "edit";
  leadId?: string;
  trackingId?: string;
  initialValues: LeadFormValues;
  niches: string[];
};

export function LeadForm({ mode, leadId, trackingId, initialValues, niches: initialNiches }: Props) {
  const [values, setValues] = useState<LeadFormValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<LeadActionState>({});
  const [niches, setNiches] = useState(initialNiches);
  const [sameAsPhone, setSameAsPhone] = useState(
    mode === "create" || (!!initialValues.phone && initialValues.phone === initialValues.whatsapp),
  );
  const [pending, startTransition] = useTransition();
  const [mergingId, setMergingId] = useState<string | null>(null);

  function set(field: LeadField, value: string) {
    setValues((v) => {
      const next = { ...v, [field]: value };
      if (sameAsPhone && field === "phone") next.whatsapp = value;
      return next;
    });
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function payload(): LeadFormValues {
    return sameAsPhone ? { ...values, whatsapp: values.phone } : values;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = payload();
    const schema = mode === "create" ? createLeadSchema : updateLeadSchema;
    const check = schema.safeParse(data);
    if (!check.success) {
      setErrors(toFieldErrors(check.error));
      setResult({ error: "Please fix the highlighted fields." });
      focusFirstError(toFieldErrors(check.error));
      return;
    }
    setErrors({});
    setResult({});
    startTransition(async () => {
      const res =
        mode === "create" ? await createLeadAction(data) : await updateLeadAction(leadId!, data);
      // On success the action redirects, so we only get here on error.
      setResult(res);
      if (res.fieldErrors) {
        setErrors(res.fieldErrors);
        focusFirstError(res.fieldErrors);
      }
      if (res.duplicates?.length) {
        requestAnimationFrame(() => document.getElementById("duplicates")?.scrollIntoView({ behavior: "smooth" }));
      }
    });
  }

  function onMerge(id: string) {
    setMergingId(id);
    startTransition(async () => {
      const res = await mergeIntoLeadAction(id, payload());
      setResult(res);
      setMergingId(null);
    });
  }

  const fieldProps = (field: LeadField) => ({
    id: field,
    name: field,
    value: values[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(field, e.target.value),
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `${field}-error` : undefined,
    className: `input ${errors[field] ? "input-error" : ""}`,
    disabled: pending,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {result.duplicates && result.duplicates.length > 0 && (
        <div id="duplicates" className="card border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">
            {mode === "create" ? "This lead already exists" : "Another lead uses these details"}
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            {mode === "create"
              ? "No new ID was created. Open the existing lead, or update it with the details you just entered (only filled-in fields are copied)."
              : "Change the conflicting phone / WhatsApp / Instagram / website, or edit the other lead instead."}
          </p>
          <ul className="mt-3 space-y-2">
            {result.duplicates.map((d) => (
              <li key={d.id} className="rounded-xl border border-amber-200 bg-white p-3">
                <div className="flex items-center gap-3">
                  <LeadAvatar name={d.brand_name} logoUrl={d.logo_url} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{d.brand_name}</p>
                    <p className="font-mono text-xs text-brand-700">{d.tracking_id}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[d.phone, d.instagram && `@${d.instagram}`, d.city].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/leads/${d.tracking_id}`} className="btn-secondary flex-1 py-2">Open profile</Link>
                  {mode === "create" && (
                    <button type="button" onClick={() => onMerge(d.id)} disabled={pending} className="btn-primary flex-1 py-2">
                      {mergingId === d.id && <Spinner />} Update this lead
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.error && !result.duplicates?.length && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{result.error}</p>
      )}

      <Section title="Business">
        <Field label="Brand name *" field="brand_name" error={errors.brand_name}>
          <input {...fieldProps("brand_name")} autoComplete="organization" placeholder="e.g. Kesariya Threads" />
        </Field>
        <Field label="Owner name" field="owner_name" error={errors.owner_name}>
          <input {...fieldProps("owner_name")} autoComplete="name" placeholder="e.g. Riya Patel" />
        </Field>
        <NicheSelect
          value={values.niche}
          niches={niches}
          error={errors.niche}
          disabled={pending}
          onChange={(v) => set("niche", v)}
          onAdded={(name) => {
            setNiches((n) => (n.includes(name) ? n : [...n, name].sort((a, b) => a.localeCompare(b))));
            set("niche", name);
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status" field="status" error={errors.status}>
            <select {...fieldProps("status")}>
              {[...new Set([...LEAD_STATUSES, values.status])].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Source" field="source" error={errors.source}>
            <select {...fieldProps("source")}>
              {LEAD_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Contact">
        <Field label="Phone" field="phone" error={errors.phone} hint="10-digit Indian number or +country code">
          <input {...fieldProps("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={sameAsPhone}
            onChange={(e) => {
              setSameAsPhone(e.target.checked);
              if (e.target.checked) setValues((v) => ({ ...v, whatsapp: v.phone }));
            }}
            className="h-4 w-4 rounded border-slate-300 accent-brand-600"
            disabled={pending}
          />
          WhatsApp is the same as phone
        </label>
        {!sameAsPhone && (
          <Field label="WhatsApp" field="whatsapp" error={errors.whatsapp}>
            <input {...fieldProps("whatsapp")} type="tel" inputMode="tel" placeholder="98765 43210" />
          </Field>
        )}
        <Field label="Email" field="email" error={errors.email}>
          <input {...fieldProps("email")} type="email" inputMode="email" autoComplete="email" placeholder="hello@brand.in" />
        </Field>
        <Field label="Instagram" field="instagram" error={errors.instagram} hint="Handle or profile link">
          <input {...fieldProps("instagram")} autoCapitalize="none" autoCorrect="off" placeholder="@brandname" />
        </Field>
        <Field label="Website" field="website" error={errors.website}>
          <input {...fieldProps("website")} type="url" inputMode="url" autoCapitalize="none" placeholder="brand.in" />
        </Field>
      </Section>

      <Section title="Location">
        <div className="grid grid-cols-[5.5rem_1fr] gap-3">
          <Field label="Country" field="country" error={errors.country}>
            <input {...fieldProps("country")} maxLength={2} autoCapitalize="characters"
              onChange={(e) => set("country", e.target.value.toUpperCase())} />
          </Field>
          <Field label="State *" field="state" error={errors.state}>
            {values.country === "IN" ? (
              <select {...fieldProps("state")}>
                <option value="">Select state…</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                ))}
              </select>
            ) : (
              <input {...fieldProps("state")} maxLength={2} placeholder="2-letter code"
                onChange={(e) => set("state", e.target.value.toUpperCase())} />
            )}
          </Field>
        </div>
        <Field label="City" field="city" error={errors.city}>
          <input {...fieldProps("city")} autoComplete="address-level2" placeholder="e.g. Ahmedabad" />
        </Field>
        {mode === "edit" && (
          <p className="text-xs text-slate-500">
            Tracking ID <span className="font-mono font-semibold">{trackingId}</span> stays the same even if you change the state.
          </p>
        )}
      </Section>

      <Section title="Extra">
        <Field label="Logo URL" field="logo_url" error={errors.logo_url} hint="Optional — will be filled automatically later">
          <input {...fieldProps("logo_url")} type="url" inputMode="url" autoCapitalize="none" placeholder="https://…/logo.png" />
        </Field>
        <Field label="Notes" field="notes" error={errors.notes}>
          <textarea {...fieldProps("notes")} rows={4} placeholder="Anything useful about this lead…" />
        </Field>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <Link href={mode === "edit" ? `/leads/${trackingId}` : "/"} className="btn-secondary flex-1">Cancel</Link>
        <button type="submit" className="btn-primary flex-[2]" disabled={pending}>
          {pending && !mergingId && <Spinner />}
          {pending && !mergingId ? "Saving…" : mode === "create" ? "Save lead" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function focusFirstError(errors: FieldErrors) {
  const first = Object.keys(errors).find((k) => errors[k as LeadField]);
  if (first) requestAnimationFrame(() => document.getElementById(first)?.focus());
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card space-y-4 p-4">
      <legend className="sr-only">{title}</legend>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  field,
  error,
  hint,
  children,
}: {
  label: string;
  field: LeadField;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={field} className="label">{label}</label>
      {children}
      {error ? <ErrorText field={field} message={error} /> : hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function ErrorText({ field, message }: { field: string; message: string }) {
  return <p id={`${field}-error`} className="mt-1 text-xs font-medium text-red-600">{message}</p>;
}

const ADD_NEW = "__add_new__";

function NicheSelect({
  value,
  niches,
  error,
  disabled,
  onChange,
  onAdded,
}: {
  value: string;
  niches: string[];
  error?: string;
  disabled: boolean;
  onChange: (v: string) => void;
  onAdded: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string>();
  const [saving, startSaving] = useTransition();
  const options = value && !niches.includes(value) ? [value, ...niches] : niches;

  function save() {
    setAddError(undefined);
    startSaving(async () => {
      const res = await addNicheAction(name);
      if (res.error || !res.niche) {
        setAddError(res.error ?? "Could not add niche.");
        return;
      }
      onAdded(res.niche.name);
      setName("");
      setAdding(false);
    });
  }

  return (
    <div>
      <label htmlFor="niche" className="label">Niche</label>
      <select
        id="niche"
        value={adding ? ADD_NEW : value}
        disabled={disabled}
        className={`input ${error ? "input-error" : ""}`}
        onChange={(e) => {
          if (e.target.value === ADD_NEW) setAdding(true);
          else {
            setAdding(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Select niche…</option>
        {options.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
        <option value={ADD_NEW}>+ Add new niche…</option>
      </select>
      {adding && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
            placeholder="New niche name"
            aria-label="New niche name"
            className="input"
            disabled={saving}
          />
          <button type="button" onClick={save} disabled={saving || !name.trim()} className="btn-primary shrink-0">
            {saving ? <Spinner /> : "Add"}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="btn-secondary shrink-0" disabled={saving}>
            ✕
          </button>
        </div>
      )}
      {(addError || error) && <ErrorText field="niche" message={addError ?? error!} />}
    </div>
  );
}
