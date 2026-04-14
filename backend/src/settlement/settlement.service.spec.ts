import { round4, toDecimalString } from '../common/money';

describe('SettlementService amount helpers', () => {
  it('toDecimalString formats four decimal places', () => {
    expect(toDecimalString(123.456789)).toBe('123.4568');
  });

  it('round4 matches payout arithmetic', () => {
    expect(round4(10.125)).toBe(10.125);
    expect(round4(100 - 37.5)).toBe(62.5);
  });
});
