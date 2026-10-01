-- New players start private.
--
-- The plugin's "Show my log on the website" setting is now off by
-- default (Plugin Hub rule: a feature that uses a third-party server is
-- opt-in), so a freshly registered player stays hidden until that
-- setting is turned on and sent through /update-settings. Existing rows
-- keep their current value.

alter table players
  alter column profile_public set default false;
