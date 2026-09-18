-- Elterngespräche löschen dürfen
--
-- Bisher gab es für eltern_tickets nur SELECT, INSERT und UPDATE. Ein delete()
-- aus der App lief deshalb ins Leere: RLS hat es stillschweigend verworfen, die
-- Zeile blieb stehen. Diese Policies schließen die Lücke.
--
-- Die Nachrichten hängen per ON DELETE CASCADE am Ticket und verschwinden mit,
-- deshalb reicht das Löschen des Tickets.

drop policy if exists "tickets loeschen" on eltern_tickets;
create policy "tickets loeschen" on eltern_tickets
  for delete using (ist_team());

drop policy if exists "ticketnachrichten loeschen" on eltern_ticket_nachrichten;
create policy "ticketnachrichten loeschen" on eltern_ticket_nachrichten
  for delete using (ist_team());
