-- Rollback: Remove private-room invitation storage.

DROP TABLE IF EXISTS room_invites;
