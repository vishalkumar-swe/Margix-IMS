import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-controls";

interface SelectFilter {
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
}

/**
 * List filters as a plain GET form: filters live in the URL (shareable,
 * back-button friendly) and work without client JavaScript.
 */
export function FilterBar({
  search,
  selects = [],
  checkbox,
}: {
  search?: { name: string; placeholder: string; value?: string };
  selects?: SelectFilter[];
  checkbox?: { name: string; label: string; checked: boolean };
}) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
      {search && (
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-slate-400" aria-hidden />
          <Input
            type="search"
            name={search.name}
            defaultValue={search.value}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            className="pl-8"
          />
        </div>
      )}
      {selects.map((filter) => (
        <Select key={filter.name} name={filter.name} defaultValue={filter.value ?? ""} aria-label={filter.label} className="w-auto">
          <option value="">{filter.label}</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ))}
      {checkbox && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            name={checkbox.name}
            value="true"
            defaultChecked={checkbox.checked}
            className="size-4 rounded border-slate-300"
          />
          {checkbox.label}
        </label>
      )}
      <Button type="submit" variant="secondary">
        Apply
      </Button>
    </form>
  );
}
