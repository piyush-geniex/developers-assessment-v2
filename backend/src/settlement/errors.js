class SettlementError extends Error {
  /**
   * @param {string} message
   * @param {number} statusCode
   */
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'SettlementError';
    this.statusCode = statusCode;
  }
}

class AlreadySettledError extends SettlementError {
  /**
   * @param {string} userId
   * @param {string} periodStart
   * @param {string} periodEnd
   */
  constructor(userId, periodStart, periodEnd) {
    super(
      `Remittance already exists for user ${userId} in period ${periodStart} – ${periodEnd}`,
      409
    );
    this.name = 'AlreadySettledError';
  }
}

class InvalidPeriodError extends SettlementError {
  /** @param {string} detail */
  constructor(detail) {
    super(`Invalid settlement period: ${detail}`, 400);
    this.name = 'InvalidPeriodError';
  }
}

module.exports = { SettlementError, AlreadySettledError, InvalidPeriodError };
