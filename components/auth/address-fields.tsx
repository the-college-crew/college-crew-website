import { Input, Label } from "@/components/ui/field";
import { US_STATES } from "@/lib/constants/us-states";

/**
 * Structured US address fieldset. Field names match the signup metadata /
 * validation keys (address_line1, address_line2, city, state, postal_code).
 *
 * The state control is a plain input backed by a <datalist>, so it works with
 * no JS: users can pick from the 50 states + DC or type the code/name (the
 * server normalizes it). autoComplete attrs let the browser autofill the whole
 * block — a cheap first step toward richer address suggestions later.
 */
export function AddressFields({ legend = "Address" }: { legend?: string }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-sm font-medium text-ink">{legend}</legend>

      <div>
        <Label htmlFor="address_line1">Street address</Label>
        <Input
          id="address_line1"
          name="address_line1"
          autoComplete="address-line1"
          required
        />
      </div>

      <div>
        <Label htmlFor="address_line2">Apt / unit (optional)</Label>
        <Input
          id="address_line2"
          name="address_line2"
          autoComplete="address-line2"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            name="city"
            autoComplete="address-level2"
            required
          />
        </div>

        <div>
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            name="state"
            list="us-states"
            autoComplete="address-level1"
            placeholder="State"
            className="sm:w-28"
            required
          />
          <datalist id="us-states">
            {US_STATES.map((s) => (
              <option key={s.code} value={s.name} label={s.code} />
            ))}
          </datalist>
        </div>

        <div>
          <Label htmlFor="postal_code">ZIP</Label>
          <Input
            id="postal_code"
            name="postal_code"
            autoComplete="postal-code"
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            placeholder="12345"
            className="sm:w-24"
            required
          />
        </div>
      </div>
    </fieldset>
  );
}
