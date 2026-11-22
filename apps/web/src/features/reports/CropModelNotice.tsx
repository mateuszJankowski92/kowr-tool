import type { CropModelCapability } from "@kowr/contracts";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "../../components/ui/alert";

export function CropModelNotice({ kind }: { kind: CropModelCapability["kind"] }) {
  if (kind !== "approximate") return null;

  return (
    <Alert className="mt-4" variant="warning">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>
        <strong className="font-semibold">Model przybliżony.</strong> Parametry lub przebieg rozwoju
        uprawy oszacowano z danych dla podobnej grupy roślin. Wynik zależy od przyjętego kalendarza
        i sposobu użytkowania. Zakres wyników pokazuje wpływ założeń, a nie dokładność pomiaru na
        polu.
      </AlertDescription>
    </Alert>
  );
}
