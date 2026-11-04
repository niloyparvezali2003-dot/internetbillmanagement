# Mobile customer action icons

The customer cards on mobile now use the same icon action set as the desktop customer directory:

- BookOpen: open customer ledger
- Pencil: edit customer
- CircleDollarSign: change monthly rate
- History: view rate history
- UserMinus / UserPlus: leave / rejoin customer

Every icon button includes a descriptive `aria-label` and `title`. Mobile controls keep a 42px touch target, with distinct warning styling for Leave and success styling for Rejoin. No customer, billing, payment, or Firestore logic is changed.
