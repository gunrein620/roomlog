import {
  VendorActivationRepositoryError,
  type VendorAccountResolver,
  type VendorActivationRepository
} from "./vendor-activation.repository";

const unavailableError = new VendorActivationRepositoryError(
  "ACTIVATION_UNAVAILABLE",
  "Vendor activation is unavailable."
);

function fail(): never {
  throw unavailableError;
}

export class UnavailableVendorActivationRepository
  implements VendorActivationRepository, VendorAccountResolver
{
  async getByKeyHash(_keyHash: string): Promise<never> {
    return fail();
  }

  async getById(_activationId: string): Promise<never> {
    return fail();
  }

  async getActiveAccountLink(_userId: string): Promise<never> {
    return fail();
  }

  async claim(_input: {
    activationId: string;
    userId: string;
    now: Date;
  }): Promise<never> {
    return fail();
  }

  async resolveActiveVendorId(_userId: string): Promise<never> {
    return fail();
  }

  async resolveActiveVendorAccount(_userId: string): Promise<never> {
    return fail();
  }

  async close(): Promise<void> {}
}
