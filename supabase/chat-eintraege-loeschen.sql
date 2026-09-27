-- =====================================================================
-- Chats: To-dos, Abstimmungen und Angepinntes löschen (28.09.2026)
-- Einmal im SQL Editor ausführen (idempotent). Keine Namen, keine Schlüssel.
--
-- Neues Recht "chats.delete_items" (Rechte-Reiter → Chats & Übersicht).
-- Standard: alle, die fremde Nachrichten löschen dürfen, bekommen es auch –
-- genauso für Einzelrechte an Personen. Eigene Einträge darf jeder löschen.
--
-- Wer darf was löschen (topic_items):
--   eigene Einträge            → immer
--   To-do / Abstimmung         → chats.delete_items
--   angepinnte Nachricht       → chats.delete_items oder chats.delete_messages
--   normale Nachricht / System → chats.delete_messages (wie bisher)
-- =====================================================================

insert into public.role_permissions (role, perm, allowed)
select role, 'chats.delete_items', allowed
  from public.role_permissions where perm = 'chats.delete_messages'
on conflict (role, perm) do nothing;

insert into public.user_permissions (user_id, perm, allowed)
select user_id, 'chats.delete_items', allowed
  from public.user_permissions where perm = 'chats.delete_messages'
on conflict (user_id, perm) do nothing;

drop policy if exists "titems delete" on public.topic_items;
create policy "titems delete" on public.topic_items for delete to authenticated
  using (
    can_access_topic(topic_id) and (
      created_by = (select auth.uid())
      or (type in ('todo', 'umfrage') and (select has_perm('chats.delete_items')))
      or (type not in ('todo', 'umfrage') and coalesce(pinned, false) and (select has_perm('chats.delete_items')))
      or (type not in ('todo', 'umfrage') and (select has_perm('chats.delete_messages')))
    )
  );
