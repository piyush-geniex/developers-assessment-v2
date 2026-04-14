export class WorklogException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorklogException';
  }
}

export class InvalidRemittanceStatusException extends WorklogException {
  constructor(status: string) {
    super(`Invalid remittance status: ${status}`);
    this.name = 'InvalidRemittanceStatusException';
  }
}

export class WorklogNotFoundExceptio extends WorklogException {
  constructor(id: string) {
    super(`Worklog not found: ${id}`);
    this.name = 'WorklogNotFoundException';
  }
}
