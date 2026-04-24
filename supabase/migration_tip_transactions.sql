-- Allow 'tip' as a valid transaction type.
alter table transactions
  drop constraint if exists transactions_type_check;

alter table transactions
  add constraint transactions_type_check
  check (type in ('subscription', 'ppv', 'tip'));
