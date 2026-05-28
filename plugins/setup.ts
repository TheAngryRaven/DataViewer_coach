// Compile-time stub of the host's vehicle-setup record (DataViewer
// src/lib/setupStorage.ts). At runtime the host's real interface resolves; this
// exists only so the package typechecks standalone. Keep it matched to the host
// contract.
//
// PSI fields are always in PSI; tire width/diameter values are expressed in the
// units named by `unitSystem` ("mm" or "in"). The PSI / width / diameter "mode"
// fields are display-precision hints (single / halves / quarters), not values.

export type SetupUnitSystem = "mm" | "in";
export type TirePsiMode = "single" | "halves" | "quarters";
export type TireSizeMode = "halves" | "quarters";

export interface VehicleSetup {
  id: string;
  vehicleId: string;
  templateId: string;
  name: string;
  unitSystem: SetupUnitSystem;

  tireBrand: string;
  psiMode: TirePsiMode;
  psiFrontLeft: number | null;
  psiFrontRight: number | null;
  psiRearLeft: number | null;
  psiRearRight: number | null;
  tireWidthMode: TireSizeMode;
  tireWidthFrontLeft: number | null;
  tireWidthFrontRight: number | null;
  tireWidthRearLeft: number | null;
  tireWidthRearRight: number | null;
  tireDiameterMode: TireSizeMode;
  tireDiameterFrontLeft: number | null;
  tireDiameterFrontRight: number | null;
  tireDiameterRearLeft: number | null;
  tireDiameterRearRight: number | null;

  /** Template-defined free-form fields, keyed by TemplateFieldDef.id on the host. */
  customFields: Record<string, string | number | null>;

  createdAt: number;
  updatedAt: number;
}
