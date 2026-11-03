# Annual income chart

The dashboard includes a January–December chart for the current Dhaka calendar year.

- Income is net cash received: `PAYMENT.creditPoisha - PAYMENT_REVERSAL.debitPoisha`.
- Generated bills and opening balances are excluded because they are not collected income.
- Reversals reduce the month in which the reversal is posted.
- The current month is shown as month-to-date and upcoming months remain neutral.
- Highest/lowest comparisons use completed months only, so an incomplete month or future zero month is not incorrectly ranked as the lowest.
- Highest completed month is Electric Blue (`#075FE4`); lowest is red (`#E34B52`); other completed months use blue-grey; the current month uses cyan.
- Ties are reported together. If all completed months have equal income, the chart reports that rather than arbitrarily selecting one.

The chart uses the existing dashboard ledger-entry read and adds no new collection reads or charting dependency.
