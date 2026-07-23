"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, LoaderCircle, Search } from "lucide-react";

import { FieldHint, Input, Label } from "@/components/ui/field";
import type { SchoolSuggestion } from "@/lib/education/schools";

type SchoolSearchResponse = {
  schools?: SchoolSuggestion[];
  error?: string;
};

export function SchoolAutocomplete({
  defaultName = "",
  defaultSchoolId = null,
  required = true,
}: {
  defaultName?: string;
  defaultSchoolId?: number | null;
  required?: boolean;
}) {
  const listboxId = useId();
  const requestNumber = useRef(0);
  const [value, setValue] = useState(defaultName);
  const [selectedId, setSelectedId] = useState<number | null>(
    defaultSchoolId,
  );
  const [selectedName, setSelectedName] = useState(
    defaultSchoolId ? defaultName : "",
  );
  const [schools, setSchools] = useState<SchoolSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const query = value.trim();
    if (selectedId && query === selectedName) {
      return;
    }
    if (query.length < 2) {
      return;
    }

    const controller = new AbortController();
    const currentRequest = ++requestNumber.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setStatus("Searching schools…");
      try {
        const response = await fetch(`/api/schools?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as SchoolSearchResponse;
        if (currentRequest !== requestNumber.current) return;
        const nextSchools = response.ok ? (payload.schools ?? []) : [];
        setSchools(nextSchools);
        setOpen(nextSchools.length > 0);
        setActiveIndex(nextSchools.length > 0 ? 0 : -1);
        setStatus(
          response.ok
            ? nextSchools.length > 0
              ? `${nextSchools.length} school suggestions available.`
              : "No recognized matches. Your typed school will be saved as custom."
            : payload.error ??
                "Suggestions are unavailable. Your typed school can still be saved.",
        );
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        if (currentRequest !== requestNumber.current) return;
        setSchools([]);
        setOpen(false);
        setStatus(
          "Suggestions are unavailable. Your typed school can still be saved.",
        );
      } finally {
        if (currentRequest === requestNumber.current) setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [selectedId, selectedName, value]);

  function chooseSchool(school: SchoolSuggestion) {
    requestNumber.current += 1;
    setValue(school.name);
    setSelectedId(school.id);
    setSelectedName(school.name);
    setSchools([]);
    setOpen(false);
    setActiveIndex(-1);
    setStatus(`${school.name} selected as a recognized school.`);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || schools.length === 0) {
      if (event.key === "ArrowDown" && schools.length > 0) setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % schools.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? schools.length - 1 : index - 1,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      chooseSchool(schools[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Label htmlFor={`${listboxId}-input`}>College or university</Label>
      <input
        type="hidden"
        name="schoolId"
        value={selectedId === null ? "" : String(selectedId)}
      />
      <div className="relative">
        <Input
          id={`${listboxId}-input`}
          name="schoolName"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSelectedId(null);
            setSelectedName("");
            setSchools([]);
            setOpen(false);
            setLoading(false);
            setStatus("");
          }}
          onFocus={() => {
            if (schools.length > 0) setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && activeIndex >= 0
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          autoComplete="organization"
          placeholder="Start typing your school…"
          className="pr-10"
          required={required}
          maxLength={160}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-mist">
          {loading ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          ) : selectedId ? (
            <Check className="h-4 w-4 text-quad-700" aria-hidden />
          ) : (
            <Search className="h-4 w-4" aria-hidden />
          )}
        </span>
      </div>

      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-paper p-1 shadow-xl shadow-viridian/10"
        >
          {schools.map((school, index) => (
            <li
              id={`${listboxId}-option-${index}`}
              key={school.id}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                className={`w-full rounded-lg px-3 py-2 text-left ${
                  index === activeIndex
                    ? "bg-quad-100 text-ink"
                    : "hover:bg-court"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseSchool(school)}
              >
                <span className="block text-sm font-semibold">{school.name}</span>
                <span className="block text-xs text-mist">
                  {school.city}, {school.state}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <FieldHint>
        Pick a suggestion to recognize the school and show its logo when
        available. If yours is not listed, keep the name you typed and save it
        as a custom school.
      </FieldHint>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
