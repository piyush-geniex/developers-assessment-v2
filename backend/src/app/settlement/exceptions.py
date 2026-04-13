class SettlementError(Exception):
    """Base class for settlement domain failures."""


class AlreadySettledError(SettlementError):
    """Raised when a user-period pair already has a successful remittance."""


class InvalidSettlementPeriodError(SettlementError):
    """Raised when period bounds are not valid for settlement."""
