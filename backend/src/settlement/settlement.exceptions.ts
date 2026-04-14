export class SettlementException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettlementException';
  }
}

export class RemittanceAlreadyExistsException extends SettlementException {
  constructor(userId: string, periodStart: string, periodEnd: string) {
    super(
      `Remittance already exists for user ${userId} in period ${periodStart} to ${periodEnd}`,
    );
    this.name = 'RemittanceAlreadyExistsException';
  }
}

export class InvalidPeriodException extends SettlementException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPeriodException';
  }
}
